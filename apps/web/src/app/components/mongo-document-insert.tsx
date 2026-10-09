"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@synehq-oos/ui";
import { CodeEditor } from "@synehq-oos/explorer";
import type {
  ConnectionSummary,
  QueryOperation,
  SchemaTable,
} from "@synehq-oos/explorer-contracts";
import { api, ApiError, errorMessage } from "./api";
import { WriteReview, type PreparedWrite } from "./write-review";
import {
  followMongoInsert,
  mongoInsertCommand,
  mongoInsertJournalEvent,
  MongoInsertNotSubmittedError,
  mongoInsertOperation,
  mongoInsertRecords,
  mongoInsertUnresolved,
  recordMongoInsert,
  submitMongoInsert,
  type MongoInsertRecord,
  type MongoInsertScope,
} from "./mongo-insert";
import "./mongo-document-insert.css";

/** Recover recorded inserts through status reads. This component never submits a write. */
export function MongoInsertRecovery({
  connectionId,
  onPendingChange,
  onInserted,
}: {
  connectionId: string;
  onPendingChange: (pending: boolean) => void;
  onInserted: (scope: MongoInsertScope) => void;
}) {
  const [records, setRecords] = useState<MongoInsertRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const read = () => {
      const current = mongoInsertRecords(connectionId);
      setRecords(current);
      onPendingChange(current.length > 0);
    };
    read();
    window.addEventListener(mongoInsertJournalEvent, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(mongoInsertJournalEvent, read);
      window.removeEventListener("storage", read);
      onPendingChange(false);
    };
  }, [connectionId, onPendingChange]);
  async function check() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const outcomes: string[] = [];
      for (const record of records) {
        const state = mongoInsertOperation(
          await api(`/api/query/${encodeURIComponent(record.operationId)}`),
          record.operationId,
        );
        if (!mongoInsertUnresolved(state)) recordMongoInsert(record, false);
        if (state.status !== "succeeded") outcomes.push(`${record.collection}: ${state.status}.`);
        if (state.status === "succeeded") onInserted(record);
      }
      setMessage(outcomes.join(" "));
    } catch (cause) {
      setMessage(`${errorMessage(cause)} The insert was not sent again.`);
    } finally {
      setBusy(false);
    }
  }
  if (!records.length && !message) return null;
  return (
    <div className="row-recovery" role="status">
      <strong>
        {records.length ? "Document inserts need a status check." : "Insert status checked."}
      </strong>
      {records.length > 0 && (
        <>
          <p>
            Check these operations before inserting another document. Do not repeat an unknown
            insert.
          </p>
          <details>
            <summary>Operation IDs and collections</summary>
            {records.map((record) => (
              <p key={record.operationId}>
                {record.target.database} / {record.collection}: <code>{record.operationId}</code>
              </p>
            ))}
          </details>
          <Button size="sm" loading={busy} onClick={() => void check()}>
            Check insert status
          </Button>
        </>
      )}
      {message && <p>{message}</p>}
    </div>
  );
}

