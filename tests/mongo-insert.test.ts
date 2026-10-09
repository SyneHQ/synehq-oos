import { test } from "node:test";
import assert from "node:assert/strict";
import {
  followMongoInsert,
  mongoInsertCommand,
  MongoInsertNotSubmittedError,
  mongoInsertOperation,
  submitMongoInsert,
} from "../apps/web/src/app/components/mongo-insert";
import type { PreparedWrite } from "../apps/web/src/app/components/write-review";
import { parseMongoCommand } from "../apps/web/src/server/kelvo/mongodb";

const operationId = "11111111-1111-4111-8111-111111111111";
function approval(command = mongoInsertCommand("orders", '{"name":"new"}')): PreparedWrite {
  return {
    command,
    target: { connectionId: "mongo", connectionRevision: 2, database: "app", schema: null },
    operationId,
    approvalId: "fixture-approval-id",
    approvalToken: "fixture-approval-token",
    operationDigest: "fixture-digest",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

test("document insertion preserves raw numbers, nesting, arrays, and key order", () => {
  const document =
    ' \n{"unsafe":9007199254740993,"decimal":1.2300,"power":1e3,"zero":-0,"items":[{"a":1},true,null]}\n';
  const command = mongoInsertCommand("orders", document);
  assert.equal(
    command,
    '{"command":"insert_one","collection":"orders","document":' + document + "}",
  );
  assert.throws(() => parseMongoCommand(command, "write"), /canonical Extended JSON/);
});

test("canonical Extended JSON reaches the native insert contract with exact values", () => {
  const document =
    '{"_id":{"$oid":"650000000000000000000002"},"id":{"$numberLong":"9007199254740993"},"items":[{"amount":{"$numberDecimal":"1234567890123456.12345678"},"at":{"$date":{"$numberLong":"1690000000000"}}}],"text":"a,[]\\\"{}"}';
  const command = mongoInsertCommand('orders "archive"', document);
  const parsed = parseMongoCommand(command, "write");
  assert.equal(parsed.command, "insert_one");
  assert.equal(parsed.parameters.collection, 'orders "archive"');
  assert.deepEqual(parsed.parameters.document, JSON.parse(document));
  assert.ok(command.endsWith(document + "}"));
});

test("document review rejects invalid roots, shell code, trailing commands, and oversized UTF-8", () => {
  for (const document of [
    "[]",
    "null",
    "1",
    '"text"',
    '{"x":}',
    "{}; db.orders.drop()",
    '{"x": ObjectId("id")}',
  ])
    assert.throws(() => mongoInsertCommand("orders", document), /JSON/);
  assert.throws(() => mongoInsertCommand("orders", `{"text":"${"é".repeat(9000)}"}`), /16 KiB/);
});

test("an approved insert is submitted once with its exact command and approval", async () => {
  const prepared = approval();
  const calls: { path: string; options?: RequestInit }[] = [];
  const state = await submitMongoInsert(
    prepared,
    async (path, options) => {
      calls.push({ path, options });
      return { operationId, status: "unknown" };
    },
    () => {},
  );
  assert.equal(state.status, "unknown");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/query");
  assert.equal(calls[0].options?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].options?.body)), {
    target: prepared.target,
    command: prepared.command,
    mode: "write",
    operationId,
    approvalId: prepared.approvalId,
    approvalToken: prepared.approvalToken,
  });
});

test("lost submission responses never cause an automatic insert replay", async () => {
  let calls = 0;
  await assert.rejects(
    submitMongoInsert(
      approval(),
      async () => {
        calls++;
        throw new Error("Response lost after dispatch");
      },
      () => {},
    ),
    /Response lost/,
  );
  assert.equal(calls, 1);
});

test("insert polling and recovery use only the original operation status endpoint", async () => {
  const calls: { path: string; method: string }[] = [];
  const states = ["running", "succeeded"];
  const checked: string[] = [];
  const state = await followMongoInsert(
    operationId,
    { operationId, status: "queued" },
    async (path, options) => {
      calls.push({ path, method: options?.method ?? "GET" });
      return { operationId, status: states.shift() };
    },
    (value) => checked.push(value.status),
    async () => {},
  );
  assert.equal(state.status, "succeeded");
  assert.deepEqual(checked, ["queued", "running", "succeeded"]);
  assert.deepEqual(calls, [
    { path: `/api/query/${operationId}`, method: "GET" },
    { path: `/api/query/${operationId}`, method: "GET" },
  ]);
  assert.throws(
    () => mongoInsertOperation({ operationId: "different", status: "succeeded" }, operationId),
    /invalid insert status/,
  );
});

test("expired approvals cannot submit a document", async () => {
  let called = false;
  await assert.rejects(
    submitMongoInsert(
      { ...approval(), expiresAt: "2000-01-01T00:00:00Z" },
      async () => {
        called = true;
        return { operationId, status: "succeeded" };
      },
      () => {},
    ),
    MongoInsertNotSubmittedError,
  );
  assert.equal(called, false);
});
