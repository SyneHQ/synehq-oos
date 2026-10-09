import { test } from "node:test";
import assert from "node:assert/strict";
import { Binary, Table, tableToIPC, vectorFromArray } from "apache-arrow";
import { DATABASE_ENGINES } from "../packages/explorer-contracts/src/databases";
import { connectionDraftSchema } from "../apps/web/src/server/store/connection-input";
import { sourceDescriptor } from "../apps/web/src/server/kelvo/resolver";
import { mongoRequest, parseMongoCommand } from "../apps/web/src/server/kelvo/mongodb";
import { normalizeSchema } from "../apps/web/src/server/kelvo/schema";
import {
  decodeResult,
  encodeOperation,
  operationDigest,
  type OperationRequest,
} from "../packages/kelvo-client/src/index";

test("six database inputs enforce verified network TLS and managed SQLite paths", () => {
  assert.deepEqual(
    [...DATABASE_ENGINES],
    ["clickhouse", "mysql", "postgres", "mongodb", "sqlite", "oracle"],
  );
  for (const engine of DATABASE_ENGINES) {
    const input =
      engine === "sqlite"
        ? { label: "Test", engine, filePath: "example.sqlite" }
        : {
            label: "Test",
            engine,
            host: "localhost",
            database: engine === "oracle" ? "FREEPDB1" : "app",
            ...(engine === "oracle" ? { serviceName: "FREEPDB1" } : {}),
          };
    const valid = connectionDraftSchema.parse(input);
    assert.equal(valid.tlsMode, engine === "sqlite" ? "disable" : "verify-full");
    assert.equal(
      valid.port,
      { clickhouse: 8443, mysql: 3306, postgres: 5432, mongodb: 27017, sqlite: 0, oracle: 2484 }[
        engine
      ],
    );
    if (engine !== "sqlite")
      assert.equal(
        connectionDraftSchema.safeParse({ ...input, tlsMode: "disable" }).success,
        false,
      );
  }
  for (const filePath of [
    "/etc/passwd",
    "../db.sqlite",
    "a/../db.sqlite",
    "a//db.sqlite",
    "a\\db.sqlite",
    "a:db.sqlite",
  ])
    assert.equal(
      connectionDraftSchema.safeParse({ label: "Test", engine: "sqlite", filePath }).success,
      false,
    );
  assert.equal(
    connectionDraftSchema.safeParse({
      label: "Test",
      engine: "oracle",
      host: "localhost",
      serviceName: "FREEPDB1",
      database: "OTHER",
    }).success,
    false,
  );
  assert.equal(
    connectionDraftSchema.safeParse({
      label: "Test",
      engine: "sqlite",
      filePath: "sample.sqlite",
      password: "secret",
    }).success,
    false,
  );
});

test("network descriptors preserve engine credentials and selected database boundaries", () => {
  const base = {
    id: "fixture",
    revision: 1,
    hasSecret: true,
    label: "Fixture",
    host: "localhost",
    username: "owner@example",
    password: "special:/?@#",
    tlsMode: "verify-full" as const,
    readOnly: false,
    database: "app",
  };
  const mongo = sourceDescriptor({ ...base, engine: "mongodb", port: 27017, authSource: "auth" });
  const mongoUrl = new URL(mongo.secrets.KELVO_SOURCE_REQUEST_0_DSN!);
  assert.equal(decodeURIComponent(mongoUrl.username), base.username);
  assert.equal(decodeURIComponent(mongoUrl.password), base.password);
  assert.equal(mongoUrl.searchParams.get("authSource"), "auth");
  assert.equal(mongoUrl.searchParams.get("tls"), "true");
  const clickhouse = sourceDescriptor({ ...base, engine: "clickhouse", port: 8443 });
  assert.equal(clickhouse.secrets.KELVO_SOURCE_REQUEST_0_PASSWORD, base.password);
  assert.equal(new URL(clickhouse.secrets.KELVO_SOURCE_REQUEST_0_URL!).protocol, "https:");
  const oracle = sourceDescriptor({
    ...base,
    engine: "oracle",
    port: 2484,
    database: "FREEPDB1",
    serviceName: "FREEPDB1",
  });
  assert.equal(
    new URL(oracle.secrets.KELVO_SOURCE_REQUEST_0_DSN!).searchParams.get("SSL VERIFY"),
    "true",
  );
});

