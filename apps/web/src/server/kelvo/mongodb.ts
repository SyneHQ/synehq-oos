import { connectionRef, type JsonValue, type OperationRequest } from "@synehq-oos/kelvo-client";
import type { QueryTarget } from "@synehq-oos/explorer-contracts";
import { StoreError } from "../store/errors";

const commands = {
  find: ["collection", "filter", "projection", "sort"],
  find_one: ["collection", "filter", "projection", "sort"],
  aggregate: ["collection", "pipeline"],
  count: ["collection", "filter"],
  list_indexes: ["collection"],
  insert_one: ["collection", "document"],
  insert_many: ["collection", "documents"],
  update_one: ["collection", "filter", "update", "upsert"],
  update_many: ["collection", "filter", "update", "upsert"],
  delete_one: ["collection", "filter"],
  delete_many: ["collection", "filter"],
  create_collection: ["collection"],
  drop_collection: ["collection"],
  create_index: ["collection", "keys", "name", "unique"],
  drop_index: ["collection", "name"],
} as const;
const reads = new Set(["find", "find_one", "aggregate", "count", "list_indexes"]);

export function parseMongoCommand(text: string, mode: "read" | "write") {
  if (!text.isWellFormed() || Buffer.byteLength(text) > 16384)
    throw new StoreError(400, "The MongoDB command exceeds 16 KiB.");
  for (const token of text.matchAll(/"(?:\\.|[^"\\])*"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g)) {
    if (token[1] && (!/^-?\d+$/.test(token[1]) || !Number.isSafeInteger(Number(token[1]))))
      throw new StoreError(
        400,
        "Use canonical Extended JSON for large integers, decimals, and floating-point values.",
      );
  }
  let value: Record<string, JsonValue>;
  try {
    value = JSON.parse(text);
  } catch {
    throw new StoreError(400, "Enter one MongoDB command as a JSON object.");
  }
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    typeof value.command !== "string" ||
    !Object.hasOwn(commands, value.command)
  )
    throw new StoreError(
      400,
      "Select a supported MongoDB command. Shell code and runCommand are not supported.",
    );
  const command = value.command as keyof typeof commands;
  if ((mode === "read") !== reads.has(command))
    throw new StoreError(
      400,
      mode === "read"
        ? "Review this MongoDB write before running it."
        : "Run this MongoDB command as a read.",
    );
  const { command: _command, ...parameters } = value;
  const allowed: readonly string[] = commands[command];
  if (Object.keys(parameters).some((key) => !allowed.includes(key)))
    throw new StoreError(400, "The MongoDB command contains unsupported fields.");
  if (
    typeof parameters.collection !== "string" ||
    !parameters.collection ||
    Buffer.byteLength(parameters.collection) > 120 ||
    parameters.collection.startsWith("system.") ||
    /[$\0\r\n]/.test(parameters.collection)
  )
    throw new StoreError(
      400,
      "Enter a collection name of at most 120 bytes, without reserved names or dollar signs.",
    );
  return { command, parameters };
}

export function mongoRequest(
  target: QueryTarget,
  text: string,
  mode: "read" | "write",
  operationId: string,
  approvalId?: string,
): OperationRequest {
  if (target.schema !== null)
    throw new StoreError(400, "MongoDB uses a database and collection, without a SQL schema.");
  const { command, parameters } = parseMongoCommand(text, mode);
  return {
    version: 1,
    kind: mode === "write" ? "native.execute" : "native.read",
    connection: connectionRef(target),
    idempotency_key: operationId,
    ...(approvalId ? { approval_id: approvalId } : {}),
    spec: {
      native: {
        provider: "mongodb",
        command,
        parameters: [{ type: "json", value: parameters }],
        ...(mode === "write" ? { return_result: true } : {}),
      },
    },
  };
}
