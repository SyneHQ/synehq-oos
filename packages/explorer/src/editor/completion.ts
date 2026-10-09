import type * as monaco from "monaco-editor";
import type { CompletionColumn } from "./types";
import { snippets } from "./snippet";

/** ========= Helpers & Indexing (NEW) ========= **/

// SQL Keywords list - common SQL keywords
const SQL_KEYWORDS = [
  "SELECT",
  "FROM",
  "WHERE",
  "JOIN",
  "INNER",
  "LEFT",
  "RIGHT",
  "FULL",
  "OUTER",
  "ON",
  "AND",
  "OR",
  "NOT",
  "IN",
  "EXISTS",
  "BETWEEN",
  "LIKE",
  "IS",
  "NULL",
  "INSERT",
  "INTO",
  "VALUES",
  "UPDATE",
  "SET",
  "DELETE",
  "CREATE",
  "TABLE",
  "ALTER",
  "DROP",
  "INDEX",
  "VIEW",
  "DATABASE",
  "SCHEMA",
  "COLUMN",
  "CONSTRAINT",
  "PRIMARY",
  "KEY",
  "FOREIGN",
  "REFERENCES",
  "UNIQUE",
  "CHECK",
  "DEFAULT",
  "AUTO_INCREMENT",
  "IDENTITY",
  "SEQUENCE",
  "TRIGGER",
  "FUNCTION",
  "PROCEDURE",
  "DECLARE",
  "VARIABLE",
  "IF",
  "ELSE",
  "CASE",
  "WHEN",
  "THEN",
  "END",
  "WHILE",
  "FOR",
  "LOOP",
  "BREAK",
  "CONTINUE",
  "RETURN",
  "TRY",
  "CATCH",
  "THROW",
  "TRANSACTION",
  "COMMIT",
  "ROLLBACK",
  "SAVEPOINT",
  "GRANT",
  "REVOKE",
  "DENY",
  "USER",
  "ROLE",
  "PERMISSION",
  "BACKUP",
  "RESTORE",
  "EXEC",
  "EXECUTE",
  "AS",
  "ASC",
  "DESC",
  "ORDER",
  "BY",
  "GROUP",
  "HAVING",
  "DISTINCT",
  "ALL",
  "UNION",
  "INTERSECT",
  "EXCEPT",
  "MINUS",
  "LIMIT",
  "OFFSET",
  "TOP",
  "FETCH",
  "FIRST",
  "LAST",
  "NEXT",
  "PRIOR",
  "WITH",
  "RECURSIVE",
  "CTE",
  "TEMPORARY",
  "TEMP",
  "GLOBAL",
  "LOCAL",
  "SESSION",
  "SYSTEM",
  "CATALOG",
  "INFORMATION_SCHEMA",
  "PERFORMANCE_SCHEMA",
  "SHOW",
  "DESCRIBE",
  "EXPLAIN",
  "ANALYZE",
  "OPTIMIZE",
  "REPAIR",
  "TRUNCATE",
  "RENAME",
  "COMMENT",
  "PARTITION",
  "SUBPARTITION",
  "TABLESPACE",
  "STORAGE",
  "ENGINE",
  "CHARSET",
  "COLLATE",
  "ROW_FORMAT",
  "ALGORITHM",
  "DEFINER",
  "INVOKER",
  "SECURITY",
  "SQL",
  "DETERMINISTIC",
  "MODIFIES",
  "READS",
  "DATA",
  "CONTAINS",
  "NO",
  "LANGUAGE",
  "EXTERNAL",
  "NAME",
  "LIBRARY",
  "PARAMETER",
  "STYLE",
  "JAVA",
  "C",
  "ASSEMBLY",
  "SAFE",
  "UNSAFE",
  "IMMUTABLE",
  "STABLE",
  "VOLATILE",
  "LEAKPROOF",
  "STRICT",
  "COST",
  "ROWS",
  "SUPPORT",
  "SET_LIMIT",
  "SET_OFFSET",
  "ENABLE",
  "DISABLE",
  "VALIDATE",
  "INITIALLY",
  "DEFERRED",
  "IMMEDIATE",
  "DEFERRABLE",
  "MATCH",
  "SIMPLE",
  "PARTIAL",
  "FULL",
  "ACTION",
  "RESTRICT",
  "CASCADE",
  "SET_NULL",
  "SET_DEFAULT",
  "ONLY",
  "INSTEAD",
  "BEFORE",
  "AFTER",
  "EACH",
  "ROW",
  "STATEMENT",
  "REFERENCING",
  "OLD",
  "NEW",
  "TRANSITION",
  "TABLES",
  "BOOLEAN",
  "BOOL",
  "BIT",
  "TINYINT",
  "SMALLINT",
  "MEDIUMINT",
  "INT",
  "INTEGER",
  "BIGINT",
  "DECIMAL",
  "NUMERIC",
  "FLOAT",
  "DOUBLE",
  "REAL",
  "DATE",
  "TIME",
  "DATETIME",
  "TIMESTAMP",
  "YEAR",
  "CHAR",
  "VARCHAR",
  "BINARY",
  "VARBINARY",
  "TINYBLOB",
  "BLOB",
  "MEDIUMBLOB",
  "LONGBLOB",
  "TINYTEXT",
  "TEXT",
  "MEDIUMTEXT",
  "LONGTEXT",
  "ENUM",
  "SET",
  "JSON",
  "GEOMETRY",
  "POINT",
  "LINESTRING",
  "POLYGON",
  "MULTIPOINT",
  "MULTILINESTRING",
  "MULTIPOLYGON",
  "GEOMETRYCOLLECTION",
  "UNSIGNED",
  "SIGNED",
  "ZEROFILL",
  "SERIAL",
  "BIG",
  "SERIAL",
  "MONEY",
  "SMALLMONEY",
  "DATETIME2",
  "DATETIMEOFFSET",
  "SMALLDATETIME",
  "TIME",
  "DATE",
  "TIMESTAMP",
  "INTERVAL",
  "ARRAY",
  "MAP",
  "STRUCT",
  "UNION",
  "UUID",
  "INET",
  "CIDR",
  "MACADDR",
  "JSONB",
  "XML",
  "HSTORE",
  "LTREE",
  "CUBE",
  "ISN",
  "TSQUERY",
  "TSVECTOR",
];

