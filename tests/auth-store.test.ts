import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { AppStore } from "../apps/web/src/server/store/core";
import { activateEncryptionKey, runtimeIdentity } from "../apps/web/src/server/crypto/keyring";
import {
  encodeOperation,
  operationDigest,
  serviceScope,
  sha256,
  signGrant,
  type GrantClaims,
  type OperationRequest,
  type OperationResponse,
} from "../packages/kelvo-client/src/protocol";
import type {
  BeginExecutionInput,
  ConnectionInput,
  OwnerIdentity,
} from "../apps/web/src/server/store/types";

const PASSWORD = "local test owner passphrase";
const connectionInput: ConnectionInput = {
  label: "Fixture",
  engine: "postgres",
  host: "database.internal",
  port: 5432,
  database: "fixture",
  username: "reader",
  password: "fixture-db-password",
  tlsMode: "verify-full",
  readOnly: true,
};

async function fixture(t: TestContext) {
  const directory = mkdtempSync(join(process.env.OOS_TEST_TMPDIR ?? tmpdir(), "oos-store-")),
    path = join(directory, "metadata.sqlite"),
    keys = join(directory, "keys");
  const sqlite = new DatabaseSync(path);
  const migrations = resolve("apps/web/prisma/migrations");
  for (const entry of readdirSync(migrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name)))
    sqlite.exec(readFileSync(join(migrations, entry.name, "migration.sql"), "utf8"));
  sqlite.close();
  const db = new PrismaClient({
    datasourceUrl: `file:${path}?connection_limit=1&socket_timeout=10`,
    log: [],
  });
  let time = Date.now();
  const store = new AppStore(db, keys, () => new Date(time));
  t.after(async () => {
    await db.$disconnect();
    rmSync(directory, { recursive: true });
  });
  await store.initializeMetadata();
  return {
    db,
    store,
    path,
    keys,
    advance: (ms: number) => {
      time += ms;
    },
    now: () => time,
  };
}

async function ownerFixture(t: TestContext) {
  const f = await fixture(t);
  const setup = await f.store.issueSetupToken();
  await f.store.createOwner({
    token: setup.token,
    email: "owner@example.test",
    name: "Owner",
    password: PASSWORD,
  });
  const owner = await f.store.authenticateOwner("owner@example.test", PASSWORD);
  assert.ok(owner);
  return { ...f, owner };
}

async function operation(
  f: Awaited<ReturnType<typeof ownerFixture>>,
  connectionId: string,
  revision: number,
  write = false,
  readKind: "query.read" | "connection.test" | "metadata.inspect" = "query.read",
): Promise<BeginExecutionInput> {
  const instance = await f.store.getInstance(),
    operationId = randomUUID(),
    approvalId = write ? randomUUID() : undefined;
  const request: OperationRequest = {
    version: 1,
    kind: write ? "statement.execute" : readKind,
    connection: { id: connectionId, database: "fixture" },
    idempotency_key: write ? operationId : "",
    ...(approvalId ? { approval_id: approvalId } : {}),
    spec: write
      ? { statement: { sql: "UPDATE example SET value = 2 WHERE id = 1", transaction: "required" } }
      : readKind === "connection.test"
        ? {}
        : readKind === "metadata.inspect"
          ? { metadata: { object: "tables", target: { catalog: "fixture" }, limit: 1000 } }
          : { query: { sql: "SELECT 1" } },
  };
  const digest = operationDigest(request),
    issuedAt = Math.floor(f.now() / 1000);
  const claims: GrantClaims = {
    version: 2,
    ...serviceScope(instance.installationId),
    subject: { kind: "user", id: f.owner.id },
    jti: operationId,
    iat: issuedAt,
    exp: issuedAt + 120,
    connection_id: connectionId,
    operation: request.kind,
    request_sha256: digest,
    authorization: write
      ? { kind: "approved_change", approval_id: approvalId!, approved_sha256: digest }
      : { kind: "read" },
  };
  const grant = signGrant(
    claims,
    runtimeIdentity(instance.installationId, f.keys).servicePrivateKeyPem,
  );
  return {
    operationId,
    connectionId,
    connectionRevision: revision,
    database: "fixture",
    schema: null,
    executionEpoch: instance.executionEpoch,
    operationDigest: digest,
    requestJson: encodeOperation(request),
    write,
    ...(approvalId ? { approvalId } : {}),
    grantIssuedAt: issuedAt,
    grantExpiresAt: issuedAt + 120,
    grantDigest: sha256(grant),
    claimsJson: JSON.stringify(claims),
  };
}

