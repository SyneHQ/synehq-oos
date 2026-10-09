import assert from "node:assert/strict";
import test from "node:test";
import type * as monaco from "monaco-editor";
import { createSelectionExecutor } from "../packages/explorer/src/editor/selection";

test("main editor actions preserve SQL bytes and release their handlers", () => {
  const actions = new Map<string, { run: (editor: unknown) => void }>();
  const full = "  SELECT 1;\n\n";
  const selected = " SELECT 2;\n";
  let hasSelection = true;
  const fakeEditor = {
    getModel: () => ({ getValue: () => full, getValueInRange: () => selected }),
    getSelection: () => ({ isEmpty: () => !hasSelection }),
    addAction: (action: { id: string; run: (editor: unknown) => void }) => {
      actions.set(action.id, action);
      return { dispose: () => actions.delete(action.id) };
    },
  };
  const m = { KeyMod: { CtrlCmd: 1, Shift: 2 }, KeyCode: { Enter: 4 } };
  const queries: string[] = [];
  const listener = createSelectionExecutor(
    fakeEditor as unknown as monaco.editor.IStandaloneCodeEditor,
    m as unknown as typeof monaco,
    (query) => queries.push(query),
  );
  actions.get("execute-selection")!.run(fakeEditor);
  actions.get("execute-all")!.run(fakeEditor);
  hasSelection = false;
  actions.get("execute-selection")!.run(fakeEditor);
  assert.deepEqual(queries, [selected, full, full]);
  listener.dispose();
  assert.equal(actions.size, 0);
});
