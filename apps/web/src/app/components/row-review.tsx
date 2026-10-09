"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@synehq-oos/ui";
import {
  rowMutationOutcome,
  type ConnectionSummary,
  type PreparedRowChanges,
  type QueryOperation,
  type RowMutationScope,
} from "@synehq-oos/explorer-contracts";
import { api, ApiError, errorMessage } from "./api";

export interface RowReviewSession {
  scope: RowMutationScope;
  prepared: PreparedRowChanges;
}

const journalKey = (connectionId: string) => `synehq-oos-row-operations:${connectionId}`;
function journalIds(connectionId: string): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(journalKey(connectionId)) ?? "[]");
    return Array.isArray(stored)
      ? stored
          .filter((id): id is string => typeof id === "string" && /^[a-f0-9-]{36}$/.test(id))
          .slice(-100)
      : [];
  } catch {
    return [];
  }
}
function recordOperation(connectionId: string, operationId: string, unresolved: boolean) {
  try {
    const ids = new Set(journalIds(connectionId));
    if (unresolved) ids.add(operationId);
    else ids.delete(operationId);
    localStorage.setItem(journalKey(connectionId), JSON.stringify([...ids].slice(-100)));
    window.dispatchEvent(new Event("row-operations-changed"));
  } catch {
    /* The modal still shows the operation ID when storage is unavailable. */
  }
}
function retainOperation(connectionId: string, operation: QueryOperation) {
  const outcome = rowMutationOutcome(operation);
  recordOperation(
    connectionId,
    operation.operationId,
    ["pending", "unknown", "needs_review"].includes(outcome),
  );
}

