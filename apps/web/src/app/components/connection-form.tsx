"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, ShieldCheck, X } from "lucide-react";
import { Button, Field, Input } from "@synehq-oos/ui";
import {
  DATABASE_CAPABILITIES,
  type ConnectionSummary,
  type ConnectionTestResult,
  type DatabaseEngine,
} from "@synehq-oos/explorer-contracts";
import { ApiError, api, errorMessage } from "./api";
import { DatabaseIcon } from "./database-icon";
import {
  DATABASE_CATALOG,
  connectionPayload,
  createConnectionDraft,
  databaseDefinition,
  validateConnectionDraft,
  type ConnectionFieldErrors,
  type ConnectionFieldName,
} from "./database-catalog";
import {
  ConnectionSaveRejected,
  connectionSavePayload,
  reconcileConnectionSave,
  submitConnectionSave,
  waitForConnectionTest,
  type ConnectionSaveAttempt,
} from "./connection-test";

const SAVE_ATTEMPT_KEY = "synehq-oos-pending-connection-save";

function retainedSaveAttempt(): ConnectionSaveAttempt | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(SAVE_ATTEMPT_KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const candidate = value as Record<string, unknown>;
    const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    if (
      typeof candidate.draftId !== "string" ||
      !uuid.test(candidate.draftId) ||
      typeof candidate.operationId !== "string" ||
      !uuid.test(candidate.operationId)
    )
      return null;
    return { draftId: candidate.draftId, operationId: candidate.operationId };
  } catch {
    return null;
  }
}

