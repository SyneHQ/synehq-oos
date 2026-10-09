import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import type { QueryTarget } from "@synehq-oos/explorer-contracts";

export type OperationKind =
  | "connection.test"
  | "metadata.inspect"
  | "query.read"
  | "statement.execute"
  | "native.read"
  | "native.execute";
export type JsonValue =
  | null
  | boolean
  | string
  | number
  | JsonValue[]
  | { [key: string]: JsonValue };
export interface Parameter {
  type: "string" | "int64" | "bool" | "null" | "json";
  value: JsonValue;
}
export interface OperationRequest {
  version: 1;
  kind: OperationKind;
  connection: { id: string; database?: string; schema?: string };
  idempotency_key: string;
  approval_id?: string;
  spec: {
    query?: { sql: string; parameters?: Parameter[] };
    statement?: { sql: string; parameters?: Parameter[]; transaction: "required" | "autocommit" };
    native?: {
      provider: "mongodb";
      command: string;
      parameters: Parameter[];
      return_result?: boolean;
    };
    metadata?: {
      object: "tables" | "columns" | "primary_keys" | "foreign_keys" | "schemas";
      target: { catalog?: string; schema?: string; name?: string };
      cursor?: string;
      limit: number;
    };
  };
}
export interface GrantClaims {
  version: 2;
  iss: string;
  aud: string;
  cluster_tenant: string;
  service_principal: string;
  app_team: string;
  subject: { kind: "user"; id: string };
  jti: string;
  iat: number;
  exp: number;
  connection_id: string;
  operation: OperationKind;
  request_sha256: string;
  authorization:
    | { kind: "read" }
    | { kind: "approved_change"; approval_id: string; approved_sha256: string };
}
export interface ResultRef {
  id: string;
  sha256: string;
  bytes: number;
  rows: number;
  format: string;
}
export interface Receipt {
  version: 1;
  operation_id: string;
  request_sha256: string;
  outcome: "completed" | "rejected" | "failed" | "cancelled_before_start" | "outcome_unknown";
  effect: "none" | "committed" | "partial" | "unknown";
  affected_rows?: number;
  result?: ResultRef;
  error_code?: string;
}
export interface OperationResponse {
  version: 1;
  id: string;
  request_sha256: string;
  state: string;
  receipt?: Receipt;
}
export interface AdmissionRejection {
  version: 1;
  admission: "not_admitted";
  code: "RESOURCE_EXHAUSTED";
  request_sha256: string;
  grant_sha256: string;
}
export const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value);
export const validDigest = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function validateAdmissionRejection(
  value: unknown,
  requestDigest: string,
  grantDigest: string,
): AdmissionRejection {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const record = value as Record<string, unknown>;
  const fields = ["version", "admission", "code", "request_sha256", "grant_sha256"];
  if (
    Object.keys(record).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(record, field)) ||
    record.version !== 1 ||
    record.admission !== "not_admitted" ||
    record.code !== "RESOURCE_EXHAUSTED" ||
    !validDigest(requestDigest) ||
    !validDigest(grantDigest) ||
    record.request_sha256 !== requestDigest ||
    record.grant_sha256 !== grantDigest
  )
    fail();
  return {
    version: 1,
    admission: "not_admitted",
    code: "RESOURCE_EXHAUSTED",
    request_sha256: requestDigest,
    grant_sha256: grantDigest,
  };
}
function fail(): never {
  throw new Error("Invalid Kelvo operation contract.");
}
function text(value: unknown, limit = 256, optional = false): asserts value is string {
  if (
    typeof value !== "string" ||
    (!optional && !value) ||
    Buffer.byteLength(value) > limit ||
    /[\0\r\n]/.test(value) ||
    !value.isWellFormed()
  )
    fail();
}
function sql(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.includes("\0") ||
    !value.isWellFormed() ||
    Buffer.byteLength(value) > 100_000
  )
    fail();
}
function parameters(values?: Parameter[]) {
  if (!values?.length) return undefined;
  if (!Array.isArray(values) || values.length > 1024) fail();
  return values.map((p) => {
    if (p.type === "string") {
      if (typeof p.value !== "string" || !p.value.isWellFormed()) fail();
    } else if (p.type === "int64") {
      if (
        typeof p.value !== "string" ||
        !/^-?(0|[1-9][0-9]*)$/.test(p.value) ||
        BigInt(p.value) < -(1n << 63n) ||
        BigInt(p.value) >= 1n << 63n
      )
        fail();
    } else if (p.type === "bool") {
      if (typeof p.value !== "boolean") fail();
    } else if (p.type === "null") {
      if (p.value !== null) fail();
    } else if (p.type === "json") {
      validateJson(p.value);
    } else fail();
    if (Buffer.byteLength(goJSON(p.value)) > 16_384) fail();
    return { type: p.type, value: p.value };
  });
}

function validateJson(value: JsonValue, depth = 0): void {
  if (depth > 32) fail();
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (!value.isWellFormed() || value.includes("\0")) fail();
    return;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail();
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) validateJson(item, depth + 1);
    return;
  }
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) fail();
  for (const [key, item] of Object.entries(value)) {
    text(key, 1024);
    validateJson(item, depth + 1);
  }
}

