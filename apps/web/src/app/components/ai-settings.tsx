"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button, Field, Input, Spinner } from "@synehq-oos/ui";
import { api, errorMessage } from "./api";

interface ProviderSettings {
  enabled: boolean;
  endpoint: string;
  model: string;
  hasSecret: boolean;
  revision: number;
}

export function AISettings({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    const controller = new AbortController();
    api<ProviderSettings | null>("/api/ai/settings", { signal: controller.signal })
      .then((value) => {
        setSettings(value);
        setEnabled(value?.enabled ?? false);
        setLoaded(true);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      node?.close();
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || !loaded) return;
    saving.current = true;
    setBusy(true);
    setError("");
    const fields = new FormData(event.currentTarget);
    const key = String(fields.get("apiKey") || "");
    try {
      await api<ProviderSettings>("/api/ai/settings", {
        method: "PUT",
        body: JSON.stringify({
          enabled,
          endpoint: String(fields.get("endpoint") || "").trim(),
          model: String(fields.get("model") || "").trim(),
          ...(clearKey ? { apiKey: "" } : key ? { apiKey: key } : {}),
          ...(settings ? { revision: settings.revision } : {}),
        }),
      });
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      saving.current = false;
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
      aria-labelledby="ai-settings-title"
    >
      <form onSubmit={submit}>
        <header className="dialog-header">
          <div>
            <span className="eyebrow">OPTIONAL SQL ASSISTANT</span>
            <h2 id="ai-settings-title">Your AI provider.</h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={busy}
            aria-label="Close AI settings"
          >
            <X />
          </Button>
        </header>
        <div className="dialog-body">
          <p className="dialog-description">
            Use an OpenAI-compatible provider to generate SQL text. You review the SQL and choose
            when to run it.
          </p>
          {loading ? (
            <div className="panel-loading">
              <Spinner size="sm" label="Loading AI settings" />
              Loading settings...
            </div>
          ) : loaded ? (
            <>
              <label className="write-toggle">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                />
                <span>
                  <strong>Enable SQL generation</strong>
                  <small>
                    Your provider receives each prompt you submit. Schema sharing is optional for
                    each request.
                  </small>
                </span>
              </label>
              <Field label="API endpoint" hint="Enter the base URL, including /v1." required>
                <Input
                  name="endpoint"
                  type="url"
                  defaultValue={settings?.endpoint ?? ""}
                  placeholder="https://api.example.com/v1"
                  autoComplete="url"
                  required
                />
              </Field>
              <Field label="Model" required>
                <Input
                  name="model"
                  defaultValue={settings?.model ?? ""}
                  placeholder="Model name from your provider"
                  autoComplete="off"
                  required
                />
              </Field>
              <Field
                label="API key"
                hint={
                  settings?.hasSecret
                    ? "A key is saved. Leave this blank to keep it."
                    : "Leave this blank if your provider does not require a key."
                }
              >
                <Input
                  name="apiKey"
                  type="password"
                  autoComplete="new-password"
                  disabled={clearKey}
                  placeholder={
                    settings?.hasSecret ? "Saved key remains unchanged" : "Provider API key"
                  }
                />
              </Field>
              {settings?.hasSecret && (
                <label className="write-toggle">
                  <input
                    type="checkbox"
                    checked={clearKey}
                    onChange={(event) => setClearKey(event.target.checked)}
                  />
                  <span>
                    <strong>Remove the saved key</strong>
                    <small>Use this when your provider no longer requires an API key.</small>
                  </span>
                </label>
              )}
              <p className="field-note">
                Keys are encrypted on this installation. A local HTTP endpoint must appear in the
                host configuration allowlist.
              </p>
            </>
          ) : null}
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
          <Button type="submit" variant="primary" loading={busy} disabled={loading || !loaded}>
            Save settings
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
