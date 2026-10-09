import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { tableFromArrays, tableToIPC } from "apache-arrow";
import {
  decodeResult,
  decimalString,
  encodeOperation,
  operationDigest,
  serviceScope,
  signGrant,
  timestampString,
  verifyGrant,
  type GrantClaims,
  type OperationRequest,
} from "../packages/kelvo-client/src/index";

test("request encoding matches Go field order, omissions, and HTML escaping", () => {
  const request: OperationRequest = {
    kind: "query.read",
    version: 1,
    idempotency_key: "",
    connection: { schema: "public", database: "app", id: "saved-1" },
    spec: { query: { sql: "SELECT '<>&\u2028'", parameters: [] } },
  };
  const expected =
    '{"version":1,"kind":"query.read","connection":{"id":"saved-1","database":"app","schema":"public"},"idempotency_key":"","spec":{"query":{"sql":"SELECT \'\\u003c\\u003e\\u0026\\u2028\'"}}}';
  assert.equal(encodeOperation(request), expected);
  assert.equal(
    operationDigest(request),
    createHash("sha256")
      .update("kelvo.database.operation.v1\0" + expected)
      .digest("hex"),
  );
  assert.notEqual(
    operationDigest(request),
    operationDigest({ ...request, spec: { query: { sql: "SELECT '<>&\u2028' " } } }),
  );
});

test("signed grants bind SQL, schema, approval, and installation", () => {
  const pair = generateKeyPairSync("ed25519");
  const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const operation: OperationRequest = {
    version: 1,
    kind: "statement.execute",
    connection: { id: "saved-1", database: "app", schema: "public" },
    idempotency_key: "operation-1",
    approval_id: "approval-1",
    spec: {
      statement: { sql: "UPDATE items SET quantity = 2 WHERE id = 1", transaction: "required" },
    },
  };
  const now = Math.floor(Date.now() / 1000);
  const claims: GrantClaims = {
    version: 2,
    ...serviceScope("fixture"),
    subject: { kind: "user", id: "owner" },
    jti: "operation-1",
    iat: now,
    exp: now + 60,
    connection_id: "saved-1",
    operation: "statement.execute",
    request_sha256: operationDigest(operation),
    authorization: {
      kind: "approved_change",
      approval_id: "approval-1",
      approved_sha256: operationDigest(operation),
    },
  };
  const token = signGrant(claims, privateKey);
  assert.deepEqual(verifyGrant(token, publicKey, "fixture", operation), claims);
  assert.throws(() => verifyGrant(token, publicKey, "other-installation", operation));
  assert.throws(() =>
    verifyGrant(token, publicKey, "fixture", {
      ...operation,
      connection: { ...operation.connection, schema: "other" },
    }),
  );
  assert.throws(() =>
    verifyGrant(token, publicKey, "fixture", { ...operation, approval_id: "approval-2" }),
  );
});

test("Arrow decoding requires complete framing and exact row count", () => {
  const bytes = Buffer.from(
    tableToIPC(
      tableFromArrays({
        label: ["a", "b"],
        amount: [1.5, null],
        exact: new BigInt64Array([9007199254740993n, -9007199254740993n]),
      }),
      "stream",
    ),
  );
  // String dictionaries are outside the supported database adapter result contract.
  const plain = Buffer.from(
    tableToIPC(
      tableFromArrays({
        amount: new Float64Array([1.5, 2.5]),
        exact: new BigInt64Array([9007199254740993n, -9007199254740993n]),
      }),
      "stream",
    ),
  );
  assert.deepEqual(decodeResult(plain, 2).rows, [
    [1.5, "9007199254740993"],
    [2.5, "-9007199254740993"],
  ]);
  assert.throws(() => decodeResult(plain.subarray(0, -8), 2));
  assert.throws(() => decodeResult(Buffer.concat([plain, Buffer.alloc(8)]), 2));
  assert.throws(() => decodeResult(plain, 3));
  assert.throws(() => decodeResult(bytes, 2));
});

test("decimal and timestamp display preserve exact low digits", () => {
  assert.equal(decimalString(new Uint32Array([12345, 0, 0, 0]), 4), "1.2345");
  assert.equal(
    decimalString(new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff]), 4),
    "-0.0001",
  );
  assert.equal(timestampString(1234567n, 2), "1970-01-01T00:00:01.234567");
  assert.equal(timestampString(-1n, 3, "UTC"), "1969-12-31T23:59:59.999999999Z");
});
