import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  rowMutationOutcome,
  type CellValue,
  type ConnectionSummary,
  type PreparedRowChanges,
  type PreparedRowMutation,
  type QueryOperation,
  type QueryResult,
  type QueryTarget,
  type RowChanges,
  type RowMutationScope,
} from "../packages/explorer-contracts/src/index";

const origin = process.env.AUTH_URL!;
const base = process.env.OOS_TEST_URL ?? "http://127.0.0.1:3100";
const account = JSON.parse(
  readFileSync(join(process.env.OOS_DATA_DIR!, "owner-fixture.json"), "utf8"),
);
const cookies = new Map<string, string>();
async function request(path: string, method = "GET", input?: unknown, form = false) {
  const response = await fetch(base + path, {
    method,
    redirect: "manual",
    headers: {
      Origin: origin,
      Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
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
  for (const value of response.headers.getSetCookie()) {
    const cookie = value.split(";")[0],
      separator = cookie.indexOf("=");
    cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1));
  }
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}
async function api<T>(path: string, method = "GET", input?: unknown): Promise<T> {
  const response = await request(path, method, input);
  assert.ok(
    response.status >= 200 && response.status < 300,
    `${path}: HTTP ${response.status}: ${response.body.error ?? "Request failed"}`,
  );
  return response.body as T;
}
async function complete(
  initial: QueryOperation,
): Promise<QueryOperation & { result: QueryResult }> {
  let operation = initial;
  const deadline = Date.now() + 45000;
  while (["queued", "running"].includes(operation.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    operation = await api<QueryOperation>(`/api/query/${operation.operationId}`);
  }
  assert.equal(
    operation.status,
    "succeeded",
    `Operation ${operation.operationId}: ${operation.status}. ${operation.error ?? ""}`,
  );
  assert.ok(operation.result, `Operation ${operation.operationId} has no verified result.`);
  return operation as QueryOperation & { result: QueryResult };
}
async function query(target: QueryTarget, sql: string) {
  return complete(await api<QueryOperation>("/api/query", "POST", { target, sql, mode: "read" }));
}
async function write(target: QueryTarget, sql: string) {
  const prepared = await api<{ operationId: string; approvalId: string; approvalToken: string }>(
    "/api/query/prepare",
    "POST",
    { target, sql },
  );
  return complete(
    await api<QueryOperation>("/api/query", "POST", {
      target,
      sql,
      mode: "write",
      operationId: prepared.operationId,
      approvalId: prepared.approvalId,
      approvalToken: prepared.approvalToken,
    }),
  );
}
async function prepare(scope: RowMutationScope, changes: RowChanges) {
  return api<PreparedRowChanges>("/api/rows/prepare", "POST", { ...scope, changes });
}
function execution(scope: RowMutationScope, prepared: PreparedRowMutation) {
  return {
    ...scope,
    operationId: prepared.operationId,
    approvalId: prepared.approvalId,
    approvalToken: prepared.approvalToken,
    mutation: prepared.mutation,
  };
}
async function apply(scope: RowMutationScope, prepared: PreparedRowMutation) {
  return complete(
    await api<QueryOperation>("/api/rows/execute", "POST", execution(scope, prepared)),
  );
}

const csrf = await api<{ csrfToken: string }>("/api/auth/csrf");
const signedIn = await request(
  "/api/auth/callback/credentials",
  "POST",
  { ...account, csrfToken: csrf.csrfToken, callbackUrl: origin + "/connections" },
  true,
);
assert.ok([200, 302].includes(signedIn.status));
const connections = (await api<{ connections: ConnectionSummary[] }>("/api/connections"))
  .connections;
const requestedEngine = process.env.OOS_TEST_ENGINE;
assert.ok(
  requestedEngine === undefined || requestedEngine === "postgres" || requestedEngine === "mysql",
  "OOS_TEST_ENGINE must be postgres or mysql.",
);
for (const engine of (["postgres", "mysql"] as const).filter(
  (engine) => !requestedEngine || engine === requestedEngine,
)) {
  const connection = connections.find(
    (connection) =>
      connection.engine === engine &&
      connection.database === "oos" &&
      connection.label.includes("fixture"),
  );
  assert.ok(connection, `The ${engine} fixture connection is missing.`);
  const target = {
    connectionId: connection.id,
    connectionRevision: connection.revision,
    database: "oos",
    schema: engine === "postgres" ? "public" : "oos",
  };
  const existing = await query(target, "SELECT * FROM accounts ORDER BY id LIMIT 1");
  const scope: RowMutationScope = { target, table: "accounts", columns: existing.result.columns };
  const id = String(9007199254741993n + BigInt(Date.now() % 1000000));
  const values: Record<string, CellValue> = {
    id,
    name: "Row mutation qualification",
    balance: "1234567890123456.12345678",
    created_at: "2026-01-02T03:04:05.654321Z",
    note: "Original note",
  };
  assert.ok(
    scope.columns.every((column) => Object.hasOwn(values, column.name)),
    "The account fixture schema changed.",
  );
  const insertedRow = scope.columns.map((column) => values[column.name]);
  const insertion = (await prepare(scope, { inserts: [insertedRow], updates: [], deletes: [] }))
    .operations[0];
  assert.equal(
    (await query(target, `SELECT id FROM accounts WHERE id = ${id}`)).result.rowCount,
    0,
  );
  assert.equal(rowMutationOutcome(await apply(scope, insertion)), "applied");
  console.log(`${engine}: row insert required approval and affected one row.`);

  let actual = (await query(target, `SELECT * FROM accounts WHERE id = ${id}`)).result.rows[0];
  const update = (
    await prepare(scope, {
      inserts: [],
      updates: [
        { row: actual, column: "name", value: "Reviewed name" },
        { row: actual, column: "balance", value: "1234567890123456.87654321" },
      ],
      deletes: [],
    })
  ).operations[0];
  const tampered = await request("/api/rows/execute", "POST", {
    ...execution(scope, update),
    mutation: {
      kind: "update",
      row: actual,
      values: [{ column: "name", value: "Unapproved name" }],
    },
  });
  assert.equal(tampered.status, 403);
  assert.equal(tampered.body.notSubmitted, true);
  assert.equal(rowMutationOutcome(await apply(scope, update)), "applied");
  assert.equal(rowMutationOutcome(await apply(scope, update)), "applied");
  actual = (await query(target, `SELECT * FROM accounts WHERE id = ${id}`)).result.rows[0];
  const nameIndex = scope.columns.findIndex((column) => column.name === "name");
  assert.equal(actual[nameIndex], "Reviewed name");
  assert.equal(
    actual[scope.columns.findIndex((column) => column.name === "balance")],
    "1234567890123456.87654321",
  );
  assert.match(
    String(actual[scope.columns.findIndex((column) => column.name === "created_at")]),
    /654321/,
  );
  console.log(
    `${engine}: bound row update, tamper rejection, duplicate reconciliation, and exact unchanged values passed.`,
  );

  const stale = (
    await prepare(scope, {
      inserts: [],
      updates: [{ row: actual, column: "name", value: "Stale edit" }],
      deletes: [],
    })
  ).operations[0];
  await write(target, `UPDATE accounts SET note = 'Concurrent note' WHERE id = ${id}`);
  const conflict = await apply(scope, stale);
  assert.equal(conflict.result.affectedRows, 0);
  assert.equal(rowMutationOutcome(conflict), "conflict");
  actual = (await query(target, `SELECT * FROM accounts WHERE id = ${id}`)).result.rows[0];
  assert.equal(actual[nameIndex], "Reviewed name");
  const deletion = (await prepare(scope, { inserts: [], updates: [], deletes: [actual] }))
    .operations[0];
  assert.equal(rowMutationOutcome(await apply(scope, deletion)), "applied");
  assert.equal(rowMutationOutcome(await apply(scope, deletion)), "applied");
  assert.equal(
    (await query(target, `SELECT id FROM accounts WHERE id = ${id}`)).result.rowCount,
    0,
  );
  console.log(
    `${engine}: stale row conflict, row delete, and duplicate delete reconciliation passed. Fixture row removed.`,
  );
}
console.log("Live row mutation checks passed.");