export function ConnectionForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (connection: ConnectionSummary) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef(new AbortController());
  const locked = useRef(false);
  const [engine, setEngine] = useState<DatabaseEngine | null>(null);
  const [draft, setDraft] = useState(() => createConnectionDraft("postgres"));
  const [allowWrites, setAllowWrites] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [phase, setPhase] = useState<"idle" | "testing" | "saving">("idle");
  const [action, setAction] = useState<"test" | "save">("test");
  const [fieldErrors, setFieldErrors] = useState<ConnectionFieldErrors>({});
  const [error, setError] = useState("");
  const [tested, setTested] = useState<ConnectionTestResult | null>(null);
  const [testExpired, setTestExpired] = useState(false);
  const [pendingSave, setPendingSave] = useState<ConnectionSaveAttempt | null>(null);
  const pendingSaveRef = useRef<ConnectionSaveAttempt | null>(null);
  const busy = phase !== "idle";
  const selected = engine ? databaseDefinition(engine) : null;

  useEffect(() => {
    if (controller.current.signal.aborted) controller.current = new AbortController();
    const retained = retainedSaveAttempt();
    pendingSaveRef.current = retained;
    setPendingSave(retained);
    const node = dialog.current;
    node?.showModal();
    return () => {
      controller.current.abort();
      node?.close();
    };
  }, []);

  useEffect(() => {
    if (!tested?.expiresAt) return;
    const timer = setTimeout(
      () => {
        setTested(null);
        setTestExpired(true);
      },
      Math.max(0, Date.parse(tested.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [tested]);

  function retainSaveAttempt(attempt: ConnectionSaveAttempt | null) {
    pendingSaveRef.current = attempt;
    setPendingSave(attempt);
    try {
      if (attempt) sessionStorage.setItem(SAVE_ATTEMPT_KEY, JSON.stringify(attempt));
      else sessionStorage.removeItem(SAVE_ATTEMPT_KEY);
    } catch {
      /* The open form still retains the exact attempted save. */
    }
  }

  function selectEngine(value: DatabaseEngine) {
    setEngine(value);
    setDraft(createConnectionDraft(value));
    setAllowWrites(false);
    setShowPassword(false);
    setFieldErrors({});
    setError("");
    setTested(null);
    setTestExpired(false);
  }

  function setField(name: ConnectionFieldName, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
    setError("");
    setTested(null);
    setTestExpired(false);
  }

  async function run(intent: "test" | "save") {
    if (locked.current) return;
    const recovering = pendingSaveRef.current;
    if (!recovering && !engine) return;
    const errors = recovering ? {} : validateConnectionDraft(engine!, draft);
    setFieldErrors(errors);
    setError("");
    if (Object.keys(errors).length) {
      dialog.current?.querySelector<HTMLElement>(`#connection-${Object.keys(errors)[0]}`)?.focus();
      return;
    }
    locked.current = true;
    setAction(intent);
    const cachedResult = !recovering && intent === "save" ? tested : null;
    if (!cachedResult) {
      setTested(null);
      setTestExpired(false);
    }
    setPhase(recovering || cachedResult ? "saving" : "testing");
    const signal = controller.current.signal;
    try {
      if (recovering) {
        const saved = await reconcileConnectionSave(recovering, signal);
        signal.throwIfAborted();
        retainSaveAttempt(null);
        onCreated(saved);
        return;
      }
      let result = cachedResult;
      if (!result) {
        const payload = connectionPayload(engine!, draft, allowWrites);
        const admitted = await api<ConnectionTestResult>("/api/connections/test", {
          method: "POST",
          body: JSON.stringify(payload),
          signal,
        });
        result = await waitForConnectionTest(admitted, signal);
        connectionSavePayload(result);
        setTested(result);
      }
      if (intent === "test") return;
      setPhase("saving");
      const attempt = connectionSavePayload(result);
      retainSaveAttempt(attempt);
      const saved = await submitConnectionSave(attempt, signal);
      signal.throwIfAborted();
      retainSaveAttempt(null);
      onCreated(saved);
    } catch (cause) {
      if (!signal.aborted) {
        if (pendingSaveRef.current && cause instanceof ConnectionSaveRejected) {
          retainSaveAttempt(null);
          setTested(null);
          setTestExpired(cause.code !== "CONNECTION_TEST_REQUIRED");
        }
        if (cachedResult?.expiresAt && Date.parse(cachedResult.expiresAt) <= Date.now()) {
          setTested(null);
          setTestExpired(true);
        }
        if (cause instanceof ApiError) setFieldErrors(cause.fieldErrors);
        setError(errorMessage(cause));
      }
    } finally {
      locked.current = false;
      if (!signal.aborted) setPhase("idle");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("save");
  }

  return (
    <dialog
      ref={dialog}
      className="connection-dialog connection-create-dialog"
      onCancel={(event) => {
        if (locked.current) event.preventDefault();
        else onClose();
      }}
      aria-labelledby="connection-form-title"
    >
      <form onSubmit={submit} noValidate>
        <header className="dialog-header">
          <div>
            <span className="eyebrow">NEW CONNECTION</span>
            <h2 id="connection-form-title">
              {pendingSave
                ? "Check the connection save"
                : selected
                  ? `Connect ${selected.label}`
                  : "Choose a database"}
            </h2>
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
          {pendingSave ? (
            <p className="dialog-description" role="status">
              The save result is not confirmed. Check the saved connections before you start another
              test. This check uses the exact tested connection.
            </p>
          ) : !selected || !engine ? (
            <>
              <p className="dialog-description">Select the database you want to explore.</p>
              <div className="engine-picker" role="group" aria-label="Database engine">
                {DATABASE_CATALOG.map((item) => (
                  <button type="button" key={item.engine} onClick={() => selectEngine(item.engine)}>
                    <DatabaseIcon engine={item.engine} size={44} />
                    <strong>{item.label}</strong>
                    <span>{item.description}</span>
                  </button>
                ))}
              </div>
              <p className="connection-picker-note">
                Your credentials stay encrypted on this installation.
              </p>
            </>
          ) : (
            <>
              <div className="connection-selected-engine">
                <DatabaseIcon engine={engine} size={38} />
                <div>
                  <strong>{selected.label}</strong>
                  <span>{selected.description}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setEngine(null);
                    setError("");
                    setTested(null);
                    setTestExpired(false);
                  }}
                  iconStart={<ArrowLeft />}
                >
                  Change
                </Button>
              </div>
              <fieldset disabled={busy} className="connection-fields">
                <Field
                  className="connection-field-wide"
                  label="Connection name"
                  controlId="connection-label"
                  required
                  error={fieldErrors.label}
                >
                  <Input
                    name="label"
                    value={draft.label}
                    onChange={(event) => setField("label", event.target.value)}
                    placeholder={`${selected.label} database`}
                    maxLength={100}
                    autoComplete="off"
                    autoFocus
                  />
                </Field>
                {selected.fields.map((field) => (
                  <Field
                    key={`${engine}:${field.name}`}
                    className={field.wide ? "connection-field-wide" : undefined}
                    label={field.label}
                    controlId={`connection-${field.name}`}
                    required={field.required}
                    hint={field.hint}
                    error={fieldErrors[field.name]}
                  >
                    <Input
                      name={field.name}
                      type={
                        field.kind === "password"
                          ? showPassword
                            ? "text"
                            : "password"
                          : (field.kind ?? "text")
                      }
                      value={draft[field.name]}
                      onChange={(event) => setField(field.name, event.target.value)}
                      placeholder={field.placeholder}
                      min={field.kind === "number" ? 1 : undefined}
                      max={field.kind === "number" ? 65535 : undefined}
                      step={field.kind === "number" ? 1 : undefined}
                      autoComplete={field.kind === "password" ? "new-password" : "off"}
                      spellCheck={false}
                      suffix={
                        field.kind === "password" ? (
                          <button
                            className="password-visibility"
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        ) : undefined
                      }
                    />
                  </Field>
                ))}
                {engine !== "sqlite" && (
                  <details
                    className="connection-advanced connection-field-wide"
                    open={fieldErrors.tlsCa ? true : undefined}
                  >
                    <summary>Advanced: private TLS certificate</summary>
                    <Field
                      label="CA certificate (PEM)"
                      controlId="connection-tlsCa"
                      error={fieldErrors.tlsCa}
                      hint="Optional. Add the CA certificate if your database uses a private certificate authority."
                    >
                      <textarea
                        id="connection-tlsCa"
                        className="certificate-input"
                        name="tlsCa"
                        value={draft.tlsCa}
                        onChange={(event) => setField("tlsCa", event.target.value)}
                        rows={4}
                        maxLength={16384}
                        spellCheck={false}
                        placeholder="-----BEGIN CERTIFICATE-----"
                        aria-invalid={Boolean(fieldErrors.tlsCa)}
                        aria-describedby={
                          fieldErrors.tlsCa
                            ? "connection-tlsCa-error connection-tlsCa-hint"
                            : "connection-tlsCa-hint"
                        }
                      />
                    </Field>
                  </details>
                )}
                <div className="connection-safety connection-field-wide">
                  <ShieldCheck size={18} />
                  <p>
                    {engine === "sqlite"
                      ? "Kelvo reads the existing file from the configured SQLite data folder. Your browser does not upload a file."
                      : "TLS encrypts the connection and verifies the database server identity."}
                  </p>
                </div>
                {DATABASE_CAPABILITIES[engine].queryWrites && (
                  <label className="write-toggle connection-field-wide">
                    <input
                      type="checkbox"
                      checked={allowWrites}
                      onChange={(event) => {
                        setAllowWrites(event.target.checked);
                        setTested(null);
                        setTestExpired(false);
                        setError("");
                      }}
                    />
                    <span>
                      <strong>Allow write queries</strong>
                      <small>
                        {allowWrites
                          ? "Each write needs your approval in the console. Database permissions still apply."
                          : engine === "sqlite"
                            ? "This connection allows reads only. Write queries stay disabled."
                            : "This connection allows reads only. Use a database account with read-only permissions."}
                      </small>
                    </span>
                  </label>
                )}
              </fieldset>
              {tested && (
                <div className="connection-test-result" role="status">
                  <CheckCircle2 size={17} />
                  <p>Connection test passed. The connection is not saved yet.</p>
                </div>
              )}
              {testExpired && !busy && (
                <p className="connection-progress" role="status">
                  The connection test expired. Test the connection again before saving.
                </p>
              )}
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {busy && (
            <p className="connection-progress" role="status">
              {phase === "testing"
                ? "Testing these connection details..."
                : pendingSave
                  ? "Checking the exact connection save..."
                  : "Saving the tested connection..."}
            </p>
          )}
        </div>
        <footer className="dialog-footer">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {pendingSave ? (
            <Button type="submit" variant="primary" disabled={busy} loading={busy}>
              Check saved connection
            </Button>
          ) : (
            selected && (
              <>
                <Button
                  type="button"
                  onClick={() => void run("test")}
                  disabled={busy}
                  loading={busy && action === "test"}
                >
                  Test connection
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={busy}
                  loading={busy && action === "save"}
                >
                  {tested ? "Save connection" : "Test and save"}
                </Button>
              </>
            )
          )}
        </footer>
      </form>
    </dialog>
  );
}
