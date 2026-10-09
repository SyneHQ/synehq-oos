import { randomUUID } from "node:crypto";
import {
  connectionRef,
  encodeOperation,
  goJSON,
  operationDigest,
  serviceScope,
  sha256,
  signGrant,
  KelvoAdmissionRejected,
  validateAdmissionRejection,
  type GrantClaims,
  type OperationRequest,
  type OperationResponse,
  type Parameter,
  isMutatingOperation,
} from "@synehq-oos/kelvo-client";
import type { QueryOperation, QueryTarget } from "@synehq-oos/explorer-contracts";
import { runtimeIdentity } from "../crypto/keyring";
import {
  beginExecution,
  claimExecutionDispatch,
  createQueryApproval,
  getExecution,
  getInstance,
  getConnection,
  listActiveExecutions,
  recordAdmissionRejection,
  recordExecutionReceipt,
  setKelvoOperationId,
  updateExecution,
  StoreError,
  type ExecutionRecord,
  type OwnerIdentity,
} from "../store";
import { kelvoClient } from "./config";
import { mongoRequest } from "./mongodb";
import { removeSnapshot, snapshotBindingSchema } from "./sqlite-files";

export function queryRequest(
  target: QueryTarget,
  sql: string,
  mode: "read" | "write",
  operationId: string,
  approvalId?: string,
  parameters?: Parameter[],
): OperationRequest {
  return {
    version: 1,
    kind: mode === "write" ? "statement.execute" : "query.read",
    connection: connectionRef(target),
    idempotency_key: operationId,
    ...(approvalId ? { approval_id: approvalId } : {}),
    spec:
      mode === "write"
        ? { statement: { sql, ...(parameters ? { parameters } : {}), transaction: "required" } }
        : { query: { sql, ...(parameters ? { parameters } : {}) } },
  };
}
export async function connectionQueryRequest(
  owner: OwnerIdentity,
  target: QueryTarget,
  text: { sql?: string; command?: string },
  mode: "read" | "write",
  operationId: string,
  approvalId?: string,
): Promise<OperationRequest> {
  const connection = await getConnection(owner, target.connectionId);
  if (connection.engine === "mongodb") {
    if (text.sql !== undefined || text.command === undefined)
      throw new StoreError(400, "MongoDB requires a native JSON command.");
    return mongoRequest(target, text.command, mode, operationId, approvalId);
  }
  if (text.command !== undefined || text.sql === undefined)
    throw new StoreError(400, "This database requires SQL text.");
  if (connection.engine === "sqlite" && target.schema !== null)
    throw new StoreError(400, "SQLite uses the main database without a schema target.");
  const request = queryRequest(target, text.sql, mode, operationId, approvalId);
  if (mode === "write" && connection.engine === "clickhouse")
    request.spec.statement!.transaction = "autocommit";
  return request;
}

