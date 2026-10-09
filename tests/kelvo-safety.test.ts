import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSchema } from "../apps/web/src/server/kelvo/schema";
import {
  sha256,
  validateResponse,
  type OperationResponse,
  type Receipt,
} from "../packages/kelvo-client/src/protocol";

test("receipt validation rejects impossible outcomes and changed operation effects", () => {
  const digest = sha256("request");
  const response = (receipt: Partial<Receipt>): OperationResponse => ({
    version: 1,
    id: "operation",
    request_sha256: digest,
    state: receipt.outcome ?? "completed",
    receipt: {
      version: 1,
      operation_id: "operation",
      request_sha256: digest,
      outcome: "completed",
      effect: "none",
      ...receipt,
    },
  });
  assert.equal(
    validateResponse(response({}), digest, "operation", "query.read").state,
    "completed",
  );
  assert.equal(
    validateResponse(response({ effect: "committed" }), digest, "operation", "statement.execute")
      .state,
    "completed",
  );
  for (const receipt of [
    { outcome: "completed", effect: "unknown" },
    { outcome: "completed", error_code: "SOURCE_FAILED" },
    { outcome: "failed", effect: "committed", error_code: "SOURCE_FAILED" },
    { outcome: "failed", effect: "none" },
    {
      outcome: "cancelled_before_start",
      effect: "none",
      affected_rows: 0,
      error_code: "CANCELLED",
    },
    { outcome: "rejected", effect: "partial", error_code: "PERMISSION_DENIED" },
    { outcome: "outcome_unknown", effect: "none", error_code: "OUTCOME_UNKNOWN" },
    { outcome: "failed", effect: "none", error_code: "UNRECOGNIZED" },
  ] as Partial<Receipt>[])
    assert.throws(() => validateResponse(response(receipt), digest));
  assert.throws(() =>
    validateResponse(response({ effect: "committed" }), digest, "operation", "query.read"),
  );
  assert.throws(() =>
    validateResponse(response({ effect: "none" }), digest, "operation", "statement.execute"),
  );
  assert.throws(() =>
    validateResponse({ ...response({}), id: "another-operation" }, digest, "operation"),
  );
});

test("schema normalization preserves database boundaries and cross-database MySQL foreign keys", () => {
  const data: Parameters<typeof normalizeSchema>[1] = {
    tables: [
      { catalog: "orders", schema_name: "orders", name: "lines", type: "BASE TABLE" },
      { catalog: "other", schema_name: "orders", name: "lines", type: "VIEW" },
    ],
    columns: [
      {
        schema_name: "orders",
        table_name: "lines",
        name: "product_id",
        type: "bigint",
        nullable: "NO",
        position: 1,
      },
      {
        catalog: "other",
        schema_name: "orders",
        table_name: "lines",
        name: "unrelated",
        type: "text",
        position: 2,
      },
    ],
    primary_keys: [
      { catalog: "other", schema_name: "orders", table_name: "lines", column_name: "product_id" },
    ],
    foreign_keys: [
      {
        schema_name: "orders",
        table_name: "lines",
        name: "product_fk",
        column_name: "product_id",
        position: 1,
        referenced_schema: "catalog",
        referenced_table: "products",
        referenced_column: "id",
      },
    ],
  };
  const tables = normalizeSchema("orders", data, "mysql");
  assert.equal(tables.length, 1);
  assert.equal(tables[0].type, "BASE TABLE");
  assert.equal(tables[0].columns.length, 1);
  assert.equal(tables[0].columns[0].primaryKey, false);
  assert.deepEqual(tables[0].relationships[0].target, {
    database: "catalog",
    schema: "catalog",
    table: "products",
    columns: ["id"],
  });
  assert.equal(
    normalizeSchema("orders", data, "postgres")[0].relationships[0].target.database,
    "orders",
  );
});
