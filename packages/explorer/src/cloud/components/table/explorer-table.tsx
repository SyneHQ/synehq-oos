"use client";

/**
 * Database explorer shell: staged edits + toolbars + pagination around
 * useExplorerGrid / JsonDocumentView. Replaces DataTable for DataView only.
 */
import * as React from "react";
import { useMemo } from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import {
  Columns3,
  MoreHorizontal,
  FileSpreadsheetIcon,
  FileUp,
  Keyboard,
  Plus,
  RefreshCcw,
  Save,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { DataTablePagination } from "../ui/data-table-pagination";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
  DropdownMenuCheckboxItem,
} from "../ui/dropdown-menu";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { dataTableReducer } from "./reducer";
import type { EditToolbarProps } from "./types/interfaces";
import { ExplorerDataGridView, useExplorerGrid } from "./explorer-data-grid";
import type { RowHeightValue } from "../../types/data-grid";

function EditToolbar({
  editCount,
  newRowCount = 0,
  deleteCount = 0,
  onSave,
  onDiscard,
  canWrite,
  isReviewing,
}: EditToolbarProps) {
  const totalChanges = editCount + newRowCount + deleteCount;

  return (
    <div className="flex items-center gap-2 bg-muted/50 p-2 ">
      <span className="text-sm text-muted-foreground">
        {totalChanges} unsaved {totalChanges === 1 ? "change" : "changes"}
        {newRowCount > 0 && (
          <span className="ml-1 text-probe-success-fg">
            ({newRowCount} new {newRowCount === 1 ? "row" : "rows"})
          </span>
        )}
        {deleteCount > 0 && (
          <span className="ml-1 text-probe-critical-fg">({deleteCount} deleted)</span>
        )}
      </span>
      {canWrite && (
        <Button size="sm" onClick={onSave} disabled={isReviewing} className="h-8">
          <Save className="h-4 w-4 mr-2" />
          {isReviewing ? "Review pending" : "Review changes"}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={onDiscard}
        disabled={isReviewing}
        className="h-8"
      >
        <X className="h-4 w-4 mr-2" />
        Discard
      </Button>
    </div>
  );
}

export interface ExplorerTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  pagination?: boolean;
  isLoading?: boolean;
  isRefreshing?: boolean;
  onPaginationChange?: (pagination: PaginationState) => void;
  totalRows?: number;
  pageIndex?: number;
  pageSize?: number;
  onRefresh?: () => void;
  onExport?: () => void;
  onShare?: () => void;
  onImport?: () => void;
  onReviewMutations?: (batch: {
    inserts: TData[];
    updates: Array<{ row: TData; column: string; value: unknown }>;
    deletes: TData[];
  }) => Promise<boolean>;
  onPendingChangesChange?: (pending: boolean) => void;
  children?: React.ReactNode;
  enableBackground?: boolean;
  createEmptyRow?: () => TData;
  className?: string;
  tableClassName?: string;
  allowAddNewRow?: boolean;
  supportsEdit?: boolean;
  allowHideColumns?: boolean;
  canWrite?: boolean;
}

export function ExplorerTable<TData>({
  columns,
  data,
  pagination = true,
  isLoading,
  isRefreshing = false,
  onPaginationChange,
  totalRows = 0,
  pageIndex = 0,
  pageSize = 50,
  onRefresh,
  onExport,
  onShare,
  onImport,
  onReviewMutations,
  onPendingChangesChange,
  children,
  enableBackground = true,
  createEmptyRow,
  className,
  tableClassName,
  allowAddNewRow = false,
  supportsEdit = true,
  allowHideColumns = false,
  canWrite = false,
}: ExplorerTableProps<TData>) {
  const [state, dispatch] = React.useReducer(dataTableReducer<TData>, {
    rowSelection: {},
    columnVisibility: {},
    columnFilters: [],
    sorting: [],
    pendingEdits: new Map(),
    newRows: new Map(),
    pendingDeletes: new Map(),
    newRowCounter: 0,
  });

  const [isReviewing, setIsReviewing] = React.useState(false);
  const reviewInFlight = React.useRef(false);

  const [gridRowHeight, setGridRowHeight] = React.useState<RowHeightValue>("short");
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);

  const createDefaultEmptyRow = React.useCallback((): TData => {
    const emptyRow = {} as TData;
    columns.forEach((col) => {
      if ("accessorKey" in col && col.accessorKey) {
        (emptyRow as Record<string, unknown>)[col.accessorKey as string] = null;
      }
    });
    return emptyRow;
  }, [columns]);

  const addStagedRow = React.useCallback(() => {
    if (!canWrite || !supportsEdit || reviewInFlight.current) return;
    const newRowId = `new-row-${crypto.randomUUID()}`;
    const newRowData = createEmptyRow ? createEmptyRow() : createDefaultEmptyRow();
    dispatch({
      type: "ADD_NEW_ROW",
      payload: { rowId: newRowId, rowData: newRowData },
    });
  }, [createEmptyRow, createDefaultEmptyRow, canWrite, supportsEdit]);

  const handleAddNewRow = React.useCallback(() => {
    if (!allowAddNewRow) return;
    addStagedRow();
  }, [allowAddNewRow, addStagedRow]);

  const handlePendingChange = React.useCallback(
    (rowId: string, columnId: string, value: unknown) => {
      if (!canWrite || !supportsEdit || reviewInFlight.current) return;
      let originalValue: unknown;
      if (state.newRows.has(rowId)) {
        originalValue =
          (state.newRows.get(rowId) as Record<string, unknown> | undefined)?.[columnId] ?? null;
      } else {
        const idx = Number(rowId);
        originalValue = Number.isFinite(idx)
          ? (data[idx] as Record<string, unknown> | undefined)?.[columnId]
          : null;
      }
      dispatch({
        type: "ADD_EDIT",
        payload: { rowId, columnId, value, originalValue },
      });
    },
    [state.newRows, data, canWrite, supportsEdit],
  );

  const handleSaveChanges = React.useCallback(async () => {
    if (
      !canWrite ||
      !supportsEdit ||
      !onReviewMutations ||
      isLoading ||
      isRefreshing ||
      reviewInFlight.current
    )
      return;
    const newRowIds = Array.from(state.newRows.keys());
    const existingRowUpdates: Array<{
      row: TData;
      column: string;
      value: unknown;
    }> = [];

    Array.from(
      state.pendingEdits.entries() as unknown as Array<[string, Map<string, { value: unknown }>]>,
    ).forEach(([rowId, columnEdits]) => {
      if (state.newRows.has(rowId)) return;
      if (state.pendingDeletes.has(rowId)) return;
      const idx = Number(rowId);
      const row = Number.isFinite(idx) ? data[idx] : undefined;
      if (!row) return;
      Array.from(columnEdits.entries()).forEach(([columnId, { value }]) => {
        existingRowUpdates.push({ row, column: columnId, value });
      });
    });

    const deletes = Array.from(state.pendingDeletes.values());
    const inserts = newRowIds.map((rowId) => {
      const newRowData = { ...(state.newRows.get(rowId) as TData) };
      const rowEdits = state.pendingEdits.get(rowId);
      rowEdits?.forEach((edit: { value: unknown }, columnId: string | number) => {
        (newRowData as Record<string, unknown>)[columnId as string] = edit.value;
      });
      return newRowData;
    });

    if (inserts.length === 0 && existingRowUpdates.length === 0 && deletes.length === 0) {
      return;
    }

    reviewInFlight.current = true;
    setIsReviewing(true);
    try {
      if (onReviewMutations) {
        const saved = await onReviewMutations({
          inserts,
          updates: existingRowUpdates,
          deletes,
        });
        if (saved !== true) return;
        dispatch({ type: "CLEAR_NEW_ROWS" });
        dispatch({ type: "CLEAR_DELETES" });
        dispatch({ type: "CLEAR_EDITS" });
      }
    } catch {
      toast.error("The write outcome is not confirmed. Your changes remain staged.");
    } finally {
      reviewInFlight.current = false;
      setIsReviewing(false);
    }
  }, [
    canWrite,
    supportsEdit,
    isLoading,
    isRefreshing,
    onReviewMutations,
    state.pendingEdits,
    state.newRows,
    state.pendingDeletes,
    data,
  ]);

  const handleDeleteRows = React.useCallback(
    (rows: Record<string, unknown>[]) => {
      if (!onReviewMutations || !canWrite || !supportsEdit || reviewInFlight.current) return;
      for (const row of rows) {
        const idx = (data as TData[]).indexOf(row as TData);
        dispatch({
          type: "STAGE_DELETE",
          payload: {
            rowId: idx >= 0 ? String(idx) : crypto.randomUUID(),
            row: row as TData,
          },
        });
      }
      toast.success(
        `${rows.length} row${rows.length !== 1 ? "s" : ""} staged for deletion. Review changes to continue.`,
      );
    },
    [onReviewMutations, data, canWrite, supportsEdit],
  );

  const gridReadOnly = !canWrite || !supportsEdit || !!isLoading || isRefreshing || isReviewing;

  const explorer = useExplorerGrid({
    columns: columns as unknown as ColumnDef<Record<string, unknown>, unknown>[],
    data: (data ?? []) as unknown as Record<string, unknown>[],
    pendingEdits: state.pendingEdits,
    newRows: state.newRows as unknown as Map<string, Record<string, unknown>>,
    readOnly: gridReadOnly,
    allowAddRows: allowAddNewRow && canWrite,
    onStageEdit: handlePendingChange,
    onDeleteRows: handleDeleteRows,
    onDiscardNewRow: (rowId) => dispatch({ type: "REMOVE_NEW_ROW", payload: { rowId } }),
    onAddNewRow: addStagedRow,
    pageIndex,
    pageSize,
    totalRows,
    onPaginationChange: (next) => {
      if (isLoading || state.pendingEdits.size || state.newRows.size || state.pendingDeletes.size) {
        if (!isLoading) toast.info("Save or discard your changes before changing pages.");
        return;
      }
      if (next.pageIndex !== pageIndex || next.pageSize !== pageSize) onPaginationChange?.(next);
    },
    rowHeight: gridRowHeight,
    onRowHeightChange: setGridRowHeight,
  });

  const activeTable = explorer.table;

  const showEditToolbar = useMemo(
    () => state.pendingEdits.size > 0 || state.newRows.size > 0 || state.pendingDeletes.size > 0,
    [state.pendingEdits.size, state.newRows.size, state.pendingDeletes.size],
  );

  React.useEffect(() => {
    onPendingChangesChange?.(showEditToolbar);
  }, [onPendingChangesChange, showEditToolbar]);

  const showToolBar = useMemo(
    () =>
      Boolean(
        onRefresh ||
          onExport ||
          onShare ||
          onImport ||
          children ||
          (columns.length > 1 && allowHideColumns),
      ),
    [onRefresh, onExport, onShare, onImport, children, columns.length, allowHideColumns],
  );

  const showPagination = useMemo(() => pagination, [pagination]);

  const handleShare = React.useCallback(async () => {
    await onShare?.();
  }, [onShare]);

  return (
    <div
      data-explorer-shell=""
      className={cn("h-full min-h-0 min-w-0 w-full flex flex-col overflow-hidden gap-2", className)}
    >
      {showEditToolbar && (
        <EditToolbar
          editCount={Array.from(state.pendingEdits.values()).reduce(
            (count, edits) => count + edits.size,
            0,
          )}
          newRowCount={state.newRows.size}
          deleteCount={state.pendingDeletes.size}
          onSave={handleSaveChanges}
          onDiscard={() => {
            if (reviewInFlight.current) return;
            dispatch({ type: "CLEAR_EDITS" });
            dispatch({ type: "CLEAR_NEW_ROWS" });
            dispatch({ type: "CLEAR_DELETES" });
          }}
          canWrite={canWrite && supportsEdit}
          isReviewing={isReviewing}
        />
      )}
      {showToolBar && (
        <div
          data-explorer-toolbar=""
          className={cn(
            "flex min-w-0 shrink-0 flex-wrap items-center gap-2",
            !children ? "justify-end" : "",
          )}
        >
          {children}
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            {onRefresh && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (showEditToolbar) {
                    toast.info("Save or discard your changes before refreshing.");
                    return;
                  }
                  onRefresh();
                }}
                disabled={isLoading || isRefreshing}
                aria-label="Refresh table data"
                title="Refresh table data"
                className="h-8 px-3"
              >
                <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
            )}
            {allowAddNewRow && canWrite && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddNewRow}
                disabled={gridReadOnly}
                className="h-8"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Row
              </Button>
            )}
            {onReviewMutations &&
              canWrite &&
              activeTable.getFilteredSelectedRowModel().rows.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 gap-2"
                  disabled={gridReadOnly}
                  aria-label={`Delete selected rows (${activeTable.getFilteredSelectedRowModel().rows.length})`}
                  onClick={() => {
                    const selected = activeTable.getFilteredSelectedRowModel().rows;
                    const stagedIds = Array.from(state.newRows.keys());
                    const originals: Record<string, unknown>[] = [];
                    for (const row of selected) {
                      if (row.index < data.length) {
                        originals.push(data[row.index] as Record<string, unknown>);
                      } else {
                        const rowId = stagedIds[row.index - data.length];
                        if (rowId) dispatch({ type: "REMOVE_NEW_ROW", payload: { rowId } });
                      }
                    }
                    if (originals.length) handleDeleteRows(originals);
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Delete selected (
                  {activeTable.getFilteredSelectedRowModel().rows.length})
                </Button>
              )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="More table actions"
                  title="More table actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56"
                onCloseAutoFocus={(event) => {
                  if (shortcutsOpen) event.preventDefault();
                }}
              >
                {columns.length > 1 && allowHideColumns && (
                  <>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2">
                        <Columns3 className="h-4 w-4" /> Columns
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="max-h-80 w-60 overflow-y-auto">
                          {activeTable
                            .getAllColumns()
                            .filter(
                              (column) =>
                                typeof column.accessorFn !== "undefined" && column.getCanHide(),
                            )
                            .map((column) => (
                              <DropdownMenuCheckboxItem
                                key={column.id}
                                checked={column.getIsVisible()}
                                onCheckedChange={(value) => column.toggleVisibility(!!value)}
                                onSelect={(event) => event.preventDefault()}
                              >
                                <span
                                  className="truncate"
                                  title={column.columnDef.meta?.label ?? column.id}
                                >
                                  {column.columnDef.meta?.label ?? column.id}
                                </span>
                              </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                  </>
                )}
                {onExport && (
                  <DropdownMenuItem onSelect={onExport} className="gap-2">
                    <FileSpreadsheetIcon className="h-4 w-4" /> Export CSV
                  </DropdownMenuItem>
                )}
                {onImport && (
                  <DropdownMenuItem onSelect={onImport} disabled={gridReadOnly} className="gap-2">
                    <FileUp className="h-4 w-4" /> Import data
                  </DropdownMenuItem>
                )}
                {onShare && (
                  <DropdownMenuItem onSelect={handleShare} className="gap-2">
                    <Share2 className="h-4 w-4" /> Share table
                  </DropdownMenuItem>
                )}
                {
                  <DropdownMenuItem onSelect={() => setShortcutsOpen(true)} className="gap-2">
                    <Keyboard className="h-4 w-4" /> Keyboard shortcuts
                  </DropdownMenuItem>
                }
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {isLoading && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Loading table data"
          className="relative min-h-0 flex-1 overflow-hidden rounded-none border"
        >
          <div className="flex h-9 items-center gap-2 border-b bg-muted px-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading table data...
          </div>
          <div aria-hidden="true" className="divide-y">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="grid h-9 grid-cols-4 gap-6 px-3 py-3">
                {Array.from({ length: 4 }, (_, j) => (
                  <div key={j} className="h-3 rounded-none bg-muted motion-safe:animate-pulse" />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && (
        <>
          <ExplorerDataGridView
            dataGridProps={explorer}
            enableBackground={enableBackground}
            tableClassName={tableClassName}
            readOnly={gridReadOnly}
            allowAddRows={allowAddNewRow && canWrite}
            shortcutsOpen={shortcutsOpen}
            onShortcutsOpenChange={setShortcutsOpen}
          />
        </>
      )}
      {showPagination && (
        <div className="shrink-0" aria-busy={isLoading}>
          <DataTablePagination table={activeTable} totalRows={totalRows} />
        </div>
      )}
    </div>
  );
}
