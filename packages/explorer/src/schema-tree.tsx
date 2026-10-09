"use client";

import type { ReactNode } from "react";
import { Database, Folder, Table2 } from "lucide-react";
import { TreeView, type TreeNode } from "@synehq-oos/ui";
import type { SchemaTable } from "@synehq-oos/explorer-contracts";

type TableIdentity = Pick<SchemaTable, "database" | "schema" | "name">;
export const schemaTableId = (table: TableIdentity) =>
  JSON.stringify(["table", table.database, table.schema, table.name]);

/** Database, schema, and table names together identify a leaf. */
export function SchemaTree({
  tables,
  selectedTable,
  onSelect,
  renderMetadata,
  expandAll,
}: {
  tables: SchemaTable[];
  selectedTable?: TableIdentity | null;
  onSelect: (table: SchemaTable) => void;
  renderMetadata?: (table: SchemaTable) => ReactNode;
  expandAll?: boolean;
}) {
  const tableById = new Map<string, SchemaTable>();
  const databases = new Map<string, Map<string, SchemaTable[]>>();
  for (const table of tables) {
    const id = schemaTableId(table);
    if (tableById.has(id)) continue;
    tableById.set(id, table);
    if (!databases.has(table.database)) databases.set(table.database, new Map());
    const schemas = databases.get(table.database)!;
    if (!schemas.has(table.schema)) schemas.set(table.schema, []);
    schemas.get(table.schema)!.push(table);
  }
  const items: TreeNode[] = [...databases].map(([database, schemas]) => ({
    id: JSON.stringify(["database", database]),
    label: <span title={database}>{database || "Default database"}</span>,
    icon: <Database />,
    defaultExpanded: true,
    children: [...schemas]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([schema, schemaTables]) => ({
        id: JSON.stringify(["schema", database, schema]),
        label: <span title={schema}>{schema || "Default schema"}</span>,
        icon: <Folder />,
        defaultExpanded:
          expandAll ||
          schemaTables.length <= 4 ||
          (selectedTable?.database === database && selectedTable.schema === schema),
        children: [...schemaTables]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((table) => ({
            id: schemaTableId(table),
            label: <span title={table.name}>{table.name}</span>,
            icon: <Table2 />,
            trailing: renderMetadata?.(table),
          })),
      })),
  }));
  return (
    <TreeView
      label="Database schema"
      items={items}
      selectedId={selectedTable ? schemaTableId(selectedTable) : undefined}
      onSelect={(id) => {
        const table = tableById.get(id);
        if (table) onSelect(table);
      }}
    />
  );
}
