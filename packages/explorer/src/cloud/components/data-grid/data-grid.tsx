"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import { DataGridColumnHeader } from "./data-grid-column-header";
import { DataGridContextMenu } from "./data-grid-context-menu";
import { DataGridPasteDialog } from "./data-grid-paste-dialog";
import { DataGridRow } from "./data-grid-row";
import { DataGridSearch } from "./data-grid-search";
import { useAsRef } from "../../hooks/use-as-ref";
import type { useDataGrid } from "../../hooks/use-data-grid";
import { useComposedRefs } from "../../lib/compose-refs";
import {
  columnSizeCssVar,
  flexRender,
  getColumnBorderVisibility,
  getColumnPinningStyle,
} from "../../lib/data-grid";
import { cn } from "../../lib/utils";
import type { Direction } from "../../types/data-grid";

const EMPTY_CELL_SELECTION_SET = new Set<string>();

interface DataGridProps<TData>
  extends Omit<ReturnType<typeof useDataGrid<TData>>, "dir">,
    Omit<React.ComponentProps<"div">, "contextMenu"> {
  dir?: Direction;
  height?: number;
  /** Stretch the scrollport to the parent instead of shrinking to row count. */
  fill?: boolean;
  stretchColumns?: boolean;
}

export function DataGrid<TData>({
  dataGridRef,
  onDataGridChange,
  headerRef,
  rowMapRef,
  footerRef,
  dir = "ltr",
  table,
  tableMeta,
  virtualTotalSize,
  virtualItems,
  measureElement,
  columns,
  columnSizeVars,
  searchState,
  searchMatchesByRow,
  activeSearchMatch,
  cellSelectionMap,
  focusedCell,
  editingCell,
  rowHeight,
  contextMenu,
  pasteDialog,
  onRowAdd: onRowAddProp,
  height = 600,
  fill = false,
  stretchColumns = false,
  adjustLayout = false,
  className,
  ...props
}: DataGridProps<TData>) {
  const rows = table.getRowModel().rows;
  const readOnly = tableMeta?.readOnly ?? false;
  const columnVisibility = table.getState().columnVisibility;
  const columnPinning = table.getState().columnPinning;
  const composedDataGridRef = useComposedRefs(dataGridRef, onDataGridChange);

  const onRowAddRef = useAsRef(onRowAddProp);

  const onRowAdd = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      onRowAddRef.current?.(event);
    },
    [onRowAddRef],
  );

  const onDataGridContextMenu = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const onFooterCellKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!onRowAddRef.current) return;

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onRowAddRef.current();
      }
    },
    [onRowAddRef],
  );

  return (
    <div
      data-slot="grid-wrapper"
      dir={dir}
      {...props}
      className={cn(
        "relative flex min-w-0 w-full flex-col",
        fill && "h-full min-h-0 flex-1",
        className,
      )}
    >
      {searchState && <DataGridSearch {...searchState} />}
      <DataGridContextMenu tableMeta={tableMeta} columns={columns} contextMenu={contextMenu} />
      <DataGridPasteDialog tableMeta={tableMeta} pasteDialog={pasteDialog} />
      <div
        role="grid"
        aria-label="Data grid"
        aria-rowcount={rows.length + (onRowAddProp ? 1 : 0)}
        aria-colcount={columns.length}
        data-slot="grid"
        tabIndex={0}
        ref={composedDataGridRef}
        className="relative grid min-h-0 min-w-0 select-none overflow-auto overscroll-contain rounded-none border focus:outline-none"
        style={{
          ...columnSizeVars,
          ...(fill
            ? {
                height: "100%",
                maxHeight: "100%",
                gridTemplateRows: "auto 1fr auto",
                alignContent: "start",
              }
            : { maxHeight: `${height}px` }),
        }}
        onContextMenu={onDataGridContextMenu}
      >
        <div
          role="rowgroup"
          data-slot="grid-header"
          ref={headerRef}
          className="sticky top-0 z-10 grid"
        >
          {table.getHeaderGroups().map((headerGroup, rowIndex) => (
            <div
              key={headerGroup.id}
              role="row"
              aria-rowindex={rowIndex + 1}
              data-slot="grid-header-row"
              tabIndex={-1}
              // w-max: the header band ends at the last column instead of
              // painting a phantom strip across empty canvas.
              className="flex w-max border-b bg-muted"
            >
              {headerGroup.headers.map((header, colIndex) => {
                const sorting = table.getState().sorting;
                const currentSort = sorting.find((sort) => sort.id === header.column.id);
                const isSortable = header.column.getCanSort();

                const nextHeader = headerGroup.headers[colIndex + 1];
                const isLastColumn = colIndex === headerGroup.headers.length - 1;

                const { showEndBorder, showStartBorder } = getColumnBorderVisibility({
                  column: header.column,
                  nextColumn: nextHeader?.column,
                  isLastColumn,
                });

                return (
                  <div
                    key={header.id}
                    role="columnheader"
                    aria-colindex={colIndex + 1}
                    aria-sort={
                      currentSort?.desc === false
                        ? "ascending"
                        : currentSort?.desc === true
                          ? "descending"
                          : isSortable
                            ? "none"
                            : undefined
                    }
                    data-slot="grid-header-cell"
                    tabIndex={-1}
                    className={cn("relative min-w-0 overflow-hidden", {
                      "border-e": showEndBorder && header.column.id !== "select",
                      "border-s": showStartBorder && header.column.id !== "select",
                    })}
                    style={{
                      ...getColumnPinningStyle({ column: header.column, dir }),
                      // Header band uses bg-muted (see grid-header); pinned
                      // cells must paint an opaque muted bg so horizontally
                      // scrolling columns slide cleanly beneath them.
                      background: header.column.getIsPinned() ? "hsl(var(--muted))" : undefined,
                      // Same --col var the body rows consume: header and
                      // body column geometry share a single source.
                      width: `calc(var(${columnSizeCssVar(header.column.id)}) * 1px)`,
                      flexShrink: 0,
                    }}
                  >
                    {header.isPlaceholder ? null : typeof header.column.columnDef.header ===
                      "function" ? (
                      <div className="size-full px-3 py-1.5">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </div>
                    ) : (
                      <DataGridColumnHeader header={header} table={table} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div
          role="rowgroup"
          data-slot="grid-body"
          className="relative grid"
          style={{
            height: `${virtualTotalSize}px`,
            contain: "layout",
          }}
        >
          {virtualItems.map((virtualItem) => {
            const row = rows[virtualItem.index];
            if (!row) return null;

            const cellSelectionKeys =
              cellSelectionMap?.get(virtualItem.index) ?? EMPTY_CELL_SELECTION_SET;

            const searchMatchColumns = searchMatchesByRow?.get(virtualItem.index) ?? null;
            const isActiveSearchRow = activeSearchMatch?.rowIndex === virtualItem.index;

            return (
              <DataGridRow
                key={row.id}
                row={row}
                columns={columns}
                tableMeta={tableMeta}
                rowMapRef={rowMapRef}
                virtualItem={virtualItem}
                measureElement={measureElement}
                rowHeight={rowHeight}
                columnVisibility={columnVisibility}
                columnOrder={table.getState().columnOrder}
                columnPinning={columnPinning}
                focusedCell={focusedCell}
                editingCell={editingCell}
                cellSelectionKeys={cellSelectionKeys}
                searchMatchColumns={searchMatchColumns}
                activeSearchMatch={isActiveSearchRow ? activeSearchMatch : null}
                dir={dir}
                adjustLayout={adjustLayout}
                stretchColumns={stretchColumns}
                readOnly={readOnly}
              />
            );
          })}
        </div>
        {!readOnly && onRowAdd && (
          <div
            role="rowgroup"
            data-slot="grid-footer"
            ref={footerRef}
            className="sticky bg-background bottom-0 z-10 grid"
          >
            <div
              role="row"
              aria-rowindex={rows.length + 2}
              data-slot="grid-add-row"
              tabIndex={-1}
              className="flex w-full"
            >
              <div
                role="gridcell"
                tabIndex={0}
                className="relative flex h-9 grow items-center border-t bg-muted/30 transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
                style={{
                  width: table.getTotalSize(),
                  minWidth: table.getTotalSize(),
                }}
                onClick={onRowAdd}
                onKeyDown={onFooterCellKeyDown}
              >
                <div className="sticky start-0 flex items-center gap-2 px-3 text-muted-foreground">
                  <Plus className="size-3.5" />
                  <span className="text-sm">Add row</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
