"use client";

import { CodeEditor } from "./editor/code-editor";
export { CodeEditor, type CodeEditorProps } from "./editor/code-editor";

export function SqlEditor({
  value,
  onChange,
  onRun,
  onSelectionChange,
  disabled = false,
  schema = {},
  height = "280px",
}: {
  value: string;
  onChange: (value: string) => void;
  onRun?: (sql: string) => void;
  onSelectionChange?: (sql: string) => void;
  disabled?: boolean;
  dialect?: "postgresql" | "mysql";
  schema?: Record<string, string[]>;
  height?: string;
}) {
  const schemaColumns = Object.entries(schema).flatMap(([qualified, columns]) => {
    const separator = qualified.lastIndexOf(".");
    const namespace = separator < 0 ? "" : qualified.slice(0, separator);
    const table = separator < 0 ? qualified : qualified.slice(separator + 1);
    return columns.map((column) => ({ schema: namespace, table_name: table, column_name: column }));
  });
  return (
    <CodeEditor
      value={value}
      onChange={onChange}
      readOnly={disabled}
      onRun={onRun}
      onSelectionChange={onSelectionChange}
      height={height}
      ariaLabel="SQL editor"
      language="sql"
      schemaColumns={schemaColumns}
    />
  );
}
