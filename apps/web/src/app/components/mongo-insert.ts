import type { QueryOperation, QueryTarget } from "@synehq-oos/explorer-contracts";
import type { PreparedWrite } from "./write-review";

export interface MongoInsertScope {
  target: QueryTarget;
  collection: string;
}
export interface MongoInsertRecord extends MongoInsertScope {
  operationId: string;
}

/** Validate the document, then embed its original text without converting any value. */
export function mongoInsertCommand(collection: string, document: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(document);
  } catch {
    throw new Error("Enter one valid JSON document. Shell expressions are not supported.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Enter one JSON object. An array or a single value is not a document.");
  const command = `{"command":"insert_one","collection":${JSON.stringify(collection)},"document":${document}}`;
  if (!command.isWellFormed() || new TextEncoder().encode(command).byteLength > 16_384)
    throw new Error("The document and collection must fit within the 16 KiB command limit.");
  return command;
}

export function mongoInsertOperation(value: unknown, operationId: string): QueryOperation {
  if (!value || typeof value !== "object")
    throw new Error("The server returned an invalid insert status. Check the operation again.");
  const state = value as QueryOperation;
  if (
    state.operationId !== operationId ||
    !["queued", "running", "succeeded", "failed", "cancelled", "unknown"].includes(state.status)
  )
    throw new Error("The server returned an invalid insert status. Check the operation again.");
  return state;
}

export const mongoInsertUnresolved = (state: QueryOperation) =>
  ["queued", "running", "unknown"].includes(state.status);

type RequestOperation = (path: string, options?: RequestInit) => Promise<unknown>;
type UpdateOperation = (operation: QueryOperation) => void;
const pollingDelay = () => new Promise<void>((resolve) => setTimeout(resolve, 800));
export class MongoInsertNotSubmittedError extends Error {}

export async function followMongoInsert(
  operationId: string,
  initial: unknown,
  request: RequestOperation,
  update: UpdateOperation,
  pause = pollingDelay,
): Promise<QueryOperation> {
  let state = mongoInsertOperation(initial, operationId);
  update(state);
  while (state.status === "queued" || state.status === "running") {
    await pause();
    state = mongoInsertOperation(
      await request(`/api/query/${encodeURIComponent(operationId)}`),
      operationId,
    );
    update(state);
  }
  return state;
}

/** Submit once. All later requests in this function only read the operation status. */
export async function submitMongoInsert(
  prepared: PreparedWrite,
  request: RequestOperation,
  update: UpdateOperation,
  pause = pollingDelay,
): Promise<QueryOperation> {
  if (
    prepared.command === undefined ||
    !Number.isFinite(Date.parse(prepared.expiresAt)) ||
    Date.parse(prepared.expiresAt) <= Date.now()
  )
    throw new MongoInsertNotSubmittedError("This approval expired. Review the document again.");
  const initial = await request("/api/query", {
    method: "POST",
    body: JSON.stringify({
      target: prepared.target,
      command: prepared.command,
      mode: "write",
      approvalToken: prepared.approvalToken,
      operationId: prepared.operationId,
      approvalId: prepared.approvalId,
    }),
  });
  return followMongoInsert(prepared.operationId, initial, request, update, pause);
}

const journalPrefix = (connectionId: string) => `synehq-oos-mongo-insert:${connectionId}:`;
export const mongoInsertJournalEvent = "mongo-insert-operations-changed";

export function mongoInsertRecords(connectionId: string): MongoInsertRecord[] {
  const records: MongoInsertRecord[] = [];
  const prefix = journalPrefix(connectionId);
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const record = JSON.parse(localStorage.getItem(key) ?? "null") as MongoInsertRecord | null;
      if (
        record &&
        typeof record.operationId === "string" &&
        /^[a-f0-9-]{36}$/.test(record.operationId) &&
        record.target?.connectionId === connectionId &&
        typeof record.target.database === "string" &&
        typeof record.collection === "string"
      )
        records.push(record);
    }
  } catch {
    // The operation dialog retains the current status if browser storage becomes unavailable.
  }
  return records;
}

export function recordMongoInsert(record: MongoInsertRecord, unresolved: boolean): void {
  const key = journalPrefix(record.target.connectionId) + record.operationId;
  if (unresolved) localStorage.setItem(key, JSON.stringify(record));
  else localStorage.removeItem(key);
  window.dispatchEvent(new Event(mongoInsertJournalEvent));
}
