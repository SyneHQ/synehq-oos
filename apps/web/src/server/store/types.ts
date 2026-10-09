import type { OwnerSummary, ConnectionSummary } from "@synehq-oos/explorer-contracts";

export interface OwnerIdentity extends OwnerSummary {
  authVersion: number;
  sessionId: string;
}
export type ConnectionInput = Omit<ConnectionSummary, "id" | "revision" | "hasSecret"> & {
  password?: string;
  tlsCa?: string;
  tlsClientCert?: string;
  tlsClientKey?: string;
};
export type ConnectionUpdate = Partial<ConnectionInput> & { revision: number };
export interface ConnectionCredentials {
  password: string;
  tlsCa?: string;
  tlsClientCert?: string;
  tlsClientKey?: string;
}
export interface AiSettingsSummary {
  enabled: boolean;
  endpoint: string;
  model: string;
  hasSecret: boolean;
  revision: number;
}
export interface AiSettingsInput {
  enabled: boolean;
  endpoint: string;
  model: string;
  apiKey?: string | null;
  revision?: number;
}
export interface ExecutionScope {
  connectionId: string;
  connectionRevision: number;
  database: string;
  schema: string | null;
  operationDigest: string;
  executionEpoch: string;
}
export interface BeginExecutionInput extends ExecutionScope {
  operationId: string;
  requestJson: string;
  write: boolean;
  approvalToken?: string;
  approvalId?: string;
  grantIssuedAt: number;
  grantExpiresAt: number;
  grantDigest: string;
  claimsJson: string;
  sql?: string;
}
export interface QueryApprovalInput extends ExecutionScope {
  approvalId: string;
  operationId: string;
  sql?: string;
}
export interface ExecutionCustody {
  kelvoOperationId: string;
  requestDigest: string;
  grantDigest: string;
  workerId: string;
  workerOwner: string;
  claim: string;
}
export type ExecutionAuthority = Pick<OwnerIdentity, "id" | "authVersion" | "sessionId"> &
  ExecutionScope & { operationId: string };
