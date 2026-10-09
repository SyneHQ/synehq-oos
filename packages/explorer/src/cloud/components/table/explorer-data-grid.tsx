"use client";

/**
 * ExplorerDataGrid — the database explorer's grid body.
 *
 * Wraps the data-grid engine (useDataGrid + DataGrid) and adapts it to the
 * explorer's staged-editing model: all mutations (cell edits, clear, paste,
 * row deletes) are staged into the data-table reducer and only materialize
 * when the user hits "Review & Save" (see ExplorerTable EditToolbar +
 * DataView's MutationPreviewPanel flows). Nothing writes to the server from
 * the grid itself.
 *
 * `useExplorerGrid` is the logic hook (column adaptation, staged-overlay data,
 * callbacks). `ExplorerDataGridView` is the presentational shell (sizing,
 * DataGrid, keyboard-shortcuts dialog). ExplorerTable composes both with
 * toolbar/pagination chrome.
 */
import * as React from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Key, Plus } from "lucide-react";
import { DataGrid } from "../data-grid/data-grid";
import { DataGridKeyboardShortcuts } from "../data-grid/data-grid-keyboard-shortcuts";
import { getDataGridSelectColumn } from "../data-grid/data-grid-select-column";
import { useDataGrid } from "../../hooks/use-data-grid";
import { Button, EmptyState } from "@synehq-oos/ui";
import { cn, isDateType, isNumberType } from "../../lib/utils";
import { formatDateCellForDisplay } from "../../lib/data-grid";
import type { CellOpts, RowHeightValue } from "../../types/data-grid";

/** Explorer column-def extras (set by DataView via columnDef.meta). */
interface ExplorerColumnMeta {
  type?: string;
  primaryKey?: boolean;
  label?: string;
  cell?: CellOpts;
}

interface PendingEdit {
  value: unknown;
  originalValue: unknown;
}

export interface UseExplorerGridProps {
  columns: ColumnDef<Record<string, unknown>, unknown>[];
  /** Server-provided rows (current page). */
  data: Record<string, unknown>[];
  pendingEdits: Map<string, Map<string, PendingEdit>>;
  newRows: Map<string, Record<string, unknown>>;
  readOnly: boolean;
  allowAddRows: boolean;
  /** Stage a cell value into the pending-edits reducer (rowId = tanstack row id or staged new-row id). */
  onStageEdit: (rowId: string, columnId: string, value: unknown) => void;
  /** Delete PREVIEW for server rows (opens MutationPreviewPanel upstream). */
  onDeleteRows: (rows: Record<string, unknown>[]) => void;
  /** Remove an unsaved staged row. */
  onDiscardNewRow: (rowId: string) => void;
  /** Append a staged (unsaved) row. */
  onAddNewRow: () => void;
  pageIndex: number;
  pageSize: number;
  totalRows: number;
  onPaginationChange: (pagination: PaginationState) => void;
  rowHeight: RowHeightValue;
  onRowHeightChange: (height: RowHeightValue) => void;
}

/** Extra numeric families not covered by lib's isNumberType (ClickHouse int/uint/float sizing, money, serial). */
const EXTRA_NUMBER_RE = /\b(u?int\d*|tinyint|double|float\d*|money|serial|bigserial)\b/;

/** Map a database column type onto the closest data-grid cell variant. */
export function cellVariantForType(dataType?: string): CellOpts {
  const t = (dataType ?? "").toLowerCase();
  if (!t) return { variant: "short-text" };
  if (/\bbool(ean)?\b/.test(t)) return { variant: "checkbox" };
  if (isNumberType(t) || EXTRA_NUMBER_RE.test(t)) return { variant: "number", preserveText: true };
  if (/json|jsonb|object|\bmap\b|struct|tuple|\[|\]/.test(t) || t.includes("array"))
    return { variant: "json" };
  // Dates edit/commit as raw text (a date-only commit would corrupt
  // time-bearing columns) but display in a readable form.
  if (isDateType(t) || /date|time|timestamp/.test(t))
    return { variant: "short-text", formatDisplay: formatDateCellForDisplay };
  return { variant: "short-text" };
}

function PrimaryKeyBadge() {
  return <Key size={12} strokeWidth={2} className="shrink-0 text-probe-accent" />;
}

/**
 * Adapt the explorer's column defs (built in DataView) to data-grid columns:
 * replace the custom checkbox column with the grid's select column (hover
 * row-number markers, teable-style) and attach cell-variant metadata. Sorting
 * and filtering stay server-side (WHERE / Order-by toolbar), so client-side
 * sort/filter flags are disabled.
 */