// Build indexes: schema -> { tables, columnsByTable, columnsBySchemaTable }
function buildSchemaIndex(tableSchema: CompletionColumn[]) {
  const schemas = new Set<string>();
  const tables = new Set<string>();
  const tablesBySchema = new Map<string, Set<string>>();
  const columnsByTable = new Map<string, string[]>();
  const columnsBySchemaTable = new Map<string, string[]>();

  for (const row of tableSchema) {
    const schema = row.schema || "";
    const table = row.table_name;
    const col = row.column_name;

    schemas.add(schema);
    tables.add(table);

    if (!tablesBySchema.has(schema)) tablesBySchema.set(schema, new Set());
    tablesBySchema.get(schema)!.add(table);

    if (!columnsByTable.has(table)) columnsByTable.set(table, []);
    columnsByTable.get(table)!.push(col);

    const key = `${schema}.${table}`;
    if (!columnsBySchemaTable.has(key)) columnsBySchemaTable.set(key, []);
    columnsBySchemaTable.get(key)!.push(col);
  }

  return {
    schemas,
    tables,
    tablesBySchema,
    columnsByTable,
    columnsBySchemaTable,
  };
}

function buildSnippetsIndex(
  snippets: monaco.languages.CompletionItem[],
  snippetsIndexCache: Map<string, monaco.languages.CompletionItem> | null,
) {
  if (snippetsIndexCache) {
    return snippetsIndexCache;
  }

  const snippetsIndex = new Map<string, monaco.languages.CompletionItem>();
  for (const snippet of snippets) {
    snippetsIndex.set(snippet.label as string, snippet);
  }

  snippetsIndexCache = snippetsIndex;
  return snippetsIndex;
}

// Split last identifier chain like: a, a.b, `a`.b, "a"."b", a.b. (dot at end)
function splitIdentifierChain(text: string) {
  const trimmed = text.trim();
  // Match last segment that may be schema[.table][.]
  const m = /([`"][^`"]*[`"]|\w+)(?:\.([`"][^`"]*[`"]|\w+))?(?:\.)?$/.exec(trimmed);
  if (!m) return { part1: null, part2: null, endsWithDot: trimmed.endsWith(".") };
  const endsWithDot = trimmed.endsWith(".");
  const part1 = m[1] || null;
  const part2 = m[2] || null;
  return { part1, part2, endsWithDot };
}

function normalizeIdent(id?: string | null) {
  if (!id) return null;
  // remove backticks/double quotes around whole identifier
  return id.replace(/^`|`$/g, "").replace(/^"|"$/g, "");
}

function wordRangeAtPosition(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  m: typeof import("monaco-editor"),
) {
  const word = model.getWordUntilPosition(position);
  return new m.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
}

