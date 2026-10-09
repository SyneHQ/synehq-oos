"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Database, ShieldCheck, X } from "lucide-react";
import { Button, Field, Input } from "@synehq-oos/ui";
import type { ConnectionSummary, DatabaseEngine } from "@synehq-oos/explorer-contracts";
import { api, errorMessage } from "./api";

export function ConnectionForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (connection: ConnectionSummary) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [engine, setEngine] = useState<DatabaseEngine>("postgres");
  const [allowWrites, setAllowWrites] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ connection: ConnectionSummary }>("/api/connections", {
        method: "POST",
        body: JSON.stringify({
          label: data.get("label"),
          engine,
          host: data.get("host"),
          port: Number(data.get("port")),
          database: data.get("database"),
          username: data.get("username"),
          password: data.get("password"),
          tlsMode: "verify-full",
          tlsCa: String(data.get("tlsCa") || "").trim() || undefined,
          readOnly: !allowWrites,
        }),
      });
      onCreated(result.connection);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="connection-dialog"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      aria-labelledby="connection-form-title"
    >
      <form onSubmit={submit}>
        <header className="dialog-header">
          <div>
            <span className="eyebrow">DATABASE CONNECTION</span>
            <h2 id="connection-form-title">Connect your data.</h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={busy}
            aria-label="Close connection form"
          >
            <X />
          </Button>
        </header>
        <div className="dialog-body">
          <p className="dialog-description">
            Save a connection to start browsing. Your credentials are encrypted on this
            installation.
          </p>
          <div className="engine-picker" role="group" aria-label="Database engine">
            {(["postgres", "mysql"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={engine === value}
                onClick={() => setEngine(value)}
              >
                <Database />
                <span>{value === "postgres" ? "PostgreSQL" : "MySQL"}</span>
              </button>
            ))}
          </div>
          <Field label="Connection name" required>
            <Input name="label" placeholder="My database" required maxLength={100} />
          </Field>
          <div className="form-row">
            <Field label="Host" required>
              <Input name="host" placeholder="db.example.com" required />
            </Field>
            <Field label="Port" required>
              <Input
                key={engine}
                name="port"
                type="number"
                min={1}
                max={65535}
                defaultValue={engine === "postgres" ? 5432 : 3306}
                required
              />
            </Field>
          </div>
          <Field label="Database" required>
            <Input name="database" placeholder="database_name" required />
          </Field>
          <div className="form-row equal">
            <Field label="Username" required>
              <Input name="username" autoComplete="off" required />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" autoComplete="new-password" />
            </Field>
          </div>
          <div className="connection-safety">
            <ShieldCheck size={18} />
            <p>TLS verifies the database server identity. The database must support TLS.</p>
          </div>
          <details className="connection-advanced">
            <summary>Private certificate authority</summary>
            <Field label="CA certificate (PEM)" controlId="connection-tls-ca">
              <textarea
                id="connection-tls-ca"
                className="certificate-input"
                name="tlsCa"
                rows={4}
                maxLength={16384}
                spellCheck={false}
                placeholder="-----BEGIN CERTIFICATE-----"
              />
              <span className="field-note">
                Optional. Add the CA certificate if your database uses a private certificate
                authority.
              </span>
            </Field>
          </details>
          <label className="write-toggle">
            <input
              type="checkbox"
              checked={allowWrites}
              onChange={(event) => setAllowWrites(event.target.checked)}
            />
            <span>
              <strong>Allow write queries</strong>
              <small>
                {allowWrites
                  ? "Each write requires your approval in the query console. Database permissions still apply."
                  : "This connection allows reads only. Use a database account with read-only permissions."}
              </small>
            </span>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="dialog-footer">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save connection
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