/** Keep unresolved operation IDs across navigation. This control never submits a write. */
export function RowOperationRecovery({ connectionId }: { connectionId: string }) {
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [checked, setChecked] = useState<Record<string, string>>({});
  useEffect(() => {
    const read = () => setIds(journalIds(connectionId));
    read();
    window.addEventListener("row-operations-changed", read);
    return () => window.removeEventListener("row-operations-changed", read);
  }, [connectionId]);
  async function check() {
    setBusy(true);
    setMessage("");
    try {
      for (const id of ids) {
        const operation = await api<QueryOperation>(`/api/query/${encodeURIComponent(id)}`);
        setChecked((current) => ({ ...current, [id]: rowMutationOutcome(operation) }));
        retainOperation(connectionId, operation);
      }
      setMessage(
        journalIds(connectionId).length
          ? "Some row operations still need a check. Do not repeat these changes."
          : "The server confirmed these operation outcomes. Reload the table before making more changes.",
      );
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!ids.length && !message && !Object.keys(checked).length) return null;
  return (
    <div className="row-recovery" role="status">
      <strong>
        {ids.length ? "Row operations need a status check." : "Row operation check complete."}
      </strong>
      {ids.length > 0 && (
        <>
          <p>Do not repeat these changes while their outcome is unknown.</p>
          <details>
            <summary>Operation IDs</summary>
            {ids.map((id) => (
              <code key={id}>{id}</code>
            ))}
          </details>
          <Button size="sm" loading={busy} onClick={() => void check()}>
            Check operation status
          </Button>
        </>
      )}
      {Object.entries(checked).map(([id, outcome]) => (
        <p key={id}>
          <code>{id}</code> {outcome}
        </p>
      ))}
      {message && <p>{message}</p>}
    </div>
  );
}

export function RowReview({
  connection,
  session,
  onFinish,
}: {
  connection: ConnectionSummary;
  session: RowReviewSession;
  onFinish: (allApplied: boolean, discard: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitted = useRef(false);
  const live = useRef(true);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [states, setStates] = useState<Record<string, QueryOperation>>({});
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const expiresAt = Math.min(
    ...session.prepared.operations.map((item) => Date.parse(item.expiresAt)),
  );
  const expired = !Number.isFinite(expiresAt) || now >= expiresAt;
  useEffect(() => {
    live.current = true;
    const node = dialog.current;
    node?.showModal();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      live.current = false;
      clearInterval(timer);
      node?.close();
    };
  }, []);
  function close() {
    if (!running) onFinish(false, started);
  }
  function update(operation: QueryOperation) {
    retainOperation(connection.id, operation);
    if (live.current) setStates((current) => ({ ...current, [operation.operationId]: operation }));
  }
  async function approve() {
    if (submitted.current || expired) return;
    submitted.current = true;
    setStarted(true);
    setRunning(true);
    setError("");
    let applied = 0;
    for (const prepared of session.prepared.operations) {
      if (!live.current) break;
      if (Date.parse(prepared.expiresAt) <= Date.now()) {
        setError("A remaining approval expired. Completed changes will not run again.");
        break;
      }
      const initial: QueryOperation = { operationId: prepared.operationId, status: "unknown" };
      update(initial);
      try {
        let state = await api<QueryOperation>("/api/rows/execute", {
          method: "POST",
          body: JSON.stringify({
            ...session.scope,
            operationId: prepared.operationId,
            approvalId: prepared.approvalId,
            approvalToken: prepared.approvalToken,
            mutation: prepared.mutation,
          }),
        });
        update(state);
        while (live.current && (state.status === "queued" || state.status === "running")) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          if (!live.current) break;
          state = await api<QueryOperation>(
            `/api/query/${encodeURIComponent(prepared.operationId)}`,
          );
          update(state);
        }
        if (!live.current) break;
        const outcome = rowMutationOutcome(state);
        if (outcome !== "applied") {
          setError(
            outcome === "conflict"
              ? "A row changed or no longer exists. The batch stopped. Reload the table before editing again."
              : state.error ||
                  "The batch stopped. Check the operation outcome before making more changes.",
          );
          break;
        }
        applied += 1;
      } catch (cause) {
        const notSubmitted = cause instanceof ApiError && cause.notSubmitted;
        update(
          notSubmitted
            ? { operationId: prepared.operationId, status: "failed", error: errorMessage(cause) }
            : initial,
        );
        if (live.current)
          setError(
            notSubmitted
              ? `${errorMessage(cause)} The server did not submit this change.`
              : `${errorMessage(cause)} Check this operation before repeating the change.`,
          );
        break;
      }
    }
    if (live.current) {
      setRunning(false);
      if (applied === session.prepared.operations.length) onFinish(true, true);
    }
  }
  async function check(operationId: string) {
    if (running) return;
    setRunning(true);
    try {
      update(await api<QueryOperation>(`/api/query/${encodeURIComponent(operationId)}`));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRunning(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="connection-dialog row-review-dialog"
      aria-labelledby="row-review-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="dialog-header">
        <div>
          <span className="eyebrow">ROW CHANGES</span>
          <h2 id="row-review-title">
            Review {session.prepared.operations.length} row{" "}
            {session.prepared.operations.length === 1 ? "change" : "changes"}
          </h2>
        </div>
      </header>
      <div className="dialog-body">
        <p className="dialog-description">
          Each statement targets one row. Changes run in order. If one fails, earlier completed
          changes remain.
        </p>
        <dl className="write-target">
          <div>
            <dt>Connection</dt>
            <dd>{connection.label}</dd>
          </div>
          <div>
            <dt>Database</dt>
            <dd>{session.scope.target.database}</dd>
          </div>
          <div>
            <dt>Schema</dt>
            <dd>{session.scope.target.schema}</dd>
          </div>
          <div>
            <dt>Table</dt>
            <dd>{session.scope.table}</dd>
          </div>
        </dl>
        <div className="row-review-list">
          {session.prepared.operations.map((item, index) => {
            const state = states[item.operationId];
            const outcome = state ? rowMutationOutcome(state) : "Not run";
            return (
              <section key={item.operationId} className="row-review-item">
                <h3>
                  {index + 1}. {item.kind} <span>{outcome}</span>
                </h3>
                <table className="row-change-values">
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th>Current value</th>
                      <th>Proposed value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.scope.columns.flatMap((column, i) => {
                      const change =
                        item.mutation.kind === "update"
                          ? item.mutation.values.find((value) => value.column === column.name)
                          : undefined;
                      if (item.mutation.kind === "update" && !change) return [];
                      const original =
                        item.mutation.kind === "insert"
                          ? "New row"
                          : item.mutation.row[i] === null
                            ? "NULL"
                            : String(item.mutation.row[i]);
                      const proposed =
                        item.mutation.kind === "delete"
                          ? "Delete row"
                          : item.mutation.kind === "insert"
                            ? item.mutation.row[i]
                            : change?.value;
                      return [
                        <tr key={column.name}>
                          <td>{column.name}</td>
                          <td>
                            <code>{original}</code>
                          </td>
                          <td>
                            <code>{proposed === null ? "NULL" : String(proposed)}</code>
                          </td>
                        </tr>,
                      ];
                    })}
                  </tbody>
                </table>
                <pre className="review-sql" tabIndex={0}>
                  {item.sql}
                </pre>
                <details>
                  <summary>Bound values ({item.parameters.length})</summary>
                  <table>
                    <thead>
                      <tr>
                        <th>Parameter</th>
                        <th>Type</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.parameters.map((parameter, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>{parameter.type}</td>
                          <td>
                            <code>
                              {parameter.value === null ? "NULL" : String(parameter.value)}
                            </code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
                {state && <code className="row-operation-id">{item.operationId}</code>}
                {state && ["pending", "unknown", "needs_review"].includes(outcome) && (
                  <Button size="sm" disabled={running} onClick={() => void check(item.operationId)}>
                    Check status
                  </Button>
                )}
              </section>
            );
          })}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!started && (
          <p className={expired ? "form-error" : "approval-expiry"}>
            {expired
              ? "This review expired. Cancel and review the changes again."
              : `Approval expires in ${Math.ceil((expiresAt - now) / 1000)} seconds.`}
          </p>
        )}
      </div>
      <footer className="dialog-footer">
        <Button disabled={running} onClick={close}>
          {started ? "Close and discard staged changes" : "Cancel"}
        </Button>
        {!started && (
          <Button variant="primary" disabled={expired} onClick={() => void approve()}>
            Approve changes
          </Button>
        )}
        {running && <span role="status">Waiting for the database...</span>}
      </footer>
    </dialog>
  );
}
