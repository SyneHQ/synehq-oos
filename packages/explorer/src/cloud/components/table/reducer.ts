import { DataTableState } from "./types/interfaces";
import { DataTableAction } from "./types/type";
import { RowSelectionState } from "@tanstack/react-table";

export function dataTableReducer<TData>(
  state: DataTableState<TData>,
  action: DataTableAction<TData>,
): DataTableState<TData> {
  switch (action.type) {
    case "SET_ROW_SELECTION": {
      const newSelection =
        typeof action.payload === "function"
          ? action.payload(state.rowSelection as RowSelectionState)
          : action.payload;
      return { ...state, rowSelection: newSelection };
    }
    case "SET_COLUMN_VISIBILITY": {
      const newVisibility =
        typeof action.payload === "function"
          ? action.payload(state.columnVisibility)
          : action.payload;
      return { ...state, columnVisibility: newVisibility };
    }
    case "SET_COLUMN_FILTERS": {
      const newFilters =
        typeof action.payload === "function" ? action.payload(state.columnFilters) : action.payload;
      return { ...state, columnFilters: newFilters };
    }
    case "SET_SORTING": {
      const newSorting =
        typeof action.payload === "function" ? action.payload(state.sorting) : action.payload;
      return { ...state, sorting: newSorting };
    }
    case "ADD_EDIT": {
      const { rowId, columnId, value, originalValue } = action.payload;
      const newEdits = new Map(state.pendingEdits);
      let rowEdits = newEdits.get(rowId) || new Map();
      rowEdits = new Map(rowEdits);
      if (Object.is(value, originalValue)) rowEdits.delete(columnId);
      else rowEdits.set(columnId, { value, originalValue, timestamp: Date.now() });
      if (rowEdits.size) newEdits.set(rowId, rowEdits);
      else newEdits.delete(rowId);
      return { ...state, pendingEdits: newEdits };
    }
    case "CLEAR_EDITS":
      return { ...state, pendingEdits: new Map() };
    case "ADD_NEW_ROW": {
      const { rowId, rowData } = action.payload;
      const newRows = new Map(state.newRows);
      newRows.set(rowId, rowData);
      return {
        ...state,
        newRows,
        newRowCounter: state.newRowCounter + 1,
      };
    }
    case "REMOVE_NEW_ROW": {
      const { rowId } = action.payload;
      const newRows = new Map(state.newRows);
      newRows.delete(rowId);
      const pendingEdits = new Map(state.pendingEdits);
      pendingEdits.delete(rowId);
      return { ...state, newRows, pendingEdits };
    }
    case "CLEAR_NEW_ROWS":
      return { ...state, newRows: new Map(), newRowCounter: 0 };
    case "STAGE_DELETE": {
      const pendingDeletes = new Map(state.pendingDeletes);
      pendingDeletes.set(action.payload.rowId, action.payload.row);
      const pendingEdits = new Map(state.pendingEdits);
      pendingEdits.delete(action.payload.rowId);
      return { ...state, pendingDeletes, pendingEdits };
    }
    case "CLEAR_DELETES":
      return { ...state, pendingDeletes: new Map() };
    default:
      return state;
  }
}
