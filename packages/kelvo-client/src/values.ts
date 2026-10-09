import { tableFromIPC, DataType, type Vector } from "apache-arrow";
import { Message } from "apache-arrow/ipc/metadata/message";
import type { CellValue, QueryResult } from "@synehq-oos/explorer-contracts";

function invalid(): never {
  throw new Error("The Arrow result is incomplete or unsupported.");
}

/** Check physical framing before Arrow can allocate decoded vectors. */
export function validateArrow(bytes: Buffer, expectedRows: number): void {
  let offset = 0;
  let schemas = 0;
  let rows = 0;
  let messages = 0;
  while (offset + 8 <= bytes.length) {
    if (++messages > 1024 || bytes.readInt32LE(offset) !== -1) invalid();
    const size = bytes.readInt32LE(offset + 4);
    offset += 8;
    if (size === 0) {
      if (schemas !== 1 || rows !== expectedRows || offset !== bytes.length) invalid();
      return;
    }
    if (size < 0 || size > 1024 * 1024 || size % 8 !== 0 || offset + size > bytes.length) invalid();
    const message = Message.decode(bytes.subarray(offset, offset + size));
    offset += size;
    if (
      !Number.isSafeInteger(message.bodyLength) ||
      message.bodyLength < 0 ||
      message.bodyLength % 8 !== 0 ||
      offset + message.bodyLength > bytes.length
    )
      invalid();
    if (message.isSchema()) {
      if (
        ++schemas !== 1 ||
        messages !== 1 ||
        message.bodyLength !== 0 ||
        message.header().fields.length > 512
      )
        invalid();
    } else if (message.isRecordBatch()) {
      if (schemas !== 1) invalid();
      const batch = message.header();
      rows += batch.length;
      if (
        !Number.isSafeInteger(batch.length) ||
        batch.length < 0 ||
        rows > 10000 ||
        batch.nodes.length > 1024 ||
        batch.buffers.length > 4096
      )
        invalid();
      for (const node of batch.nodes)
        if (
          !Number.isSafeInteger(node.length) ||
          node.length < 0 ||
          node.length > 10000 ||
          node.nullCount < 0 ||
          node.nullCount > node.length
        )
          invalid();
      for (const region of batch.buffers)
        if (
          !Number.isSafeInteger(region.offset) ||
          !Number.isSafeInteger(region.length) ||
          region.offset < 0 ||
          region.length < 0 ||
          region.offset + region.length > message.bodyLength
        )
          invalid();
    } else invalid();
    offset += message.bodyLength;
  }
  invalid();
}

export function decimalString(words: Uint32Array, scale: number): string {
  let raw = 0n;
  for (let index = words.length - 1; index >= 0; index--) raw = (raw << 32n) | BigInt(words[index]);
  if (words[words.length - 1] & 0x80000000) raw -= 1n << BigInt(words.length * 32);
  const sign = raw < 0n ? "-" : "";
  let digits = (raw < 0n ? -raw : raw).toString();
  if (scale < 0) return sign + digits + "0".repeat(-scale);
  if (scale === 0) return sign + digits;
  digits = digits.padStart(scale + 1, "0");
  return `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}
export function timestampString(raw: bigint, unit: number, timezone?: string | null): string {
  const places = [0, 3, 6, 9][unit];
  if (places === undefined) invalid();
  const divisor = 10n ** BigInt(places);
  let seconds = raw / divisor;
  let fraction = raw % divisor;
  if (fraction < 0n) {
    fraction += divisor;
    seconds -= 1n;
  }
  const milliseconds = seconds * 1000n;
  if (milliseconds < -8640000000000000n || milliseconds > 8640000000000000n)
    return `${raw} ${["s", "ms", "us", "ns"][unit]} since Unix epoch`;
  const iso = new Date(Number(milliseconds)).toISOString().replace(/\.000Z$/, "");
  return `${iso}${places ? `.${fraction.toString().padStart(places, "0")}` : ""}${timezone ? "Z" : ""}`;
}
function cell(vector: Vector, index: number): CellValue {
  if (!vector.isValid(index)) return null;
  const type = vector.type;
  if (DataType.isTimestamp(type)) {
    let row = index;
    for (const chunk of vector.data) {
      if (row < chunk.length)
        return timestampString(BigInt(chunk.values[chunk.offset + row]), type.unit, type.timezone);
      row -= chunk.length;
    }
    return invalid();
  }
  const value = vector.get(index);
  if (DataType.isDecimal(type)) {
    if (!(value instanceof Uint32Array) || type.scale < -76 || type.scale > 76) invalid();
    return decimalString(value, type.scale);
  }
  if (DataType.isBinary(type) || DataType.isFixedSizeBinary(type))
    return `\\x${Buffer.from(value).toString("hex")}`;
  if (DataType.isDate(type)) return new Date(Number(value)).toISOString().slice(0, 10);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string" || typeof value === "boolean") return value;
  return invalid();
}
export function decodeResult(bytes: Buffer, expectedRows: number): QueryResult {
  validateArrow(bytes, expectedRows);
  const table = tableFromIPC(bytes);
  if (
    table.numRows !== expectedRows ||
    table.numCols > 512 ||
    table.numRows * table.numCols > 250000
  )
    invalid();
  const columns = table.schema.fields.map((field) => ({
    name: field.name,
    dataType: field.type.toString(),
  }));
  const vectors = columns.map((_, index) => table.getChildAt(index)!);
  const rows: CellValue[][] = [];
  let decodedBytes = Buffer.byteLength(JSON.stringify(columns));
  for (let i = 0; i < table.numRows; i++) {
    const row = vectors.map((vector) => cell(vector, i));
    decodedBytes += Buffer.byteLength(JSON.stringify(row));
    if (decodedBytes > 16 * 1024 * 1024) throw new Error("The decoded result exceeds the limit.");
    rows.push(row);
  }
  return { columns, rows, rowCount: rows.length, complete: true };
}
