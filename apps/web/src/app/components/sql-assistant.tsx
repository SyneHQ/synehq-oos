"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Settings2, X } from "lucide-react";
import { Button } from "@synehq-oos/ui";
import type { QueryTarget } from "@synehq-oos/explorer-contracts";
import { api, errorMessage } from "./api";

export function SqlAssistant({
  target,
  language = "sql",
  disabled,
  onGenerated,
  onBusy,
  onSettings,
  onClose,
}: {
  target: QueryTarget;
  language?: "sql" | "mongodb";
  disabled: boolean;
  onGenerated: (sql: string, target: QueryTarget) => void;
  onBusy: (busy: boolean) => void;
  onSettings: () => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [includeSchema, setIncludeSchema] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const request = useRef<AbortController | null>(null);
  const generatedLabel = language === "mongodb" ? "command" : "SQL";
  useEffect(() => () => request.current?.abort(), []);
  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || busy || request.current || !prompt.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    const requestTarget = { ...target };
    setBusy(true);
    onBusy(true);
    setError("");
    setDone(false);
    try {
      const result = await api<{ sql?: string; command?: string }>("/api/ai/generate", {
        method: "POST",
        body: JSON.stringify({ target: requestTarget, prompt, includeSchema }),
        signal: controller.signal,
      });
      const generated = language === "mongodb" ? result.command : result.sql;
      if (!generated?.trim())
        throw new Error(
          `The provider returned no ${generatedLabel}. Change the prompt and try again.`,
        );
      onGenerated(generated, requestTarget);
      setDone(true);
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause));
    } finally {
      request.current = null;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <form className="sql-assistant" onSubmit={generate}>
      <div className="assistant-heading">
        <div>
          <strong>{language === "mongodb" ? "Generate a MongoDB command" : "Generate SQL"}</strong>
          <span>Review the result before you run it.</span>
        </div>
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSettings}
            disabled={busy}
            iconStart={<Settings2 />}
          >
            Provider
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={busy}
            aria-label="Close query assistant"
          >
            <X />
          </Button>
        </div>
      </div>
      <label className="sr-only" htmlFor="sql-assistant-prompt">
        {language === "mongodb" ? "Describe the MongoDB command" : "Describe the SQL query"}
      </label>
      <textarea
        id="sql-assistant-prompt"
        value={prompt}
        onChange={(event) => {
          setPrompt(event.target.value);
          setDone(false);
        }}
        placeholder="Describe the data you need..."
        maxLength={8000}
        rows={2}
        disabled={disabled || busy}
        required
      />
      <div className="assistant-controls">
        <label>
          <input
            type="checkbox"
            checked={includeSchema}
            onChange={(event) => setIncludeSchema(event.target.checked)}
            disabled={disabled || busy}
          />
          <span>
            Include {language === "mongodb" ? "collection names" : "table and column names"} from{" "}
            {target.schema || target.database}
          </span>
        </label>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={disabled || !prompt.trim()}
          loading={busy}
        >
          Generate {generatedLabel}
        </Button>
      </div>
      <p className="assistant-disclosure">
        Your provider receives this prompt{includeSchema ? " and the selected schema names" : ""}.
        This request does not send database rows or documents. The generated {generatedLabel}{" "}
        replaces the editor text.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="assistant-success" role="status">
          The {generatedLabel} is ready in the editor. It has not run.
        </p>
      )}
    </form>
  );
}
