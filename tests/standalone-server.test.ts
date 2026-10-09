import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { request as httpRequest, createServer, type Server } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { brotliCompressSync, gzipSync } from "node:zlib";
import {
  createRequestHandler,
  requestPath,
  startServer,
  writeResponse,
} from "../apps/web/src/server/runtime";
import { appStore } from "../apps/web/src/server/store";
import { metadataClient } from "../apps/web/src/server/store/database";

const origin = "http://localhost:3100";

async function request(
  server: Server,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    chunked?: boolean;
  } = {},
) {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return new Promise<{
    status: number;
    headers: import("node:http").IncomingHttpHeaders;
    body: string;
  }>((resolveResponse, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port: address.port,
        path,
        method: options.method ?? "GET",
        headers: { Host: "localhost:3100", ...options.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.once("end", () =>
          resolveResponse({
            status: res.statusCode!,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        res.once("error", reject);
      },
    );
    req.once("error", reject);
    if (options.chunked && options.body) {
      req.write(options.body.slice(0, 65536));
      req.end(options.body.slice(65536));
    } else req.end(options.body);
  });
}

async function close(server: Server) {
  await new Promise<void>((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
}

test("standalone static serving restricts paths and negotiates precompressed assets", async (t) => {
  const previous = process.env.AUTH_URL;
  process.env.AUTH_URL = origin;
  const directory = mkdtempSync(join(process.env.OOS_TEST_TMPDIR ?? tmpdir(), "oos-static-"));
  const publicDir = join(directory, "public");
  mkdirSync(join(publicDir, "explorer"), { recursive: true });
  mkdirSync(join(publicDir, "_next/static"), { recursive: true });
  writeFileSync(join(publicDir, "index.html"), "<h1>Dashboard</h1>");
  writeFileSync(join(publicDir, "explorer/index.html"), "<h1>Explorer</h1>");
  writeFileSync(join(directory, "private.txt"), "private metadata");
  symlinkSync(join(directory, "private.txt"), join(publicDir, "leak.txt"));
  const script = Buffer.from("window.loaded = true;\n");
  writeFileSync(join(publicDir, "_next/static/app.js"), script);
  writeFileSync(join(publicDir, "_next/static/app.js.br"), brotliCompressSync(script));
  writeFileSync(join(publicDir, "_next/static/app.js.gz"), gzipSync(script));
  t.after(() => {
    if (previous === undefined) delete process.env.AUTH_URL;
    else process.env.AUTH_URL = previous;
    rmSync(directory, { recursive: true });
  });
  let ready = true;
  const handle = createRequestHandler({ staticDir: publicDir, isReady: () => ready });
  for (const path of [
    "/explorer/example",
    "/explorer/example/console",
    "/explorer/example/console/",
    "/explorer/?connection=example&view=console",
  ]) {
    const result = await handle(new Request(origin + path));
    assert.equal(result.status, 200);
    assert.equal(await result.text(), "<h1>Explorer</h1>");
  }
  for (const path of [
    "/explorer/example/other",
    "/api/missing",
    "/internal/kelvo/resolve-operation",
    "/leak.txt",
    "/_next/static/app.js.br",
  ]) {
    const result = await handle(new Request(origin + path));
    assert.equal(result.status, 404, path);
  }
  for (const path of [
    "/%2e%2e/private.txt",
    "/%2fetc/passwd",
    "/foo\\bar",
    "//outside.test/file",
    "/%00",
    "/bad%encoding",
  ])
    assert.throws(() => requestPath(path), /invalid/);
  assert.equal((await handle(new Request("http://outside.test/"))).status, 403);
  assert.equal((await handle(new Request(origin + "/", { method: "POST" }))).status, 405);
  ready = false;
  assert.equal((await handle(new Request(origin + "/healthz"))).status, 503);
  const gatedWrite = await handle(new Request(origin + "/api/rows/execute", { method: "POST" }));
  assert.equal(gatedWrite.status, 503);
  assert.deepEqual(await gatedWrite.json(), {
    error: "The service is starting. Try again shortly.",
    code: "NOT_READY",
    notSubmitted: true,
  });
  assert.equal((await handle(new Request(origin + "/api/auth/csrf"))).status, 503);
  ready = true;
  assert.equal((await handle(new Request(origin + "/healthz"))).status, 200);
  const br = await handle(
    new Request(origin + "/_next/static/app.js", { headers: { "Accept-Encoding": "gzip, br" } }),
  );
  assert.equal(br.headers.get("content-encoding"), "br");
  assert.equal(br.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal(br.headers.get("vary"), "Accept-Encoding");
  assert.match(br.headers.get("cache-control")!, /immutable/);
  assert.deepEqual(Buffer.from(await br.arrayBuffer()), brotliCompressSync(script));
  const gzip = await handle(
    new Request(origin + "/_next/static/app.js", {
      method: "HEAD",
      headers: { "Accept-Encoding": "br;q=0, gzip;q=0.8" },
    }),
  );
  assert.equal(gzip.headers.get("content-encoding"), "gzip");
  assert.equal(Number(gzip.headers.get("content-length")), gzipSync(script).length);
  assert.equal(await gzip.text(), "");
  const plain = await handle(
    new Request(origin + "/_next/static/app.js", {
      headers: { "Accept-Encoding": "br;q=0, gzip;q=0" },
    }),
  );
  assert.equal(plain.headers.get("content-encoding"), null);
  assert.equal(await plain.text(), script.toString());
});

test("standalone HTTP bridge preserves separate Set-Cookie headers", async () => {
  const server = createServer(async (_req, res) => {
    const headers = new Headers();
    headers.append("Set-Cookie", "first=one; HttpOnly; Path=/; SameSite=Lax");
    headers.append("Set-Cookie", "second=two; HttpOnly; Path=/; SameSite=Lax");
    await writeResponse(new Response("ok", { headers }), res);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const result = await request(server, "/");
    assert.equal(result.body, "ok");
    assert.equal(result.headers["set-cookie"]?.length, 2);
    assert.equal(result.headers["x-content-type-options"], "nosniff");
    assert.equal(result.headers["x-frame-options"], "DENY");
  } finally {
    await close(server);
  }
});

test("standalone Auth.js retains owner setup, CSRF, session revocation, and approval guards", async (t) => {
  const directory = mkdtempSync(join(process.env.OOS_TEST_TMPDIR ?? tmpdir(), "oos-http-auth-"));
  const publicDir = join(directory, "public");
  mkdirSync(publicDir);
  writeFileSync(join(publicDir, "index.html"), "Dashboard");
  const variables = {
    AUTH_URL: origin,
    OOS_KEY_DIR: join(directory, "keys"),
    DATABASE_URL: `file:${join(directory, "metadata.sqlite")}`,
    ALLOW_SIGNUP: "true",
  };
  const previous = Object.fromEntries(Object.keys(variables).map((key) => [key, process.env[key]]));
  Object.assign(process.env, variables);
  const sqlite = new DatabaseSync(join(directory, "metadata.sqlite"));
  const migrations = resolve("apps/web/prisma/migrations");
  for (const entry of readdirSync(migrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name)))
    sqlite.exec(readFileSync(join(migrations, entry.name, "migration.sql"), "utf8"));
  sqlite.close();
  await appStore().initializeMetadata();
  const server = await startServer({ port: 0, staticDir: publicDir });
  t.after(async () => {
    await close(server);
    await metadataClient().$disconnect();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(directory, { recursive: true });
  });
  const cookies = new Map<string, string>();
  const cookieHeader = () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  async function call(
    path: string,
    method = "GET",
    value?: unknown,
    form = false,
    headers: Record<string, string> = {},
  ) {
    const result = await request(server, path, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookieHeader(),
        ...(value === undefined
          ? {}
          : { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" }),
        ...headers,
      },
      body:
        value === undefined
          ? undefined
          : form
            ? new URLSearchParams(value as Record<string, string>).toString()
            : JSON.stringify(value),
    });
    for (const cookie of result.headers["set-cookie"] ?? []) {
      const pair = cookie.split(";", 1)[0],
        split = pair.indexOf("=");
      cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    return { ...result, json: JSON.parse(result.body) };
  }
  assert.equal((await call("/api/connections")).status, 401);
  const setup = await appStore().issueSetupToken();
  const owner = {
    token: setup.token,
    name: "Owner",
    email: "owner@example.test",
    password: "test owner passphrase with enough characters",
  };
  assert.equal(
    (await call("/api/setup", "POST", owner, false, { Origin: "http://outside.test" })).status,
    403,
  );
  assert.equal((await call("/api/setup", "POST", owner)).status, 201);
  assert.equal((await call("/api/setup", "POST", owner)).status, 409);
  const csrf = (await call("/api/auth/csrf")).json.csrfToken;
  const rejected = await call(
    "/api/auth/callback/credentials",
    "POST",
    { email: owner.email, password: owner.password, callbackUrl: "/connections/" },
    true,
    { "X-Auth-Return-Redirect": "1" },
  );
  assert.match(rejected.json.url, /error=/);
  assert.equal((await call("/api/session")).json.owner, null);
  const login = await call(
    "/api/auth/callback/credentials",
    "POST",
    { email: owner.email, password: owner.password, csrfToken: csrf, callbackUrl: "/connections/" },
    true,
    { "X-Auth-Return-Redirect": "1" },
  );
  assert.equal(login.json.url, origin + "/connections/");
  assert.ok(
    login.headers["set-cookie"]?.some(
      (cookie) =>
        cookie.startsWith("oos.session-token=") &&
        cookie.includes("HttpOnly") &&
        cookie.includes("SameSite=Lax"),
    ),
  );
  assert.equal((await call("/api/session")).json.owner.email, owner.email);
  const oldSession = cookieHeader();
  assert.equal(
    (await call("/api/session", "GET", undefined, false, { Host: "outside.test" })).status,
    403,
  );
  assert.equal(
    (await call("/api/session", "GET", undefined, false, { "X-Forwarded-Host": "outside.test" }))
      .json.owner.email,
    owner.email,
  );
  const write = await call("/api/query", "POST", {
    target: { connectionId: "fixture", database: "fixture", schema: null, connectionRevision: 1 },
    sql: "UPDATE example SET value=1",
    mode: "write",
  });
  assert.equal(write.status, 403);
  assert.match(write.json.error, /Review and confirm/);
  const oversized = await request(server, "/api/rows/execute", {
    method: "POST",
    headers: { Origin: origin, Cookie: cookieHeader(), "Content-Type": "application/json" },
    body: "x".repeat(256 * 1024 + 1),
    chunked: true,
  });
  assert.equal(oversized.status, 413);
  assert.equal(JSON.parse(oversized.body).notSubmitted, true);
  assert.equal(
    (
      await call("/api/auth/signout", "POST", { csrfToken: csrf, callbackUrl: "/login/" }, true, {
        Origin: "http://outside.test",
        "X-Auth-Return-Redirect": "1",
      })
    ).status,
    403,
  );
  assert.equal((await call("/api/session")).json.owner.email, owner.email);
  const logout = await call(
    "/api/auth/signout",
    "POST",
    { csrfToken: csrf, callbackUrl: "/login/" },
    true,
    { "X-Auth-Return-Redirect": "1" },
  );
  assert.equal(logout.json.url, origin + "/login/");
  assert.equal((await call("/api/session")).json.owner, null);
  assert.equal(
    (await call("/api/session", "GET", undefined, false, { Cookie: oldSession })).json.owner,
    null,
  );
});
