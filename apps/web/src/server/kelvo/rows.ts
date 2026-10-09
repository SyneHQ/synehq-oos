import { randomUUID } from "node:crypto";
import { z } from "zod";
import { encodeOperation, operationDigest, type Parameter } from "@synehq-oos/kelvo-client";
import {
  rowMutationOutcome,
  type CellValue,
  type ConnectionSummary,
  type ExecuteRowMutation,
  type PreparedRowChanges,
  type PreparedRowMutation,
  type PrepareRowChanges,
  type QueryColumn,
  type RowChanges,
  type RowMutation,
  type RowMutationOperation,
  type RowMutationScope,
  type SchemaColumn,
  type SchemaTable,
} from "@synehq-oos/explorer-contracts";
import { targetSchema } from "../http";
import {
  checkQueryApproval,
  createQueryApproval,
  getConnection,
  getInstance,
  StoreError,
  type OwnerIdentity,
} from "../store";
import { queryRequest, startOperation } from "./operations";
import { inspectSchema } from "./schema";

const identifier = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.isWellFormed() && !/[\0\r\n]/.test(value));
const cell = z.union([
  z
    .string()
    .refine(
      (value) => value.isWellFormed() && !value.includes("\0") && Buffer.byteLength(value) <= 16384,
    ),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const row = z.array(cell).min(1).max(512);
const editedCell = z.object({ column: identifier, value: cell }).strict();
const mutationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("insert"), row }).strict(),
  z
    .object({ kind: z.literal("update"), row, values: z.array(editedCell).min(1).max(512) })
    .strict(),
  z.object({ kind: z.literal("delete"), row }).strict(),
]);
const scopeShape = {
  target: targetSchema,
  table: identifier,
  columns: z
    .array(z.object({ name: identifier, dataType: z.string().min(1).max(256) }).strict())
    .min(1)
    .max(512),
};
export const prepareRowsSchema = z
  .object({
    ...scopeShape,
    changes: z
      .object({
        inserts: z.array(row).max(100),
        updates: z.array(z.object({ row, column: identifier, value: cell }).strict()).max(1000),
        deletes: z.array(row).max(100),
      })
      .strict(),
  })
  .strict();
export const executeRowSchema = z
  .object({
    ...scopeShape,
    mutation: mutationSchema,
    operationId: z.string().uuid(),
    approvalId: z.string().uuid(),
    approvalToken: z.string().min(1).max(256),
  })
  .strict();

type ValueKind =
  | "integer"
  | "decimal"
  | "float"
  | "boolean"
  | "text"
  | "json"
  | "binary"
  | "date"
  | "timestamp"
  | "time"
  | "uuid";
interface ColumnType {
  kind: ValueKind;
  cast?: string;
  unsigned?: boolean;
  minimum?: bigint;
  maximum?: bigint;
}
const wrongValue = (column: SchemaColumn): never => {
  throw new StoreError(
    400,
    `The value for ${column.name} cannot be represented safely as ${column.dataType}.`,
  );
};

