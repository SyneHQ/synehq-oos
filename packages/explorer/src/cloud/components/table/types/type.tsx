import {
  ColumnFiltersState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";

export type DataTableAction<TData> =
  | {
      type: "SET_ROW_SELECTION";
      payload: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState);
    }
  | {
      type: "SET_COLUMN_VISIBILITY";
      payload: VisibilityState | ((prev: VisibilityState) => VisibilityState);
    }
  | {
      type: "SET_COLUMN_FILTERS";
      payload: ColumnFiltersState | ((prev: ColumnFiltersState) => ColumnFiltersState);
    }
  | {
      type: "SET_SORTING";
      payload: SortingState | ((prev: SortingState) => SortingState);
    }
  | {
      type: "ADD_EDIT";
      payload: {
        rowId: string;
        columnId: string;
        value: unknown;
        originalValue: unknown;
      };
    }
  | { type: "CLEAR_EDITS" }
  | {
      type: "ADD_NEW_ROW";
      payload: {
        rowId: string;
        rowData: TData;
      };
    }
  | {
      type: "REMOVE_NEW_ROW";
      payload: {
        rowId: string;
      };
    }
  | { type: "CLEAR_NEW_ROWS" }
  | {
      type: "STAGE_DELETE";
      payload: { rowId: string; row: TData };
    }
  | { type: "CLEAR_DELETES" };