function isAfterFromish(prefix: string) {
  // Works even if the line ends with a dot or partial identifier
  // e.g. "FROM public.", "JOIN `sch`.", "update mysch."
  // Also tolerates multiple spaces/newlines
  return /\b(from|join|update|into)\b\s+[`"\w.]*$/i.test(prefix);
}

/** ========= Hardened table/alias parser (UPDATED) ========= **/

function parseSqlAndFindTableNameAndAliases(sql: string) {
  // captures FROM/JOIN schema.table [AS] alias
  const regex =
    /\b(?:FROM|JOIN)\s+((?:[`"][^`"]+[`"]|\w+)(?:\.(?:[`"][^`"]+[`"]|\w+))?)\s*(?:AS\s+)?((?:[`"][^`"]+[`"]|\w+))?/gi;
  const tables: { table_name: string; alias: string }[] = [];

  while (true) {
    const match = regex.exec(sql);
    if (!match) break;

    const table_name = match[1];
    if (!/\(/.test(table_name)) {
      let alias = match[2] as string | null;
      const badAlias = /^(on|where|inner|left|right|join)$/i;
      if (alias && badAlias.test(alias)) alias = null;
      tables.push({
        table_name,
        alias: (alias || table_name) as string,
      });
    }
  }

  return tables;
}

/** ========= Unified Completion Service ========= **/

interface CompletionContext {
  model: monaco.editor.ITextModel;
  position: monaco.Position;
  tableSchema: CompletionColumn[];
  m: typeof import("monaco-editor");
  builtInSnippets?: any[];
  suggestionsData?: any;
  currentTable?: string;
  currentSchema?: string;
}

export function createUnifiedCompletionService() {
  let snippetsIndexCache: Map<string, monaco.languages.CompletionItem> | null = null as Map<
    string,
    monaco.languages.CompletionItem
  > | null;
  return (
    context: CompletionContext,
  ): monaco.languages.CompletionItem[] | monaco.languages.CompletionItem[] => {
    const {
      model,
      position,
      tableSchema,
      m,
      builtInSnippets,
      suggestionsData,
      currentTable,
      currentSchema,
    } = context;

    const firstLine = model.getLineContent(position.lineNumber);

    const customSnippets = Array.from(
      buildSnippetsIndex(snippets(position, m), snippetsIndexCache).values(),
    ).map((a) => ({
      ...a,
      sortText: "4" + a.label,
    }));

    const skipKeywords = [
      "--",
      "//",
      "/*",
      "*/",
      "#",
      "#region",
      "#endregion",
      "//region",
      "//endregion",
    ];

    // skip if the line has --, //, /*, or */ or # or #region or #endregion or //region or //endregion as the first character or just has two characters
    if (
      skipKeywords.some((keyword) => firstLine.trim().startsWith(keyword)) ||
      firstLine.trim().length <= 2
    ) {
      return [];
    }

    const { schemas, tables, tablesBySchema, columnsByTable, columnsBySchemaTable } =
      buildSchemaIndex(tableSchema);

    const completionItems: (monaco.languages.CompletionItem | monaco.languages.CompletionItem)[] =
      [];

    // Parse SQL to extract table aliases
    const full = model.getValue();
    const tableNamesAndAliases = new Map(
      parseSqlAndFindTableNameAndAliases(full).map(({ table_name, alias }) => [
        normalizeIdent(alias)!,
        normalizeIdent(table_name)!,
      ]),
    );

    // Get line text up to cursor
    const lineTextUpToCursor = model.getValueInRange({
      startLineNumber: position.lineNumber,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    });

    const inFromish = isAfterFromish(lineTextUpToCursor);
    const { part1, part2, endsWithDot } = splitIdentifierChain(lineTextUpToCursor);
    const p1 = normalizeIdent(part1);
    const p2 = normalizeIdent(part2);

    let replaceRange = wordRangeAtPosition(model, position, m);

    // If we're after "<schema>." (endsWithDot + p1 and no p2), use a zero-width insertion
    if (endsWithDot && p1 && !p2) {
      replaceRange = new m.Range(
        position.lineNumber,
        position.column,
        position.lineNumber,
        position.column,
      );
    }

    // 1. Built-in snippets (highest priority)
    if (builtInSnippets) {
      completionItems.push(
        ...builtInSnippets.map((item) => ({
          label: item.label || item.prefix,
          kind: m.languages.CompletionItemKind.Snippet,
          filterText: item.prefix,
          insertText: item.insertText,
          insertTextRules: m.languages.CompletionItemInsertTextRule?.InsertAsSnippet,
          sortText: "1" + (item.prefix || item.label),
          detail: item.description ?? "SQL Snippet",
          documentation: item.insertText,
          range: replaceRange,
        })),
      );
    }

    // 3. SQL Keywords - always available
    completionItems.push(
      ...SQL_KEYWORDS.map((kw) => ({
        label: kw,
        kind: m.languages.CompletionItemKind.Keyword,
        detail: "SQL Keyword",
        sortText: "3" + kw,
        insertText: kw,
        range: replaceRange,
      })),
    );

    // 4. Keywords from suggestionsData (additional keywords from language service)
    if (suggestionsData?.keywords?.length) {
      completionItems.push(
        ...suggestionsData.keywords.map((kw: string) => ({
          label: kw,
          kind: m.languages.CompletionItemKind.Keyword,
          detail: "keyword",
          sortText: "3" + kw,
          insertText: kw,
          range: replaceRange,
        })),
      );
    }

    // 5. Schema/Table completions in FROM/JOIN context
    if (inFromish) {
      if (p1 && endsWithDot && !p2) {
        // User typed "FROM schema." - show tables in that schema
        const schema = p1;
        const tbls = [...(tablesBySchema.get(schema) || [])].sort();
        completionItems.push(
          ...tbls.map((t) => ({
            label: t,
            kind: m.languages.CompletionItemKind.Field,
            detail: `Table in ${schema}.${t}`,
            sortText: "2" + t,
            insertText: t,
            range: replaceRange,
          })),
        );
      } else {
        // Show all schemas and tables
        completionItems.push(
          ...[...schemas].sort().map((s) => ({
            label: s,
            kind: m.languages.CompletionItemKind.Folder,
            detail: "Schema",
            sortText: "2" + s,
            insertText: s,
            range: replaceRange,
          })),
        );
        completionItems.push(
          ...[...tables].sort().map((t) => ({
            label: t,
            kind: m.languages.CompletionItemKind.Field,
            detail: "Table",
            sortText: "3" + t,
            insertText: t,
            range: replaceRange,
          })),
        );
      }
    }

    // 6. Column completions
    if (endsWithDot && p1) {
      if (p2) {
        // User typed "schema.table." - show columns from that specific table
        const key = `${p1}.${p2}`;
        const cols = columnsBySchemaTable.get(key);
        if (cols?.length) {
          completionItems.push(
            ...cols.sort().map((c) => ({
              label: c,
              kind: m.languages.CompletionItemKind.Field,
              detail: `Column from ${p1}.${p2}`,
              sortText: "2" + c,
              insertText: c,
              range: replaceRange,
            })),
          );
        }
      } else {
        // User typed "alias." or "table." - show columns from that table
        let baseTable: string | null = null;

        if (tableNamesAndAliases.has(p1)) {
          const raw = tableNamesAndAliases.get(p1)!; // "schema.table" or "table"
          baseTable = raw.includes(".") ? raw.split(".")[1] : raw;
        } else {
          baseTable = p1;
        }

        if (baseTable && columnsByTable.has(baseTable)) {
          completionItems.push(
            ...columnsByTable
              .get(baseTable)!
              .sort()
              .map((c) => ({
                label: c,
                kind: m.languages.CompletionItemKind.Field,
                detail: `Column from ${baseTable}`,
                sortText: "2" + c,
                insertText: c,
                range: replaceRange,
              })),
          );
        }
      }
    }

    // 7. Show columns from all referenced tables in SELECT context (when not in FROM clause)
    if (!inFromish && !endsWithDot) {
      // Add columns from all referenced tables
      for (const [alias, tableName] of tableNamesAndAliases) {
        const baseTable = tableName.includes(".") ? tableName.split(".")[1] : tableName;
        const cols = columnsByTable.get(baseTable);
        if (cols?.length) {
          completionItems.push(
            ...cols.map((c) => ({
              label: `${alias}.${c}`,
              kind: m.languages.CompletionItemKind.Field,
              detail: `Column from ${alias} (${baseTable})`,
              sortText: "2" + c,
              insertText: `${alias}.${c}`,
              range: replaceRange,
            })),
          );
          // Also add unqualified column names
          completionItems.push(
            ...cols.map((c) => ({
              label: c,
              kind: m.languages.CompletionItemKind.Field,
              detail: `Column from ${baseTable}`,
              sortText: "2" + c,
              insertText: c,
              range: replaceRange,
            })),
          );
        }
      }

      if (!tableNamesAndAliases.size && currentTable && currentSchema) {
        completionItems.push(
          // we need to get the columns from the current table and schema
          ...(columnsBySchemaTable.get(`${currentSchema}.${currentTable}`) ?? [])
            .slice()
            .sort()
            .map((c) => ({
              label: c,
              kind: m.languages.CompletionItemKind.Field,
              detail: `Column from ${currentTable}`,
              sortText: "2" + c,
              insertText: c,
              range: replaceRange,
            })),
        );
      }
    }

    // 2. Custom snippets (second highest priority)
    if (customSnippets?.length) {
      completionItems.push(...customSnippets);
    }

    // De-duplicate by label and return
    const labels = new Set<string>();
    return completionItems.filter((item) => {
      const label = typeof item.label === "string" ? item.label : item.label.label;
      if (labels.has(label)) return false;
      labels.add(label);
      return true;
    });
  };
}