function columnType(column: SchemaColumn, engine: ConnectionSummary["engine"]): ColumnType {
  const name = column.dataType.toLowerCase().trim();
  if (engine === "postgres") {
    const integers: Record<string, [number, string]> = {
      smallint: [16, "SMALLINT"],
      integer: [32, "INTEGER"],
      bigint: [64, "BIGINT"],
    };
    if (integers[name]) {
      const [bits, cast] = integers[name];
      return {
        kind: "integer",
        cast,
        minimum: -(1n << BigInt(bits - 1)),
        maximum: (1n << BigInt(bits - 1)) - 1n,
      };
    }
    if (["numeric", "decimal"].includes(name)) return { kind: "decimal", cast: "NUMERIC" };
    if (["real", "double precision"].includes(name))
      return { kind: "float", cast: name === "real" ? "REAL" : "DOUBLE PRECISION" };
    if (name === "boolean") return { kind: "boolean" };
    if (["text", "character varying", "character"].includes(name)) return { kind: "text" };
    if (["json", "jsonb"].includes(name)) return { kind: "json", cast: name.toUpperCase() };
    if (name === "bytea") return { kind: "binary" };
    if (name === "date") return { kind: "date", cast: "DATE" };
    if (["timestamp without time zone", "timestamp with time zone"].includes(name))
      return { kind: "timestamp", cast: name.toUpperCase() };
    if (["time without time zone", "time with time zone"].includes(name))
      return { kind: "time", cast: name.toUpperCase() };
    if (name === "uuid") return { kind: "uuid", cast: "UUID" };
  } else {
    const integer =
      /^(tinyint|smallint|mediumint|int|integer|bigint)(?:\(\d+\))?( unsigned)?(?: zerofill)?$/.exec(
        name,
      );
    if (integer) {
      const bits = { tinyint: 8, smallint: 16, mediumint: 24, int: 32, integer: 32, bigint: 64 }[
        integer[1]
      ]!;
      const unsigned = Boolean(integer[2]);
      return {
        kind: "integer",
        unsigned,
        minimum: unsigned ? 0n : -(1n << BigInt(bits - 1)),
        maximum: (1n << BigInt(unsigned ? bits : bits - 1)) - 1n,
      };
    }
    const decimal = /^(?:decimal|numeric)\((\d+),(\d+)\)( unsigned)?$/.exec(name);
    if (
      decimal &&
      Number(decimal[1]) <= 65 &&
      Number(decimal[2]) <= 30 &&
      Number(decimal[2]) <= Number(decimal[1])
    )
      return {
        kind: "decimal",
        cast: `DECIMAL(${Number(decimal[1])},${Number(decimal[2])})`,
        unsigned: Boolean(decimal[3]),
      };
    if (/^(?:float|double|real)(?:\(\d+(?:,\d+)?\))?(?: unsigned)?$/.test(name))
      return { kind: "float", cast: "DOUBLE" };
    if (
      /^(?:char|varchar)\(\d+\)$/.test(name) ||
      /^(?:tinytext|text|mediumtext|longtext)$/.test(name) ||
      /^(?:enum|set)\(/.test(name)
    )
      return { kind: "text" };
    if (name === "json") return { kind: "json", cast: "JSON" };
    if (
      /^(?:binary|varbinary)\(\d+\)$/.test(name) ||
      /^(?:tinyblob|blob|mediumblob|longblob)$/.test(name)
    )
      return { kind: "binary" };
    if (name === "date") return { kind: "date", cast: "DATE" };
    if (/^(?:timestamp|datetime)(?:\([0-6]\))?$/.test(name))
      return { kind: "timestamp", cast: "DATETIME(6)" };
    if (/^time(?:\([0-6]\))?$/.test(name)) return { kind: "time", cast: "TIME(6)" };
  }
  throw new StoreError(
    400,
    `The row editor does not support ${column.name} (${column.dataType}). Use the SQL console for this table.`,
  );
}

function decimalKey(value: string, column: SchemaColumn): string {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!match || !(match[2] || match[3]) || (match[4]?.replace(/^[+-]/, "").length ?? 0) > 5)
    wrongValue(column);
  let exponent = Number(match![4] ?? 0) - (match![3]?.length ?? 0);
  if (Math.abs(exponent) > 10000) wrongValue(column);
  let digits = (match![2] + (match![3] ?? "")).replace(/^0+/, "");
  if (!digits) return "0";
  const trailing = /0+$/.exec(digits)?.[0].length ?? 0;
  if (trailing) {
    digits = digits.slice(0, -trailing);
    exponent += trailing;
  }
  return `${match![1] === "-" ? "-" : ""}${digits}e${exponent}`;
}

