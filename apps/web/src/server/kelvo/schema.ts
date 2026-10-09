import { connectionRef, type OperationRequest, type Parameter } from "@synehq-oos/kelvo-client";
import type {
  CellValue,
  DatabaseEngine,
  QueryTarget,
  SchemaTable,
  SchemaRelationship,
} from "@synehq-oos/explorer-contracts";
import { MAX_TABLE_WHERE_LENGTH } from "@synehq-oos/explorer-contracts";
import { z } from "zod";
import { getConnection, StoreError, type OwnerIdentity } from "../store";
import { targetSchema } from "../http";
import { awaitOperation, queryRequest, startOperation } from "./operations";
import { mongoRequest } from "./mongodb";

type Row = Record<string, CellValue>;
async function metadata(
  owner: OwnerIdentity,
  target: QueryTarget,
  object: NonNullable<OperationRequest["spec"]["metadata"]>["object"],
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; offset <= 10000; offset += 1000) {
    const request: OperationRequest = {
      version: 1,
      kind: "metadata.inspect",
      connection: connectionRef(target),
      idempotency_key: "",
      spec: {
        metadata: {
          object,
          target: { catalog: target.database, ...(target.schema ? { schema: target.schema } : {}) },
          ...(offset ? { cursor: String(offset) } : {}),
          limit: 1000,
        },
      },
    };
    const state = await awaitOperation(owner, await startOperation(owner, target, request));
    const result = state.result;
    if (!result || !result.complete) throw new StoreError(502, "Schema metadata is incomplete.");
    if (rows.length + result.rows.length > 10000)
      throw new StoreError(
        413,
        "This schema exceeds 10,000 metadata rows. Select a smaller schema.",
      );
    rows.push(
      ...result.rows.map((values) =>
        Object.fromEntries(result.columns.map((column, i) => [column.name, values[i]])),
      ),
    );
    if (result.rows.length < 1000) return rows;
  }
  throw new StoreError(413, "Schema metadata exceeds the limit.");
}
const string = (value: CellValue | undefined) =>
  value === null || value === undefined ? "" : String(value);
