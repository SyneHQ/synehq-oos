import assert from "node:assert/strict";
import test from "node:test";
import { numericEditValue } from "../packages/explorer/src/cloud/lib/numeric-edit";
import { dataTableReducer } from "../packages/explorer/src/cloud/components/table/reducer";
import type { DataTableState } from "../packages/explorer/src/cloud/components/table/types/interfaces";

test("editing preserves int64 and decimal text without rounding", () => {
  assert.equal(
    numericEditValue("9223372036854775807", "9223372036854775806", true),
    "9223372036854775807",
  );
  assert.equal(
    numericEditValue("12345678901234567890.123456789", "0", true),
    "12345678901234567890.123456789",
  );
  assert.equal(numericEditValue("1.2500e+30", "0", true), "1.2500e+30");
});

test("opening and closing a numeric cell preserves its original type", () => {
  assert.equal(numericEditValue("42", 42, true), 42);
  assert.equal(numericEditValue("42", "42", true), "42");
  assert.equal(numericEditValue("", null, true), null);
  assert.equal(numericEditValue("", "", true), "");
});

test("clearing an existing numeric value stages NULL", () => {
  assert.equal(numericEditValue("", "9223372036854775807", true), null);
});

function initialState(): DataTableState<Record<string, unknown>> {
  return {
    rowSelection: {},
    columnVisibility: {},
    columnFilters: [],
    sorting: [],
    pendingEdits: new Map(),
    newRows: new Map(),
    pendingDeletes: new Map(),
    newRowCounter: 0,
  };
}

test("reverting an edit removes the pending write without changing the previous state", () => {
  const original = initialState();
  const edited = dataTableReducer(original, {
    type: "ADD_EDIT",
    payload: { rowId: "0", columnId: "amount", originalValue: "100.0000", value: "100.0001" },
  });
  const reverted = dataTableReducer(edited, {
    type: "ADD_EDIT",
    payload: { rowId: "0", columnId: "amount", originalValue: "100.0000", value: "100.0000" },
  });
  assert.equal(original.pendingEdits.size, 0);
  assert.equal(edited.pendingEdits.get("0")?.get("amount")?.value, "100.0001");
  assert.equal(reverted.pendingEdits.size, 0);
});

test("discarding an unsaved row removes its pending cell values", () => {
  let state = dataTableReducer(initialState(), {
    type: "ADD_NEW_ROW",
    payload: { rowId: "new-row-1", rowData: { amount: null } },
  });
  state = dataTableReducer(state, {
    type: "ADD_EDIT",
    payload: { rowId: "new-row-1", columnId: "amount", originalValue: null, value: "123.4500" },
  });
  state = dataTableReducer(state, { type: "REMOVE_NEW_ROW", payload: { rowId: "new-row-1" } });
  assert.equal(state.newRows.size, 0);
  assert.equal(state.pendingEdits.size, 0);
});

test("deleting a row removes its pending primary-key edit and keeps the original snapshot", () => {
  const originalRow = Object.freeze({ id: "9223372036854775806", amount: "123.4500" });
  let edited = dataTableReducer(initialState(), {
    type: "ADD_EDIT",
    payload: {
      rowId: "0",
      columnId: "id",
      originalValue: originalRow.id,
      value: "9223372036854775807",
    },
  });
  edited = dataTableReducer(edited, {
    type: "ADD_EDIT",
    payload: { rowId: "1", columnId: "amount", originalValue: "10.0000", value: "10.0001" },
  });

  const deleted = dataTableReducer(edited, {
    type: "STAGE_DELETE",
    payload: { rowId: "0", row: originalRow },
  });

  assert.equal(deleted.pendingEdits.has("0"), false);
  assert.equal(deleted.pendingEdits.get("1")?.get("amount")?.value, "10.0001");
  assert.equal(deleted.pendingDeletes.get("0"), originalRow);
  assert.deepEqual(deleted.pendingDeletes.get("0"), {
    id: "9223372036854775806",
    amount: "123.4500",
  });
  assert.equal(edited.pendingEdits.get("0")?.get("id")?.value, "9223372036854775807");
  assert.equal(edited.pendingDeletes.size, 0);
});

test("clipboard copy and paste keep tabs, line breaks, quotes, and empty rows", async () => {
  const { readClipboardRows, writeClipboardRows } = await import(
    "../packages/explorer/src/cloud/lib/clipboard"
  );
  const rows = [
    ["line one\nline two", "one\ttwo", '"quoted"', ""],
    ["", "9223372036854775807", "2026-10-09 14:25:30.123456+05:30", ""],
  ];
  assert.deepEqual(readClipboardRows(writeClipboardRows(rows)), rows);
  assert.deepEqual(readClipboardRows("a\tb\r\n1\t2\r\n"), [
    ["a", "b"],
    ["1", "2"],
  ]);
  assert.throws(() => readClipboardRows('"unclosed'), /unclosed quoted value/);
});