function typedValue(
  value: CellValue,
  column: SchemaColumn,
  engine: ConnectionSummary["engine"],
): { parameter: Parameter; type: ColumnType; key: string } {
  const type = columnType(column, engine);
  if (value === null) return { parameter: { type: "null", value: null }, type, key: "null" };
  if (type.kind === "integer") {
    const text =
      typeof value === "number" && Number.isSafeInteger(value)
        ? String(value)
        : typeof value === "string"
          ? value
          : wrongValue(column);
    if (!/^-?(0|[1-9][0-9]*)$/.test(text)) wrongValue(column);
    const integer = BigInt(text);
    if (integer < type.minimum! || integer > type.maximum!) wrongValue(column);
    return {
      parameter: { type: integer > (1n << 63n) - 1n ? "string" : "int64", value: text },
      type,
      key: `integer:${integer}`,
    };
  }
  if (type.kind === "decimal" || type.kind === "float") {
    const text =
      typeof value === "string"
        ? value
        : typeof value === "number" &&
            Number.isFinite(value) &&
            (type.kind === "float" || Number.isSafeInteger(value))
          ? String(value)
          : wrongValue(column);
    const key = decimalKey(text, column);
    if (type.unsigned && key.startsWith("-")) wrongValue(column);
    if (type.kind === "float" && !Number.isFinite(Number(text))) wrongValue(column);
    return { parameter: { type: "string", value: text }, type, key: `${type.kind}:${key}` };
  }
  if (type.kind === "boolean") {
    const bool =
      typeof value === "boolean"
        ? value
        : value === "true"
          ? true
          : value === "false"
            ? false
            : wrongValue(column);
    return { parameter: { type: "bool", value: bool }, type, key: `boolean:${bool}` };
  }
  if (typeof value !== "string") wrongValue(column);
  let text = value as string;
  if (type.kind === "json") {
    try {
      JSON.parse(text);
    } catch {
      wrongValue(column);
    }
  }
  if (type.kind === "binary") {
    if (!/^\\x(?:[a-fA-F0-9]{2})*$/.test(text)) wrongValue(column);
    text = text.slice(2);
  }
  if (type.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(text)) wrongValue(column);
  if (
    type.kind === "uuid" &&
    !/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(text)
  )
    wrongValue(column);
  if (type.kind === "timestamp") {
    if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?$/.test(text))
      wrongValue(column);
    if (engine === "mysql") {
      if (/[+-]\d{2}:\d{2}$/.test(text)) wrongValue(column);
      text = text.replace("T", " ").replace(/Z$/, "");
    }
  }
  if (
    type.kind === "time" &&
    !/^-?\d{2,3}:\d{2}:\d{2}(?:\.\d{1,6})?(?:[+-]\d{2}:\d{2})?$/.test(text)
  )
    wrongValue(column);
  return {
    parameter: { type: "string", value: text },
    type,
    key: `${type.kind}:${type.kind === "binary" || type.kind === "uuid" ? text.toLowerCase() : text}`,
  };
}

function checkedColumns(
  connection: ConnectionSummary,
  table: SchemaTable,
  scope: RowMutationScope,
): SchemaColumn[] {
  if (connection.readOnly)
    throw new StoreError(403, "Enable writes for this connection before preparing row changes.");
  if (
    connection.id !== scope.target.connectionId ||
    connection.revision !== scope.target.connectionRevision ||
    connection.database !== scope.target.database
  )
    throw new StoreError(409, "The connection changed. Refresh the table before editing rows.");
  if (
    !scope.target.schema ||
    table.database !== scope.target.database ||
    table.schema !== scope.target.schema ||
    table.name !== scope.table ||
    table.type !== "BASE TABLE"
  )
    throw new StoreError(400, "Row changes require one selected base table and schema.");
  if (
    (connection.engine === "mysql" &&
      (table.schema !== table.database ||
        ["mysql", "information_schema", "performance_schema", "sys"].includes(
          table.database.toLowerCase(),
        ))) ||
    (connection.engine === "postgres" &&
      (table.schema === "information_schema" || table.schema.startsWith("pg_")))
  )
    throw new StoreError(400, "The row editor cannot change this database scope.");
  const names = scope.columns.map((column) => column.name),
    columns = new Map(table.columns.map((column) => [column.name, column]));
  if (
    columns.size !== table.columns.length ||
    new Set(names).size !== names.length ||
    names.length !== table.columns.length ||
    table.columns.some((column) => !Number.isSafeInteger(column.position) || column.position < 1) ||
    new Set(table.columns.map((column) => column.position)).size !== table.columns.length
  )
    throw new StoreError(
      400,
      "Row changes require all table columns with unique names and positions.",
    );
  return names.map((name) => {
    const column = columns.get(name);
    if (!column) throw new StoreError(400, "The result columns do not match the selected table.");
    columnType(column, connection.engine);
    return column;
  });
}

