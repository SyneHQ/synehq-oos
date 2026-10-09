import { AppStore } from "./core";
import { metadataClient } from "./database";
import type {
  AiSettingsInput,
  BeginExecutionInput,
  ConnectionInput,
  ConnectionUpdate,
  ExecutionAuthority,
  ExecutionCustody,
  OwnerIdentity,
  QueryApprovalInput,
} from "./types";
import type { OperationStatus } from "@synehq-oos/explorer-contracts";
import type { AdmissionRejection, OperationResponse } from "@synehq-oos/kelvo-client";

export { AppStore } from "./core";
export { StoreError } from "./errors";
export type { ExecutionRecord } from "./core";
export type * from "./types";

export const appStore = () => new AppStore(metadataClient());
export const getInstance = () => appStore().getInstance();
export const initializeMetadata = () => appStore().initializeMetadata();
export const setupStatus = () => appStore().setupStatus();
export const issueSetupToken = () => appStore().issueSetupToken();
export const createOwner = (input: {
  token: string;
  email: string;
  name: string;
  password: string;
}) => appStore().createOwner(input);
export const authenticateOwner = (email: string, password: string) =>
  appStore().authenticateOwner(email, password);
export const assertOwnerIdentity = (
  owner: Pick<OwnerIdentity, "id" | "authVersion" | "sessionId">,
) => appStore().assertOwnerIdentity(owner);
export const revokeSession = (sessionId: string) => appStore().revokeSession(sessionId);
export const changeOwnerPassword = (
  owner: OwnerIdentity,
  currentPassword: string,
  nextPassword: string,
) => appStore().changeOwnerPassword(owner, currentPassword, nextPassword);
export const listConnections = (owner: OwnerIdentity) => appStore().listConnections(owner);
export const getConnection = (owner: OwnerIdentity, id: string) =>
  appStore().getConnection(owner, id);
export const createConnection = (owner: OwnerIdentity, input: ConnectionInput) =>
  appStore().createConnection(owner, input);
export const updateConnection = (owner: OwnerIdentity, id: string, input: ConnectionUpdate) =>
  appStore().updateConnection(owner, id, input);
export const deleteConnection = (owner: OwnerIdentity, id: string) =>
  appStore().deleteConnection(owner, id);
export const decryptConnection = (owner: OwnerIdentity, id: string, revision?: number) =>
  appStore().decryptConnection(owner, id, revision);
export const createQueryApproval = (owner: OwnerIdentity, input: QueryApprovalInput) =>
  appStore().createQueryApproval(owner, input);
export const checkQueryApproval = (
  owner: OwnerIdentity,
  input: QueryApprovalInput & { token: string },
) => appStore().checkQueryApproval(owner, input);
export const beginExecution = (owner: OwnerIdentity, input: BeginExecutionInput) =>
  appStore().beginExecution(owner, input);
export const claimExecutionDispatch = (owner: OwnerIdentity, operationId: string) =>
  appStore().claimExecutionDispatch(owner, operationId);
export const authorizeExecution = (authority: ExecutionAuthority) =>
  appStore().authorizeExecution(authority);
export const getExecutionForResolver = (localId: string) =>
  appStore().getExecutionForResolver(localId);
export const getExecutionByKelvoId = (remoteId: string) =>
  appStore().getExecutionByKelvoId(remoteId);
export const setKelvoOperationId = (
  owner: OwnerIdentity,
  localId: string,
  remoteId: string,
  digest: string,
) => appStore().setKelvoOperationId(owner, localId, remoteId, digest);
export const bindExecutionCustody = (localId: string, custody: ExecutionCustody) =>
  appStore().bindExecutionCustody(localId, custody);
export const completeExecutionCustody = (localId: string, custody: ExecutionCustody) =>
  appStore().completeExecutionCustody(localId, custody);
export const getExecution = (owner: OwnerIdentity, operationId: string) =>
  appStore().getExecution(owner, operationId);
export const listExecutions = (owner: OwnerIdentity) => appStore().listExecutions(owner);
export const listActiveExecutions = (owner: OwnerIdentity) =>
  appStore().listActiveExecutions(owner);
export const recordExecutionReceipt = (
  owner: OwnerIdentity,
  operationId: string,
  receipt: OperationResponse,
) => appStore().recordExecutionReceipt(owner, operationId, receipt);
export const recordAdmissionRejection = (
  owner: OwnerIdentity,
  operationId: string,
  rejection: AdmissionRejection,
) => appStore().recordAdmissionRejection(owner, operationId, rejection);
export const updateExecution = (
  owner: OwnerIdentity,
  operationId: string,
  update: { status: OperationStatus; error?: string; affectedRows?: number; durationMs?: number },
) => appStore().updateExecution(owner, operationId, update);
export const getAiSettings = (owner: OwnerIdentity) => appStore().getAiSettings(owner);
export const saveAiSettings = (owner: OwnerIdentity, input: AiSettingsInput) =>
  appStore().saveAiSettings(owner, input);
export const decryptAiSettings = (owner: OwnerIdentity) => appStore().decryptAiSettings(owner);
export const listSavedQueries = (owner: OwnerIdentity) => appStore().listSavedQueries(owner);
export const saveQuery = (
  owner: OwnerIdentity,
  input: { id?: string; connectionId: string; database: string; title: string; sql: string },
) => appStore().saveQuery(owner, input);
export const deleteSavedQuery = (owner: OwnerIdentity, id: string) =>
  appStore().deleteSavedQuery(owner, id);
