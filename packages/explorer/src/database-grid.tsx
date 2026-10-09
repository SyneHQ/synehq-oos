"use client";

import * as React from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import type { CellValue, QueryColumn } from "@synehq-oos/explorer-contracts";
import { ExplorerTable } from "./cloud/components/table/explorer-table";

export interface GridMutationBatch {
  inserts: CellValue[][];
  updates: Array<{ row: CellValue[]; column: string; value: CellValue }>;
  deletes: CellValue[][];
}

export interface DatabaseGridProps {
  columns: QueryColumn[];
  rows: CellValue[][];
  label?: string;
  primaryKeyColumns?: string[];
  canWrite?: boolean;
  allowAddRows?: boolean;
  isLoading?: boolean;
  isRefreshing?: boolean;
  /** The host changes this value only after it discards or completes staged changes. */
  resetKey?: string | number;
  /** Enable this only when the API returns an exact total row count. */
  pagination?: boolean;
  pageIndex?: number;
  pageSize?: number;
  totalRows?: number;
  onPaginationChange?: (pagination: PaginationState) => void;
  onRefresh?: () => void;
  onExport?: () => void;
  /** Resolve true only after every approved change succeeds. False retains all staged changes. */
  onReviewMutations?: (batch: GridMutationBatch) => Promise<boolean>;
  onPendingChangesChange?: (pending: boolean) => void;
  children?: React.ReactNode;
  className?: string;
}

type GridRow = Record<string, CellValue>;

function assertCellValue(value: unknown): CellValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error("The cell value cannot be sent as a database parameter.");
}

/** Adapt wire arrays to the existing Cloud grid without converting values or merging column names. */
export function DatabaseGrid({
  columns,
  rows,
  label = "Database results",
  primaryKeyColumns = [],
  canWrite = false,
  allowAddRows = false,
  resetKey,
  pagination = false,
  pageIndex = 0,
  pageSize = 100,
  totalRows,
  onReviewMutations,
  ...props
}: DatabaseGridProps) {
  const columnKeys = React.useMemo(() => columns.map((_, index) => `column-${index}`), [columns]);
  const records = React.useMemo(
    () =>
      rows.map(
        (row) =>
          Object.fromEntries(columnKeys.map((key, index) => [key, row[index] ?? null])) as GridRow,
      ),
    [rows, columnKeys],
  );
  const hasUniqueNames = new Set(columns.map((column) => column.name)).size === columns.length;
  const hasExactKey =
    primaryKeyColumns.length > 0 &&
    primaryKeyColumns.every((name) => columns.some((column) => column.name === name));
  const editable = canWrite && hasUniqueNames && hasExactKey && Boolean(onReviewMutations);

  const gridColumns = React.useMemo<ColumnDef<GridRow, unknown>[]>(
    () => [
      { id: "select" },
      ...columns.map((column, index) => ({
        id: columnKeys[index],
        accessorKey: columnKeys[index],
        meta: {
          label: column.name || "Unnamed column",
          type: column.dataType,
          primaryKey: primaryKeyColumns.includes(column.name),
        },
      })),
    ],
    [columns, columnKeys, primaryKeyColumns],
  );

  const review = React.useCallback(
    async (batch: {
      inserts: GridRow[];
      updates: Array<{ row: GridRow; column: string; value: unknown }>;
      deletes: GridRow[];
    }): Promise<boolean> => {
      if (!editable || !onReviewMutations) return false;
      const toRow = (row: GridRow): CellValue[] =>
        columnKeys.map((key) => assertCellValue(row[key]));
      const updates = batch.updates.map((update) => {
        const index = columnKeys.indexOf(update.column);
        if (index < 0) throw new Error("The edited column is no longer in this result.");
        return {
          row: toRow(update.row),
          column: columns[index].name,
          value: assertCellValue(update.value),
        };
      });
      return onReviewMutations({
        inserts: batch.inserts.map(toRow),
        updates,
        deletes: batch.deletes.map(toRow),
      });
    },
    [editable, onReviewMutations, columnKeys, columns],
  );

  return (
    <section
      className="cloud-explorer-grid flex min-h-0 min-w-0 flex-1 flex-col"
      aria-label={label}
    >
      <ExplorerTable<GridRow>
        key={resetKey}
        {...props}
        columns={gridColumns}
        data={records}
        canWrite={editable}
        supportsEdit={editable}
        allowAddNewRow={editable && allowAddRows}
        allowHideColumns
        pagination={pagination && totalRows !== undefined}
        pageIndex={pageIndex}
        pageSize={pageSize}
        totalRows={totalRows ?? rows.length}
        onReviewMutations={editable ? review : undefined}
      />
    </section>
  );
}