function validateRow(
  row: CellValue[],
  columns: SchemaColumn[],
  engine: ConnectionSummary["engine"],
  insert = false,
): void {
  if (row.length !== columns.length)
    throw new StoreError(400, "The row does not contain every table column.");
  row.forEach((value, index) => {
    cell.parse(value);
    typedValue(value, columns[index], engine);
    if (insert && value === null && !columns[index].nullable)
      throw new StoreError(
        400,
        `Enter a value for ${columns[index].name}. This column does not allow NULL.`,
      );
  });
}

function rowKey(
  row: CellValue[],
  columns: SchemaColumn[],
  engine: ConnectionSummary["engine"],
): string {
  const primary = columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => column.primaryKey);
  if (
    !primary.length ||
    primary.some(
      ({ column, index }) => row[index] === null || columnType(column, engine).kind === "float",
    )
  )
    throw new StoreError(400, "Row changes require a complete primary key with exact values.");
  return JSON.stringify(
    primary.map(({ column, index }) => typedValue(row[index], column, engine).key),
  );
}

export function groupRowChanges(
  connection: ConnectionSummary,
  table: SchemaTable,
  scope: RowMutationScope,
  changes: RowChanges,
): RowMutation[] {
  const columns = checkedColumns(connection, table, scope),
    mutations: RowMutation[] = [],
    occupied = new Set<string>();
  const updates = new Map<string, Extract<RowMutation, { kind: "update" }>>();
  for (const change of changes.updates) {
    validateRow(change.row, columns, connection.engine);
    const key = rowKey(change.row, columns, connection.engine),
      column = columns.find((column) => column.name === change.column);
    if (!column) throw new StoreError(400, "The edited column is not in the selected table.");
    const existing = updates.get(key);
    if (existing && JSON.stringify(existing.row) !== JSON.stringify(change.row))
      throw new StoreError(
        400,
        "The same primary key has different original row values. Refresh the table.",
      );
    if (existing?.values.some((value) => value.column === change.column))
      throw new StoreError(400, "The same cell appears more than once in these changes.");
    const mutation = existing ?? { kind: "update" as const, row: change.row, values: [] };
    mutation.values.push({ column: change.column, value: change.value });
    updates.set(key, mutation);
  }
  for (const [key, mutation] of updates) {
    occupied.add(key);
    mutations.push(mutation);
  }
  for (const original of changes.deletes) {
    validateRow(original, columns, connection.engine);
    const key = rowKey(original, columns, connection.engine);
    if (occupied.has(key))
      throw new StoreError(
        400,
        "A row appears in more than one change. Review the staged changes.",
      );
    occupied.add(key);
    mutations.push({ kind: "delete", row: original });
  }
  for (const values of changes.inserts) {
    validateRow(values, columns, connection.engine, true);
    if (columns.some((column) => column.primaryKey)) {
      const key = rowKey(values, columns, connection.engine);
      if (occupied.has(key))
        throw new StoreError(
          400,
          "A primary key appears in more than one change. Review the staged changes.",
        );
      occupied.add(key);
    }
    mutations.push({ kind: "insert", row: values });
  }
  if (!mutations.length || mutations.length > 100)
    throw new StoreError(400, "Prepare between 1 and 100 row changes at a time.");
  return mutations;
}

