import {
  Column,
  ColumnDef,
  ColumnFiltersState,
  Row,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import { Table as TableType } from "@tanstack/react-table";

export interface DataTableState<TData> {
  rowSelection: Record<string, boolean>;
  columnVisibility: VisibilityState;
  columnFilters: ColumnFiltersState;
  sorting: SortingState;
  pendingEdits: Map<string, Map<string, EditOperation>>;
  newRows: Map<string, TData>;
  pendingDeletes: Map<string, TData>;
  newRowCounter: number;
}

export interface EditOperation {
  value: unknown;
  originalValue: unknown;
  timestamp: number;
}

export interface EditableCellProps<TData> {
  getValue: () => any;
  row: Row<TData>;
  column: Column<TData, any>;
  table: TableType<TData>;
  canEdit?: boolean;
  theme?: string;
  onPendingChange: (rowId: string, columnId: string, value: any) => void;
}

// Extend the ColumnMeta type
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends unknown, TValue> {
    editable?: boolean;
    type?: string;
    primaryKey?: boolean;
    foreignKey?: boolean;
    unique?: boolean;
  }
}

export interface EditToolbarProps {
  editCount: number;
  newRowCount?: number;
  deleteCount?: number;
  onSave: () => Promise<void>;
  onDiscard: () => void;
  canWrite: boolean;
  isReviewing?: boolean;
}