export const isMutatingOperation = (kind: OperationKind) =>
  kind === "statement.execute" || kind === "native.execute";

/** Match Go encoding/json, including HTML and Unicode line separator escaping. */
export function goJSON(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
export function encodeOperation(r: OperationRequest): string {
  if (r.version !== 1) fail();
  text(r.connection.id);
  text(r.connection.database ?? "", 256, true);
  text(r.connection.schema ?? "", 256, true);
  text(r.idempotency_key, 128, true);
  text(r.approval_id ?? "", 256, true);
  const connection = {
    id: r.connection.id,
    ...(r.connection.database ? { database: r.connection.database } : {}),
    ...(r.connection.schema ? { schema: r.connection.schema } : {}),
  };
  let spec: OperationRequest["spec"] = {};
  if (r.kind === "connection.test") {
    if (Object.keys(r.spec).length) fail();
  } else if (r.kind === "query.read") {
    if (!r.spec.query || Object.keys(r.spec).length !== 1 || r.approval_id) fail();
    sql(r.spec.query.sql);
    const p = parameters(r.spec.query.parameters);
    spec = { query: { sql: r.spec.query.sql, ...(p ? { parameters: p } : {}) } };
  } else if (r.kind === "statement.execute") {
    const v = r.spec.statement;
    if (
      !v ||
      Object.keys(r.spec).length !== 1 ||
      !r.idempotency_key ||
      !r.approval_id ||
      !["required", "autocommit"].includes(v.transaction)
    )
      fail();
    sql(v.sql);
    const p = parameters(v.parameters);
    spec = {
      statement: { sql: v.sql, ...(p ? { parameters: p } : {}), transaction: v.transaction },
    };
  } else if (r.kind === "native.read" || r.kind === "native.execute") {
    const value = r.spec.native;
    if (
      !value ||
      Object.keys(r.spec).length !== 1 ||
      value.provider !== "mongodb" ||
      !validId(value.command) ||
      !Array.isArray(value.parameters) ||
      value.parameters.length !== 1 ||
      value.parameters[0]?.type !== "json" ||
      (r.kind === "native.execute"
        ? !r.idempotency_key || !r.approval_id
        : Boolean(r.approval_id || value.return_result))
    )
      fail();
    const p = parameters(value.parameters);
    spec = {
      native: {
        provider: "mongodb",
        command: value.command,
        parameters: p!,
        ...(value.return_result ? { return_result: true } : {}),
      },
    };
  } else if (r.kind === "metadata.inspect") {
    const v = r.spec.metadata;
    if (
      !v ||
      Object.keys(r.spec).length !== 1 ||
      !["tables", "columns", "primary_keys", "foreign_keys", "schemas"].includes(v.object) ||
      !Number.isInteger(v.limit) ||
      v.limit < 1 ||
      v.limit > 10000
    )
      fail();
    for (const s of [v.target.catalog, v.target.schema, v.target.name]) text(s ?? "", 256, true);
    text(v.cursor ?? "", 4096, true);
    spec = {
      metadata: {
        object: v.object,
        target: {
          ...(v.target.catalog ? { catalog: v.target.catalog } : {}),
          ...(v.target.schema ? { schema: v.target.schema } : {}),
          ...(v.target.name ? { name: v.target.name } : {}),
        },
        ...(v.cursor ? { cursor: v.cursor } : {}),
        limit: v.limit,
      },
    };
  } else fail();
  const encoded = goJSON({
    version: 1,
    kind: r.kind,
    connection,
    idempotency_key: r.idempotency_key,
    ...(r.approval_id ? { approval_id: r.approval_id } : {}),
    spec,
  });
  if (Buffer.byteLength(encoded) > 256 * 1024) fail();
  return encoded;
}
export const operationDigest = (r: OperationRequest) =>
  sha256(`kelvo.database.operation.v1\0${encodeOperation(r)}`);
export const connectionRef = (t: QueryTarget) => ({
  id: t.connectionId,
  database: t.database,
  ...(t.schema ? { schema: t.schema } : {}),
});
export const serviceScope = (installationId: string) => ({
  iss: "synehq_oos",
  aud: "kelvo_application",
  cluster_tenant: `oos-${sha256(installationId).slice(0, 28)}`,
  service_principal: "synehq_oos",
  app_team: installationId,
});

export function signGrant(claims: GrantClaims, privateKey: string): string {
  const header = Buffer.from(
    goJSON({ alg: "EdDSA", typ: "kelvo-operation+jwt", kid: claims.iss }),
  ).toString("base64url");
  const payload = Buffer.from(goJSON(claims)).toString("base64url");
  const input = `${header}.${payload}`;
  return `${input}.${sign(null, Buffer.from(input), createPrivateKey(privateKey)).toString("base64url")}`;
}
export function verifyGrant(
  token: string,
  publicKey: string,
  installationId: string,
  operation: OperationRequest,
): GrantClaims {
  if (token.length > 32768) fail();
  const parts = token.split(".");
  if (
    parts.length !== 3 ||
    parts.some(
      (p) => !/^[A-Za-z0-9_-]+$/.test(p) || Buffer.from(p, "base64url").toString("base64url") !== p,
    )
  )
    fail();
  if (
    !verify(
      null,
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey(publicKey),
      Buffer.from(parts[2], "base64url"),
    )
  )
    fail();
  const h = JSON.parse(Buffer.from(parts[0], "base64url").toString()) as Record<string, unknown>;
  const c = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as GrantClaims;
  const scope = serviceScope(installationId);
  const now = Math.floor(Date.now() / 1000);
  if (
    Object.keys(h).length !== 3 ||
    h.alg !== "EdDSA" ||
    h.typ !== "kelvo-operation+jwt" ||
    h.kid !== scope.iss ||
    c.version !== 2 ||
    !validId(c.jti) ||
    c.subject?.kind !== "user"
  )
    fail();
  for (const key of Object.keys(scope) as (keyof typeof scope)[]) if (c[key] !== scope[key]) fail();
  if (
    !Number.isInteger(c.iat) ||
    !Number.isInteger(c.exp) ||
    c.iat > now + 30 ||
    c.iat <= 0 ||
    c.exp <= now ||
    c.exp <= c.iat ||
    c.exp - c.iat > 300
  )
    fail();
  if (
    c.connection_id !== operation.connection.id ||
    c.operation !== operation.kind ||
    c.request_sha256 !== operationDigest(operation)
  )
    fail();
  if (isMutatingOperation(operation.kind)) {
    if (
      c.authorization.kind !== "approved_change" ||
      c.authorization.approval_id !== operation.approval_id ||
      c.authorization.approved_sha256 !== c.request_sha256
    )
      fail();
  } else if (c.authorization.kind !== "read" || operation.approval_id) fail();
  return c;
}

export function validateResponse(
  value: unknown,
  digest: string,
  id?: string,
  kind?: OperationKind,
): OperationResponse {
  const r = value as OperationResponse;
  if (!r || r.version !== 1 || !validId(r.id) || (id && r.id !== id) || r.request_sha256 !== digest)
    fail();
  if (["queued", "assigned", "running"].includes(r.state)) {
    if (r.receipt) fail();
    return r;
  }
  const v = r.receipt;
  if (
    !["completed", "rejected", "failed", "cancelled_before_start", "outcome_unknown"].includes(
      r.state,
    ) ||
    !v ||
    v.version !== 1 ||
    v.operation_id !== r.id ||
    v.request_sha256 !== digest ||
    v.outcome !== r.state ||
    !["none", "committed", "partial", "unknown"].includes(v.effect)
  )
    fail();
  if (
    v.affected_rows !== undefined &&
    (!Number.isSafeInteger(v.affected_rows) || v.affected_rows < 0)
  )
    fail();
  if (v.outcome === "completed") {
    if (!["none", "committed"].includes(v.effect) || v.error_code) fail();
  } else if (v.outcome === "rejected" || v.outcome === "cancelled_before_start") {
    if (v.effect !== "none" || v.result || v.affected_rows !== undefined || !v.error_code) fail();
  } else if (v.outcome === "failed") {
    if (!["none", "partial"].includes(v.effect) || v.result || !v.error_code) fail();
  } else if (v.effect !== "unknown" || v.result || !v.error_code) fail();
  if (
    v.error_code &&
    ![
      "INVALID_ARGUMENT",
      "PERMISSION_DENIED",
      "UNSUPPORTED",
      "CONFLICT",
      "DATABASE_MISMATCH",
      "NOT_INITIALIZED",
      "RESOURCE_EXHAUSTED",
      "UNAVAILABLE",
      "CANCELLED",
      "DEADLINE_EXCEEDED",
      "SOURCE_FAILED",
      "OUTCOME_UNKNOWN",
    ].includes(v.error_code)
  )
    fail();
  // This client supports individual statements. It cannot verify batch step receipts.
  const extended = v as Receipt & { steps?: unknown[]; provider_reference?: string };
  if (extended.steps !== undefined && (!Array.isArray(extended.steps) || extended.steps.length))
    fail();
  text(extended.provider_reference ?? "", 512, true);
  if (
    kind &&
    ((!isMutatingOperation(kind) && v.effect !== "none") ||
      (isMutatingOperation(kind) && v.outcome === "completed" && v.effect !== "committed"))
  )
    fail();
  if (
    v.result &&
    (r.state !== "completed" ||
      !validId(v.result.id) ||
      !validDigest(v.result.sha256) ||
      !Number.isSafeInteger(v.result.bytes) ||
      v.result.bytes < 1 ||
      !Number.isSafeInteger(v.result.rows) ||
      v.result.rows < 0 ||
      v.result.format !== "arrow_ipc")
  )
    fail();
  if (Buffer.byteLength(goJSON(v)) > 32768) fail();
  return r;
}
