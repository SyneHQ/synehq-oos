import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  KelvoClient,
  operationDigest,
  type OperationRequest,
  type OperationResponse,
} from "../packages/kelvo-client/src/index";
import {
  rowMutationOutcome,
  type CellValue,
  type ConnectionSummary,
  type QueryResult,
  type RowMutationScope,
  type SchemaTable,
} from "../packages/explorer-contracts/src/index";
import {
  executeRowMutation,
  groupRowChanges,
  prepareRowChanges,
  rowStatement,
  RowWriteNotSubmitted,
} from "../apps/web/src/server/kelvo/rows";
import { inspectSchema } from "../apps/web/src/server/kelvo/schema";
import { AppStore } from "../apps/web/src/server/store/core";
import { metadataClient } from "../apps/web/src/server/store/database";
import { queryRequest } from "../apps/web/src/server/kelvo/operations";

const connection: ConnectionSummary = {
  id: "connection",
  label: "Fixture",
  engine: "postgres",
  host: "fixture.internal",
  port: 5432,
  database: "fixture",
  username: "owner",
  tlsMode: "verify-full",
  readOnly: false,
  revision: 1,
  hasSecret: true,
};
const table: SchemaTable = {
  database: "fixture",
  schema: "public",
  name: "accounts",
  type: "BASE TABLE",
  relationships: [],
  columns: [
    { name: "id", dataType: "bigint", position: 1, nullable: false, primaryKey: true },
    { name: "name", dataType: "text", position: 2, nullable: false, primaryKey: false },
    { name: "balance", dataType: "numeric", position: 3, nullable: false, primaryKey: false },
    {
      name: "updated_at",
      dataType: "timestamp with time zone",
      position: 4,
      nullable: false,
      primaryKey: false,
    },
    { name: "note", dataType: "text", position: 5, nullable: true, primaryKey: false },
    { name: "active", dataType: "boolean", position: 6, nullable: false, primaryKey: false },
    { name: "payload", dataType: "jsonb", position: 7, nullable: true, primaryKey: false },
    { name: "bytes", dataType: "bytea", position: 8, nullable: true, primaryKey: false },
  ],
};
const scope: RowMutationScope = {
  target: {
    connectionId: connection.id,
    connectionRevision: 1,
    database: "fixture",
    schema: "public",
  },
  table: "accounts",
  columns: table.columns.map((column) => ({ name: column.name, dataType: "Utf8" })),
};
const original: CellValue[] = [
  "9007199254740993",
  "O'Reilly",
  "1234567890123456.12345678",
  "2026-01-02T03:04:05.123456Z",
  null,
  true,
  '{"id":9007199254740993}',
  "\\x00ff",
];

test("PostgreSQL row updates bind exact values and every original field within one physical row", () => {
  const malicious = "changed'; DELETE FROM accounts; --";
  const statement = rowStatement(connection, table, scope, {
    kind: "update",
    row: original,
    values: [{ column: "name", value: malicious }],
  });
  assert.match(
    statement.sql,
    /^UPDATE "public"\."accounts" SET "name" = \$1 WHERE \(tableoid, ctid\) = \(SELECT tableoid, ctid FROM/,
  );
  assert.match(statement.sql, /FOR UPDATE\)$/);
  assert.match(statement.sql, /"note" IS NULL/);
  assert.match(
    statement.sql,
    /"balance" IS NOT DISTINCT FROM CAST\(CAST\(\$4 AS TEXT\) AS NUMERIC\)/,
  );
  assert.equal(statement.sql.includes(malicious), false);
  assert.deepEqual(statement.parameters[0], { type: "string", value: malicious });
  assert.deepEqual(statement.parameters[1], { type: "int64", value: "9007199254740993" });
  assert.ok(statement.parameters.some((parameter) => parameter.value === original[2]));
  assert.ok(statement.parameters.some((parameter) => parameter.value === original[3]));
  assert.ok(statement.parameters.some((parameter) => parameter.value === original[6]));
  assert.ok(statement.parameters.some((parameter) => parameter.value === "00ff"));
  assert.equal(statement.parameters.length, original.length);
  assert.equal(original[0], "9007199254740993");
});