export function MongoDocumentInsert({
  connection,
  table,
  onClose,
  onInserted,
}: {
  connection: ConnectionSummary;
  table: SchemaTable;
  onClose: () => void;
  onInserted: (scope: MongoInsertScope) => void;
}) {
  const [scope] = useState<MongoInsertScope>(() => ({
    target: {
      connectionId: connection.id,
      connectionRevision: connection.revision,
      database: table.database,
      schema: null,
    },
    collection: table.name,
  }));
  const [document, setDocument] = useState("{\n  \n}");
  const [prepared, setPrepared] = useState<PreparedWrite | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [operation, setOperation] = useState<QueryOperation | null>(null);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const live = useRef(true);
  const submitted = useRef(false);
  const working = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    live.current = true;
    controller.current = new AbortController();
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    const node = dialog.current;
    if (!prepared) node?.showModal();
    else node?.close();
    return () => node?.close();
  }, [prepared]);
  const request = (path: string, options?: RequestInit) =>
    api(path, { ...options, signal: controller.current?.signal });
  function close() {
    if (!working.current) onClose();
  }
  async function prepare() {
    if (working.current || started || prepared || connection.readOnly) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const command = mongoInsertCommand(scope.collection, document);
      const approval = await api<Omit<PreparedWrite, "sql" | "command" | "target">>(
        "/api/query/prepare",
        {
          method: "POST",
          body: JSON.stringify({ target: scope.target, command }),
          signal: controller.current?.signal,
        },
      );
      if (live.current) setPrepared({ ...approval, command, target: scope.target });
    } catch (cause) {
      if (live.current) setError(errorMessage(cause));
    } finally {
      working.current = false;
      if (live.current) setBusy(false);
    }
  }
  function update(record: MongoInsertRecord, state: QueryOperation) {
    try {
      recordMongoInsert(record, mongoInsertUnresolved(state));
    } catch {
      // Retain the visible operation ID if storage becomes unavailable after submission.
    }
    if (live.current) setOperation(state);
  }
  function finish(state: QueryOperation) {
    if (!live.current) return;
    if (state.status === "succeeded") onInserted(scope);
    else if (state.status === "unknown")
      setError(
        "The insert outcome is unknown. Check this operation before repeating the document.",
      );
    else if (state.status === "failed" || state.status === "cancelled")
      setError(state.error || `The insert ${state.status}.`);
  }
  async function approve(approval: PreparedWrite) {
    if (
      approval !== prepared ||
      working.current ||
      submitted.current ||
      connection.readOnly ||
      Date.parse(approval.expiresAt) <= Date.now()
    )
      return;
    const record = { ...scope, operationId: approval.operationId };
    try {
      recordMongoInsert(record, true);
    } catch {
      setPrepared(null);
      setError(
        "Browser storage is unavailable. Enable it so this insert can be checked after a reload.",
      );
      return;
    }
    submitted.current = true;
    working.current = true;
    setStarted(true);
    setBusy(true);
    setPrepared(null);
    setError("");
    const unknown: QueryOperation = { operationId: record.operationId, status: "unknown" };
    setOperation(unknown);
    try {
      const state = await submitMongoInsert(approval, request, (state) => update(record, state));
      finish(state);
    } catch (cause) {
      const notSubmitted =
        cause instanceof MongoInsertNotSubmittedError ||
        (cause instanceof ApiError && cause.notSubmitted);
      update(record, notSubmitted ? { ...unknown, status: "failed" } : unknown);
      if (live.current)
        setError(
          `${errorMessage(cause)} ${notSubmitted ? "The insert was not submitted." : "The outcome is unknown. Check this operation before repeating the document."}`,
        );
    } finally {
      working.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function check() {
    if (!operation || working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    const record = { ...scope, operationId: operation.operationId };
    try {
      const initial = await request(`/api/query/${encodeURIComponent(record.operationId)}`);
      const state = await followMongoInsert(record.operationId, initial, request, (state) =>
        update(record, state),
      );
      finish(state);
    } catch (cause) {
      if (live.current) setError(`${errorMessage(cause)} The insert was not sent again.`);
    } finally {
      working.current = false;
      if (live.current) setBusy(false);
    }
  }
  return (
    <>
      <dialog
        ref={dialog}
        className="connection-dialog mongo-insert-dialog"
        aria-labelledby="mongo-insert-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <header className="dialog-header">
          <div>
            <span className="eyebrow">MONGODB DOCUMENT</span>
            <h2 id="mongo-insert-title">{started ? "Document insert" : "Add a document"}</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={close}
            aria-label="Close document editor"
          >
            <X />
          </Button>
        </header>
        <div className="dialog-body">
          <dl className="write-target">
            <div>
              <dt>Database</dt>
              <dd>{scope.target.database}</dd>
            </div>
            <div>
              <dt>Collection</dt>
              <dd>{scope.collection}</dd>
            </div>
          </dl>
          {started ? (
            <div className="mongo-insert-status" role="status">
              <strong>
                {busy
                  ? "Checking insert status..."
                  : operation?.status === "succeeded"
                    ? "Document added"
                    : `Insert ${operation?.status ?? "unknown"}`}
              </strong>
              {!busy && (operation?.status === "unknown" || operation?.status === "failed") && (
                <p>
                  Operation ID: <code>{operation.operationId}</code>
                </p>
              )}
            </div>
          ) : (
            <>
              <p className="dialog-description">
                Enter one JSON object. Use canonical Extended JSON for dates, decimals, large
                numbers, and ObjectIds. Review the exact document and collection before inserting.
              </p>
              <CodeEditor
                value={document}
                onChange={(value) => {
                  setDocument(value);
                  setError("");
                }}
                onRun={() => void prepare()}
                readOnly={busy || prepared !== null}
                language="json"
                height="min(340px, 42vh)"
                ariaLabel="New MongoDB document"
              />
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="dialog-footer">
          <Button disabled={busy} onClick={close}>
            {started ? "Close" : "Cancel"}
          </Button>
          {started ? (
            operation &&
            mongoInsertUnresolved(operation) && (
              <Button variant="primary" loading={busy} onClick={() => void check()}>
                Check operation status
              </Button>
            )
          ) : (
            <Button
              variant="primary"
              loading={busy}
              disabled={!document.trim()}
              onClick={() => void prepare()}
            >
              Review document
            </Button>
          )}
        </footer>
      </dialog>
      {prepared && (
        <WriteReview
          connection={connection}
          prepared={prepared}
          collection={scope.collection}
          onClose={() => setPrepared(null)}
          onApprove={(approval) => void approve(approval)}
        />
      )}
    </>
  );
}