export function buildGridColumns(
  columns: ColumnDef<Record<string, unknown>, unknown>[],
): ColumnDef<Record<string, unknown>, unknown>[] {
  const result: ColumnDef<Record<string, unknown>, unknown>[] = [];
  for (const col of columns) {
    if (col.id === "select") {
      // The gutter is pinned to the far left permanently (teable invariant):
      // user-pinned data columns must always land AFTER it.
      result.push(
        getDataGridSelectColumn({
          enableRowMarkers: true,
          enablePinning: false,
        }) as unknown as ColumnDef<Record<string, unknown>, unknown>,
      );
      continue;
    }

    const meta = col.meta as ExplorerColumnMeta | undefined;
    const accessorKey =
      "accessorKey" in col && typeof col.accessorKey === "string" ? col.accessorKey : col.id;
    if (!accessorKey) continue;

    // Prefer caller-supplied label/cell (LumenDataGrid); fall back to type map.
    const variant = meta?.cell ?? cellVariantForType(meta?.type);
    result.push({
      id: accessorKey,
      accessorKey,
      header: undefined,
      enableSorting: false,
      enableColumnFilter: false,
      // No explicit size: computeAutoColumnWidths (content measurement)
      // seeds the widths, users' manual resizes override.
      minSize: 60,
      meta: {
        ...(col.meta as object),
        label: meta?.label ?? accessorKey,
        badge: meta?.primaryKey ? <PrimaryKeyBadge /> : undefined,
        cell: variant,
      },
    });
  }
  return result;
}

export function useExplorerGrid({
  columns,
  data,
  pendingEdits,
  newRows,
  readOnly,
  allowAddRows,
  onStageEdit,
  onDeleteRows,
  onDiscardNewRow,
  onAddNewRow,
  pageIndex,
  pageSize,
  totalRows,
  onPaginationChange,
  rowHeight,
  onRowHeightChange,
}: UseExplorerGridProps) {
  const gridColumns = React.useMemo(() => buildGridColumns(columns), [columns]);

  const dataColumnIds = React.useMemo(
    () =>
      gridColumns
        .filter((c) => c.id && c.id !== "select" && c.id !== "actions")
        .map((c) => c.id as string),
    [gridColumns],
  );

  const newRowIds = React.useMemo(() => Array.from(newRows.keys()), [newRows]);

  const resolveRowId = React.useCallback(
    (rowIndex: number): string | undefined => {
      if (rowIndex < data.length) return String(rowIndex);
      return newRowIds[rowIndex - data.length];
    },
    [data.length, newRowIds],
  );

  // Rows the user sees: server rows + staged edits overlaid + staged new rows
  // appended. Discarding edits reverts to `data`; saving triggers a refetch.
  const gridData = React.useMemo(() => {
    const base: Record<string, unknown>[] = data.map((row, i) => {
      const edits = pendingEdits.get(String(i));
      if (!edits) return row;
      const out = { ...row };
      edits.forEach((edit, columnId) => {
        out[columnId] = edit.value;
      });
      return out;
    });
    newRows.forEach((rowData, rowId) => {
      const out: Record<string, unknown> = { ...rowData };
      const edits = pendingEdits.get(rowId);
      edits?.forEach((edit, columnId) => {
        out[columnId] = edit.value;
      });
      base.push(out);
    });
    return base;
  }, [data, pendingEdits, newRows]);

  const gridDataRef = React.useRef(gridData);
  React.useEffect(() => {
    gridDataRef.current = gridData;
  }, [gridData]);

  // The grid is controlled: it reports the fully-updated data array and we
  // diff it against what it last rendered to derive staged edits.
  const handleDataChange = React.useCallback(
    (nextData: Record<string, unknown>[]) => {
      const prev = gridDataRef.current;
      for (let i = 0; i < nextData.length; i++) {
        const prevRow = prev?.[i];
        const nextRow = nextData[i];
        if (!prevRow || prevRow === nextRow) continue;
        const rowId = resolveRowId(i);
        if (!rowId) continue;
        for (const columnId of dataColumnIds) {
          if (prevRow[columnId] !== nextRow[columnId]) {
            onStageEdit(rowId, columnId, nextRow[columnId]);
          }
        }
      }
    },
    [dataColumnIds, onStageEdit, resolveRowId],
  );

  const handleRowsDelete = React.useCallback(
    async (_rows: Record<string, unknown>[], indices: number[]) => {
      const serverRows: Record<string, unknown>[] = [];
      for (const rowIndex of indices) {
        if (rowIndex < data.length) {
          // Use ORIGINAL server rows so identity (PK) is untouched by staged edits
          serverRows.push(data[rowIndex]);
        } else {
          const stagedId = newRowIds[rowIndex - data.length];
          if (stagedId) onDiscardNewRow(stagedId);
        }
      }
      if (serverRows.length > 0) onDeleteRows(serverRows);
    },
    [data, newRowIds, onDiscardNewRow, onDeleteRows],
  );

  // "+ Add row" footer / Shift+Enter: append a staged row and focus its first cell.
  const handleRowAdd = React.useCallback((): Promise<{
    rowIndex: number;
    columnId: string;
  } | null> => {
    onAddNewRow();
    const firstColumnId = dataColumnIds[0];
    if (!firstColumnId) return Promise.resolve(null);
    return Promise.resolve({
      rowIndex: gridDataRef.current.length,
      columnId: firstColumnId,
    });
  }, [dataColumnIds, onAddNewRow]);

  // Paste overflow beyond the current page: stage additional unsaved rows; the
  // pasted values arrive via onDataChange and are staged onto those rows.
  const handleRowsAdd = React.useCallback(
    async (count: number) => {
      for (let i = 0; i < count; i++) onAddNewRow();
    },
    [onAddNewRow],
  );

  // Forward tanstack's OnChangeFn (value OR updater) to the plain-value sink
  const handlePaginationChange = React.useCallback(
    (updater: PaginationState | ((old: PaginationState) => PaginationState)) => {
      onPaginationChange(
        typeof updater === "function" ? updater({ pageIndex, pageSize }) : updater,
      );
    },
    [onPaginationChange, pageIndex, pageSize],
  );

  return useDataGrid<Record<string, unknown>>({
    data: gridData,
    columns: gridColumns,
    rowHeight,
    onRowHeightChange,
    onDataChange: handleDataChange,
    onRowsDelete: readOnly ? undefined : handleRowsDelete,
    onRowAdd: readOnly || !allowAddRows ? undefined : handleRowAdd,
    onRowsAdd: readOnly || !allowAddRows ? undefined : handleRowsAdd,
    enableSearch: true,
    enablePaste: !readOnly,
    enableSingleCellSelection: true,
    stretchColumns: true,
    readOnly,
    // Server-driven pagination contract for the shared table chrome
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(totalRows / pageSize)),
    state: { pagination: { pageIndex, pageSize } },
    onPaginationChange: handlePaginationChange,
    // Gutter is the only left-pinned column; further "Pin to left" actions
    // on data columns append after it (row.getVisibleCells() puts left-pinned
    // columns first, so without this a pinned column would take slot #1).
    initialState: { columnPinning: { left: ["select"], right: [] } },
    autoFocus: false,
  });
}

