export interface ResultChartColumn {
  name: string;
  dataType?: string;
}

export type ResultChartCell = string | number | boolean | null;
export type ResultChartType = "bar" | "line" | "scatter";

export interface ResultChartConfig {
  type: ResultChartType;
  xColumn: number;
  yColumn: number;
}

export interface QueryResultChartProps {
  columns: ResultChartColumn[];
  rows: ResultChartCell[][];
  complete: boolean;
  color?: string;
  className?: string;
}

export interface ResultChartPoint {
  x: string | number;
  y: number | null;
  rawX: string;
  rawY: string;
  rowIndex: number;
}

export interface PreparedChartData {
  points: ResultChartPoint[];
  approximate: boolean;
  omitted: number;
  missing: number;
  error?: string;
}
