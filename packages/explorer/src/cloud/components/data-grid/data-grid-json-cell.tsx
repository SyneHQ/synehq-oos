"use client";

import { Braces, Save } from "lucide-react";
import * as React from "react";
import { DataGridCellWrapper } from "./data-grid-cell-wrapper";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "../ui/sheet";
import { CodeEditor } from "../../../sql-editor";
import type { DataGridCellProps } from "../../types/data-grid";

function jsonText(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

/** The Cloud JSON side sheet uses the shared editor and stages the exact text. */
export function JsonCell<TData>(props: DataGridCellProps<TData>) {
  const { cell, tableMeta, rowIndex, columnId, readOnly } = props;
  const raw = cell.getValue();
  const [localValue, setLocalValue] = React.useState(() => jsonText(raw));
  const [error, setError] = React.useState("");
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setLocalValue(jsonText(raw));
  }, [raw]);

  function stageValue() {
    if (readOnly) return;
    try {
      JSON.parse(localValue);
    } catch {
      setError("Enter valid JSON before you stage this change.");
      return;
    }
    // Parse only for syntax validation. Keep the text to preserve large numbers.
    tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: localValue });
    tableMeta?.onCellEditingStop?.();
    setOpen(false);
  }

  return (
    <DataGridCellWrapper {...props} readOnly>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setLocalValue(jsonText(raw));
            setError("");
          }
        }}
      >
        <SheetTrigger asChild>
          <button
            type="button"
            className="flex cursor-pointer items-center text-xs text-probe-text-link hover:underline"
            aria-label={readOnly ? "View JSON value" : "Edit JSON value"}
          >
            <Braces className="mr-1 h-3 w-3" />
            {raw === null ? "NULL" : "JSON"}
          </button>
        </SheetTrigger>
        <SheetContent className="flex max-h-screen min-w-[min(60vw,900px)] flex-col overflow-y-auto">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <SheetTitle>JSON value</SheetTitle>
              <SheetDescription>
                {readOnly ? "Read-only result." : "Stage this value, then review all row changes."}
              </SheetDescription>
            </div>
            {!readOnly && (
              <Button variant="outline" size="sm" className="gap-2" onClick={stageValue}>
                <Save className="h-4 w-4" />
                Stage change
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <CodeEditor
            value={localValue}
            onChange={setLocalValue}
            language="json"
            readOnly={readOnly}
            height="80vh"
            ariaLabel="JSON value editor"
          />
        </SheetContent>
      </Sheet>
    </DataGridCellWrapper>
  );
}