export interface ExplorerDataGridViewProps {
  dataGridProps: ReturnType<typeof useExplorerGrid>;
  enableBackground?: boolean;
  tableClassName?: string;
  readOnly: boolean;
  allowAddRows: boolean;
  shortcutsOpen?: boolean;
  onShortcutsOpenChange?: (open: boolean) => void;
}

export function ExplorerDataGridView({
  dataGridProps,
  enableBackground = true,
  tableClassName,
  readOnly,
  allowAddRows,
  shortcutsOpen,
  onShortcutsOpenChange,
}: ExplorerDataGridViewProps) {
  // Exactly the condition under which useExplorerGrid hands back onRowAdd, so
  // the first-run action can never be a button with nothing behind it.
  const onRowAdd = !readOnly && allowAddRows ? dataGridProps.onRowAdd : undefined;

  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden",
        enableBackground && "bg-background",
        tableClassName,
      )}
    >
      {dataGridProps.table.getRowModel().rows.length === 0 ? (
        onRowAdd ? (
          <EmptyState
            kind="first-run"
            title="No rows yet"
            description="Add a row to get started. New rows stay staged until you review and save them."
            actions={
              <Button variant="primary" iconStart={<Plus />} onClick={() => void onRowAdd()}>
                Add row
              </Button>
            }
            className="min-h-[200px]"
          />
        ) : (
          <EmptyState
            kind="causal"
            title="No rows"
            cause="The query for this page returned no rows."
            freeRemedy="Clear any filter above, or check another page."
            className="min-h-[200px]"
          />
        )
      ) : (
        <>
          <DataGrid {...dataGridProps} fill stretchColumns className="rounded-none" />
          <DataGridKeyboardShortcuts
            enableSearch={true}
            enablePaste={!readOnly}
            enableRowAdd={!readOnly && allowAddRows}
            enableRowsDelete={!readOnly}
            open={shortcutsOpen}
            onOpenChange={onShortcutsOpenChange}
          />
        </>
      )}
    </div>
  );
}