test("simultaneous first claims create one owner and never reopen initialized setup", async (t) => {
  const f = await fixture(t),
    setup = await f.store.issueSetupToken();
  const otherDb = new PrismaClient({
    datasourceUrl: `file:${f.path}?connection_limit=1&socket_timeout=10`,
    log: [],
  });
  t.after(() => otherDb.$disconnect());
  const other = new AppStore(otherDb, f.keys);
  const body = {
    token: setup.token,
    email: "owner@example.test",
    name: "Owner",
    password: PASSWORD,
  };
  const results = await Promise.allSettled([
    f.store.createOwner(body),
    other.createOwner({ ...body, email: "second@example.test" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await f.db.owner.count(), 1);
  assert.equal((await f.store.setupStatus()).initialized, true);
  await assert.rejects(f.store.issueSetupToken(), /already complete/);
  await assert.rejects(f.store.createOwner(body), /already complete/);
  await f.db.owner.delete({ where: { id: "owner" } });
  assert.deepEqual(await f.store.setupStatus(), {
    initialized: true,
    allowSignup: false,
    recoveryRequired: true,
  });
  await assert.rejects(
    f.store.createOwnerLocally({ email: body.email, name: body.name, password: PASSWORD }),
    /already complete/,
  );
  await assert.rejects(
    f.store.recoverOwnerPassword("another safe passphrase"),
    /owner record is missing/,
  );
});

test("expired setup tokens and disabled web signup cannot claim an owner", async (t) => {
  const f = await fixture(t),
    setup = await f.store.issueSetupToken();
  f.advance(31 * 60 * 1000);
  await assert.rejects(
    f.store.createOwner({
      token: setup.token,
      email: "owner@example.test",
      name: "Owner",
      password: PASSWORD,
    }),
    /invalid or expired/,
  );
  const before = process.env.ALLOW_SIGNUP;
  process.env.ALLOW_SIGNUP = "false";
  try {
    await assert.rejects(
      f.store.createOwner({
        token: (await f.store.issueSetupToken()).token,
        email: "owner@example.test",
        name: "Owner",
        password: PASSWORD,
      }),
      /disabled/,
    );
    await f.store.createOwnerLocally({
      email: "owner@example.test",
      name: "Owner",
      password: PASSWORD,
    });
  } finally {
    if (before === undefined) delete process.env.ALLOW_SIGNUP;
    else process.env.ALLOW_SIGNUP = before;
  }
  assert.equal(await f.db.owner.count(), 1);
});

test("connection secrets stay encrypted, require a live session, and fail closed on corruption", async (t) => {
  const f = await ownerFixture(t);
  const connection = await f.store.createConnection(f.owner, connectionInput);
  assert.equal(connection.hasSecret, true);
  assert.equal("password" in connection, false);
  assert.equal(
    (
      await f.db.connection.findUniqueOrThrow({ where: { id: connection.id } })
    ).credentials!.includes("fixture-db-password"),
    false,
  );
  assert.equal(
    (await f.store.decryptConnection(f.owner, connection.id, 1)).password,
    "fixture-db-password",
  );
  const updated = await f.store.updateConnection(f.owner, connection.id, {
    label: "Updated",
    revision: 1,
  });
  assert.equal(
    (await f.store.decryptConnection(f.owner, connection.id, updated.revision)).password,
    "fixture-db-password",
  );
  await assert.rejects(
    f.store.updateConnection(f.owner, connection.id, { label: "Stale", revision: 1 }),
    /connection changed/i,
  );
  await assert.rejects(
    f.store.createConnection(f.owner, { ...connectionInput, tlsMode: "disable" }),
    /verified TLS/,
  );
  await assert.rejects(
    f.store.createConnection(f.owner, { ...connectionInput, tlsClientKey: "unsupported" }),
    /Unrecognized key/,
  );
  await f.db.connection.update({
    where: { id: connection.id },
    data: { credentials: "plaintext must not be returned" },
  });
  await assert.rejects(f.store.decryptConnection(f.owner, connection.id), /could not be decrypted/);
  await f.store.recoverOwnerPassword("recovered owner passphrase");
  await assert.rejects(f.store.listConnections(f.owner), /Sign in/);
  const recovered = await f.store.authenticateOwner(
    "owner@example.test",
    "recovered owner passphrase",
  );
  assert.ok(recovered);
  assert.notEqual(recovered.authVersion, f.owner.authVersion);
  await f.store.deleteConnection(recovered, connection.id);
  assert.equal(
    (await f.db.connection.findUniqueOrThrow({ where: { id: connection.id } })).credentials,
    null,
  );
});

test("a write approval and durable dispatch can each be claimed once", async (t) => {
  const f = await ownerFixture(t),
    connection = await f.store.createConnection(f.owner, { ...connectionInput, readOnly: false });
  const request = await operation(f, connection.id, connection.revision, true);
  const approval = await f.store.createQueryApproval(f.owner, {
    ...request,
    approvalId: request.approvalId!,
    operationId: request.operationId,
  });
  request.approvalToken = approval.token;
  assert.equal((await f.store.beginExecution(f.owner, request)).created, true);
  assert.equal((await f.store.beginExecution(f.owner, request)).created, false);
  assert.deepEqual(
    (
      await Promise.all([
        f.store.claimExecutionDispatch(f.owner, request.operationId),
        f.store.claimExecutionDispatch(f.owner, request.operationId),
      ])
    ).sort(),
    [false, true],
  );
  const custody = {
    kelvoOperationId: "remote-op-1",
    requestDigest: request.operationDigest,
    grantDigest: request.grantDigest,
    workerId: "worker-a",
    workerOwner: "owner-a",
    claim: "claim-a",
  };
  await f.store.setKelvoOperationId(
    f.owner,
    request.operationId,
    custody.kelvoOperationId,
    request.operationDigest,
  );
  assert.equal(
    (await f.store.bindExecutionCustody(request.operationId, custody)).workerId,
    "worker-a",
  );
  await assert.rejects(
    f.store.bindExecutionCustody(request.operationId, { ...custody, workerId: "worker-b" }),
    /another worker/,
  );
  await f.store.updateExecution(f.owner, request.operationId, {
    status: "unknown",
    error: "Transport ended before a receipt.",
  });
  assert.equal(await f.store.claimExecutionDispatch(f.owner, request.operationId), false);
  await f.store.completeExecutionCustody(request.operationId, custody);
  await assert.rejects(f.store.getExecutionForResolver(request.operationId), /not authorized/);
  await f.store.updateExecution(f.owner, request.operationId, {
    status: "succeeded",
    affectedRows: 1,
  });
  assert.equal((await f.store.getExecutionByKelvoId(custody.kelvoOperationId)).status, "succeeded");
  const other = await operation(f, connection.id, connection.revision, true);
  await assert.rejects(
    f.store.beginExecution(f.owner, { ...other, approvalToken: approval.token }),
    /already consumed/,
  );
  assert.equal(await f.db.execution.count(), 1);
});

test("callback-before-submit binding is stable and revoked authority cannot resolve credentials", async (t) => {
  const f = await ownerFixture(t),
    connection = await f.store.createConnection(f.owner, connectionInput),
    request = await operation(f, connection.id, connection.revision);
  await f.store.beginExecution(f.owner, request);
  await f.store.claimExecutionDispatch(f.owner, request.operationId);
  const custody = {
    kelvoOperationId: "callback-first",
    requestDigest: request.operationDigest,
    grantDigest: request.grantDigest,
    workerId: "worker-a",
    workerOwner: "owner-a",
    claim: "claim-a",
  };
  await f.store.bindExecutionCustody(request.operationId, custody);
  assert.equal(
    (
      await f.store.setKelvoOperationId(
        f.owner,
        request.operationId,
        custody.kelvoOperationId,
        request.operationDigest,
      )
    ).claim,
    custody.claim,
  );
  await assert.rejects(
    f.store.setKelvoOperationId(
      f.owner,
      request.operationId,
      "different-id",
      request.operationDigest,
    ),
    /different Kelvo ID/,
  );
  await f.store.updateConnection(f.owner, connection.id, {
    revision: connection.revision,
    label: "Changed",
  });
  await assert.rejects(f.store.getExecutionForResolver(request.operationId), /connection changed/i);
  // Cleanup remains possible after authority expires, but its exact custody is still required.
  f.advance(31 * 60 * 1000);
  await assert.rejects(
    f.store.completeExecutionCustody(request.operationId, { ...custody, claim: "other" }),
    /does not match/,
  );
  await f.store.completeExecutionCustody(request.operationId, custody);
});

test("read, test, and metadata requests accept the public empty idempotency key", async (t) => {
  const f = await ownerFixture(t),
    connection = await f.store.createConnection(f.owner, connectionInput);
  for (const kind of ["query.read", "connection.test", "metadata.inspect"] as const) {
    const input = await operation(f, connection.id, connection.revision, false, kind);
    assert.equal((await f.store.beginExecution(f.owner, input)).created, true);
    assert.equal((await f.store.beginExecution(f.owner, input)).created, false);
    await f.store.updateExecution(f.owner, input.operationId, { status: "cancelled" });
  }
  const input = await operation(f, connection.id, connection.revision);
  const mismatched = {
    ...JSON.parse(input.requestJson),
    idempotency_key: "another-operation",
  } as OperationRequest;
  await assert.rejects(
    f.store.beginExecution(f.owner, {
      ...input,
      requestJson: encodeOperation(mismatched),
      operationDigest: operationDigest(mismatched),
    }),
    /idempotency key/,
  );
});

test("admission caps preserve reconciliation and retain unknown work until confirmed cleanup", async (t) => {
  const f = await ownerFixture(t);
  const [a, b, c] = await Promise.all(
    ["A", "B", "C"].map((label) =>
      f.store.createConnection(f.owner, { ...connectionInput, label }),
    ),
  );
  const first = await operation(f, a.id, a.revision);
  await f.store.beginExecution(f.owner, first);
  await f.store.claimExecutionDispatch(f.owner, first.operationId);
  const custody = {
    kelvoOperationId: "active-operation",
    requestDigest: first.operationDigest,
    grantDigest: first.grantDigest,
    workerId: "worker-a",
    workerOwner: "owner-a",
    claim: "claim-a",
  };
  await f.store.bindExecutionCustody(first.operationId, custody);
  const blockedOnA = await operation(f, a.id, a.revision);
  await assert.rejects(
    f.store.beginExecution(f.owner, blockedOnA),
    /connection has an active operation/,
  );
  assert.equal((await f.store.beginExecution(f.owner, first)).created, false);
  const queued = await operation(f, b.id, b.revision);
  await f.store.beginExecution(f.owner, queued);
  await assert.rejects(
    f.store.beginExecution(f.owner, await operation(f, c.id, c.revision)),
    /two active operations/,
  );
  f.advance(121000);
  await f.store.updateExecution(f.owner, first.operationId, {
    status: "unknown",
    error: "The transport ended.",
  });
  await f.store.beginExecution(f.owner, await operation(f, c.id, c.revision));
  const expired = await f.store.getExecution(f.owner, queued.operationId);
  assert.equal(expired.status, "failed");
  assert.equal(expired.dispatchedAt, null);
  await assert.rejects(
    f.store.beginExecution(f.owner, await operation(f, a.id, a.revision)),
    /connection has an active operation/,
  );
  await f.store.completeExecutionCustody(first.operationId, custody);
  assert.equal(
    (await f.store.beginExecution(f.owner, await operation(f, a.id, a.revision))).created,
    true,
  );
  assert.equal((await f.store.getExecution(f.owner, first.operationId)).status, "unknown");
});

test("confirmed receipts survive transport uncertainty and reject changed database effects", async (t) => {
  const f = await ownerFixture(t),
    connection = await f.store.createConnection(f.owner, { ...connectionInput, readOnly: false });
  const input = await operation(f, connection.id, connection.revision, true);
  const approval = await f.store.createQueryApproval(f.owner, {
    ...input,
    approvalId: input.approvalId!,
    operationId: input.operationId,
  });
  await f.store.beginExecution(f.owner, { ...input, approvalToken: approval.token });
  await f.store.claimExecutionDispatch(f.owner, input.operationId);
  await f.store.setKelvoOperationId(
    f.owner,
    input.operationId,
    "receipt-operation",
    input.operationDigest,
  );
  await f.store.updateExecution(f.owner, input.operationId, {
    status: "unknown",
    error: "Connection closed before the receipt arrived.",
  });
  const response: OperationResponse = {
    version: 1,
    id: "receipt-operation",
    request_sha256: input.operationDigest,
    state: "completed",
    receipt: {
      version: 1,
      operation_id: "receipt-operation",
      request_sha256: input.operationDigest,
      outcome: "completed",
      effect: "committed",
      affected_rows: 1,
    },
  };
  const saved = await f.store.recordExecutionReceipt(f.owner, input.operationId, response);
  assert.equal(saved.status, "succeeded");
  assert.equal(saved.error, null);
  assert.deepEqual(JSON.parse(saved.receiptJson!), response);
  assert.equal(
    (
      await f.store.recordExecutionReceipt(f.owner, input.operationId, response)
    ).completedAt!.getTime(),
    saved.completedAt!.getTime(),
  );
  await assert.rejects(
    f.store.updateExecution(f.owner, input.operationId, { status: "unknown" }),
    /confirmed receipt/,
  );
  await assert.rejects(
    f.store.recordExecutionReceipt(f.owner, input.operationId, {
      ...response,
      receipt: { ...response.receipt!, affected_rows: 2 },
    }),
    /receipt changed/,
  );
  await assert.rejects(
    f.store.recordExecutionReceipt(f.owner, input.operationId, {
      ...response,
      receipt: { ...response.receipt!, effect: "none" },
    }),
    /contract/,
  );
});

test("restore revokes old sessions, approvals, epochs, and dispatchable work", async (t) => {
  const f = await ownerFixture(t),
    connection = await f.store.createConnection(f.owner, { ...connectionInput, readOnly: false });
  const pending = await operation(f, connection.id, connection.revision, true);
  const approval = await f.store.createQueryApproval(f.owner, {
    ...pending,
    approvalId: pending.approvalId!,
    operationId: pending.operationId,
  });
  const request = await operation(f, connection.id, connection.revision);
  await f.store.beginExecution(f.owner, request);
  const prior = await f.store.getInstance();
  await f.store.invalidateRestoredAuthority();
  const current = await f.store.getInstance();
  assert.notEqual(current.executionEpoch, prior.executionEpoch);
  assert.equal(
    (await f.db.execution.findUniqueOrThrow({ where: { operationId: request.operationId } }))
      .status,
    "unknown",
  );
  assert.ok(
    (await f.db.queryApproval.findUniqueOrThrow({ where: { id: approval.approvalId } })).consumedAt,
  );
  await assert.rejects(f.store.assertOwnerIdentity(f.owner), /Sign in/);
  const owner = await f.store.authenticateOwner(f.owner.email, PASSWORD);
  assert.ok(owner);
  await assert.rejects(
    f.store.beginExecution(owner, { ...pending, approvalToken: approval.token }),
    /grant claims do not match|old installation state/,
  );
});

test("rotation resumes mixed keys and missing keys never create replacements", async (t) => {
  const f = await ownerFixture(t),
    connection = await f.store.createConnection(f.owner, connectionInput);
  await f.store.saveAiSettings(f.owner, {
    enabled: true,
    endpoint: "https://llm.example.test/v1",
    model: "fixture",
    apiKey: "fixture-provider-key",
  });
  const instance = await f.store.getInstance();
  await f.db.instance.update({
    where: { id: 1 },
    data: { maintenance: true, maintenanceReason: "key-rotation" },
  });
  activateEncryptionKey(instance.installationId, f.keys);
  await assert.rejects(
    f.store.updateConnection(f.owner, connection.id, { revision: 1, password: "changed" }),
    /maintenance/,
  );
  assert.deepEqual(await f.store.rotateSecrets(true), { connections: 1, ai: 1 });
  assert.equal(
    (await f.store.decryptConnection(f.owner, connection.id)).password,
    "fixture-db-password",
  );
  assert.equal((await f.store.decryptAiSettings(f.owner)).apiKey, "fixture-provider-key");
  await f.store.saveAiSettings(f.owner, {
    enabled: false,
    endpoint: "https://llm.example.test/v1",
    model: "fixture",
    revision: 1,
  });
  await assert.rejects(f.store.decryptAiSettings(f.owner), /disabled/);
  unlinkSync(join(f.keys, "encryption-keyring.json"));
  await assert.rejects(f.store.initializeMetadata());
  await assert.rejects(f.store.decryptConnection(f.owner, connection.id), /could not be decrypted/);
});

test("expired idle sessions and forged session identities cannot access connections", async (t) => {
  const f = await ownerFixture(t);
  await assert.rejects(f.store.listConnections({ ...f.owner, sessionId: randomUUID() }), /Sign in/);
  await assert.rejects(
    f.store.listConnections({ ...f.owner, id: "another-owner" } as OwnerIdentity),
    /Sign in/,
  );
  f.advance(31 * 60 * 1000);
  await assert.rejects(f.store.listConnections(f.owner), /Sign in/);
});
