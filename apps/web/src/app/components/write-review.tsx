"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { Button } from "@synehq-oos/ui";
import {
  DATABASE_CAPABILITIES,
  type ConnectionSummary,
  type QueryTarget,
} from "@synehq-oos/explorer-contracts";

interface PreparedWriteMetadata {
  approvalToken: string;
  operationId: string;
  approvalId: string;
  operationDigest: string;
  expiresAt: string;
  target: QueryTarget;
}
export type PreparedWrite = PreparedWriteMetadata &
  ({ sql: string; command?: never } | { command: string; sql?: never });

export function WriteReview({
  connection,
  prepared,
  collection,
  onClose,
  onApprove,
}: {
  connection: ConnectionSummary;
  prepared: PreparedWrite;
  collection?: string;
  onClose: () => void;
  onApprove: (prepared: PreparedWrite) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nativeCommand = prepared.command !== undefined;
  const contentLabel = nativeCommand ? "command" : "SQL";
  const submitted = useRef(false);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((Date.parse(prepared.expiresAt) - Date.now()) / 1000)),
  );
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    const timer = setInterval(
      () =>
        setRemaining(Math.max(0, Math.ceil((Date.parse(prepared.expiresAt) - Date.now()) / 1000))),
      1000,
    );
    return () => {
      clearInterval(timer);
      node?.close();
    };
  }, [prepared.expiresAt]);
  const expired = !Number.isFinite(remaining) || remaining <= 0;
  function approve() {
    if (submitted.current || expired || Date.parse(prepared.expiresAt) <= Date.now()) return;
    submitted.current = true;
    onApprove(prepared);
  }
  return (
    <dialog
      ref={dialog}
      className="connection-dialog write-review-dialog"
      onCancel={onClose}
      aria-labelledby="write-review-title"
    >
      <header className="dialog-header">
        <div>
          <span className="eyebrow">WRITE APPROVAL</span>
          <h2 id="write-review-title">
            {collection
              ? "Review this document."
              : nativeCommand
                ? "Review this command."
                : "Review this query."}
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label={nativeCommand ? "Close command review" : "Close query review"}
        >
          <X />
        </Button>
      </header>
      <div className="dialog-body">
        <p className="dialog-description">
          This operation can change your database. Check the target and the complete {contentLabel}{" "}
          before you approve it.
        </p>
        <dl className="write-target">
          <div>
            <dt>Connection</dt>
            <dd>{connection.label}</dd>
          </div>
          <div>
            <dt>{connection.engine === "sqlite" ? "File" : "Server"}</dt>
            <dd>
              {connection.engine === "sqlite"
                ? connection.filePath
                : `${connection.host}:${connection.port}`}
            </dd>
          </div>
          <div>
            <dt>Database</dt>
            <dd>{prepared.target.database}</dd>
          </div>
          {collection && (
            <div>
              <dt>Collection</dt>
              <dd>{collection}</dd>
            </div>
          )}
          {DATABASE_CAPABILITIES[connection.engine].schemas && (
            <div>
              <dt>Schema</dt>
              <dd>{prepared.target.schema || "Database default"}</dd>
            </div>
          )}
          {connection.engine !== "sqlite" && (
            <div>
              <dt>Database user</dt>
              <dd>{connection.username || "No username"}</dd>
            </div>
          )}
        </dl>
        <pre
          className="review-sql"
          tabIndex={0}
          aria-label={`${nativeCommand ? "Command" : "SQL"} to approve`}
        >
          {prepared.command ?? prepared.sql}
        </pre>
        <div className="connection-safety">
          <ShieldCheck size={18} />
          <p>
            Your approval applies to this exact {contentLabel} and target. The server can use this
            approval once.
          </p>
        </div>
        <p className={expired ? "form-error" : "approval-expiry"} role="status">
          {expired
            ? `This review expired. Close it and review the ${nativeCommand ? "command" : "query"} again.`
            : `This review expires in ${remaining} seconds.`}
        </p>
      </div>
      <footer className="dialog-footer">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={approve} disabled={expired}>
          Approve and run
        </Button>
      </footer>
    </dialog>
  );
}
