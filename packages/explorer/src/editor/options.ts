export const EditorOptions = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  fontSize: 14,
  fontFamily:
    'CommitMono, "Fira Code", "SF Mono", Monaco, Inconsolata, "Roboto Mono", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace',
  fontLigatures: true,
  lineNumbers: "on" as const,
  roundedSelection: false,
  scrollbar: {
    vertical: "visible" as const,
    horizontal: "visible" as const,
  },
  folding: true,
  semanticTokenColorCustomizations: {
    "[Rouge]": {
      enabled: true,
      rules: {
        "*.declaration": { bold: true },
      },
    },
  },
  foldingStrategy: "indentation" as const,
  showFoldingControls: "always" as const,
  unfoldOnClickAfterEndOfLine: false,
  selectionHighlight: true,
  occurrencesHighlight: "multiFile" as const,
  renderLineHighlight: "all" as const,
  contextmenu: true,
  mouseWheelZoom: true,
  quickSuggestions: {
    other: true,
    comments: false,
    strings: true,
  },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnCommitCharacter: true,
  acceptSuggestionOnEnter: "on" as const,
  wordBasedSuggestions: "off" as const,
  parameterHints: {
    enabled: true,
  },
  autoIndent: "full" as const,
};
