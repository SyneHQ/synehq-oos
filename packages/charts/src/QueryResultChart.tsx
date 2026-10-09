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
import type { QueryResultChartProps, ResultChartSelectProps, ResultChartType } from "./types";

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
  border: "1px solid var(--line, #e5e5e5)",
  background: "var(--paper, #fff)",
  borderRadius: 4,
  color: "inherit",
  padding: "5px 7px",
  maxWidth: 190,
  minWidth: 85,
  font: "inherit",
};

function renderNativeSelect({
  label,
  value,
  options,
  onValueChange,
  disabled,
}: ResultChartSelectProps) {
  return (
    <select
      style={selectStyle}
      aria-label={label}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      disabled={disabled}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function QueryResultChart({
  columns,
  rows,
  complete,
  color = "#cf3c00",
  className,
  renderSelect = renderNativeSelect,
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
        axisLabel: { hideOverlap: true, color: "#6b6b6b" },
        axisLine: { lineStyle: { color: "#d4d4d4" } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        name: yName,
        nameTextStyle: { color: "#6b6b6b" },
        axisLabel: { color: "#6b6b6b" },
        splitLine: { lineStyle: { color: "#e5e5e5" } },
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
        background: "var(--paper, #fff)",
        color: "var(--muted, #6b6b6b)",
        fontSize: 11,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          padding: "8px 12px",
          borderBottom: "1px solid var(--line, #e5e5e5)",
        }}
      >
        <label style={{ display: "flex", gap: 7, alignItems: "center" }}>
          Type
          {renderSelect({
            label: "Chart type",
            value: config.type,
            options: [
              { value: "bar", label: "Bar" },
              { value: "line", label: "Line" },
              { value: "scatter", label: "Scatter" },
            ],
            onValueChange: (type) =>
              setConfig((value) => ({ ...value, type: type as ResultChartType })),
          })}
        </label>
        {(["xColumn", "yColumn"] as const).map((axis, index) => (
          <label key={axis} style={{ display: "flex", gap: 7, alignItems: "center" }}>
            {index === 0 ? "X" : "Y"}
            {renderSelect({
              label: index === 0 ? "Chart X column" : "Chart Y column",
              value: String(config[axis]),
              options: columns.map((column, columnIndex) => ({
                value: String(columnIndex),
                label: `${columnIndex + 1}. ${column.name || "Unnamed column"}`,
              })),
              disabled: columns.length === 0,
              onValueChange: (column) =>
                setConfig((value) => ({
                  ...value,
                  [axis]: Number(column),
                })),
            })}
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
