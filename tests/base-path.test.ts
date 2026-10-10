import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applicationPath, normalizeBasePath, stripBasePath } from "../apps/web/src/paths";
import { createRequestHandler } from "../apps/web/src/server/runtime";

test("application paths stay within the exact selected mount", () => {
  assert.equal(applicationPath("/connections", "/synehq"), "/synehq/connections");
  assert.equal(applicationPath("/api/session", ""), "/api/session");
  assert.equal(stripBasePath("/synehq/explorer/id/console", "/synehq"), "/explorer/id/console");
  assert.equal(stripBasePath("/synehq", "/synehq"), "/");
  for (const path of ["/synehq-other/api/session", "/api/session", "/synehqevil"])
    assert.equal(stripBasePath(path, "/synehq"), null);
  for (const path of [
    "//outside.test",
    "https://outside.test",
    "/bad\\path",
    "/bad\npath",
    "/../login",
    "/%2e%2e/login",
    "/%2fadmin",
  ])
    assert.throws(() => applicationPath(path, "/synehq"));
  for (const path of ["/synehq/", "/other", "/../synehq", "//synehq"])
    assert.throws(() => normalizeBasePath(path));
});

test("prefixed static assets and deep links require a matching build", async () => {
  const previous = { AUTH_URL: process.env.AUTH_URL, OOS_BASE_PATH: process.env.OOS_BASE_PATH };
  const root = mkdtempSync(join(tmpdir(), "oos-prefix-"));
  Object.assign(process.env, { AUTH_URL: "http://localhost:3100", OOS_BASE_PATH: "/synehq" });
  try {
    assert.throws(() => createRequestHandler({ staticDir: root }), /Build the static dashboard/);
    writeFileSync(join(root, "oos-build.json"), JSON.stringify({ basePath: "" }));
    assert.throws(() => createRequestHandler({ staticDir: root }), /same base path/);
    writeFileSync(join(root, "oos-build.json"), JSON.stringify({ basePath: "/synehq" }));
    for (const path of ["explorer", "_next/static", "monaco/vs"])
      mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, "explorer/index.html"), "Explorer");
    writeFileSync(join(root, "_next/static/app.js"), "application");
    writeFileSync(join(root, "monaco/vs/loader.js"), "editor");
    const handler = createRequestHandler({ staticDir: root, isReady: () => true });
    for (const path of [
      "/synehq/explorer/connection/console",
      "/synehq/_next/static/app.js",
      "/synehq/monaco/vs/loader.js",
      "/healthz",
    ])
      assert.equal((await handler(new Request(`http://localhost:3100${path}`))).status, 200);
    for (const path of ["/api/session", "/explorer/connection", "/synehqevil/explorer/connection"])
      assert.equal((await handler(new Request(`http://localhost:3100${path}`))).status, 404);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("the full auth and HTTP boundary also works under /synehq", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, OOS_TEST_BASE_PATH: "/synehq" };
  // The child must start its own test runner instead of inheriting the parent runner context.
  delete env.NODE_TEST_CONTEXT;
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "--test", "--test-reporter=tap", "tests/standalone-server.test.ts"],
    { env, timeout: 60_000, encoding: "utf8", stdio: "pipe" },
  );
  assert.match(output, /ok 3 - standalone Auth\.js retains owner setup/);
  assert.match(output, /# pass 3\b/);
});