test("MySQL row changes use null-safe, byte-sensitive predicates and a one-row limit", () => {
  const mysql = { ...connection, engine: "mysql" as const };
  const mysqlTable: SchemaTable = {
    ...table,
    schema: "fixture",
    columns: [
      { name: "id", dataType: "bigint unsigned", position: 1, nullable: false, primaryKey: true },
      { name: "name", dataType: "varchar(255)", position: 2, nullable: false, primaryKey: false },
      {
        name: "amount",
        dataType: "decimal(30,8)",
        position: 3,
        nullable: false,
        primaryKey: false,
      },
    ],
  };
  const mysqlScope = {
    ...scope,
    target: { ...scope.target, schema: "fixture" },
    columns: mysqlTable.columns.map((column) => ({ name: column.name, dataType: "Utf8" })),
  };
  const row = ["18446744073709551615", "Case sensitive", "1234567890123456.12345678"];
  const statement = rowStatement(mysql, mysqlTable, mysqlScope, { kind: "delete", row });
  assert.match(statement.sql, /^DELETE FROM `accounts` WHERE/);
  assert.match(statement.sql, /BINARY `name` <=> BINARY \?/);
  assert.match(statement.sql, /LIMIT 1$/);
  assert.deepEqual(statement.parameters[0], { type: "string", value: "18446744073709551615" });
  assert.deepEqual(statement.parameters[2], { type: "string", value: "1234567890123456.12345678" });
  const insert = rowStatement(mysql, mysqlTable, mysqlScope, { kind: "insert", row });
  assert.equal((insert.sql.match(/VALUES/g) ?? []).length, 1);
  assert.match(insert.sql, /CAST\(\? AS UNSIGNED\)/);
  assert.match(insert.sql, /CAST\(\? AS DECIMAL\(30,8\)\)/);
  const quotedTable = { ...mysqlTable, name: "account`history" },
    quotedScope = { ...mysqlScope, table: quotedTable.name };
  const quoted = rowStatement(mysql, quotedTable, quotedScope, { kind: "insert", row });
  assert.match(quoted.sql, /^INSERT INTO `account``history` /);
  assert.equal(quoted.sql.includes("`fixture`."), false);
  const request = queryRequest(
    quotedScope.target,
    quoted.sql,
    "write",
    "operation",
    "approval",
    quoted.parameters,
  );
  assert.deepEqual(request.connection, {
    id: mysql.id,
    database: mysql.database,
    schema: mysql.database,
  });
  assert.throws(
    () =>
      rowStatement(mysql, { ...quotedTable, schema: "another" }, quotedScope, {
        kind: "insert",
        row,
      }),
    /selected base table and schema/,
  );
  assert.throws(
    () =>
      rowStatement(
        mysql,
        { ...quotedTable, database: "another", schema: "another" },
        {
          ...quotedScope,
          target: { ...quotedScope.target, database: "another", schema: "another" },
        },
        { kind: "insert", row },
      ),
    /connection changed/,
  );
});

