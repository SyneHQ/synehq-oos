"use client";

import Editor, { loader, type OnMount } from "@monaco-editor/react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type * as monaco from "monaco-editor";
import { EditorOptions } from "./options";
import { createSelectionExecutor } from "./selection";
import { createUnifiedCompletionService } from "./completion";
import type { CompletionColumn } from "./types";

// The host provides a fixed asset path for this page. No public CDN is used.
export const EditorAssetPath = createContext("/monaco/vs");

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: "sql" | "json";
  readOnly?: boolean;
  height?: string;
  ariaLabel?: string;
  theme?: "light" | "vs-dark";
  onRun?: (sql: string) => void;
  onSelectionChange?: (sql: string) => void;
  schemaColumns?: CompletionColumn[];
}

/** Controlled surface extracted from ReviewQueryEditor and MonacoEditor. */
export function CodeEditor({
  value,
  onChange,
  language = "sql",
  readOnly = false,
  height = "280px",
  ariaLabel = "Code editor",
  theme = "light",
  onRun,
  onSelectionChange,
  schemaColumns = [],
}: CodeEditorProps) {
  const assetPath = useContext(EditorAssetPath);
  const [mounted, setMounted] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const live = useRef({ readOnly, onRun, onSelectionChange, schemaColumns });
  live.current = { readOnly, onRun, onSelectionChange, schemaColumns };
  const disposables = useRef<monaco.IDisposable[]>([]);
  useEffect(() => {
    let active = true;
    loader.config({ paths: { vs: assetPath } });
    loader
      .init()
      .then(() => {
        if (active) setMounted(true);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
      disposables.current.forEach((item) => item.dispose());
      disposables.current = [];
    };
  }, [assetPath]);
  const onMount: OnMount = (editor, m) => {
    disposables.current.forEach((item) => item.dispose());
    disposables.current = [
      editor.onDidChangeCursorSelection((event) => {
        live.current.onSelectionChange?.(editor.getModel()?.getValueInRange(event.selection) ?? "");
      }),
    ];
    if (language === "sql") {
      const complete = createUnifiedCompletionService();
      disposables.current.push(
        createSelectionExecutor(editor, m, (query) => {
          if (!live.current.readOnly) live.current.onRun?.(query);
        }),
        m.languages.registerCompletionItemProvider("sql", {
          triggerCharacters: [".", " "],
          provideCompletionItems(model, position) {
            if (model !== editor.getModel()) return { suggestions: [] };
            return {
              suggestions: complete({
                model,
                position,
                tableSchema: live.current.schemaColumns,
                m,
              }),
            };
          },
        }),
      );
    } else {
      disposables.current.push(
        editor.addAction({
          id: "run-json-command",
          label: "Run command",
          keybindings: [m.KeyMod.CtrlCmd | m.KeyCode.Enter],
          run: () => {
            if (!live.current.readOnly) live.current.onRun?.(editor.getValue());
          },
        }),
      );
    }
  };
  return (
    <div className="sql-editor" style={{ height }}>
      {loadError ? (
        <p role="alert">The editor could not load. Reload the page to try again.</p>
      ) : mounted ? (
        <Editor
          height="100%"
          language={language}
          value={value}
          onChange={(text) => onChange(text ?? "")}
          onMount={onMount}
          theme={theme}
          loading={<p>Loading editor...</p>}
          options={{ ...EditorOptions, readOnly, ariaLabel, padding: { top: 16, bottom: 16 } }}
        />
      ) : (
        <p role="status">Loading editor...</p>
      )}
    </div>
  );
}
