import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { issueSetupToken } from "../apps/web/src/server/store";

const origin = process.env.AUTH_URL!;
const base = process.env.OOS_TEST_URL ?? "http://127.0.0.1:3100";
const fixture = process.env.OOS_FIXTURE_DIR!;
const runtime = process.env.OOS_DATA_DIR!;
const cookies = new Map<string, string>();
async function request(path: string, method = "GET", input?: unknown, form = false) {
  const res = await fetch(base + path, {
    method,
    redirect: "manual",
    headers: {
      Origin: origin,
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      ...(input === undefined
        ? {}
        : { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" }),
    },
    body:
      input === undefined
        ? undefined
        : form
          ? new URLSearchParams(input as Record<string, string>)
          : JSON.stringify(input),
  });
  for (const value of res.headers.getSetCookie()) {
    const [cookie] = value.split(";");
    const split = cookie.indexOf("=");
    cookies.set(cookie.slice(0, split), cookie.slice(split + 1));
  }
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 300);
  }
  return { status: res.status, body };
}
async function api(path: string, method = "GET", data?: unknown) {
  const res = await request(path, method, data);
  assert.ok(
    res.status >= 200 && res.status < 300,
    `${path}: ${res.status} ${JSON.stringify(res.body)}`,
  );
  return res.body;
}
async function completed(initial: any) {
  let result = initial;
  const deadline = Date.now() + 45000;
  while (["queued", "running"].includes(result.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    result = await api(`/api/query/${result.operationId}`);
  }
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.ok(result.result, JSON.stringify(result));
  return result;
}
const accountPath = join(runtime, "owner-fixture.json");
if (!existsSync(accountPath))
  writeFileSync(
    accountPath,
    JSON.stringify({
      email: "owner@oos.test",
      name: "Local owner",
      password: randomBytes(24).toString("base64url"),
    }),
    { mode: 0o600 },
  );
const account = JSON.parse(readFileSync(accountPath, "utf8"));
const setup = await api("/api/setup");
if (!setup.initialized) {
  const token = await issueSetupToken();
  await api("/api/setup", "POST", { ...account, token: token.token });
}
const csrf = await api("/api/auth/csrf");
const signedIn = await request(
  "/api/auth/callback/credentials",
  "POST",
  { ...account, csrfToken: csrf.csrfToken, callbackUrl: origin + "/connections" },
  true,
);
assert.ok([200, 302].includes(signedIn.status), JSON.stringify(signedIn));
assert.equal((await api("/api/session")).owner.email, account.email);
console.log("Owner setup and authenticated session passed.");
const credentials = JSON.parse(readFileSync(join(fixture, "credentials.json"), "utf8"));
const ca = readFileSync(join(fixture, "tls", "ca.crt"), "utf8");
const connections = (await api("/api/connections")).connections;
for (const engine of ["postgres", "mysql"] as const) {
  const label = engine === "postgres" ? "PostgreSQL fixture" : "MySQL fixture";
  const connection =
    connections.find((c: any) => c.label === label) ??
    (
      await api("/api/connections", "POST", {
        label,
        engine,
        host: "127.0.0.1",
        port: engine === "postgres" ? 55432 : 53306,
        database: "oos",
        username: "oos",
        password: credentials[engine],
        tlsMode: "verify-full",
        tlsCa: ca,
        readOnly: false,
      })
    ).connection;
  assert.equal((await api(`/api/connections/${connection.id}/test`, "POST")).ok, true);
  console.log(`${engine}: verified TLS connection passed.`);
  const target = {
    connectionId: connection.id,
    database: "oos",
    schema: engine === "postgres" ? "public" : "oos",
    connectionRevision: connection.revision,
  };
  const simple = await completed(
    await api("/api/query", "POST", { target, mode: "read", sql: "SELECT 1 AS value" }),
  );
  assert.equal(String(simple.result.rows[0][0]), "1");
  console.log(`${engine}: simple Arrow result passed.`);
  const schema = await api(`/api/connections/${connection.id}/schema?schema=${target.schema}`);
  assert.ok(
    schema.tables.some(
      (t: any) =>
        t.name === "accounts" && t.columns.some((c: any) => c.name === "id" && c.primaryKey),
    ),
  );
  assert.ok(
    schema.tables
      .find((t: any) => t.name === "orders")
      .relationships.some((r: any) => r.target.table === "accounts"),
  );
  const query = await completed(
    await api("/api/query", "POST", {
      target,
      mode: "read",
      sql: "SELECT id, balance, created_at, note FROM accounts ORDER BY id DESC",
    }),
  );
  assert.equal(query.result.rows[0][0], "9007199254740993");
  assert.equal(query.result.rows[0][1], "1234567890123456.12345678");
  assert.match(query.result.rows[0][2], /123456/);
  assert.equal(query.result.rows[0][3], null);
  const filtered = await completed(
    await api("/api/tables/data", "POST", {
      target,
      table: "accounts",
      page: 0,
      pageSize: 100,
      filter: { column: "name", operator: "eq", value: "Northwind" },
      sort: { column: "id", direction: "asc" },
    }),
  );
  assert.equal(filtered.result.rowCount, 1);
  console.log(`${engine}: schema, foreign keys, exact values, table filter, and sort passed.`);
  const sql = "UPDATE orders SET amount = amount + 1 WHERE id = 1";
  assert.equal((await request("/api/query", "POST", { target, mode: "write", sql })).status, 403);
  const prepared = await api("/api/query/prepare", "POST", { target, sql });
  const approved = {
    target,
    sql,
    mode: "write",
    operationId: prepared.operationId,
    approvalId: prepared.approvalId,
    approvalToken: prepared.approvalToken,
  };
  assert.equal((await request("/api/query", "POST", { ...approved, sql: sql + " " })).status, 403);
  const written = await completed(await api("/api/query", "POST", approved));
  assert.equal(written.result.affectedRows, 1);
  const repeated = await completed(await api("/api/query", "POST", approved));
  assert.equal(repeated.operationId, written.operationId);
  console.log(
    `${engine}: explicit write approval, changed SQL rejection, and duplicate request reconciliation passed.`,
  );
}
writeFileSync(join(runtime, "browser-cookies.json"), JSON.stringify([...cookies]), { mode: 0o600 });
console.log("Live explorer checks passed.");