export async function prepareQuery(
  owner: OwnerIdentity,
  target: QueryTarget,
  sql: string,
  command?: string,
) {
  const operationId = randomUUID(),
    approvalId = randomUUID();
  const request = await connectionQueryRequest(
    owner,
    target,
    command === undefined ? { sql } : { command },
    "write",
    operationId,
    approvalId,
  );
  const digest = operationDigest(request);
  const instance = await getInstance();
  const approval = await createQueryApproval(owner, {
    ...target,
    operationDigest: digest,
    executionEpoch: instance.executionEpoch,
    operationId,
    approvalId,
    sql: command ?? sql,
  });
  return {
    operationId,
    approvalId,
    approvalToken: approval.token,
    operationDigest: digest,
    expiresAt: approval.expiresAt.toISOString(),
  };
}
function token(record: ExecutionRecord) {
  return signGrant(
    JSON.parse(record.claimsJson) as GrantClaims,
    runtimeIdentity().servicePrivateKeyPem,
  );
}
export async function startOperation(
  owner: OwnerIdentity,
  target: QueryTarget,
  request: OperationRequest,
  id: string = request.idempotency_key || randomUUID(),
  approvalToken?: string,
  admissionRetries = 2,
): Promise<QueryOperation> {
  if (!isMutatingOperation(request.kind) && !request.idempotency_key)
    request = { ...request, idempotency_key: id };
  for (const active of await listActiveExecutions(owner))
    await readOperation(owner, active.operationId, { includeResult: false, timeoutMs: 2000 });
  const instance = await getInstance();
  const identity = runtimeIdentity();
  const digest = operationDigest(request);
  const now = Math.floor(Date.now() / 1000);
  const claims: GrantClaims = {
    version: 2,
    ...serviceScope(identity.installationId),
    subject: { kind: "user", id: owner.id },
    jti: id,
    iat: now,
    exp: now + 300,
    connection_id: target.connectionId,
    operation: request.kind,
    request_sha256: digest,
    authorization: isMutatingOperation(request.kind)
      ? { kind: "approved_change", approval_id: request.approval_id!, approved_sha256: digest }
      : { kind: "read" },
  };
  const grant = signGrant(claims, identity.servicePrivateKeyPem);
  const { record } = await beginExecution(owner, {
    ...target,
    operationId: id,
    operationDigest: digest,
    executionEpoch: instance.executionEpoch,
    requestJson: encodeOperation(request),
    write: isMutatingOperation(request.kind),
    ...(approvalToken ? { approvalToken } : {}),
    ...(request.approval_id ? { approvalId: request.approval_id } : {}),
    grantIssuedAt: now,
    grantExpiresAt: now + 300,
    grantDigest: sha256(grant),
    claimsJson: goJSON(claims),
    sql:
      request.spec.query?.sql ??
      request.spec.statement?.sql ??
      (request.spec.native
        ? JSON.stringify({
            command: request.spec.native.command,
            ...(request.spec.native.parameters[0].value as object),
          })
        : undefined),
  });
  if (record.admissionRejectionJson) return readOperation(owner, record.operationId);
  if (!(await claimExecutionDispatch(owner, record.operationId)))
    return readOperation(owner, record.operationId);
  let state: OperationResponse;
  try {
    state = await kelvoClient().submit(request, token(record));
  } catch (cause) {
    if (cause instanceof KelvoAdmissionRejected) {
      let rejected: ExecutionRecord;
      try {
        rejected = await recordAdmissionRejection(owner, record.operationId, cause.rejection);
      } catch {
        return readOperation(owner, record.operationId);
      }
      if (
        admissionRetries > 0 &&
        (request.kind === "query.read" ||
          request.kind === "metadata.inspect" ||
          request.kind === "native.read")
      ) {
        const nextId = randomUUID();
        return startOperation(
          owner,
          target,
          { ...request, idempotency_key: nextId },
          nextId,
          undefined,
          admissionRetries - 1,
        );
      }
      return {
        operationId: record.operationId,
        status: "failed",
        error: rejected.error ?? undefined,
      };
    }
    return readOperation(owner, record.operationId);
  }
  const bound = await setKelvoOperationId(owner, record.operationId, state.id, digest);
  return operationView(owner, bound, state);
}
export async function readOperation(
  owner: OwnerIdentity,
  id: string,
  options: { includeResult?: boolean; timeoutMs?: number } = {},
): Promise<QueryOperation> {
  const record = await getExecution(owner, id);
  if (record.admissionRejectionJson) {
    validateAdmissionRejection(
      JSON.parse(record.admissionRejectionJson),
      record.operationDigest,
      record.grantDigest,
    );
    return { operationId: id, status: "failed", error: record.error ?? undefined };
  }
  if (record.receiptJson)
    return operationView(
      owner,
      record,
      JSON.parse(record.receiptJson) as OperationResponse,
      options.includeResult,
    );
  if (!record.kelvoOperationId) {
    if (!record.dispatchedAt)
      return {
        operationId: id,
        status: record.status as QueryOperation["status"],
        ...(record.error ? { error: record.error } : {}),
      };
    const originalRequest = JSON.parse(record.requestJson) as OperationRequest;
    if (originalRequest.idempotency_key) {
      let recovered: OperationResponse | null;
      try {
        recovered = await kelvoClient(options.timeoutMs).lookup(originalRequest, token(record));
      } catch {
        return unavailableOperation(owner, id, options.includeResult);
      }
      if (recovered) {
        const bound = await setKelvoOperationId(owner, id, recovered.id, record.operationDigest);
        return operationView(owner, bound, recovered, options.includeResult);
      }
    }
    return unavailableOperation(owner, id, options.includeResult);
  }
  let state: OperationResponse;
  try {
    state = await kelvoClient(options.timeoutMs).poll(
      record.kelvoOperationId,
      record.operationDigest,
      token(record),
    );
  } catch {
    return unavailableOperation(owner, id, options.includeResult);
  }
  return operationView(owner, record, state, options.includeResult);
}
async function operationView(
  owner: OwnerIdentity,
  record: ExecutionRecord,
  state: OperationResponse,
  includeResult = true,
): Promise<QueryOperation> {
  const receipt = state.receipt;
  if (!receipt)
    return {
      operationId: record.operationId,
      status: state.state === "queued" ? "queued" : "running",
    };
  const confirmed = await recordExecutionReceipt(owner, record.operationId, state);
  const status = confirmed.status as QueryOperation["status"];
  if (
    confirmed.fileSnapshotJson &&
    confirmed.custodyCompletedAt &&
    ["succeeded", "failed", "cancelled"].includes(status)
  ) {
    try {
      removeSnapshot(snapshotBindingSchema.parse(JSON.parse(confirmed.fileSnapshotJson)));
    } catch {
      /* Retained custody prevents replay if cleanup must be repeated. */
    }
  }
  if (status !== "succeeded" || !includeResult)
    return {
      operationId: record.operationId,
      status,
      ...(confirmed.error ? { error: confirmed.error } : {}),
    };
  try {
    const result = receipt.result
      ? await kelvoClient().result(state, token(confirmed))
      : { columns: [], rows: [], rowCount: 0, complete: true };
    return {
      operationId: record.operationId,
      status,
      result: {
        ...result,
        affectedRows: receipt.affected_rows,
        durationMs: confirmed.durationMs ?? undefined,
      },
    };
  } catch {
    return {
      operationId: record.operationId,
      status,
      error:
        "The database operation completed. Its result is unavailable. Do not repeat a write to retrieve its result.",
    };
  }
}
async function unavailableOperation(
  owner: OwnerIdentity,
  id: string,
  includeResult = true,
): Promise<QueryOperation> {
  const current = await getExecution(owner, id);
  if (current.receiptJson)
    return operationView(
      owner,
      current,
      JSON.parse(current.receiptJson) as OperationResponse,
      includeResult,
    );
  if (["succeeded", "failed", "cancelled"].includes(current.status))
    return {
      operationId: id,
      status: current.status as QueryOperation["status"],
      error: current.error ?? "The database outcome is confirmed. Its result is unavailable.",
    };
  const error = "Kelvo did not confirm the outcome. Check this operation before you run it again.";
  try {
    await updateExecution(owner, id, { status: "unknown", error });
  } catch (failure) {
    const latest = await getExecution(owner, id);
    if (latest.receiptJson)
      return operationView(
        owner,
        latest,
        JSON.parse(latest.receiptJson) as OperationResponse,
        includeResult,
      );
    throw failure;
  }
  return { operationId: id, status: "unknown", error };
}
export async function cancelOperation(owner: OwnerIdentity, id: string): Promise<QueryOperation> {
  const record = await getExecution(owner, id);
  if (record.admissionRejectionJson) return readOperation(owner, id);
  if (record.receiptJson)
    return operationView(owner, record, JSON.parse(record.receiptJson) as OperationResponse);
  if (!record.kelvoOperationId)
    throw new StoreError(
      409,
      "The operation has no confirmed Kelvo ID. Its outcome remains unknown.",
    );
  let state: OperationResponse;
  try {
    state = await kelvoClient().cancel(
      record.kelvoOperationId,
      record.operationDigest,
      token(record),
    );
  } catch {
    return unavailableOperation(owner, id);
  }
  return operationView(owner, record, state);
}
export async function awaitOperation(
  owner: OwnerIdentity,
  initial: QueryOperation,
): Promise<QueryOperation> {
  let state = initial;
  const deadline = Date.now() + 35_000;
  while (["queued", "running"].includes(state.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    state = await readOperation(owner, state.operationId);
  }
  if (state.status !== "succeeded")
    throw new StoreError(502, state.error ?? "The database operation did not complete.");
  return state;
}
