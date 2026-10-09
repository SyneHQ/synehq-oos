import type {
  PreparedChartData,
  ResultChartCell,
  ResultChartColumn,
  ResultChartConfig,
} from "./types";

export const MAX_CHART_ROWS = 2000;
const decimalPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function exactChartLabel(value: ResultChartCell): string {
  return value === null ? "NULL" : String(value);
}

function numericValue(value: ResultChartCell): {
  value: number | null;
  approximate: boolean;
  error?: string;
} {
  if (value === null) return { value: null, approximate: false };
  if (typeof value === "boolean" || (typeof value === "string" && !decimalPattern.test(value))) {
    return {
      value: null,
      approximate: false,
      error: "The selected column contains a nonnumeric value.",
    };
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number))
    return {
      value: null,
      approximate: false,
      error: "The selected column contains a nonfinite value.",
    };
  if (typeof value === "string" && number === 0 && /[1-9]/.test(value.split(/[eE]/)[0])) {
    return {
      value: null,
      approximate: false,
      error:
        "The selected value is too small to plot without changing it to zero. Inspect it in the table.",
    };
  }
  if (
    Math.abs(number) > Number.MAX_SAFE_INTEGER ||
    (Number.isInteger(number) && !Number.isSafeInteger(number))
  ) {
    return {
      value: null,
      approximate: false,
      error:
        "The selected column exceeds the safe integer range for charts. Inspect these values in the table.",
    };
  }
  if (typeof value === "string" && /^[+-]?\d+$/.test(value) && BigInt(value) !== BigInt(number)) {
    return {
      value: null,
      approximate: false,
      error:
        "The selected column cannot keep its integer precision in a chart. Inspect these values in the table.",
    };
  }
  return {
    value: number,
    approximate: !Number.isInteger(number) || (typeof value === "string" && /[.eE]/.test(value)),
  };
}

export function prepareChartData(
  columns: ResultChartColumn[],
  rows: ResultChartCell[][],
  config: ResultChartConfig,
): PreparedChartData {
  const result: PreparedChartData = {
    points: [],
    approximate: false,
    omitted: Math.max(0, rows.length - MAX_CHART_ROWS),
    missing: 0,
  };
  if (!columns[config.xColumn] || !columns[config.yColumn])
    return { ...result, error: "Select an X column and a Y column." };
  for (const [rowIndex, row] of rows.slice(0, MAX_CHART_ROWS).entries()) {
    const rawX = row[config.xColumn];
    const rawY = row[config.yColumn];
    if (rawX === undefined || rawY === undefined)
      return {
        ...result,
        points: [],
        error: `Row ${rowIndex + 1} has no value for a selected column.`,
      };
    const y = numericValue(rawY);
    if (y.error)
      return {
        ...result,
        points: [],
        error: `Y column, row ${rowIndex + 1}: ${y.error}`,
      };
    const x =
      config.type === "scatter"
        ? numericValue(rawX)
        : { value: exactChartLabel(rawX), approximate: false };
    if ("error" in x && x.error)
      return {
        ...result,
        points: [],
        error: `X column, row ${rowIndex + 1}: ${x.error}`,
      };
    result.approximate ||= x.approximate || y.approximate;
    if (x.value === null || y.value === null) {
      result.missing += 1;
      if (config.type === "scatter" || x.value === null) continue;
    }
    result.points.push({
      x: x.value,
      y: y.value,
      rawX: exactChartLabel(rawX),
      rawY: exactChartLabel(rawY),
      rowIndex,
    });
  }
  return result;
}

export function initialChartConfig(
  columns: ResultChartColumn[],
  rows: ResultChartCell[][],
): ResultChartConfig {
  const numericColumn = columns.findIndex(
    (_, index) =>
      index !== 0 &&
      rows.slice(0, 100).some((row) => row[index] !== null && row[index] !== undefined) &&
      rows
        .slice(0, 100)
        .every((row) => row[index] !== undefined && !numericValue(row[index]).error),
  );
  return {
    type: "bar",
    xColumn: 0,
    yColumn: numericColumn >= 0 ? numericColumn : Math.min(1, columns.length - 1),
  };
}
