"use client";

import type { ColumnDef, TableMeta } from "@tanstack/react-table";
import {
  BracesIcon,
  CopyIcon,
  EraserIcon,
  FileSpreadsheetIcon,
  ScissorsIcon,
  Trash2Icon,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useAsRef } from "../../hooks/use-as-ref";
import { parseCellKey } from "../../lib/data-grid";
import type { CellUpdate, ContextMenuState } from "../../types/data-grid";

interface DataGridContextMenuProps<TData> {
  tableMeta: TableMeta<TData>;
  columns: Array<ColumnDef<TData>>;
  contextMenu: ContextMenuState;
}

export function DataGridContextMenu<TData>({
  tableMeta,
  columns,
  contextMenu,
}: DataGridContextMenuProps<TData>) {
  const onContextMenuOpenChange = tableMeta?.onContextMenuOpenChange;
  const selectionState = tableMeta?.selectionState;
  const dataGridRef = tableMeta?.dataGridRef;
  const onDataUpdate = tableMeta?.onDataUpdate;
  const onRowsDelete = tableMeta?.onRowsDelete;
  const onCellsCopy = tableMeta?.onCellsCopy;
  const onCellsCut = tableMeta?.onCellsCut;

  if (!contextMenu.open) return null;

  return (
    <ContextMenu
      tableMeta={tableMeta}
      columns={columns}
      dataGridRef={dataGridRef}
      contextMenu={contextMenu}
      onContextMenuOpenChange={onContextMenuOpenChange}
      selectionState={selectionState}
      onDataUpdate={onDataUpdate}
      onRowsDelete={onRowsDelete}
      onCellsCopy={onCellsCopy}
      onCellsCut={onCellsCut}
    />
  );
}

interface ContextMenuProps<TData>
  extends Pick<
      TableMeta<TData>,
      | "dataGridRef"
      | "onContextMenuOpenChange"
      | "selectionState"
      | "onDataUpdate"
      | "onRowsDelete"
      | "onCellsCopy"
      | "onCellsCut"
      | "readOnly"
    >,
    Required<Pick<TableMeta<TData>, "contextMenu">> {
  tableMeta: TableMeta<TData>;
  columns: Array<ColumnDef<TData>>;
}

const ContextMenu = React.memo(ContextMenuImpl, (prev, next) => {
  if (prev.contextMenu.open !== next.contextMenu.open) return false;
  if (!next.contextMenu.open) return true;
  if (prev.contextMenu.x !== next.contextMenu.x) return false;
  if (prev.contextMenu.y !== next.contextMenu.y) return false;

  const prevSize = prev.selectionState?.selectedCells?.size ?? 0;
  const nextSize = next.selectionState?.selectedCells?.size ?? 0;
  if (prevSize !== nextSize) return false;

  return true;
}) as typeof ContextMenuImpl;

function ContextMenuImpl<TData>({
  tableMeta,
  columns,
  dataGridRef,
  contextMenu,
  onContextMenuOpenChange,
  selectionState,
  onDataUpdate,
  onRowsDelete,
  onCellsCopy,
  onCellsCut,
}: ContextMenuProps<TData>) {
  const propsRef = useAsRef({
    dataGridRef,
    selectionState,
    onDataUpdate,
    onRowsDelete,
    onCellsCopy,
    onCellsCut,
    columns,
  });

  const triggerStyle = React.useMemo<React.CSSProperties>(
    () => ({
      position: "fixed",
      left: `${contextMenu.x}px`,
      top: `${contextMenu.y}px`,
      width: "1px",
      height: "1px",
      padding: 0,
      margin: 0,
      border: "none",
      background: "transparent",
      pointerEvents: "none",
      opacity: 0,
    }),
    [contextMenu.x, contextMenu.y],
  );

  const onCloseAutoFocus = React.useCallback(
    (event: Event) => {
      event.preventDefault();
      propsRef.current.dataGridRef?.current?.focus();
    },
    [propsRef],
  );

  const onCopy = React.useCallback(() => {
    propsRef.current.onCellsCopy?.();
  }, [propsRef]);

  const onCut = React.useCallback(() => {
    propsRef.current.onCellsCut?.();
  }, [propsRef]);

  const onClear = React.useCallback(() => {
    const { selectionState, columns, onDataUpdate } = propsRef.current;

    if (!selectionState?.selectedCells || selectionState.selectedCells.size === 0) return;

    const updates: Array<CellUpdate> = [];

    for (const cellKey of Array.from(selectionState.selectedCells)) {
      const { rowIndex, columnId } = parseCellKey(cellKey);

      // Get column from columns array
      const column = columns.find((col: ColumnDef<TData>) => {
        if (col.id) return col.id === columnId;
        if ("accessorKey" in col) return col.accessorKey === columnId;
        return false;
      });
      const cellVariant = column?.meta?.cell?.variant;

      let emptyValue: unknown = "";
      if (cellVariant === "multi-select" || cellVariant === "file") {
        emptyValue = [];
      } else if (cellVariant === "number" || cellVariant === "date") {
        emptyValue = null;
      } else if (cellVariant === "checkbox") {
        emptyValue = false;
      }

      updates.push({ rowIndex, columnId, value: emptyValue });
    }

    onDataUpdate?.(updates);

    toast.success(`${updates.length} cell${updates.length !== 1 ? "s" : ""} cleared`);
  }, [propsRef]);

  const onDelete = React.useCallback(async () => {
    const { selectionState, onRowsDelete } = propsRef.current;

    if (!selectionState?.selectedCells || selectionState.selectedCells.size === 0) return;

    const rowIndices = new Set<number>();
    for (const cellKey of Array.from(selectionState.selectedCells)) {
      const { rowIndex } = parseCellKey(cellKey);
      rowIndices.add(rowIndex);
    }

    const rowIndicesArray = Array.from(rowIndices).sort((a, b) => a - b);

    // No toast here: the grid can't tell whether the host deleted the rows or
    // only staged them for review. The host handler owns user feedback.
    await onRowsDelete?.(rowIndicesArray);
  }, [propsRef]);

  return (
    <DropdownMenu open={contextMenu.open} onOpenChange={onContextMenuOpenChange}>
      <DropdownMenuTrigger style={triggerStyle} />
      <DropdownMenuContent
        data-grid-popover=""
        align="start"
        className="w-48"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DropdownMenuItem className="gap-2" onSelect={onCopy}>
          <CopyIcon size={16} />
          Copy
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2" onSelect={() => tableMeta?.onCellsCopyAs?.("json")}>
          <BracesIcon size={16} />
          Copy as JSON
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2" onSelect={() => tableMeta?.onCellsCopyAs?.("csv")}>
          <FileSpreadsheetIcon size={16} />
          Copy as CSV
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2" onSelect={onCut} disabled={tableMeta?.readOnly}>
          <ScissorsIcon size={16} />
          Cut
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2" onSelect={onClear} disabled={tableMeta?.readOnly}>
          <EraserIcon size={16} />
          Clear
        </DropdownMenuItem>
        {onRowsDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2" onSelect={onDelete}>
              <Trash2Icon size={16} />
              Delete rows
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