test("native MongoDB requests match independent Go canonical vectors", () => {
  const read =
    '{"version":1,"kind":"native.read","connection":{"id":"mongo-vector","database":"app"},"idempotency_key":"read-vector","spec":{"native":{"provider":"mongodb","command":"aggregate","parameters":[{"type":"json","value":{"collection":"orders","pipeline":[{"$match":{"status":"paid"}},{"$limit":25}]}}]}}}';
  const write =
    '{"version":1,"kind":"native.execute","connection":{"id":"mongo-vector","database":"app"},"idempotency_key":"write-vector","approval_id":"approval-vector","spec":{"native":{"provider":"mongodb","command":"insert_one","parameters":[{"type":"json","value":{"collection":"orders","document":{"Name":"UPPER","name":"lower","amount":{"$numberDecimal":"12.3400"},"id":{"$numberLong":"9007199254740993"}}}}],"return_result":true}}}';
  for (const [canonical, digest] of [
    [read, "c9c5758652f5219e31e227387ee0eedad64cc8ab9a27f9f2229089985aed3b1b"],
    [write, "784f86e1319c8fb857a69bd0bcf3d1204dc16c69cb8fab7fb1dd30129b61a0c5"],
  ]) {
    const request = JSON.parse(canonical) as OperationRequest;
    assert.equal(encodeOperation(request), canonical);
    assert.equal(operationDigest(request), digest);
  }
  const noApproval = JSON.parse(write) as OperationRequest;
  delete noApproval.approval_id;
  assert.throws(() => encodeOperation(noApproval));
  const readResult = JSON.parse(read) as OperationRequest;
  readResult.spec.native!.return_result = true;
  assert.throws(() => encodeOperation(readResult));
});

test("MongoDB command parsing preserves exact values and requires the matching approval mode", () => {
  for (const numeric of ["1.5", "1e2", "9007199254740993"])
    assert.throws(
      () =>
        parseMongoCommand(
          `{"command":"find","collection":"orders","filter":{"amount":${numeric}}}`,
          "read",
        ),
      /Extended JSON/,
    );
  assert.throws(
    () => parseMongoCommand('{"command":"delete_many","collection":"orders","filter":{}}', "read"),
    /Review/,
  );
  for (const collection of ["system.users", "$cmd", "界".repeat(41)])
    assert.throws(
      () => parseMongoCommand(JSON.stringify({ command: "find", collection }), "read"),
      /collection name/,
    );
  const command =
    '{"command":"insert_one","collection":"orders","document":{"id":{"$numberLong":"9007199254740993"},"text":"<>&\\u2028"}}';
  const request = mongoRequest(
    { connectionId: "mongo", connectionRevision: 1, database: "app", schema: null },
    command,
    "write",
    "operation",
    "approval",
  );
  assert.match(encodeOperation(request), /\\u003c\\u003e\\u0026\\u2028/);
  assert.match(encodeOperation(request), /9007199254740993/);
});

test("MongoDB Arrow results preserve canonical Extended JSON and declare no invented relations", () => {
  const document =
    '{"amount":{"$numberDecimal":"12.3400"},"id":{"$numberLong":"9007199254740993"}}';
  const table = new Table({ document: vectorFromArray([Buffer.from(document)], new Binary()) });
  table.schema.metadata.set("source_format", "mongodb_canonical_ejson");
  table.schema.metadata.set("kelvo_document_format", "kelvo_provider_json_v1");
  const result = decodeResult(Buffer.from(tableToIPC(table, "stream")), 1);
  assert.deepEqual(result.rows, [[document]]);
  assert.equal(result.columns[0].dataType, "json");
  const tables = normalizeSchema(
    "app",
    {
      tables: [{ catalog: "app", schema_name: "app", name: "orders", type: "collection" }],
      columns: [],
      primary_keys: [],
      foreign_keys: [],
    },
    "mongodb",
  );
  assert.deepEqual(tables[0].relationships, []);
  assert.equal(tables[0].columns[0].name, "document");
  assert.equal(tables[0].columns[0].primaryKey, false);
});
