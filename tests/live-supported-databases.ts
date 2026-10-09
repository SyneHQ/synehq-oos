import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CellValue,
  ConnectionDraftInput,
  ConnectionSummary,
  DatabaseEngine,
  QueryOperation,
  QueryResult,
  QueryTarget,
  SchemaTable,
} from "../packages/explorer-contracts/src/index";

// Run on the isolated Linux host after the app, Kelvo, and fixtures are ready.
// This test uses the existing owner. It does not initialize or reset the installation.
const engines = ["postgres", "mysql", "clickhouse", "mongodb", "sqlite", "oracle"] as const;
const requested = process.env.OOS_TEST_ENGINE?.split(",").map((value) => value.trim());
assert.ok(
  !requested || requested.every((value) => engines.includes(value as DatabaseEngine)),
  "OOS_TEST_ENGINE must contain supported engine names, separated by commas.",
);
function requiredEnvironment(name: string): string {
  const value = process.env[name];
  assert.ok(value, `Set ${name} before running this test.`);
  return value;
}
function privateJson(path: string): Record<string, string> {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value as Record<string, string>;
  } catch {
    throw new Error("A required private fixture file is missing or invalid.");
  }
}
const origin = new URL(requiredEnvironment("AUTH_URL")).origin;
const base = process.env.OOS_TEST_URL ?? "http://127.0.0.1:3100";
const fixtureDirectory = requiredEnvironment("OOS_FIXTURE_DIR");
const account = privateJson(join(requiredEnvironment("OOS_DATA_DIR"), "owner-fixture.json"));
const credentials = privateJson(join(fixtureDirectory, "credentials.json"));
const ca = readFileSync(join(fixtureDirectory, "tls", "ca.crt"), "utf8");
const cookies = new Map<string, string>();
type QueryText = { sql: string; command?: never } | { command: string; sql?: never };
type CompletedOperation = QueryOperation & { result: QueryResult };
interface PreparedWrite {
  operationId: string;
  approvalId: string;
  approvalToken: string;
  operationDigest: string;
  expiresAt: string;
}
interface Fixture {
  engine: DatabaseEngine;
  label: string;
  port: number;
  database: string;
  schema: string | null;
  username: string;
}
const fixtures: Fixture[] = [
  {
    engine: "postgres",
    label: "PostgreSQL fixture",
    port: 55432,
    database: "oos",
    schema: "public",
    username: "oos",
  },
  {
    engine: "mysql",
    label: "MySQL fixture",
    port: 53306,
    database: "oos",
    schema: "oos",
    username: "oos",
  },
  {
    engine: "clickhouse",
    label: "ClickHouse fixture",
    port: 54843,
    database: "oos",
    schema: "oos",
    username: "oos",
  },
  {
    engine: "mongodb",
    label: "MongoDB fixture",
    port: 57017,
    database: "oos",
    schema: null,
    username: "oos",
  },
  {
    engine: "sqlite",
    label: "SQLite fixture",
    port: 0,
    database: "main",
    schema: null,
    username: "",
  },
  {
    engine: "oracle",
    label: "Oracle fixture",
    port: 52484,
    database: "FREEPDB1",
    schema: "OOS",
    username: "OOS",
  },
];

