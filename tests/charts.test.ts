import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CHART_ROWS,
  initialChartConfig,
  prepareChartData,
} from "../packages/charts/src/result-data";

const columns = [{ name: "label" }, { name: "value" }];
const config = { type: "bar" as const, xColumn: 0, yColumn: 1 };

test("charts keep exact source labels and mark decimal plotting approximate", () => {
  const data = prepareChartData(
    columns,
    [["<img src=x onerror=alert(1)>", "0.100000000000000001"]],
    config,
  );
  assert.equal(data.points[0].rawX, "<img src=x onerror=alert(1)>");
  assert.equal(data.points[0].rawY, "0.100000000000000001");
  assert.equal(data.points[0].y, 0.1);
  assert.equal(data.approximate, true);
});

test("charts reject integer values outside the safe numeric range", () => {
  for (const value of [
    "9007199254740992",
    "9007199254740993",
    "-9007199254740993",
    9007199254740992,
  ]) {
    assert.match(
      prepareChartData(columns, [["a", value]], config).error ?? "",
      /safe integer range/,
    );
  }
  assert.equal(
    prepareChartData(columns, [["a", "9007199254740991"]], config).points[0].y,
    Number.MAX_SAFE_INTEGER,
  );
});

test("charts keep null gaps and zero values distinct", () => {
  const data = prepareChartData(
    columns,
    [
      ["a", null],
      ["b", "0"],
      ["c", 0],
    ],
    { ...config, type: "line" },
  );
  assert.equal(data.missing, 1);
  assert.deepEqual(
    data.points.map((point) => point.y),
    [null, 0, 0],
  );
});

test("charts reject booleans, empty strings, partial numbers, and nonfinite values", () => {
  for (const value of [
    false,
    true,
    "",
    " ",
    "12items",
    "NaN",
    "Infinity",
    "1e999",
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    assert.ok(prepareChartData(columns, [["a", value]], config).error);
  }
  assert.match(prepareChartData(columns, [["a", "1e-999"]], config).error ?? "", /too small/);
});

test("scatter plots require numeric X values and omit null coordinates", () => {
  const data = prepareChartData(
    columns,
    [
      ["1", "2"],
      [null, "3"],
      ["4", null],
      ["5", "6"],
    ],
    { ...config, type: "scatter" },
  );
  assert.equal(data.missing, 2);
  assert.deepEqual(
    data.points.map((point) => [point.x, point.y, point.rowIndex]),
    [
      [1, 2, 0],
      [5, 6, 3],
    ],
  );
  assert.ok(prepareChartData(columns, [["name", "2"]], { ...config, type: "scatter" }).error);
});

test("column positions preserve duplicate names and chart limits remain explicit", () => {
  const sameNames = [{ name: "value" }, { name: "value" }, { name: "value" }];
  const row: (string | number)[] = ["wrong", "right", 7];
  const data = prepareChartData(
    sameNames,
    Array.from({ length: MAX_CHART_ROWS + 3 }, () => row),
    { type: "bar", xColumn: 1, yColumn: 2 },
  );
  assert.equal(data.points.length, MAX_CHART_ROWS);
  assert.equal(data.omitted, 3);
  assert.equal(data.points[0].x, "right");
  assert.equal(data.points[0].y, 7);
  assert.equal(row[2], 7);
});

test("initial mapping chooses a numeric Y column without changing rows", () => {
  assert.deepEqual(
    initialChartConfig(
      [{ name: "label" }, { name: "text" }, { name: "amount" }],
      [["a", "name", "12"]],
    ),
    { type: "bar", xColumn: 0, yColumn: 2 },
  );
  assert.match(prepareChartData([], [], config).error ?? "", /Select/);
});