export function rowStatement(
  connection: ConnectionSummary,
  table: SchemaTable,
  scope: RowMutationScope,
  input: RowMutation,
): { sql: string; parameters: Parameter[] } {
  const mutation = mutationSchema.parse(input),
    columns = checkedColumns(connection, table, scope);
  validateRow(mutation.row, columns, connection.engine, mutation.kind === "insert");
  if (mutation.kind !== "insert") rowKey(mutation.row, columns, connection.engine);
  const postgres = connection.engine === "postgres",
    parameters: Parameter[] = [];
  const quote = (name: string) =>
    postgres ? `"${name.replaceAll('"', '""')}"` : `\`${name.replaceAll("`", "``")}\``;
  const relation = postgres ? `${quote(table.schema)}.${quote(table.name)}` : quote(table.name);
  function bound(value: CellValue, column: SchemaColumn, original = false): string {
    const typed = typedValue(value, column, connection.engine);
    parameters.push(typed.parameter);
    const placeholder = postgres ? `$${parameters.length}` : "?";
    if (value === null) return placeholder;
    if (typed.type.kind === "binary")
      return postgres ? `decode(CAST(${placeholder} AS TEXT), 'hex')` : `UNHEX(${placeholder})`;
    if (typed.type.kind === "json" && original)
      return postgres ? `CAST(${placeholder} AS TEXT)` : placeholder;
    if (typed.type.kind === "integer")
      return postgres
        ? `CAST(${placeholder} AS ${typed.type.cast})`
        : `CAST(${placeholder} AS ${typed.type.unsigned ? "UNSIGNED" : "SIGNED"})`;
    if (typed.type.kind === "text" || typed.type.kind === "boolean") return placeholder;
    return postgres
      ? `CAST(CAST(${placeholder} AS TEXT) AS ${typed.type.cast})`
      : `CAST(${placeholder} AS ${typed.type.cast})`;
  }
  function originalPredicate(): string {
    return columns
      .map((column, index) => {
        const value = mutation.row[index],
          name = quote(column.name);
        if (value === null) return `${name} IS NULL`;
        const expression = bound(value, column, true),
          kind = columnType(column, connection.engine).kind;
        if (kind === "text" || kind === "json")
          return postgres
            ? `(CAST(${name} AS TEXT) COLLATE "C") IS NOT DISTINCT FROM (CAST(${expression} AS TEXT) COLLATE "C")`
            : `BINARY ${name} <=> BINARY ${expression}`;
        return `${name} ${postgres ? "IS NOT DISTINCT FROM" : "<=>"} ${expression}`;
      })
      .join(" AND ");
  }
  let sql: string;
  if (mutation.kind === "insert") {
    sql = `INSERT INTO ${relation} (${columns.map((column) => quote(column.name)).join(", ")}) VALUES (${columns.map((column, index) => bound(mutation.row[index], column)).join(", ")})`;
  } else {
    let prefix: string;
    if (mutation.kind === "delete") prefix = `DELETE FROM ${relation}`;
    else {
      const changes = new Map(mutation.values.map((value) => [value.column, value.value]));
      if (
        changes.size !== mutation.values.length ||
        [...changes.keys()].some((name) => !columns.some((column) => column.name === name))
      )
        throw new StoreError(400, "Edited column names must be unique and belong to this table.");
      const selected = columns
        .map((column, index) => ({ column, index }))
        .filter(({ column }) => changes.has(column.name));
      for (const { column } of selected)
        if (changes.get(column.name) === null && !column.nullable)
          throw new StoreError(400, `The column ${column.name} does not allow NULL.`);
      if (
        selected.every(
          ({ column, index }) =>
            typedValue(changes.get(column.name)!, column, connection.engine).key ===
            typedValue(mutation.row[index], column, connection.engine).key,
        )
      )
        throw new StoreError(400, "The edited values equal the original row.");
      prefix = `UPDATE ${relation} SET ${selected.map(({ column }) => `${quote(column.name)} = ${bound(changes.get(column.name)!, column)}`).join(", ")}`;
    }
    const predicate = originalPredicate();
    sql = postgres
      ? `${prefix} WHERE (tableoid, ctid) = (SELECT tableoid, ctid FROM ${relation} WHERE ${predicate} FOR UPDATE)`
      : `${prefix} WHERE ${predicate} LIMIT 1`;
  }
  try {
    encodeOperation(
      queryRequest(scope.target, sql, "write", "row-validation", "row-validation", parameters),
    );
  } catch {
    throw new StoreError(
      413,
      "This row exceeds the SQL or parameter limit. Use a smaller change in the SQL console.",
    );
  }
  return { sql, parameters };
}

