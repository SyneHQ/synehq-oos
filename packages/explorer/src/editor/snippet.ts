import type * as monaco from "monaco-editor";

export const snippets = (position: monaco.Position, m: typeof import("monaco-editor")) => [
  {
    label: "select_all",
    kind: m.languages.CompletionItemKind.Snippet,
    insertText: "SELECT * FROM ${1:table_name};",
    insertTextRules: m.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: "Select all columns from a table",
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: position.column,
      endColumn: position.column,
    },
  },
  {
    label: "select_with_where",
    kind: m.languages.CompletionItemKind.Snippet,
    insertText: "SELECT ${1:column1}, ${2:column2}\nFROM ${3:table_name}\nWHERE ${4:condition};",
    insertTextRules: m.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: "Select specific columns with WHERE clause",
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: position.column,
      endColumn: position.column,
    },
  },
  {
    label: "inner_join",
    kind: m.languages.CompletionItemKind.Snippet,
    insertText:
      "SELECT ${1:t1.column1}, ${2:t2.column2}\nFROM ${3:table1} t1\nINNER JOIN ${4:table2} t2 ON t1.${5:id} = t2.${6:foreign_id};",
    insertTextRules: m.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: "Inner join between two tables",
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: position.column,
      endColumn: position.column,
    },
  },
  {
    label: "left_join",
    kind: m.languages.CompletionItemKind.Snippet,
    insertText:
      "SELECT ${1:t1.column1}, ${2:t2.column2}\nFROM ${3:table1} t1\nLEFT JOIN ${4:table2} t2 ON t1.${5:id} = t2.${6:foreign_id};",
    insertTextRules: m.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: "Left join between two tables",
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: position.column,
      endColumn: position.column,
    },
  },
  {
    label: "group_by_count",
    kind: m.languages.CompletionItemKind.Snippet,
    insertText:
      "SELECT ${1:column}, COUNT(*) as count\nFROM ${2:table_name}\nGROUP BY ${1:column}\nORDER BY count DESC;",
    insertTextRules: m.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: "Group by with count aggregation",
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: position.column,
      endColumn: position.column,
    },
  },
  {
    label: "insert_into",
    kind: m.languages.CompletionItemKind.Snippet,
    insertText:
      "INSERT INTO ${1:table_name} (${2:column1}, ${3:column2})\nVALUES (${4:value1}, ${5:value2});",
    insertTextRules: m.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: "Insert new record into table",
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: position.column,
      endColumn: position.column,
    },
  },
  {
    label: "update_set",
    kind: m.languages.CompletionItemKind.Snippet,
    insertText: "UPDATE ${1:table_name}\nSET ${2:column1} = ${3:new_value}\nWHERE ${4:condition};",
    insertTextRules: m.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: "Update records in table",
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: position.column,
      endColumn: position.column,
    },
  },
  {
    label: "delete_from",
    kind: m.languages.CompletionItemKind.Snippet,
    insertText: "DELETE FROM ${1:table_name}\nWHERE ${2:condition};",
    insertTextRules: m.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: "Delete records from table",
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: position.column,
      endColumn: position.column,
    },
  },
  {
    label: "case_when",
    kind: m.languages.CompletionItemKind.Snippet,
    insertText:
      "CASE\n    WHEN ${1:condition1} THEN ${2:value1}\n    WHEN ${3:condition2} THEN ${4:value2}\n    ELSE ${5:default_value}\nEND as ${6:alias}",
    insertTextRules: m.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: "Case when conditional statement",
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: position.column,
      endColumn: position.column,
    },
  },
  {
    label: "subquery",
    kind: m.languages.CompletionItemKind.Snippet,
    insertText:
      "SELECT ${1:column}\nFROM (\n    SELECT ${2:column}\n    FROM ${3:table_name}\n    WHERE ${4:condition}\n) as ${5:subquery_alias};",
    insertTextRules: m.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: "Subquery template",
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: position.column,
      endColumn: position.column,
    },
  },
];