test("row preparation rejects incomplete keys, projections, duplicate names, and conflicting snapshots", () => {
  const mutation = { kind: "delete" as const, row: original };
  assert.throws(
    () =>
      rowStatement(
        connection,
        { ...table, columns: table.columns.map((column) => ({ ...column, primaryKey: false })) },
        scope,
        mutation,
      ),
    /complete primary key/,
  );
  assert.throws(
    () => rowStatement(connection, table, { ...scope, columns: scope.columns.slice(1) }, mutation),
    /all table columns/,
  );
  assert.throws(
    () =>
      rowStatement(
        connection,
        table,
        {
          ...scope,
          columns: scope.columns.map((column, index) => (index === 1 ? scope.columns[0] : column)),
        },
        mutation,
      ),
    /unique names/,
  );
  assert.throws(
    () =>
      rowStatement(connection, table, scope, { ...mutation, row: [null, ...original.slice(1)] }),
    /complete primary key/,
  );
  assert.throws(
    () =>
      rowStatement(connection, table, scope, {
        ...mutation,
        row: [9007199254740992, ...original.slice(1)],
      }),
    /cannot be represented safely/,
  );
  assert.throws(
    () =>
      rowStatement(
        connection,
        table,
        { ...scope, target: { ...scope.target, database: "another" } },
        mutation,
      ),
    /connection changed/,
  );
  assert.throws(
    () => rowStatement(connection, { ...table, type: "VIEW" }, scope, mutation),
    /base table/,
  );
  assert.throws(
    () => rowStatement({ ...connection, readOnly: true }, table, scope, mutation),
    /Enable writes/,
  );
  assert.throws(
    () =>
      groupRowChanges(connection, table, scope, {
        inserts: [],
        updates: [
          { row: original, column: "name", value: "One" },
          {
            row: [original[0], "Another snapshot", ...original.slice(2)],
            column: "balance",
            value: "2",
          },
        ],
        deletes: [],
      }),
    /different original row values/,
  );
  assert.throws(
    () =>
      groupRowChanges(connection, table, scope, {
        inserts: [],
        updates: [
          { row: original, column: "name", value: "One" },
          { row: original, column: "name", value: "Two" },
        ],
        deletes: [],
      }),
    /same cell/,
  );
  assert.throws(
    () =>
      groupRowChanges(connection, table, scope, {
        inserts: [],
        updates: [{ row: original, column: "name", value: "One" }],
        deletes: [original],
      }),
    /more than one change/,
  );
});

test("multiple cell edits become one row statement and no-op or oversized edits fail before approval", () => {
  const grouped = groupRowChanges(connection, table, scope, {
    inserts: [],
    updates: [
      { row: original, column: "name", value: "New name" },
      { row: original, column: "balance", value: "2.00000000" },
    ],
    deletes: [],
  });
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].kind, "update");
  assert.match(
    rowStatement(connection, table, scope, grouped[0]).sql,
    /SET "name" = \$1, "balance" = CAST\(CAST\(\$2 AS TEXT\) AS NUMERIC\)/,
  );
  assert.throws(
    () =>
      rowStatement(connection, table, scope, {
        kind: "update",
        row: original,
        values: [{ column: "name", value: original[1] }],
      }),
    /equal the original row/,
  );
  assert.throws(
    () =>
      rowStatement(connection, table, scope, {
        kind: "update",
        row: original,
        values: [{ column: "name", value: "\n".repeat(12000) }],
      }),
    /parameter limit/,
  );
});

test("row outcomes distinguish conflicts and missing affected-row evidence from applied writes", () => {
  const succeeded = {
    operationId: "operation",
    status: "succeeded" as const,
    result: { columns: [], rows: [], rowCount: 0, complete: true },
  };
  assert.equal(
    rowMutationOutcome({ ...succeeded, result: { ...succeeded.result, affectedRows: 1 } }),
    "applied",
  );
  assert.equal(
    rowMutationOutcome({ ...succeeded, result: { ...succeeded.result, affectedRows: 0 } }),
    "conflict",
  );
  assert.equal(
    rowMutationOutcome({ ...succeeded, result: { ...succeeded.result, affectedRows: 2 } }),
    "needs_review",
  );
  assert.equal(rowMutationOutcome(succeeded), "needs_review");
  assert.equal(rowMutationOutcome({ operationId: "operation", status: "unknown" }), "unknown");
});