async function currentTable(
  owner: OwnerIdentity,
  scope: RowMutationScope,
): Promise<{ connection: ConnectionSummary; table: SchemaTable }> {
  const connection = await getConnection(owner, scope.target.connectionId);
  if (connection.readOnly)
    throw new StoreError(403, "Enable writes for this connection before preparing row changes.");
  if (
    connection.revision !== scope.target.connectionRevision ||
    connection.database !== scope.target.database
  )
    throw new StoreError(409, "The connection changed. Refresh the table before editing rows.");
  if (!scope.target.schema) throw new StoreError(400, "Select one schema before editing rows.");
  const tables = await inspectSchema(owner, connection.id, scope.target.schema, true);
  const matches = tables.filter(
    (table) =>
      table.database === scope.target.database &&
      table.schema === scope.target.schema &&
      table.name === scope.table,
  );
  if (matches.length !== 1)
    throw new StoreError(400, "The selected table is missing or ambiguous. Refresh the table.");
  return { connection, table: matches[0] };
}

export async function prepareRowChanges(
  owner: OwnerIdentity,
  input: PrepareRowChanges,
): Promise<PreparedRowChanges> {
  const checked = prepareRowsSchema.parse(input),
    { connection, table } = await currentTable(owner, checked);
  const mutations = groupRowChanges(connection, table, checked, checked.changes);
  const statements = mutations.map((mutation) => ({
    mutation,
    ...rowStatement(connection, table, checked, mutation),
  }));
  const instance = await getInstance(),
    operations: PreparedRowMutation[] = [];
  for (const item of statements) {
    const operationId = randomUUID(),
      approvalId = randomUUID();
    const request = queryRequest(
      checked.target,
      item.sql,
      "write",
      operationId,
      approvalId,
      item.parameters,
    );
    const digest = operationDigest(request);
    const approval = await createQueryApproval(owner, {
      ...checked.target,
      operationId,
      approvalId,
      operationDigest: digest,
      executionEpoch: instance.executionEpoch,
      sql: item.sql,
    });
    operations.push({
      operationId,
      approvalId,
      approvalToken: approval.token,
      operationDigest: digest,
      expiresAt: approval.expiresAt.toISOString(),
      kind: item.mutation.kind,
      sql: item.sql,
      parameters: item.parameters,
      expectedRows: 1,
      mutation: item.mutation,
    });
  }
  return { operations };
}

export class RowWriteNotSubmitted extends Error {
  constructor(readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : "The row write was not submitted.");
  }
}

export async function executeRowMutation(
  owner: OwnerIdentity,
  input: ExecuteRowMutation,
): Promise<RowMutationOperation> {
  let checked: ExecuteRowMutation;
  let request: ReturnType<typeof queryRequest>;
  try {
    checked = executeRowSchema.parse(input);
    const { connection, table } = await currentTable(owner, checked);
    const statement = rowStatement(connection, table, checked, checked.mutation);
    request = queryRequest(
      checked.target,
      statement.sql,
      "write",
      checked.operationId,
      checked.approvalId,
      statement.parameters,
    );
    const instance = await getInstance();
    await checkQueryApproval(owner, {
      ...checked.target,
      operationId: checked.operationId,
      approvalId: checked.approvalId,
      token: checked.approvalToken,
      operationDigest: operationDigest(request),
      executionEpoch: instance.executionEpoch,
    });
  } catch (cause) {
    throw new RowWriteNotSubmitted(cause);
  }
  const operation = await startOperation(
    owner,
    checked.target,
    request,
    checked.operationId,
    checked.approvalToken,
  );
  return { ...operation, expectedRows: 1, mutationOutcome: rowMutationOutcome(operation) };
}
