export { cn } from "@synehq-oos/ui";

export function isDateType(type: string): boolean {
  type = type.toLowerCase();
  return (
    type.includes("timestamp") ||
    type.includes("date") ||
    type.includes("datetime") ||
    type.includes("time") ||
    type.includes("timetz") ||
    type.includes("time with time zone") ||
    type.includes("time without time zone") ||
    // MongoDB date types
    type.includes("isodate") ||
    // SQL Server date types
    type.includes("smalldatetime") ||
    type.includes("datetime2") ||
    type.includes("datetimeoffset") ||
    // PostgreSQL specific date types
    type.includes("timestamptz") ||
    type.includes("timestamp with time zone") ||
    type.includes("timestamp without time zone") ||
    type.includes("interval")
  );
}

export function isNumberType(type: string): boolean {
  type = type.toLowerCase();
  return (
    type.includes("number") ||
    type.includes("integer") ||
    type.includes("decimal") ||
    type.includes("numeric") ||
    type.includes("real") ||
    type.includes("double precision") ||
    type.includes("float") ||
    type.includes("smallint") ||
    type.includes("bigint")
  );
}
