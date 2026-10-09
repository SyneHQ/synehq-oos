export type DatabaseEngine = "postgres" | "mysql";
export type TlsMode = "verify-full" | "disable";

export interface OwnerSummary {
  id: string;
  name: string;
  email: string;
}

export interface ConnectionSummary {
  id: string;
  label: string;
  engine: DatabaseEngine;
  host: string;
  port: number;
  database: string;
  username: string;
  tlsMode: TlsMode;
  readOnly: boolean;
  revision: number;
  hasSecret: boolean;
}

export interface QueryTarget {
  connectionId: string;
  database: string;
  schema: string | null;
  connectionRevision: number;
}

export interface SchemaColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  primaryKey: boolean;
  position: number;
  defaultValue?: string | null;
}
export interface RelationshipEndpoint {
  database: string;
  schema: string;
  table: string;
  columns: string[];
}
export interface SchemaRelationship {
  name: string;
  source: RelationshipEndpoint;
  target: RelationshipEndpoint;
}
export interface SchemaTable {
  database: string;
  schema: string;
  name: string;
  type: string;
  columns: SchemaColumn[];
  relationships: SchemaRelationship[];
}
export interface QueryColumn {
  name: string;
  dataType: string;
}
export type CellValue = string | number | boolean | null;
export interface QueryResult {
  columns: QueryColumn[];
  rows: CellValue[][];
  rowCount: number;
  affectedRows?: number;
  durationMs?: number;
  complete: boolean;
}
export type OperationStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "unknown";
export interface QueryOperation {
  operationId: string;
  status: OperationStatus;
  result?: QueryResult;
  error?: string;
}
export const MAX_SQL_BYTES = 100_000;
export const MAX_OPERATION_BYTES = 256 * 1024;
export const DEFAULT_MAX_ROWS = 10_000;
export const DEFAULT_MAX_RESULT_BYTES = 4 * 1024 * 1024;
export * from "./rows";
