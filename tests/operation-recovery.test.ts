import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  KelvoClient,
  KelvoAdmissionRejected,
  operationDigest,
  sha256,
  type OperationRequest,
  type OperationResponse,
} from "../packages/kelvo-client/src/index";
import { AppStore } from "../apps/web/src/server/store/core";
import { metadataClient } from "../apps/web/src/server/store/database";
import {
  cancelOperation,
  prepareQuery,
  queryRequest,
  readOperation,
  startOperation,
} from "../apps/web/src/server/kelvo/operations";

test("lost write admission reconciles with the original grant and never resubmits", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "oos-recovery-"));
  const path = join(directory, "metadata.sqlite"),
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
    password = "recovery fixture passphrase";
  await store.createOwner({
    token: setup.token,
    email: "owner@example.test",
    name: "Owner",
    password,
  });
  const firstOwner = await store.authenticateOwner("owner@example.test", password);
  assert.ok(firstOwner);
  const connection = await store.createConnection(firstOwner, {
    label: "Fixture",
    engine: "postgres",
    host: "fixture.internal",
    port: 5432,
    database: "fixture",
    username: "reader",
    password: "fixture",
    tlsMode: "verify-full",
    readOnly: false,
  });
  const target = {
    connectionId: connection.id,
    connectionRevision: connection.revision,
    database: connection.database,
    schema: null,
  };
  const sql = "UPDATE fixture SET value = 2 WHERE id = 1";
  const approval = await prepareQuery(firstOwner, target, sql);
  const request = queryRequest(target, sql, "write", approval.operationId, approval.approvalId);
  const digest = operationDigest(request);
  let submits = 0,
    lookups = 0,
    originalGrant = "",
    found = false;
  const completed: OperationResponse = {
    version: 1,
    id: "remote-write",
    request_sha256: digest,
    state: "completed",
    receipt: {
      version: 1,
      operation_id: "remote-write",
      request_sha256: digest,
      outcome: "completed",
      effect: "committed",
      affected_rows: 1,
    },
  };
  t.mock.method(
    KelvoClient.prototype,
    "submit",
    async (_request: OperationRequest, grant: string) => {
      submits += 1;
      originalGrant = grant;
      throw new Error("The submit response was lost.");
    },
  );
  t.mock.method(
    KelvoClient.prototype,
    "lookup",
    async (storedRequest: OperationRequest, grant: string) => {
      lookups += 1;
      assert.deepEqual(storedRequest, request);
      assert.equal(grant, originalGrant);
      return found ? completed : null;
    },
  );
  const uncertain = await startOperation(
    firstOwner,
    target,
    request,
    approval.operationId,
    approval.approvalToken,
  );
  assert.equal(uncertain.status, "unknown");
  assert.equal(submits, 1);
  assert.equal(lookups, 1);
  await store.revokeSession(firstOwner.sessionId);
  const owner = await store.authenticateOwner(firstOwner.email, password);
  assert.ok(owner);
  found = true;
  const recovered = await readOperation(owner, approval.operationId);
  assert.equal(recovered.status, "succeeded");
  assert.equal(recovered.result?.affectedRows, 1);
  assert.equal(submits, 1);
  assert.equal(lookups, 2);
  assert.equal((await readOperation(owner, approval.operationId)).status, "succeeded");
  assert.equal(submits, 1);
  assert.equal(lookups, 2);

  const readRequest = queryRequest(target, "SELECT 1", "read", "fixture-read");
  const readDigest = operationDigest(readRequest);
  t.mock.method(KelvoClient.prototype, "submit", async () => ({
    version: 1,
    id: "remote-read",
    request_sha256: readDigest,
    state: "queued",
  }));
  const running = await startOperation(owner, target, readRequest);
  let cancellations = 0;
  t.mock.method(KelvoClient.prototype, "cancel", async (id: string, digest: string) => {
    cancellations += 1;
    assert.equal(id, "remote-read");
    assert.equal(digest, readDigest);
    return {
      version: 1,
      id,
      request_sha256: digest,
      state: "cancelled_before_start",
      receipt: {
        version: 1,
        operation_id: id,
        request_sha256: digest,
        outcome: "cancelled_before_start",
        effect: "none",
        error_code: "CANCELLED",
      },
    };
  });
  assert.equal((await cancelOperation(owner, running.operationId)).status, "cancelled");
  assert.equal((await readOperation(owner, running.operationId)).status, "cancelled");
  assert.equal(cancellations, 1);

  const resultRequest = queryRequest(target, "SELECT 1", "read", "fixture-result"),
    resultDigest = operationDigest(resultRequest);
  const resultState: OperationResponse = {
    version: 1,
    id: "remote-result",
    request_sha256: resultDigest,
    state: "completed",
    receipt: {
      version: 1,
      operation_id: "remote-result",
      request_sha256: resultDigest,
      outcome: "completed",
      effect: "none",
      result: { id: "result", sha256: "a".repeat(64), bytes: 4, rows: 1, format: "arrow_ipc" },
    },
  };
  let resultGrant = "";
  t.mock.method(
    KelvoClient.prototype,
    "submit",
    async (_request: OperationRequest, grant: string) => {
      resultGrant = grant;
      return resultState;
    },
  );
  t.mock.method(KelvoClient.prototype, "result", async () => {
    throw new Error("The result transport failed.");
  });
  const missingResult = await startOperation(owner, target, resultRequest);
  assert.equal(missingResult.status, "succeeded");
  assert.match(missingResult.error!, /operation completed/);
  const afterExpiry = Date.now() + 301000;
  t.mock.method(Date, "now", () => afterExpiry);
  t.mock.method(
    KelvoClient.prototype,
    "result",
    async (state: OperationResponse, grant: string) => {
      assert.deepEqual(state, resultState);
      assert.equal(grant, resultGrant);
      const claims = JSON.parse(Buffer.from(grant.split(".")[1], "base64url").toString());
      assert.ok(claims.exp < Math.floor(Date.now() / 1000));
      return {
        columns: [{ name: "id", dataType: "Int64" }],
        rows: [["9007199254740993"]],
        rowCount: 1,
        complete: true,
      };
    },
  );
  const resultAfterExpiry = await readOperation(owner, missingResult.operationId);
  assert.equal(resultAfterExpiry.status, "succeeded");
  assert.equal(resultAfterExpiry.result?.rows[0][0], "9007199254740993");
  t.mock.method(Date, "now", () => afterExpiry - 301000);
  await t.test(
    "lost read admission retains its signed key and recovers after expiry without resubmission",
    async (t) => {
      let readSubmits = 0,
        readLookups = 0,
        retainedRead: OperationRequest | undefined,
        retainedGrant = "",
        found = false;
      t.mock.method(
        KelvoClient.prototype,
        "submit",
        async (request: OperationRequest, grant: string) => {
          readSubmits += 1;
          retainedRead = request;
          retainedGrant = grant;
          assert.ok(request.idempotency_key);
          const claims = JSON.parse(Buffer.from(grant.split(".")[1], "base64url").toString());
          assert.equal(claims.jti, request.idempotency_key);
          assert.equal(claims.request_sha256, operationDigest(request));
          throw new Error("Read admission response lost.");
        },
      );
      t.mock.method(
        KelvoClient.prototype,
        "lookup",
        async (request: OperationRequest, grant: string): Promise<OperationResponse | null> => {
          readLookups += 1;
          assert.deepEqual(request, retainedRead);
          assert.equal(grant, retainedGrant);
          const digest = operationDigest(request);
          return found
            ? {
                version: 1,
                id: "recovered-read",
                request_sha256: digest,
                state: "completed",
                receipt: {
                  version: 1,
                  operation_id: "recovered-read",
                  request_sha256: digest,
                  outcome: "completed",
                  effect: "none",
                },
              }
            : null;
        },
      );
      const original = queryRequest(target, "SELECT 1", "read", "");
      const uncertain = await startOperation(owner, target, original);
      assert.equal(original.idempotency_key, "");
      assert.equal(uncertain.status, "unknown");
      assert.equal(readSubmits, 1);
      assert.equal(readLookups, 1);
      const stored = await db.execution.findUniqueOrThrow({
        where: { operationId: uncertain.operationId },
      });
      assert.equal(stored.operationId, retainedRead!.idempotency_key);
      assert.deepEqual(JSON.parse(stored.requestJson), retainedRead);
      assert.ok(stored.dispatchedAt);
      assert.equal(stored.custodyCompletedAt, null);
      assert.equal((await readOperation(owner, uncertain.operationId)).status, "unknown");
      assert.equal(readSubmits, 1);
      assert.equal(readLookups, 2);
      t.mock.method(Date, "now", () => afterExpiry);
      assert.ok(JSON.parse(stored.claimsJson).exp < Math.floor(Date.now() / 1000));
      found = true;
      const recovered = await readOperation(owner, uncertain.operationId);
      assert.equal(recovered.status, "succeeded");
      assert.equal(readSubmits, 1);
      assert.equal(readLookups, 3);
      assert.equal((await readOperation(owner, uncertain.operationId)).status, "succeeded");
      assert.equal(readSubmits, 1);
      assert.equal(readLookups, 3);
    },
  );
  await t.test(
    "bound admission rejection is durable, never replays a write, and retries reads with fresh identities only",
    async (t) => {
      let submissions = 0,
        lookups = 0;
      const attempts: Array<{ request: OperationRequest; grant: string }> = [];
      let mode: "reject" | "third-succeeds" | "mismatch" = "reject";
      t.mock.method(KelvoClient.prototype, "lookup", async () => {
        lookups += 1;
        return null;
      });
      t.mock.method(
        KelvoClient.prototype,
        "submit",
        async (request: OperationRequest, grant: string): Promise<OperationResponse> => {
          submissions += 1;
          attempts.push({ request, grant });
          const digest = operationDigest(request);
          assert.equal(
            JSON.parse(Buffer.from(grant.split(".")[1], "base64url").toString()).jti,
            request.idempotency_key,
          );
          if (mode === "third-succeeds" && attempts.length === 3) {
            const remoteId = `fresh-${request.idempotency_key}`;
            return {
              version: 1,
              id: remoteId,
              request_sha256: digest,
              state: "completed",
              receipt: {
                version: 1,
                operation_id: remoteId,
                request_sha256: digest,
                outcome: "completed",
                effect: "none",
              },
            };
          }
          throw new KelvoAdmissionRejected({
            version: 1,
            admission: "not_admitted",
            code: "RESOURCE_EXHAUSTED",
            request_sha256: digest,
            grant_sha256: mode === "mismatch" ? "0".repeat(64) : sha256(grant),
          });
        },
      );
      const approved = await prepareQuery(owner, target, sql);
      const writeRequest = queryRequest(
        target,
        sql,
        "write",
        approved.operationId,
        approved.approvalId,
      );
      const rejectedWrite = await startOperation(
        owner,
        target,
        writeRequest,
        approved.operationId,
        approved.approvalToken,
      );
      assert.equal(rejectedWrite.status, "failed");
      assert.equal(submissions, 1);
      assert.equal(lookups, 0);
      assert.equal(
        (
          await startOperation(
            owner,
            target,
            writeRequest,
            approved.operationId,
            approved.approvalToken,
          )
        ).status,
        "failed",
      );
      assert.equal(submissions, 1);
      const stored = await db.execution.findUniqueOrThrow({
        where: { operationId: approved.operationId },
      });
      const evidence = JSON.parse(stored.admissionRejectionJson!);
      assert.equal(evidence.request_sha256, stored.operationDigest);
      assert.equal(evidence.grant_sha256, stored.grantDigest);
      assert.equal(
        await db.actionLog.count({
          where: { action: "query.not-admitted", target: approved.operationId },
        }),
        1,
      );
      assert.equal((await store.listActiveExecutions(owner)).length, 0);
      await assert.rejects(
        store.setKelvoOperationId(
          owner,
          approved.operationId,
          "contradictory-operation",
          stored.operationDigest,
        ),
        /not admitted/,
      );
      await t.test(
        "expired duplicates and cancellation retain a proven write rejection",
        async (t) => {
          t.mock.timers.enable({ apis: ["Date"], now: (stored.grantExpiresAt + 1) * 1000 });
          await assert.rejects(
            store.claimExecutionDispatch(owner, approved.operationId),
            /authority expired/,
          );
          const consumed = (
            await db.queryApproval.findUniqueOrThrow({ where: { id: approved.approvalId } })
          ).consumedAt;
          assert.ok(consumed);
          const priorCancellations = cancellations;
          assert.equal(
            (
              await startOperation(
                owner,
                target,
                writeRequest,
                approved.operationId,
                approved.approvalToken,
              )
            ).status,
            "failed",
          );
          assert.equal((await cancelOperation(owner, approved.operationId)).status, "failed");
          assert.equal(submissions, 1);
          assert.equal(lookups, 0);
          assert.equal(cancellations, priorCancellations);
          assert.deepEqual(
            (await db.queryApproval.findUniqueOrThrow({ where: { id: approved.approvalId } }))
              .consumedAt,
            consumed,
          );
        },
      );
      attempts.length = 0;
      mode = "third-succeeds";
      const recovered = await startOperation(
        owner,
        target,
        queryRequest(target, "SELECT 1", "read", "capacity-read"),
      );
      assert.equal(recovered.status, "succeeded");
      assert.equal(attempts.length, 3);
      assert.equal(new Set(attempts.map((attempt) => attempt.request.idempotency_key)).size, 3);
      assert.equal(new Set(attempts.map((attempt) => attempt.grant)).size, 3);
      for (const attempt of attempts.slice(0, 2))
        assert.equal(
          (
            await db.execution.findUniqueOrThrow({
              where: { operationId: attempt.request.idempotency_key },
            })
          ).status,
          "failed",
        );
      attempts.length = 0;
      mode = "reject";
      assert.equal(
        (
          await startOperation(
            owner,
            target,
            queryRequest(target, "SELECT 1", "read", "capacity-exhausted"),
          )
        ).status,
        "failed",
      );
      assert.equal(attempts.length, 3);
      assert.equal((await store.listActiveExecutions(owner)).length, 0);
      attempts.length = 0;
      mode = "third-succeeds";
      const metadataRequest: OperationRequest = {
        version: 1,
        kind: "metadata.inspect",
        connection: { id: target.connectionId, database: target.database },
        idempotency_key: "metadata-capacity",
        spec: {
          metadata: { object: "primary_keys", target: { catalog: target.database }, limit: 1000 },
        },
      };
      assert.equal((await startOperation(owner, target, metadataRequest)).status, "succeeded");
      assert.equal(attempts.length, 3);
      assert.equal(new Set(attempts.map((attempt) => attempt.request.idempotency_key)).size, 3);
      attempts.length = 0;
      mode = "mismatch";
      const uncertain = await startOperation(
        owner,
        target,
        queryRequest(target, "SELECT 1", "read", "unbound-rejection"),
      );
      assert.equal(uncertain.status, "unknown");
      assert.equal(attempts.length, 1);
      assert.equal(
        (await db.execution.findUniqueOrThrow({ where: { operationId: uncertain.operationId } }))
          .admissionRejectionJson,
        null,
      );
      await assert.rejects(
        startOperation(
          owner,
          target,
          queryRequest(target, "SELECT 1", "read", "blocked-by-unbound"),
        ),
        /active operation/,
      );
      assert.equal(attempts.length, 1);
      const original = attempts[0];
      t.mock.method(
        KelvoClient.prototype,
        "lookup",
        async (request: OperationRequest, grant: string): Promise<OperationResponse> => {
          assert.deepEqual(request, original.request);
          assert.equal(grant, original.grant);
          const digest = operationDigest(request);
          return {
            version: 1,
            id: "recovered-unbound",
            request_sha256: digest,
            state: "completed",
            receipt: {
              version: 1,
              operation_id: "recovered-unbound",
              request_sha256: digest,
              outcome: "completed",
              effect: "none",
            },
          };
        },
      );
      assert.equal((await readOperation(owner, uncertain.operationId)).status, "succeeded");
    },
  );
  await t.test(
    "new admission reconciles abandoned reads without result downloads and keeps unresolved slots",
    async (t) => {
      const additional = await store.createConnection(owner, {
        label: "Second fixture",
        engine: "postgres",
        host: "fixture.internal",
        port: 5432,
        database: "fixture",
        username: "reader",
        password: "fixture",
        tlsMode: "verify-full",
        readOnly: true,
      });
      const third = await store.createConnection(owner, {
        label: "Third fixture",
        engine: "postgres",
        host: "fixture.internal",
        port: 5432,
        database: "fixture",
        username: "reader",
        password: "fixture",
        tlsMode: "verify-full",
        readOnly: true,
      });
      const secondTarget = { ...target, connectionId: additional.id },
        thirdTarget = { ...target, connectionId: third.id };
      const states = new Map<string, OperationResponse>(),
        grants = new Map<string, string>();
      let submissions = 0,
        polls = 0,
        downloads = 0;
      t.mock.method(
        KelvoClient.prototype,
        "submit",
        async (request: OperationRequest, grant: string): Promise<OperationResponse> => {
          submissions += 1;
          const id = `remote-${request.idempotency_key}`,
            digest = operationDigest(request);
          const state: OperationResponse =
            request.idempotency_key === "admitted-after-recovery"
              ? {
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
                  },
                }
              : { version: 1, id, request_sha256: digest, state: "running" };
          states.set(id, state);
          grants.set(id, grant);
          return state;
        },
      );
      t.mock.method(
        KelvoClient.prototype,
        "poll",
        async (id: string, digest: string, grant: string): Promise<OperationResponse> => {
          polls += 1;
          assert.equal(grant, grants.get(id));
          assert.equal(digest, states.get(id)!.request_sha256);
          return states.get(id)!;
        },
      );
      t.mock.method(KelvoClient.prototype, "result", async () => {
        downloads += 1;
        throw new Error("Admission must not download an abandoned result.");
      });
      const firstRead = await startOperation(
        owner,
        target,
        queryRequest(target, "SELECT 1", "read", "abandoned-first"),
      );
      const secondRead = await startOperation(
        owner,
        secondTarget,
        queryRequest(secondTarget, "SELECT 1", "read", "abandoned-second"),
      );
      assert.equal(firstRead.status, "running");
      assert.equal(secondRead.status, "running");
      await assert.rejects(
        startOperation(
          owner,
          thirdTarget,
          queryRequest(thirdTarget, "SELECT 1", "read", "admitted-after-recovery"),
        ),
        /two active operations/,
      );
      assert.equal(submissions, 2);
      for (const [id, state] of states)
        states.set(id, {
          ...state,
          state: "completed",
          receipt: {
            version: 1,
            operation_id: id,
            request_sha256: state.request_sha256,
            outcome: "completed",
            effect: "none",
            result: {
              id: `result-${id}`,
              sha256: "a".repeat(64),
              bytes: 4,
              rows: 1,
              format: "arrow_ipc",
            },
          },
        });
      const beforePolls = polls;
      const admitted = await startOperation(
        owner,
        thirdTarget,
        queryRequest(thirdTarget, "SELECT 1", "read", "admitted-after-recovery"),
      );
      assert.equal(admitted.status, "succeeded");
      assert.equal(polls - beforePolls, 2);
      assert.equal(submissions, 3);
      assert.equal(downloads, 0);
      for (const read of [firstRead, secondRead])
        assert.equal(
          (await db.execution.findUniqueOrThrow({ where: { operationId: read.operationId } }))
            .status,
          "succeeded",
        );
      t.mock.method(KelvoClient.prototype, "submit", async () => {
        submissions += 1;
        throw new Error("The admission response was lost.");
      });
      t.mock.method(KelvoClient.prototype, "lookup", async () => null);
      const unresolved = await startOperation(
        owner,
        target,
        queryRequest(target, "SELECT 1", "read", "unresolved-read"),
      );
      assert.equal(unresolved.status, "unknown");
      await assert.rejects(
        startOperation(owner, target, queryRequest(target, "SELECT 1", "read", "blocked-read")),
        /active operation/,
      );
      assert.equal(submissions, 4);
      assert.equal(
        (await db.execution.findUniqueOrThrow({ where: { operationId: unresolved.operationId } }))
          .custodyCompletedAt,
        null,
      );
    },
  );
});
