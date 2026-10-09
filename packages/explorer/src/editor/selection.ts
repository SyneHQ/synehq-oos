import type * as monaco from "monaco-editor";

/** Adapted from the main app selection helper. Preserve the approved SQL bytes. */
export function createSelectionExecutor(
  editor: monaco.editor.IStandaloneCodeEditor,
  m: typeof import("monaco-editor"),
  executeQuery: (query: string) => void,
) {
  const selection = editor.addAction({
    id: "execute-selection",
    label: "Run selection or query",
    keybindings: [m.KeyMod.CtrlCmd | m.KeyCode.Enter],
    contextMenuGroupId: "execution",
    contextMenuOrder: 1,
    run: (ed) => {
      const query = getSelectedOrAllText(ed);
      if (query?.trim()) executeQuery(query);
    },
  });
  const all = editor.addAction({
    id: "execute-all",
    label: "Run complete query",
    keybindings: [m.KeyMod.Shift | m.KeyMod.CtrlCmd | m.KeyCode.Enter],
    contextMenuGroupId: "execution",
    contextMenuOrder: 1.1,
    run: (ed) => {
      const query = ed.getModel()?.getValue();
      if (query?.trim()) executeQuery(query);
    },
  });
  return {
    dispose() {
      selection.dispose();
      all.dispose();
    },
  };
}

export function getSelectedOrAllText(editor: monaco.editor.ICodeEditor) {
  const model = editor.getModel();
  if (!model) return null;
  const selection = editor.getSelection();
  return selection && !selection.isEmpty() ? model.getValueInRange(selection) : model.getValue();
}
