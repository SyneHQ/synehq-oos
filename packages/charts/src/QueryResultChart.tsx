"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { init, use, type ComposeOption, type EChartsType } from "echarts/core";
import {
  BarChart,
  LineChart,
  ScatterChart,
  type BarSeriesOption,
  type LineSeriesOption,
  type ScatterSeriesOption,
} from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  TooltipComponent,
  type AriaComponentOption,
  type GridComponentOption,
  type TooltipComponentOption,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { initialChartConfig, prepareChartData } from "./result-data";
import type { QueryResultChartProps, ResultChartType } from "./types";

use([
  BarChart,
  LineChart,
  ScatterChart,
  AriaComponent,
  GridComponent,
  TooltipComponent,
  CanvasRenderer,
]);
type ChartOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | ScatterSeriesOption
  | AriaComponentOption
  | GridComponentOption
  | TooltipComponentOption
>;
const selectStyle: CSSProperties = {
  border: "1px solid #d6cadd",
  background: "white",
  borderRadius: 0,
  color: "#65546f",
  padding: "5px 7px",
  maxWidth: 190,
  minWidth: 85,
  font: "inherit",
};

export function QueryResultChart({
  columns,
  rows,
  complete,
  color = "#80609f",
  className,
}: QueryResultChartProps) {
  const [config, setConfig] = useState(() => initialChartConfig(columns, rows));
  const node = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsType | null>(null);
  const prepared = useMemo(() => prepareChartData(columns, rows, config), [columns, rows, config]);
  const plottedCount = prepared.points.filter((point) => point.y !== null).length;
  const xName = columns[config.xColumn]?.name || `Column ${config.xColumn + 1}`;
  const yName = columns[config.yColumn]?.name || `Column ${config.yColumn + 1}`;
  const option = useMemo<ChartOption>(
    () => ({
      animation: false,
      aria: {
        enabled: true,
        label: {
          description: `${config.type} chart. X column ${xName}. Y column ${yName}. The result table contains the exact values.`,
        },
      },
      grid: { top: 24, right: 28, bottom: 60, left: 20, containLabel: true },
      tooltip: {
        trigger: "item",
        renderMode: "richText",
        confine: true,
        formatter: (params: unknown) => {
          const index = (params as { dataIndex?: number }).dataIndex;
          const point = index === undefined ? undefined : prepared.points[index];
          return point
            ? `Row ${point.rowIndex + 1}\n${xName}: ${point.rawX}\n${yName}: ${point.rawY}`
            : "";
        },
      },
      xAxis: {
        type: config.type === "scatter" ? "value" : "category",
        name: xName,
        nameLocation: "middle",
        nameGap: 40,
        ...(config.type === "scatter" ? {} : { data: prepared.points.map((point) => point.x) }),
        axisLabel: { hideOverlap: true, color: "#8c769b" },
        axisLine: { lineStyle: { color: "#d9cfe0" } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        name: yName,
        nameTextStyle: { color: "#8c769b" },
        axisLabel: { color: "#8c769b" },
        splitLine: { lineStyle: { color: "#eee7f3" } },
      },
      series: [
        {
          type: config.type,
          name: yName,
          data: prepared.points.map((point) =>
            config.type === "scatter" ? [point.x, point.y] : point.y,
          ),
          itemStyle: { color },
          ...(config.type === "line"
            ? {
                connectNulls: false,
                showSymbol: true,
                symbolSize: 5,
                lineStyle: { color, width: 2 },
              }
            : config.type === "bar"
              ? { barMaxWidth: 48 }
              : { symbolSize: 7 }),
        },
      ],
    }),
    [prepared, config.type, xName, yName, color],
  );
  useEffect(() => {
    if (!node.current) return;
    const instance = init(node.current, undefined, { renderer: "canvas" });
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(node.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);
  useEffect(() => {
    if (prepared.error || plottedCount === 0) chart.current?.clear();
    else chart.current?.setOption(option, { notMerge: true });
  }, [option, prepared.error, plottedCount]);
  return (
    <section
      className={className}
      aria-label="Query result chart"
      style={{
        display: "flex",
        flex: 1,
        minHeight: 280,
        flexDirection: "column",
        overflow: "auto",
        background: "#fff",
        color: "#8a7499",
        fontSize: 11,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "center",
          padding: "11px 16px",
          borderBottom: "1px solid #e9e1ef",
        }}
      >
        <label style={{ display: "flex", gap: 7, alignItems: "center" }}>
          Type
          <select
            style={selectStyle}
            aria-label="Chart type"
            value={config.type}
            onChange={(event) =>
              setConfig((value) => ({
                ...value,
                type: event.target.value as ResultChartType,
              }))
            }
          >
            <option value="bar">Bar</option>
            <option value="line">Line</option>
            <option value="scatter">Scatter</option>
          </select>
        </label>
        {(["xColumn", "yColumn"] as const).map((axis, index) => (
          <label key={axis} style={{ display: "flex", gap: 7, alignItems: "center" }}>
            {index === 0 ? "X" : "Y"}
            <select
              style={selectStyle}
              aria-label={index === 0 ? "Chart X column" : "Chart Y column"}
              value={config[axis]}
              onChange={(event) =>
                setConfig((value) => ({
                  ...value,
                  [axis]: Number(event.target.value),
                }))
              }
            >
              {columns.map((column, columnIndex) => (
                <option key={columnIndex} value={columnIndex}>
                  {columnIndex + 1}. {column.name || "Unnamed column"}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 5,
          padding: "10px 16px",
          fontSize: 10,
          lineHeight: 1.65,
        }}
      >
        <p style={{ margin: 0 }}>
          {plottedCount} plotted rows from {rows.length} returned rows. Charts do not run queries.
        </p>
        {prepared.omitted > 0 && (
          <p style={{ margin: 0 }}>
            The chart omits the last {prepared.omitted} returned rows. Add a SQL filter to narrow
            the result.
          </p>
        )}
        {!complete && (
          <p style={{ margin: 0 }}>
            The query result reached its limit. This chart does not show the complete database
            result.
          </p>
        )}
        {prepared.missing > 0 && (
          <p style={{ margin: 0 }}>
            {prepared.missing} rows contain null values. Null values create gaps or have no plotted
            point.
          </p>
        )}
        {prepared.approximate && (
          <p style={{ margin: 0 }}>
            Decimal positions can be approximate. Tooltips and the result table keep the original
            values.
          </p>
        )}
      </div>
      {prepared.error && (
        <p
          role="alert"
          style={{
            margin: "0 16px 12px",
            padding: 12,
            background: "#fff7f7",
            color: "#a25b68",
            border: "1px solid #eedce1",
            lineHeight: 1.7,
          }}
        >
          {prepared.error}
        </p>
      )}
      {!prepared.error && !plottedCount && (
        <p style={{ padding: "20px 16px", margin: 0 }}>
          No values can be plotted with these columns.
        </p>
      )}
      <div
        ref={node}
        style={{
          flex: 1,
          minHeight: 230,
          width: "100%",
          ...(prepared.error ? { visibility: "hidden" } : {}),
        }}
      />
    </section>
  );
}
