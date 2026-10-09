import type {
  ConnectionSummary,
  ConnectionTestResult,
  QueryOperation,
} from "@synehq-oos/explorer-contracts";
import { ApiError, api } from "./api";

export interface ConnectionSaveAttempt {
  draftId: string;
  operationId: string;
}

export class ConnectionSaveRejected extends ApiError {
  constructor(error: ApiError) {
    super(error.message, error.status, error.notSubmitted, error.fieldErrors, error.code);
  }
}

export function connectionSavePayload(result: ConnectionTestResult): ConnectionSaveAttempt {
  if (
    result.status !== "succeeded" ||
    !result.draftId ||
    !result.operationId ||
    !result.expiresAt ||
    !Number.isFinite(Date.parse(result.expiresAt))
  ) {
    throw new Error("The test response was incomplete. No connection was saved. Test again.");
  }
  if (Date.parse(result.expiresAt) <= Date.now())
    throw new Error("The connection test expired. Test the connection again.");
  return { draftId: result.draftId, operationId: result.operationId };
}

export async function submitConnectionSave(
  attempt: ConnectionSaveAttempt,
  signal?: AbortSignal,
  retry = false,
): Promise<ConnectionSummary> {
  try {
    const saved = await api<{ connection: ConnectionSummary }>("/api/connections", {
      method: "POST",
      body: JSON.stringify({ draftId: attempt.draftId, operationId: attempt.operationId }),
      signal,
    });
    if (saved.connection.id !== attempt.draftId)
      throw new Error(
        "The save response does not match the tested connection. Check the save status again.",
      );
    return saved.connection;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.code === "CONNECTION_TEST_GONE" ||
        error.code === "CONNECTION_TEST_EXPIRED" ||
        (!retry && error.code === "CONNECTION_TEST_REQUIRED"))
    )
      throw new ConnectionSaveRejected(error);
    throw error;
  }
}

export async function reconcileConnectionSave(
  attempt: ConnectionSaveAttempt,
  signal?: AbortSignal,
): Promise<ConnectionSummary> {
  const saved = await api<{ connections: ConnectionSummary[] }>("/api/connections", { signal });
  const connection = saved.connections.find((item) => item.id === attempt.draftId);
  if (connection) return connection;
  // The server permits an exact retry for a saved draft, even after its original expiry.
  return submitConnectionSave(attempt, signal, true);
}

export async function waitForConnectionTest<T extends QueryOperation>(
  initial: T,
  signal?: AbortSignal,
): Promise<T> {
  let operation: QueryOperation = initial;
  const deadline = Date.now() + 60_000;
  while (operation.status === "queued" || operation.status === "running") {
    signal?.throwIfAborted();
    if (Date.now() >= deadline)
      throw new Error("The connection test did not finish. No successful result was received.");
    await new Promise((resolve) => setTimeout(resolve, 500));
    signal?.throwIfAborted();
    operation = await api<QueryOperation>(`/api/query/${encodeURIComponent(initial.operationId)}`, {
      signal,
    });
    if (operation.operationId !== initial.operationId) {
      throw new Error(
        "The service returned a different connection test. Test the connection again.",
      );
    }
  }
  signal?.throwIfAborted();
  if (operation.status !== "succeeded") {
    throw new Error(
      operation.error ||
        (operation.status === "unknown"
          ? "The connection test result is not known. No successful result was received."
          : operation.status === "cancelled"
            ? "The connection test was cancelled."
            : "The connection test failed."),
    );
  }
  return { ...initial, ...operation };
}
