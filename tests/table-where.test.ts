import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_TABLE_WHERE_LENGTH,
  type DatabaseEngine,
  type SchemaTable,
} from "../packages/explorer-contracts/src/index";
import { tableReadRequest, tableRequestSchema } from "../apps/web/src/server/kelvo/schema";

const table: SchemaTable = {
  database: "analytics",
  schema: "public",
  name: "accounts",
  type: "BASE TABLE",
  relationships: [],
  columns: [
    { name: "id", dataType: "bigint", position: 1, nullable: false, primaryKey: true },
    { name: "name", dataType: "text", position: 2, nullable: false, primaryKey: false },
    { name: "balance", dataType: "numeric", position: 3, nullable: false, primaryKey: false },
  ],
};
const input = {
  target: {
    connectionId: "fixture",
    connectionRevision: 1,
    database: "analytics",
    schema: "public",
  },
  table: "accounts",
  page: 2,
  pageSize: 100,
};

test("WHERE expressions retain exact SQL text and dialect pagination in read requests", () => {
  const predicate =
    "id = 9007199254740993 AND balance = 1234567890123456.12345678 OR name = 'O''Reilly; DELETE'";
  for (const engine of [
    "postgres",
    "mysql",
    "clickhouse",
    "sqlite",
    "oracle",
  ] as DatabaseEngine[]) {
    const request = tableReadRequest(
      engine,
      table,
      tableRequestSchema.parse({
        ...input,
        where: `  ${predicate}\n`,
        sort: { column: "name", direction: "desc" },
      }),
    );
    const quote = ["postgres", "sqlite", "oracle"].includes(engine) ? '"' : "`";
    const namespace = ["postgres", "sqlite", "oracle"].includes(engine) ? "public" : "analytics";
    const pagination =
      engine === "oracle" ? " OFFSET 200 ROWS FETCH NEXT 100 ROWS ONLY" : " LIMIT 100 OFFSET 200";
    assert.equal(request.kind, "query.read");
    assert.equal(request.approval_id, undefined);
    assert.equal(request.spec.statement, undefined);
    assert.equal(
      request.spec.query?.sql,
      `SELECT * FROM ${quote}${namespace}${quote}.${quote}accounts${quote} WHERE (\n${predicate}\n) ORDER BY ${quote}name${quote} DESC, ${quote}id${quote} ASC${pagination}`,
    );
    assert.deepEqual(request.spec.query?.parameters, []);
  }
});

test("WHERE bounds, empty expressions, and legacy filters have an unambiguous contract", () => {
  const empty = tableRequestSchema.parse({ ...input, where: " \t\n " });
  assert.equal(empty.where, "");
  assert.equal(tableReadRequest("postgres", table, empty).spec.query?.sql.includes("WHERE"), false);
  assert.equal(
    tableRequestSchema.safeParse({ ...input, where: "x".repeat(MAX_TABLE_WHERE_LENGTH) }).success,
    true,
  );
  assert.equal(
    tableRequestSchema.safeParse({ ...input, where: "x".repeat(MAX_TABLE_WHERE_LENGTH + 1) })
      .success,
    false,
  );
  const filter = { column: "name", operator: "eq", value: "O'Reilly" };
  assert.equal(tableRequestSchema.safeParse({ ...input, where: "id > 1", filter }).success, false);
  const legacy = tableReadRequest(
    "postgres",
    table,
    tableRequestSchema.parse({ ...input, where: "  ", filter }),
  );
  assert.ok(legacy.spec.query?.sql.includes('WHERE CAST("name" AS TEXT) = $1'));
  assert.deepEqual(legacy.spec.query?.parameters, [{ type: "string", value: "O'Reilly" }]);
});

test("line comments cannot consume generated WHERE closure, sorting, or pagination", () => {
  const request = tableReadRequest(
    "postgres",
    table,
    tableRequestSchema.parse({ ...input, where: "id > 0 -- keep the row limit" }),
  );
  assert.ok(
    request.spec.query?.sql.endsWith(
      'WHERE (\nid > 0 -- keep the row limit\n) ORDER BY "id" ASC LIMIT 100 OFFSET 200',
    ),
  );
});

test("MongoDB rejects SQL WHERE expressions and keeps its native document pagination", () => {
  const nativeInput = { ...input, target: { ...input.target, schema: null } };
  assert.throws(
    () =>
      tableReadRequest(
        "mongodb",
        table,
        tableRequestSchema.parse({ ...nativeInput, where: "id > 0" }),
      ),
    /MongoDB console/,
  );
  const request = tableReadRequest("mongodb", table, tableRequestSchema.parse(nativeInput));
  assert.equal(request.kind, "native.read");
  assert.equal(request.spec.query, undefined);
  assert.deepEqual(request.spec.native?.parameters, [
    {
      type: "json",
      value: { collection: "accounts", pipeline: [{ $skip: 200 }, { $limit: 100 }] },
    },
  ]);
});
