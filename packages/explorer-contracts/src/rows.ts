import type { CellValue, QueryColumn, QueryOperation, QueryTarget } from "./index";

export interface RowChanges {
  inserts: CellValue[][];
  updates: { row: CellValue[]; column: string; value: CellValue }[];
  deletes: CellValue[][];
}

export type RowMutation =
  | { kind: "insert"; row: CellValue[] }
  | { kind: "update"; row: CellValue[]; values: { column: string; value: CellValue }[] }
  | { kind: "delete"; row: CellValue[] };

export interface RowMutationScope {
  target: QueryTarget;
  table: string;
  columns: QueryColumn[];
}

export interface PrepareRowChanges extends RowMutationScope {
  changes: RowChanges;
}
export interface PreparedRowMutation {
  operationId: string;
  approvalId: string;
  approvalToken: string;
  operationDigest: string;
  expiresAt: string;
  kind: RowMutation["kind"];
  sql: string;
  parameters: { type: "string" | "int64" | "bool" | "null"; value: string | boolean | null }[];
  expectedRows: 1;
  mutation: RowMutation;
}
export interface PreparedRowChanges {
  operations: PreparedRowMutation[];
}
export interface ExecuteRowMutation extends RowMutationScope {
  operationId: string;
  approvalId: string;
  approvalToken: string;
  mutation: RowMutation;
}
export type RowMutationOutcome =
  | "pending"
  | "applied"
  | "conflict"
  | "failed"
  | "cancelled"
  | "unknown"
  | "needs_review";
export interface RowMutationOperation extends QueryOperation {
  expectedRows: 1;
  mutationOutcome: RowMutationOutcome;
}

/** A successful statement can still match zero rows. Never treat that as an applied edit. */
export function rowMutationOutcome(operation: QueryOperation): RowMutationOutcome {
  if (operation.status === "queued" || operation.status === "running") return "pending";
  if (
    operation.status === "failed" ||
    operation.status === "cancelled" ||
    operation.status === "unknown"
  )
    return operation.status;
  const affected = operation.result?.affectedRows;
  if (affected === 1) return "applied";
  if (affected === 0) return "conflict";
  return "needs_review";
}