async function request(path: string, method = "GET", input?: unknown, form = false) {
  let response: Response;
  try {
    response = await fetch(base + path, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(45_000),
      headers: {
        Host: new URL(origin).host,
        Origin: origin,
        Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
        ...(input === undefined
          ? {}
          : {
              "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json",
            }),
      },
      body:
        input === undefined
          ? undefined
          : form
            ? new URLSearchParams(input as Record<string, string>)
            : JSON.stringify(input),
    });
  } catch {
    throw new Error(`${method} ${path}: the HTTP request did not complete.`);
  }
  for (const value of response.headers.getSetCookie()) {
    const cookie = value.split(";")[0],
      separator = cookie.indexOf("=");
    cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1));
  }
  let body: unknown = {};
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      if (response.status < 300 || response.status >= 400)
        throw new Error(`${method} ${path}: HTTP ${response.status} returned invalid JSON.`);
    }
  }
  return { status: response.status, body };
}
async function api<T>(path: string, method = "GET", input?: unknown, status?: number): Promise<T> {
  const response = await request(path, method, input);
  assert.ok(
    status === undefined
      ? response.status >= 200 && response.status < 300
      : response.status === status,
    `${method} ${path}: HTTP ${response.status}.`,
  );
  return response.body as T;
}
class OperationFailure extends Error {
  readonly status: QueryOperation["status"];
  constructor(operation: QueryOperation) {
    super(
      `Operation ${operation.operationId}: ${operation.status}; a complete verified result is required.`,
    );
    this.status = operation.status;
  }
}
async function complete(initial: QueryOperation): Promise<CompletedOperation> {
  let operation = initial;
  const deadline = Date.now() + 60_000;
  while (["queued", "running"].includes(operation.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    operation = await api<QueryOperation>(`/api/query/${operation.operationId}`);
  }
  if (operation.status !== "succeeded" || !operation.result?.complete)
    throw new OperationFailure(operation);
  assert.equal(
    operation.result.rowCount,
    operation.result.rows.length,
    "The result row count changed.",
  );
  assert.ok(
    operation.result.rows.every((row) => row.length === operation.result!.columns.length),
    "A result row does not match its columns.",
  );
  return operation as CompletedOperation;
}
async function read(target: QueryTarget, text: QueryText) {
  return complete(
    await api<QueryOperation>("/api/query", "POST", { target, ...text, mode: "read" }, 202),
  );
}
async function listConnections() {
  return (await api<{ connections: ConnectionSummary[] }>("/api/connections")).connections;
}
function name(fixture: Fixture, value: string): string {
  return fixture.engine === "oracle" ? value.toUpperCase() : value;
}
function quote(fixture: Fixture, value: string): string {
  const delimiter = ["postgres", "sqlite", "oracle"].includes(fixture.engine) ? '"' : "`";
  return delimiter + name(fixture, value) + delimiter;
}
function accounts(fixture: Fixture): string {
  return `${quote(fixture, fixture.schema ?? fixture.database)}.${quote(fixture, "accounts")}`;
}
function sqlRow(result: QueryResult, index = 0): Record<string, CellValue> {
  assert.ok(result.rows[index], "The expected SQL row is missing.");
  return Object.fromEntries(
    result.columns.map((column, columnIndex) => [
      column.name.toLowerCase(),
      result.rows[index][columnIndex],
    ]),
  );
}
function documents(result: QueryResult): Record<string, unknown>[] {
  assert.deepEqual(result.columns, [{ name: "document", dataType: "json" }]);
  return result.rows.map((row) => {
    assert.equal(typeof row[0], "string", "The MongoDB document is not JSON text.");
    try {
      return JSON.parse(row[0] as string) as Record<string, unknown>;
    } catch {
      throw new Error("The MongoDB result is not valid JSON.");
    }
  });
}

async function testedConnection(fixture: Fixture): Promise<ConnectionSummary> {
  const matching = (await listConnections()).filter(
    (connection) => connection.label === fixture.label,
  );
  assert.ok(
    matching.length <= 1,
    `${fixture.engine}: multiple canonical fixture connections exist.`,
  );
  const existing = matching[0];
  if (existing) {
    assert.ok(
      existing.engine === fixture.engine &&
        existing.database === fixture.database &&
        !existing.readOnly,
      `${fixture.engine}: the existing fixture target or write policy differs.`,
    );
    assert.ok(
      fixture.engine === "sqlite"
        ? existing.filePath === "sample.sqlite"
        : existing.host === "127.0.0.1" &&
            existing.port === fixture.port &&
            existing.tlsMode === "verify-full",
      `${fixture.engine}: the existing fixture endpoint differs.`,
    );
  }
  const input: ConnectionDraftInput =
    fixture.engine === "sqlite"
      ? { engine: "sqlite", label: fixture.label, filePath: "sample.sqlite", readOnly: false }
      : {
          engine: fixture.engine,
          label: fixture.label,
          host: "127.0.0.1",
          port: fixture.port,
          database: fixture.database,
          username: fixture.username,
          password: credentials[fixture.engine],
          tlsMode: "verify-full",
          tlsCa: ca,
          readOnly: false,
          ...(fixture.engine === "mongodb" ? { authSource: "oos" } : {}),
          ...(fixture.engine === "oracle" ? { serviceName: "FREEPDB1" } : {}),
        };
  if (fixture.engine !== "sqlite")
    assert.ok(input.password, `${fixture.engine}: fixture credentials are missing.`);
  if (existing) input.label = `${fixture.label} validation ${randomUUID()}`;
  const draft = await api<QueryOperation & { draftId: string; expiresAt: string }>(
    "/api/connections/test",
    "POST",
    input,
    202,
  );
  assert.ok(
    draft.draftId && Date.parse(draft.expiresAt) > Date.now(),
    `${fixture.engine}: the test draft has no expiry.`,
  );
  const promotion = { draftId: draft.draftId, operationId: draft.operationId };
  // A test can finish in the initial response. Only a pending test must fail this check.
  if (["queued", "running"].includes(draft.status))
    assert.equal((await request("/api/connections", "POST", promotion)).status, 409);
  assert.equal(
    (await request("/api/connections", "POST", { ...promotion, operationId: randomUUID() })).status,
    409,
  );
  assert.ok(
    !(await listConnections()).some((connection) => connection.id === draft.draftId),
    "A test draft is visible in saved connections.",
  );
  const draftTarget: QueryTarget = {
    connectionId: draft.draftId,
    connectionRevision: 1,
    database: fixture.database,
    schema: fixture.schema,
  };
  const draftText: QueryText =
    fixture.engine === "mongodb"
      ? { command: JSON.stringify({ command: "find", collection: "accounts", filter: {} }) }
      : { sql: "SELECT 1" };
  assert.equal(
    (await request("/api/query", "POST", { target: draftTarget, ...draftText, mode: "read" }))
      .status,
    404,
  );
  await complete(draft);
  const saved = (
    await api<{ connection: ConnectionSummary }>("/api/connections", "POST", promotion, 201)
  ).connection;
  try {
    assert.equal(saved.id, draft.draftId);
    assert.ok(
      !Object.hasOwn(saved, "password") && !Object.hasOwn(saved, "tlsCa"),
      "A connection response contains a secret field.",
    );
    const repeated = await api<{ connection: ConnectionSummary }>(
      "/api/connections",
      "POST",
      promotion,
      201,
    );
    assert.equal(
      repeated.connection.id,
      saved.id,
      "Repeated promotion created another connection.",
    );
    assert.ok(
      (await listConnections()).some((connection) => connection.id === saved.id),
      "A verified connection was not saved.",
    );
    await complete(
      await api<QueryOperation>(`/api/connections/${saved.id}/test`, "POST", undefined, 202),
    );
  } finally {
    if (existing) {
      await api(`/api/connections/${saved.id}`, "DELETE");
      const remaining = await listConnections();
      assert.ok(
        !remaining.some((connection) => connection.id === saved.id),
        "The temporary validation connection was not removed.",
      );
      assert.ok(
        remaining.some((connection) => connection.id === existing.id),
        "The existing fixture connection was removed.",
      );
    }
  }
  if (existing)
    await complete(
      await api<QueryOperation>(`/api/connections/${existing.id}/test`, "POST", undefined, 202),
    );
  console.log(
    `${fixture.engine}: connection test, hidden draft, promotion, and saved connection test passed.`,
  );
  return existing ?? saved;
}

async function inspectAndBrowse(fixture: Fixture, target: QueryTarget) {
  const schemaQuery =
    fixture.schema === null ? "" : `?schema=${encodeURIComponent(fixture.schema)}`;
  const tables = (
    await api<{ tables: SchemaTable[] }>(
      `/api/connections/${target.connectionId}/schema${schemaQuery}`,
    )
  ).tables;
  const accountTable = tables.find((table) => table.name === name(fixture, "accounts"));
  const orders = tables.find((table) => table.name === name(fixture, "orders"));
  assert.ok(accountTable && orders, `${fixture.engine}: fixture tables are missing from metadata.`);
  if (fixture.engine === "clickhouse" || fixture.engine === "mongodb") {
    assert.ok(
      tables.every(
        (table) =>
          table.relationships.length === 0 && table.columns.every((column) => !column.primaryKey),
      ),
      `${fixture.engine}: metadata fabricated relational keys.`,
    );
    if (fixture.engine === "mongodb")
      assert.ok(
        tables.every(
          (table) =>
            table.columns.length === 1 &&
            table.columns[0].name === "document" &&
            table.columns[0].dataType === "json",
        ),
        "MongoDB metadata must expose one document column.",
      );
  } else {
    assert.ok(
      accountTable.columns.some(
        (column) => column.name === name(fixture, "id") && column.primaryKey,
      ),
      `${fixture.engine}: the account primary key is missing.`,
    );
    const relationship = orders.relationships.find(
      (value) => value.target.table === accountTable.name,
    );
    assert.ok(relationship, `${fixture.engine}: the order foreign key is missing.`);
    assert.deepEqual(relationship.source, {
      database: fixture.database,
      schema: fixture.schema ?? "main",
      table: orders.name,
      columns: [name(fixture, "account_id")],
    });
    assert.deepEqual(relationship.target, {
      database: fixture.database,
      schema: fixture.schema ?? "main",
      table: accountTable.name,
      columns: [name(fixture, "id")],
    });
  }
  const browseInput = { target, table: accountTable.name, page: 0, pageSize: 100 };
  const sort = { column: name(fixture, "id"), direction: "asc" };
  const browsed = await complete(
    await api<QueryOperation>(
      "/api/tables/data",
      "POST",
      {
        ...browseInput,
        ...(fixture.engine === "mongodb" ? {} : { sort }),
      },
      202,
    ),
  );
  assert.ok(browsed.result.rowCount >= 2, `${fixture.engine}: fixture table rows are missing.`);
  if (fixture.engine === "mongodb") {
    documents(browsed.result);
    for (const controls of [
      { sort: { column: "document", direction: "asc" } },
      { filter: { column: "document", operator: "eq", value: "Northwind" } },
      { where: "account_id = 9007199254740993" },
    ])
      assert.equal(
        (await request("/api/tables/data", "POST", { ...browseInput, ...controls })).status,
        400,
      );
    assert.equal(
      (await request("/api/query", "POST", { target, sql: "SELECT 1", mode: "read" })).status,
      400,
    );
    const exact = await read(target, {
      command: JSON.stringify({
        command: "find",
        collection: "accounts",
        filter: { _id: { $oid: "650000000000000000000002" } },
      }),
    });
    assert.equal(exact.result.rowCount, 1);
    const document = documents(exact.result)[0];
    assert.deepEqual(document._id, { $oid: "650000000000000000000002" });
    assert.deepEqual(document.account_id, { $numberLong: "9007199254740993" });
    assert.deepEqual(document.balance, { $numberDecimal: "1234567890123456.12345678" });
    assert.equal(document.name, "Acme");
    assert.equal(document.note, null);
  } else {
    const ids = browsed.result.rows.map((_, index) =>
      BigInt(String(sqlRow(browsed.result, index).id)),
    );
    assert.ok(
      ids.every((id, index) => index === 0 || ids[index - 1] <= id),
      `${fixture.engine}: table sorting failed.`,
    );
    const exact = await read(target, {
      sql: `SELECT * FROM ${accounts(fixture)} WHERE ${quote(fixture, "id")} = 9007199254740993`,
    });
    assert.equal(exact.result.rowCount, 1);
    const row = sqlRow(exact.result);
    assert.equal(row.id, "9007199254740993");
    assert.equal(row.balance, "1234567890123456.12345678");
    assert.match(String(row.created_at), /\.123456/);
    assert.equal(row.name, "Acme");
    assert.equal(row.note, null);
    const where = `${quote(fixture, "id")} = 9007199254740993 AND (${quote(fixture, "name")} = 'Northwind' OR ${quote(fixture, "name")} = 'Acme') AND ${quote(fixture, "note")} IS NULL -- retain paging`;
    const whereInput = { ...browseInput, sort, where: `  ${where}\n` };
    const matched = await complete(
      await api<QueryOperation>("/api/tables/data", "POST", whereInput, 202),
    );
    assert.equal(matched.result.rowCount, 1, `${fixture.engine}: WHERE selected the wrong rows.`);
    assert.equal(sqlRow(matched.result).id, "9007199254740993");
    assert.equal(sqlRow(matched.result).balance, "1234567890123456.12345678");
    const nextPage = await complete(
      await api<QueryOperation>("/api/tables/data", "POST", { ...whereInput, page: 1 }, 202),
    );
    assert.equal(nextPage.result.rowCount, 0, `${fixture.engine}: WHERE paging changed the match.`);
    const rejected = await api<QueryOperation>(
      "/api/tables/data",
      "POST",
      {
        ...browseInput,
        where: `1 = 1); DELETE FROM ${accounts(fixture)} WHERE 1 = 0; --`,
      },
      202,
    );
    await assert.rejects(
      complete(rejected),
      (error: unknown) => error instanceof OperationFailure && error.status === "failed",
      `${fixture.engine}: the read guard accepted a second statement.`,
    );
    console.log(
      `${fixture.engine}: WHERE expressions, exact values, paging, and read guard checks passed.`,
    );
    const filteredInput = {
      ...browseInput,
      sort,
      filter: { column: name(fixture, "name"), operator: "eq", value: "Northwind" },
    };
    if (fixture.engine === "clickhouse") {
      assert.equal((await request("/api/tables/data", "POST", filteredInput)).status, 400);
      const nulls = await complete(
        await api<QueryOperation>(
          "/api/tables/data",
          "POST",
          {
            ...browseInput,
            sort,
            filter: { column: "note", operator: "eq", value: null },
          },
          202,
        ),
      );
      assert.ok(
        nulls.result.rowCount >= 1 &&
          nulls.result.rows.every((_, index) => sqlRow(nulls.result, index).note === null),
        "ClickHouse NULL filtering failed.",
      );
    } else {
      const filtered = await complete(
        await api<QueryOperation>("/api/tables/data", "POST", filteredInput, 202),
      );
      assert.equal(filtered.result.rowCount, 1);
      assert.equal(sqlRow(filtered.result).name, "Northwind");
    }
  }
  if (fixture.engine !== "postgres" && fixture.engine !== "mysql")
    assert.equal(
      (
        await request("/api/rows/prepare", "POST", {
          target,
          table: accountTable.name,
          columns: browsed.result.columns,
          changes: { inserts: [], updates: [], deletes: [browsed.result.rows[0]] },
        })
      ).status,
      400,
    );
  console.log(
    `${fixture.engine}: metadata, relationships, table browsing, precise values, and capability checks passed.`,
  );
}

async function approvedWrites(fixture: Fixture, target: QueryTarget) {
  const id = String(9007199254740994n + BigInt(`0x${randomBytes(7).toString("hex")}`));
  const documentId = `oos-six-${randomUUID()}`;
  const marker = `Six engine qualification ${randomUUID()}`;
  // Kelvo binds MySQL transactions to the selected database and rejects qualified writes.
  const writeTable = fixture.engine === "mysql" ? quote(fixture, "accounts") : accounts(fixture);
  const select: QueryText =
    fixture.engine === "mongodb"
      ? {
          command: JSON.stringify({
            command: "find",
            collection: "accounts",
            filter: { _id: documentId },
          }),
        }
      : { sql: `SELECT * FROM ${accounts(fixture)} WHERE ${quote(fixture, "id")} = ${id}` };
  const insert = (label: string): QueryText =>
    fixture.engine === "mongodb"
      ? {
          command: JSON.stringify({
            command: "insert_one",
            collection: "accounts",
            document: {
              _id: documentId,
              name: label,
              account_id: { $numberLong: id },
              balance: { $numberDecimal: "1234567890123456.12345678" },
              note: null,
            },
          }),
        }
      : {
          sql: `INSERT INTO ${writeTable} (${["id", "name", "balance", "created_at", "note"].map((field) => quote(fixture, field)).join(", ")}) VALUES (${id}, '${label}', '1234567890123456.12345678', ${fixture.engine === "oracle" ? "TO_TIMESTAMP('2026-01-02 03:04:05.654321','YYYY-MM-DD HH24:MI:SS.FF6')" : "'2026-01-02 03:04:05.654321'"}, NULL)`,
        };
  const remove: QueryText =
    fixture.engine === "mongodb"
      ? {
          command: JSON.stringify({
            command: "delete_one",
            collection: "accounts",
            filter: { _id: documentId },
          }),
        }
      : {
          sql:
            fixture.engine === "clickhouse"
              ? `ALTER TABLE ${accounts(fixture)} DELETE WHERE ${quote(fixture, "id")} = ${id}`
              : `DELETE FROM ${writeTable} WHERE ${quote(fixture, "id")} = ${id}`,
        };
  const pendingWrites = new Set<string>();
  async function prepare(text: QueryText) {
    return api<PreparedWrite>("/api/query/prepare", "POST", { target, ...text });
  }
  function execution(text: QueryText, prepared: PreparedWrite) {
    return {
      target,
      ...text,
      mode: "write",
      operationId: prepared.operationId,
      approvalId: prepared.approvalId,
      approvalToken: prepared.approvalToken,
    };
  }
  async function execute(text: QueryText, prepared: PreparedWrite) {
    pendingWrites.add(prepared.operationId);
    try {
      const result = await complete(
        await api<QueryOperation>("/api/query", "POST", execution(text, prepared), 202),
      );
      pendingWrites.delete(prepared.operationId);
      assert.equal(
        result.operationId,
        prepared.operationId,
        "A write returned a different operation ID.",
      );
      return result;
    } catch (error) {
      if (
        error instanceof OperationFailure &&
        ["succeeded", "failed", "cancelled"].includes(error.status)
      )
        pendingWrites.delete(prepared.operationId);
      throw error;
    }
  }
  const rows = async () => (await read(target, select)).result;
  const assertAbsent = async () =>
    assert.equal((await rows()).rowCount, 0, `${fixture.engine}: the test row should be absent.`);
  // A random identifier must be absent before this test owns it or can remove it.
  await assertAbsent();
  let finished = false;
  try {
    const text = insert(marker);
    assert.equal(
      (await request("/api/query", "POST", { target, ...text, mode: "write" })).status,
      403,
    );
    const prepared = await prepare(text);
    assert.match(prepared.operationDigest, /^[a-f0-9]{64}$/);
    await assertAbsent();
    assert.equal(
      (await request("/api/query", "POST", execution(insert(`${marker} changed`), prepared)))
        .status,
      403,
    );
    await assertAbsent();
    const applied = await execute(text, prepared);
    const inserted = await rows();
    assert.equal(
      inserted.rowCount,
      1,
      `${fixture.engine}: the approved insert did not create exactly one row.`,
    );
    if (fixture.engine === "mongodb") {
      const document = documents(inserted)[0];
      assert.equal(document._id, documentId);
      assert.equal(document.name, marker);
      assert.deepEqual(document.account_id, { $numberLong: id });
      assert.deepEqual(document.balance, { $numberDecimal: "1234567890123456.12345678" });
      assert.equal(document.note, null);
    } else {
      const row = sqlRow(inserted);
      assert.equal(row.id, id);
      assert.equal(row.name, marker);
      assert.equal(row.balance, "1234567890123456.12345678");
      assert.match(String(row.created_at), /\.654321/);
      assert.equal(row.note, null);
    }
    assert.equal((await execute(text, prepared)).operationId, applied.operationId);
    assert.equal((await rows()).rowCount, 1, "A repeated insert created another row.");
    const deletion = await prepare(remove);
    await execute(remove, deletion);
    await assertAbsent();
    await execute(remove, deletion);
    await assertAbsent();
    await execute(text, prepared);
    await assertAbsent();
    finished = true;
  } finally {
    if (!finished) {
      // Reconcile the same operations before cleanup. Never resubmit an uncertain write.
      for (const operationId of pendingWrites) {
        try {
          const operation = await api<QueryOperation>(`/api/query/${operationId}`);
          if (["succeeded", "failed", "cancelled"].includes(operation.status))
            pendingWrites.delete(operationId);
        } catch {
          /* Keep the operation pending when its outcome cannot be read. */
        }
      }
      const cleanupId = fixture.engine === "mongodb" ? documentId : id;
      if (pendingWrites.size) {
        console.error(
          `${fixture.engine}: cleanup is pending for test row ${cleanupId}; unconfirmed operations: ${[...pendingWrites].join(", ")}.`,
        );
      } else {
        try {
          if ((await rows()).rowCount > 0) await execute(remove, await prepare(remove));
          await assertAbsent();
          console.log(`${fixture.engine}: removed this test's row after a failed check.`);
        } catch {
          console.error(
            `${fixture.engine}: cleanup is unverified for test row ${cleanupId}; operations: ${[...pendingWrites].join(", ") || "none pending"}.`,
          );
        }
      }
    }
  }
  console.log(
    `${fixture.engine}: approval, changed input rejection, exact insert, delete, and completed write replay checks passed. Test row removed.`,
  );
}

const csrf = await api<{ csrfToken: string }>("/api/auth/csrf");
const signedIn = await request(
  "/api/auth/callback/credentials",
  "POST",
  {
    ...account,
    csrfToken: csrf.csrfToken,
    callbackUrl: origin + "/connections",
  },
  true,
);
assert.ok([200, 302].includes(signedIn.status), "Owner authentication failed.");
const session = await api<{ owner: { email: string } }>("/api/session");
assert.ok(
  session.owner.email === account.email,
  "The authenticated owner does not match the fixture.",
);
for (const fixture of fixtures.filter(
  (fixture) => !requested || requested.includes(fixture.engine),
)) {
  const connection = await testedConnection(fixture);
  const target: QueryTarget = {
    connectionId: connection.id,
    connectionRevision: connection.revision,
    database: fixture.database,
    schema: fixture.schema,
  };
  await inspectAndBrowse(fixture, target);
  await approvedWrites(fixture, target);
}
console.log("Live supported database checks passed.");