export function normalizeSchema(
  database: string,
  data: { tables: Row[]; columns: Row[]; primary_keys: Row[]; foreign_keys: Row[] },
  engine: DatabaseEngine = "postgres",
): SchemaTable[] {
  const key = (schema: string, table: string) => JSON.stringify([database, schema, table]);
  // Relational column and key responses omit catalog. Their signed request selects the database.
  const inCatalog = (row: Row) => row.catalog === undefined || string(row.catalog) === database;
  const tables = new Map<string, SchemaTable>();
  for (const row of data.tables) {
    if (string(row.catalog) !== database) continue;
    const schema = string(row.schema_name),
      name = string(row.name);
    tables.set(key(schema, name), {
      database,
      schema,
      name,
      type: string(row.type),
      columns: [],
      relationships: [],
    });
  }
  const primary = new Set(
    data.primary_keys
      .filter(inCatalog)
      .map((row) =>
        JSON.stringify([string(row.schema_name), string(row.table_name), string(row.column_name)]),
      ),
  );
  for (const row of data.columns) {
    if (!inCatalog(row)) continue;
    const schema = string(row.schema_name),
      table = string(row.table_name),
      name = string(row.name);
    tables.get(key(schema, table))?.columns.push({
      name,
      dataType: string(row.type),
      nullable: row.nullable === "YES",
      primaryKey: primary.has(JSON.stringify([schema, table, name])),
      position: Number(row.position),
      defaultValue: row.default_value === null ? null : string(row.default_value),
    });
  }
  const relationships = new Map<string, SchemaRelationship>();
  for (const row of [...data.foreign_keys].sort(
    (a, b) => Number(a.position) - Number(b.position),
  )) {
    if (!inCatalog(row)) continue;
    const schema = string(row.schema_name),
      table = string(row.table_name),
      name = string(row.name);
    const id = JSON.stringify([schema, table, name]);
    let relation = relationships.get(id);
    const referencedSchema = string(row.referenced_schema);
    const referencedDatabase =
      string(row.referenced_catalog) || (engine === "mysql" ? referencedSchema : database);
    if (!relation) {
      relation = {
        name,
        source: { database, schema, table, columns: [] },
        target: {
          database: referencedDatabase,
          schema: referencedSchema,
          table: string(row.referenced_table),
          columns: [],
        },
      };
      relationships.set(id, relation);
      tables.get(key(schema, table))?.relationships.push(relation);
    } else if (
      relation.target.database !== referencedDatabase ||
      relation.target.schema !== referencedSchema ||
      relation.target.table !== string(row.referenced_table)
    )
      throw new StoreError(502, "Foreign key metadata contains conflicting targets.");
    relation.source.columns.push(string(row.column_name));
    relation.target.columns.push(string(row.referenced_column));
  }
  for (const table of tables.values()) table.columns.sort((a, b) => a.position - b.position);
  if (engine === "mongodb") {
    for (const table of tables.values()) {
      table.columns = [
        {
          name: "document",
          dataType: "json",
          nullable: false,
          primaryKey: false,
          position: 1,
          defaultValue: null,
        },
      ];
      table.relationships = [];
    }
  }
  return [...tables.values()];
}
const cache = new Map<string, { until: number; tables: SchemaTable[] }>();
const pendingSchema = new Map<string, Promise<SchemaTable[]>>();
export async function inspectSchema(
  owner: OwnerIdentity,
  connectionId: string,
  selectedSchema: string | null = null,
  refresh = false,
) {
  const connection = await getConnection(owner, connectionId);
  if (
    (connection.engine === "mongodb" || connection.engine === "sqlite") &&
    selectedSchema !== null
  )
    throw new StoreError(400, "This database does not accept a selected schema.");
  const target: QueryTarget = {
    connectionId,
    connectionRevision: connection.revision,
    database: connection.database,
    schema: selectedSchema,
  };
  const key = JSON.stringify([owner.id, owner.authVersion, target]);
  const stored = cache.get(key);
  if (!refresh && stored && stored.until > Date.now()) return stored.tables;
  const existing = pendingSchema.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const tables = await metadata(owner, target, "tables");
    const columns = connection.engine === "mongodb" ? [] : await metadata(owner, target, "columns");
    const relational = connection.engine !== "mongodb" && connection.engine !== "clickhouse";
    const primary_keys = relational ? await metadata(owner, target, "primary_keys") : [];
    const foreign_keys = relational ? await metadata(owner, target, "foreign_keys") : [];
    const normalized = normalizeSchema(
      connection.database,
      { tables, columns, primary_keys, foreign_keys },
      connection.engine,
    );
    if (cache.size >= 16) cache.delete(cache.keys().next().value!);
    cache.set(key, { until: Date.now() + 30000, tables: normalized });
    return normalized;
  })();
  pendingSchema.set(key, pending);
  try {
    return await pending;
  } finally {
    if (pendingSchema.get(key) === pending) pendingSchema.delete(key);
  }
}
export const tableRequestSchema = z
  .object({
    target: targetSchema,
    table: z.string().min(1).max(256),
    page: z.number().int().min(0).max(10000),
    pageSize: z.literal(100),
    where: z.string().max(MAX_TABLE_WHERE_LENGTH).trim().optional(),
    sort: z
      .object({ column: z.string().max(256), direction: z.enum(["asc", "desc"]) })
      .strict()
      .optional(),
    filter: z
      .object({
        column: z.string().max(256),
        operator: z.literal("eq"),
        value: z.string().max(4096).nullable(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((input) => !input.where || !input.filter, {
    message: "Use a WHERE expression or a column filter, not both.",
    path: ["where"],
  });
export async function browseTable(owner: OwnerIdentity, input: z.infer<typeof tableRequestSchema>) {
  const connection = await getConnection(owner, input.target.connectionId);
  if (
    connection.revision !== input.target.connectionRevision ||
    connection.database !== input.target.database
  )
    throw new StoreError(409, "The connection changed. Refresh the explorer.");
  const tables = await inspectSchema(owner, connection.id, input.target.schema);
  const table = tables.find(
    (t) =>
      t.name === input.table &&
      (connection.engine === "mongodb" || connection.engine === "sqlite"
        ? input.target.schema === null
        : t.schema === input.target.schema) &&
      t.database === input.target.database,
  );
  if (!table) throw new StoreError(404, "Table not found in the selected schema.");
  return startOperation(owner, input.target, tableReadRequest(connection.engine, table, input));
}

export function tableReadRequest(
  engine: DatabaseEngine,
  table: SchemaTable,
  input: z.infer<typeof tableRequestSchema>,
): OperationRequest {
  if (engine === "mongodb") {
    if (input.sort || input.filter || input.where)
      throw new StoreError(400, "Use the MongoDB console to filter or sort document fields.");
    return mongoRequest(
      input.target,
      JSON.stringify({
        command: "aggregate",
        collection: table.name,
        pipeline: [{ $skip: input.page * 100 }, { $limit: 100 }],
      }),
      "read",
      "",
    );
  }
  const allowed = new Set(table.columns.map((c) => c.name));
  if (
    (input.sort && !allowed.has(input.sort.column)) ||
    (input.filter && !allowed.has(input.filter.column))
  )
    throw new StoreError(400, "The sort or filter column is not in this table.");
  const quote = (name: string) =>
    ["postgres", "sqlite", "oracle"].includes(engine)
      ? `"${name.replaceAll('"', '""')}"`
      : `\`${name.replaceAll("`", "``")}\``;
  const namespace = ["postgres", "sqlite", "oracle"].includes(engine)
    ? table.schema
    : table.database;
  const parameters: Parameter[] = [];
  let where = "";
  if (input.where) {
    // Kelvo validates this query as a read. Newlines keep line comments inside the predicate.
    where = ` WHERE (\n${input.where}\n)`;
  } else if (input.filter) {
    if (input.filter.value === null) where = ` WHERE ${quote(input.filter.column)} IS NULL`;
    else {
      if (engine === "clickhouse")
        throw new StoreError(
          400,
          "ClickHouse value filters are unavailable. Use the query console.",
        );
      const cast = engine === "oracle" ? "VARCHAR2(4000)" : engine === "mysql" ? "CHAR" : "TEXT";
      const placeholder = engine === "postgres" ? "$1" : engine === "oracle" ? ":1" : "?";
      where = ` WHERE CAST(${quote(input.filter.column)} AS ${cast}) = ${placeholder}`;
      parameters.push({ type: "string", value: input.filter.value });
    }
  }
  const order = input.sort
    ? [`${quote(input.sort.column)} ${input.sort.direction.toUpperCase()}`]
    : [];
  for (const column of table.columns.filter((c) => c.primaryKey && c.name !== input.sort?.column))
    order.push(`${quote(column.name)} ASC`);
  const pagination =
    engine === "oracle"
      ? ` OFFSET ${input.page * 100} ROWS FETCH NEXT 100 ROWS ONLY`
      : ` LIMIT 100 OFFSET ${input.page * 100}`;
  const sql = `SELECT * FROM ${quote(namespace)}.${quote(table.name)}${where}${order.length ? ` ORDER BY ${order.join(", ")}` : ""}${pagination}`;
  return queryRequest(input.target, sql, "read", "", undefined, parameters);
}
