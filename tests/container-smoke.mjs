import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

// Run only against the disposable container created by the GitHub runner.
assert.equal(process.env.CI, "true");
assert.ok(["amd64", "arm64"].includes(process.env.EXPECTED_ARCH));
const origin = "http://127.0.0.1:3100";
const basePath = process.env.OOS_BASE_PATH ?? "";
assert.ok(["", "/synehq"].includes(basePath));
const cookies = new Map();
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 100_000,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
assert.equal(docker("inspect", "synehq-oos", "--format", "{{.Config.Image}}"), process.env.IMAGE);
assert.equal(
  docker("exec", "synehq-oos", "/nodejs/bin/node", "-p", "process.arch"),
  process.env.EXPECTED_ARCH === "amd64" ? "x64" : "arm64",
);

async function healthy() {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const response = await fetch("http://127.0.0.1:3100/healthz", {
        headers: { Host: "127.0.0.1:3100" },
        signal: AbortSignal.timeout(2000),
      });
      await response.text();
      if (response.ok) return;
    } catch {}
    await delay(1000);
  }
  throw new Error("The container did not become ready.");
}

async function api(path, method = "GET", input, form = false) {
  const response = await fetch(`${origin}${basePath}${path}`, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(45_000),
    headers: {
      Host: "127.0.0.1:3100",
      Origin: origin,
      Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
      ...(input
        ? { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" }
        : {}),
      ...(form ? { "X-Auth-Return-Redirect": "1" } : {}),
    },
    body: input ? (form ? new URLSearchParams(input) : JSON.stringify(input)) : undefined,
  });
  for (const value of response.headers.getSetCookie()) {
    assert.ok(
      value.includes(`Path=${basePath}/;`),
      "Authentication cookies must use the configured application path.",
    );
    const entry = value.split(";", 1)[0];
    const separator = entry.indexOf("=");
    cookies.set(entry.slice(0, separator), entry.slice(separator + 1));
  }
  assert.ok(response.ok, `${method} ${path} returned HTTP ${response.status}.`);
  return response.json();
}

async function complete(initial) {
  let operation = initial;
  const deadline = Date.now() + 60_000;
  while (["queued", "running"].includes(operation.status) && Date.now() < deadline) {
    await delay(250);
    operation = await api(`/api/query/${operation.operationId}`);
  }
  assert.equal(operation.status, "succeeded", "The database operation must succeed.");
  assert.equal(operation.result?.complete, true);
  return operation.result;
}

await healthy();
const login = await fetch(`${origin}${basePath}/login/`, { signal: AbortSignal.timeout(5000) });
assert.equal(login.status, 200);
const page = await login.text();
const assets = [...page.matchAll(/(?:src|href)="([^" ]+\.(?:js|css)(?:\?[^" ]*)?)"/g)];
assert.ok(assets.length > 0, "The login page must reference static assets.");
for (const [, path] of assets) {
  assert.ok(path.startsWith(`${basePath}/_next/`));
  const asset = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(5000) });
  assert.equal(asset.status, 200, "The static asset must be available at the configured path.");
  await asset.arrayBuffer();
}
if (basePath) {
  for (const path of ["/api/setup", "/api/session", "/login/"]) {
    const response = await fetch(`${origin}${path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    await response.text();
    assert.equal(response.status, 404, "Bare routes must not bypass the application prefix.");
  }
}
assert.equal((await api("/api/setup")).initialized, false);
const setup = docker(
  "exec",
  "synehq-oos",
  "/nodejs/bin/node",
  "/app/dist/operator.mjs",
  "setup-token",
);
const token = /^Setup token: (\S+)$/m.exec(setup)?.[1];
assert.ok(token, "The local setup command must return a token.");
const email = "container-test@example.test";
const password = randomBytes(32).toString("base64url");
await api("/api/setup", "POST", { token, email, name: "Container test", password });
const csrf = await api("/api/auth/csrf");
await api(
  "/api/auth/callback/credentials",
  "POST",
  {
    email,
    password,
    csrfToken: csrf.csrfToken,
    callbackUrl: `${basePath}/connections/`,
  },
  true,
);
assert.equal((await api("/api/session")).owner?.email, email);

docker(
  "exec",
  "synehq-oos",
  "/nodejs/bin/node",
  "--input-type=module",
  "-e",
  `
  import { DatabaseSync } from 'node:sqlite';
  const db = new DatabaseSync('/data/sqlite-databases/container-smoke.sqlite');
  db.exec('CREATE TABLE sample (value INTEGER); INSERT INTO sample VALUES (42)');
  db.close();
`,
);
const draft = await api("/api/connections/test", "POST", {
  engine: "sqlite",
  label: "Container smoke",
  filePath: "container-smoke.sqlite",
  readOnly: true,
});
await complete(draft);
const { connection } = await api("/api/connections", "POST", {
  draftId: draft.draftId,
  operationId: draft.operationId,
});
async function readFixture() {
  const result = await complete(
    await api("/api/query", "POST", {
      target: {
        connectionId: connection.id,
        connectionRevision: connection.revision,
        database: "main",
        schema: null,
      },
      sql: "SELECT value FROM sample",
      mode: "read",
    }),
  );
  assert.equal(result.rowCount, 1);
  assert.equal(String(result.rows[0][0]), "42");
}
await readFixture();
docker("stop", "--time", "90", "synehq-oos");
assert.equal(docker("inspect", "synehq-oos", "--format", "{{.State.ExitCode}}"), "0");
docker("start", "synehq-oos");
await healthy();
assert.equal((await api("/api/connections")).connections[0].id, connection.id);
await readFixture();
docker("stop", "--time", "90", "synehq-oos");
assert.equal(docker("inspect", "synehq-oos", "--format", "{{.State.ExitCode}}"), "0");
console.log(
  `Verified ${process.env.EXPECTED_ARCH} at ${basePath || "/"}: static assets, owner setup, SQLite query, clean shutdown, and persisted restart.`,
);
