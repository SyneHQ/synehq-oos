# Outerbase chart review

Review date: 2026-10-09.

Scope: public repository metadata, pinned source, dependency declarations, and license files. This record does not claim a running Outerbase workflow test.

## Source and license

Reviewed Studio revision: [`b06fb85e5967440278d5a815721b360920566ab9`](https://github.com/outerbase/studio/commit/b06fb85e5967440278d5a815721b360920566ab9).

| Finding                                             | Evidence                                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Outerbase Studio contains its chart implementation. | [`src/components/chart`](https://github.com/outerbase/studio/tree/b06fb85e5967440278d5a815721b360920566ab9/src/components/chart) |
| Studio uses ECharts `^5.6.0`.                       | [`package.json`](https://github.com/outerbase/studio/blob/b06fb85e5967440278d5a815721b360920566ab9/package.json)                 |
| Studio source uses AGPL-3.0.                        | [`LICENSE`](https://github.com/outerbase/studio/blob/b06fb85e5967440278d5a815721b360920566ab9/LICENSE)                           |
| Apache ECharts 5.6.0 uses Apache-2.0.               | [ECharts license](https://github.com/apache/echarts/blob/5.6.0/LICENSE)                                                          |

The public Outerbase organization inventory had no separate chart library repository. The inspected chart component is internal Studio code.

Do not copy Studio components into an Apache-only package and replace their license. Such a copy would retain AGPL obligations.

ECharts is a separate dependency with a different license. A new SyneHQ component can use ECharts directly without copying Studio implementation code.

Keep required ECharts license and notice files when distributing it. Its license does not grant rights to Outerbase's UI code or assets.

## Useful UI patterns

These patterns come from source inspection. The live UI review is separate.

| Pattern                           | Source behavior                                                                               | Fit for the personal explorer                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Table and chart switch            | The chart editor can show the same query result as a table or a chart.                        | Add a result view switch after a completed query. Keep the table as the default.     |
| Explicit column mapping           | The editor selects an X column and one or more Y columns.                                     | Start with one X column and one Y column. Use result column positions as identities. |
| Separate query and style controls | The source places SQL and its Run action beside a chart settings panel.                       | Keep SQL execution in the existing console. Chart settings must not run SQL.         |
| Resize-aware drawing              | The chart observes its container and updates its dimensions.                                  | Support the existing result panel size and dispose the renderer on unmount.          |
| Chart type choice                 | Studio exposes line, bar, column, scatter, pie, radar, funnel, area, and other display types. | Start with bar and line only. Each extra type needs its own value rules.             |

Primary evidence: [board chart editor](https://github.com/outerbase/studio/blob/b06fb85e5967440278d5a815721b360920566ab9/src/components/board/board-chart-editor.tsx), [chart type selector](https://github.com/outerbase/studio/blob/b06fb85e5967440278d5a815721b360920566ab9/src/components/chart/chart-type-selection.tsx), and [series controls](https://github.com/outerbase/studio/blob/b06fb85e5967440278d5a815721b360920566ab9/src/components/chart/chart-series.tsx).

## Code behavior to avoid

Studio's [chart component](https://github.com/outerbase/studio/blob/b06fb85e5967440278d5a815721b360920566ab9/src/components/chart/index.tsx) uses `parseFloat` for several value formats. Its table renderer uses a fallback that hides zero values.

The [options builder](https://github.com/outerbase/studio/blob/b06fb85e5967440278d5a815721b360920566ab9/src/components/chart/echart-options-builder.ts) converts radar values with `Number`. That path can lose integer precision.

The inspected resize cleanup stops observation. It does not explicitly dispose the ECharts instance or clear the pending resize timer.

These findings support an independent adapter with narrow value rules. They are source findings, not measured production failures.

## Selected first chart slice

The table remains the default result view. The owner selects the chart view explicitly.

1. Add a **Chart** view beside the result table after a successful console query.
2. Offer bar, line, and scatter charts with explicit X and Y selectors.
3. Render only the returned query result. Do not request more data or run hidden aggregation queries.
4. Show the number of plotted rows and any result truncation notice.
5. Keep original cell values in the result model and tooltip text.
6. Refuse unsupported numeric values with a clear reason.
7. Treat null as a missing value. Do not convert null, an empty string, or false to zero.
8. Use result column positions to distinguish duplicate column names.
9. Load the chart renderer only when the owner selects the chart view.

The first slice does not need dashboards, chart persistence, image backgrounds, scheduled queries, or AI chart execution.

## Syne Charts boundary

The Syne Charts base revision is `c2a0a5f65dde33db9b9f30f3486d92777ba2422a` in `SyneHQ/charts.ts`.

The shared layer should accept result data and a chart configuration. It must not import app routes, credentials, auth, or database drivers.

A suitable adapter can accept `{ columns, rows, complete }` plus `{ type, xColumn, yColumn }`. Columns should use stable positional identifiers.

Its existing chart renderer uses ECharts through `echarts-for-react`. Its shared types import Prisma, and its root entry loads map modules.

A new standalone module now uses modular ECharts imports in `src/explorer`. OOS copies that module into its chart package.

No Outerbase source was copied into Syne Charts or OOS. The [chart record](chart-provenance.md) describes the new module and remaining validation.