test("row APIs prepare without a write slot, bind parameters once, and preserve conflict outcomes", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "oos-row-api-")),
    path = join(directory, "metadata.sqlite"),
    keys = join(directory, "keys"),
    tls = join(directory, "tls");
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    OOS_KEY_DIR: process.env.OOS_KEY_DIR,
    OOS_TLS_DIR: process.env.OOS_TLS_DIR,
  };
  process.env.DATABASE_URL = `file:${path}`;
  process.env.OOS_KEY_DIR = keys;
  process.env.OOS_TLS_DIR = tls;
  mkdirSync(tls);
  writeFileSync(join(tls, "ca.crt"), "fixture only; transport is mocked");
  const sqlite = new DatabaseSync(path),
    migrations = resolve("apps/web/prisma/migrations");
  for (const entry of readdirSync(migrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name)))
    sqlite.exec(readFileSync(join(migrations, entry.name, "migration.sql"), "utf8"));
  sqlite.close();
  const db = metadataClient(),
    store = new AppStore(db, keys);
  t.after(async () => {
    await db.$disconnect();
    rmSync(directory, { recursive: true });
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  await store.initializeMetadata();
  const setup = await store.issueSetupToken(),
    password = "row API fixture passphrase";
  await store.createOwner({
    token: setup.token,
    email: "owner@example.test",
    name: "Owner",
    password,
  });
  const owner = await store.authenticateOwner("owner@example.test", password);
  assert.ok(owner);
  const storedConnection = await store.createConnection(owner, {
    label: connection.label,
    engine: connection.engine,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    username: connection.username,
    tlsMode: connection.tlsMode,
    readOnly: false,
    password: "fixture",
  });
  const currentScope = {
    ...scope,
    target: {
      ...scope.target,
      connectionId: storedConnection.id,
      connectionRevision: storedConnection.revision,
    },
  };
  const results = new Map<string, QueryResult>();
  const writes: OperationRequest[] = [];
  let affectedRows = 1,
    loseWriteResponse = false,
    metadataRequests = 0;
  const metadataRows: Record<string, Record<string, CellValue>[]> = {
    tables: [
      { catalog: table.database, schema_name: table.schema, name: table.name, type: table.type },
    ],
    columns: table.columns.map((column) => ({
      schema_name: table.schema,
      table_name: table.name,
      name: column.name,
      type: column.dataType,
      position: column.position,
      nullable: column.nullable ? "YES" : "NO",
      default_value: null,
    })),
    primary_keys: [{ schema_name: table.schema, table_name: table.name, column_name: "id" }],
    foreign_keys: [],
  };
  t.mock.method(
    KelvoClient.prototype,
    "submit",
    async (request: OperationRequest): Promise<OperationResponse> => {
      const id = randomUUID(),
        digest = operationDigest(request);
      if (request.kind === "statement.execute") {
        writes.push(request);
        if (loseWriteResponse) throw new Error("The row submit response was lost.");
        return {
          version: 1,
          id,
          request_sha256: digest,
          state: "completed",
          receipt: {
            version: 1,
            operation_id: id,
            request_sha256: digest,
            outcome: "completed",
            effect: "committed",
            affected_rows: affectedRows,
          },
        };
      }
      assert.equal(request.kind, "metadata.inspect");
      metadataRequests += 1;
      const rows = metadataRows[request.spec.metadata!.object],
        names = rows.length ? Object.keys(rows[0]) : [];
      results.set(id, {
        columns: names.map((name) => ({ name, dataType: "Utf8" })),
        rows: rows.map((row) => names.map((name) => row[name])),
        rowCount: rows.length,
        complete: true,
      });
      return {
        version: 1,
        id,
        request_sha256: digest,
        state: "completed",
        receipt: {
          version: 1,
          operation_id: id,
          request_sha256: digest,
          outcome: "completed",
          effect: "none",
          result: { id, sha256: "a".repeat(64), bytes: 4, rows: rows.length, format: "arrow_ipc" },
        },
      };
    },
  );
  t.mock.method(
    KelvoClient.prototype,
    "result",
    async (state: OperationResponse) => results.get(state.id)!,
  );
  await t.test("concurrent schema refreshes share one metadata inspection", async () => {
    const before = metadataRequests;
    const [first, second] = await Promise.all([
      inspectSchema(owner, storedConnection.id, "public", true),
      inspectSchema(owner, storedConnection.id, "public", true),
    ]);
    assert.deepEqual(first, second);
    assert.equal(metadataRequests - before, 4);
    assert.equal(writes.length, 0);
  });
  const changes = {
    inserts: [],
    updates: [{ row: original, column: "name", value: "Reviewed name" }],
    deletes: [],
  };
  const prepared = await prepareRowChanges(owner, { ...currentScope, changes });
  assert.equal(prepared.operations.length, 1);
  assert.equal(await db.execution.count({ where: { write: true } }), 0);
  assert.equal(await db.execution.count({ where: { status: { in: ["queued", "running"] } } }), 0);
  assert.equal(writes.length, 0);
  const operation = prepared.operations[0],
    execution = {
      ...currentScope,
      mutation: operation.mutation,
      operationId: operation.operationId,
      approvalId: operation.approvalId,
      approvalToken: operation.approvalToken,
    };
  await t.test(
    "row preflight rejection guarantees no write dispatch and preserves the exact approval",
    async () => {
      await assert.rejects(
        executeRowMutation(owner, {
          ...execution,
          mutation: {
            kind: "update",
            row: original,
            values: [{ column: "name", value: "Unapproved name" }],
          },
        }),
        (error: unknown) => {
          assert.ok(error instanceof RowWriteNotSubmitted);
          assert.match(error.message, /approval expired, changed/i);
          return true;
        },
      );
      assert.equal(writes.length, 0);
      assert.equal(await db.execution.count({ where: { operationId: execution.operationId } }), 0);
      assert.equal(
        (await db.queryApproval.findUniqueOrThrow({ where: { id: execution.approvalId } }))
          .consumedAt,
        null,
      );
    },
  );
  assert.equal((await executeRowMutation(owner, execution)).mutationOutcome, "applied");
  assert.equal((await executeRowMutation(owner, execution)).mutationOutcome, "applied");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].spec.statement!.parameters![0].value, "Reviewed name");
  const conflict = (await prepareRowChanges(owner, { ...currentScope, changes })).operations[0];
  affectedRows = 0;
  const result = await executeRowMutation(owner, {
    ...currentScope,
    mutation: conflict.mutation,
    operationId: conflict.operationId,
    approvalId: conflict.approvalId,
    approvalToken: conflict.approvalToken,
  });
  assert.equal(result.status, "succeeded");
  assert.equal(result.mutationOutcome, "conflict");
  assert.equal(writes.length, 2);
  await t.test(
    "a lost row submission remains unknown and cannot claim that it was not submitted",
    async (t) => {
      const pending = (await prepareRowChanges(owner, { ...currentScope, changes })).operations[0];
      loseWriteResponse = true;
      t.mock.method(KelvoClient.prototype, "lookup", async () => null);
      const uncertain = await executeRowMutation(owner, {
        ...currentScope,
        mutation: pending.mutation,
        operationId: pending.operationId,
        approvalId: pending.approvalId,
        approvalToken: pending.approvalToken,
      });
      assert.equal(uncertain.status, "unknown");
      assert.equal(uncertain.mutationOutcome, "unknown");
      assert.equal("notSubmitted" in uncertain, false);
      assert.equal(writes.length, 3);
      assert.ok(
        (await db.execution.findUniqueOrThrow({ where: { operationId: pending.operationId } }))
          .dispatchedAt,
      );
      assert.ok(
        (await db.queryApproval.findUniqueOrThrow({ where: { id: pending.approvalId } }))
          .consumedAt,
      );
    },
  );
});
