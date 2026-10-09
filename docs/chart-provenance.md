# Chart source record

Source repository: [`SyneHQ/charts.ts`](https://github.com/SyneHQ/charts.ts).

Base revision: `c2a0a5f65dde33db9b9f30f3486d92777ba2422a`.

Working branch: `feature/oos-result-charts`.

## New standalone module

The new module lives in `src/explorer` in the Syne Charts working tree. SyneHQ OOS copies these files into `packages/charts/src`:

- `QueryResultChart.tsx`
- `result-data.ts`
- `types.ts`
- `index.ts`

The two source copies must remain identical. Apply source changes and formatting to both copies until a published package replaces the copy.

The module is new code. It does not copy the existing Cloud-oriented chart components or Outerbase Studio chart code.

## Why the legacy entry is separate

The inspected Syne Charts root entry loads map modules. Its shared type file imports `ChartType` from Prisma.

Its existing bar renderer uses `echarts-for-react` and a Next.js theme provider. Those dependencies do not belong in the standalone explorer module.

The new module imports ECharts bar, line, and scatter renderers directly. The host passes result rows and columns through public types.

## Runtime behavior

The explorer loads the chart module after the owner selects **Chart**. The result table remains the default view.

Chart settings do not execute queries. They use only the current completed result.

The module keeps original values for tooltips. It refuses unsafe integer magnitudes, rejects nonnumeric values, and labels approximate decimal plotting.

The chart renders at most 2,000 returned rows and reports omitted rows. Null values remain missing values.

Tooltips use canvas rich text. Database labels do not become HTML.

## License boundary

The new standalone module is SyneHQ-owned code under the MIT license in `packages/charts/LICENSE`. The project owner authorized its open-source distribution.

The broader inspected Syne Charts snapshot had no tracked root license. This new module's license does not change the license status of unrelated legacy files.

Apache ECharts 5.6.0 uses Apache-2.0. Retain its license and notices when distributing the application.

Outerbase Studio uses AGPL-3.0. No Outerbase source is included. The [research record](outerbase-chart-review.md) links the reviewed source and licenses.

## Validation

Seven focused data tests cover integer precision, decimals, null values, invalid numbers, scatter mapping, duplicate names, and the row cap.

All seven data tests passed on Linux with Node `24.21.0` and ECharts `5.6.0` on 2026-10-09.

The full Linux gate passed 58 unit tests, the direct TypeScript check, and the production application build.

The [validation record](validation.md) tracks browser checks and remaining release work. Source inspection and data tests do not verify the rendered chart.
