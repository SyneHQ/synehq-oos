# Shared explorer components

The reusable UI must work in both a personal installation and SyneHQ Cloud. The host owns auth, database access, and approvals.

## Package boundary

| Package                          | Owns                                                                           | Does not own                                         |
| -------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `@synehq-oos/ui`                 | Probe controls, focus behavior, visual tokens                                  | Sessions, API requests, database access              |
| `@synehq-oos/explorer`           | SQL editing, staged row changes, result grid, schema tree, relationship layout | Query execution, connection credentials, Cloud state |
| `@synehq-oos/explorer-contracts` | Public schema, result, operation, and target types                             | A storage model or deployment                        |
| `@synehq-oos/charts`             | Bar, line, and scatter views for returned query rows                           | Query execution, Cloud types, persistence            |
| `@synehq-oos/kelvo-client`       | Server transport, bounded results, operation status                            | Browser rendering or owner authentication            |

The web app imports the packages from this workspace. No package is published yet.

## Host responsibilities

The host must authenticate each request and check access to its target. It must perform all database operations through Kelvo.

The SQL editor returns text to a host callback. The editor cannot run the SQL itself.

The database grid receives column metadata and row arrays. It preserves integer and decimal strings without numeric conversion.

The grid maps columns by position. Duplicate column names remain separate in read results. Duplicate names disable row changes.

The grid stages edits, additions, and deletions. The review callback receives original row values and proposed values. It returns `true` only after every approved change succeeds.

The grid locks during review. A cancelled or failed review retains staged changes. The host must resolve partial or unknown outcomes before permitting another attempt.

The host must block target, filter, sort, and page changes while staged changes exist. The host can change `resetKey` after explicit discard or resolved execution.

Pagination is optional. Enable the total-row footer only when the API returns an exact count. A page result does not establish a total count.

The schema tree and diagram receive normalized tables. Each table identity includes its database, schema, and name.

The diagram uses declared foreign keys. It must not infer a relationship from a similar column name.

The personal host owns write approvals. Each approval binds the exact SQL, connection revision, database, schema, and operation.

AI can create SQL text. AI cannot execute a query, grant approval, or bypass connection permissions.

## Cloud adoption

Cloud adoption must use an adapter at its existing API boundary.

1. Map Cloud schema and result types to the public contracts.
2. Pass approved query actions into host callbacks.
3. Keep Cloud sessions and team checks in the Cloud host.
4. Import shared style tokens once in the host stylesheet. Add `gridColors` to the host Tailwind theme.
5. Wrap the page in the shared UI `TooltipProvider`. Render `ExplorerNotifications` if the host has no Sonner notification renderer.
6. Test the existing Cloud approval and query workflows.

Do not import the personal app into Cloud. Do not copy Cloud route handlers into the shared UI.

A package update must preserve both hosts' contracts. A breaking change requires a version change and migration notes.

## Extraction provenance

Source: private `SyneHQ/app.ts` repository.

Reviewed revision: `664256bb66f54a3dbec912efae6f7fdbdf44fc8b`.

The Probe controls and tokens are copied source. The schema tree and Dagre layout adapt reviewed source to public contracts.

`DatabaseGrid` adapts the real Cloud `ExplorerTable`, `ExplorerDataGrid`, `useDataGrid`, cell renderers, and reducer. It retains selection, paste, keyboard navigation, and staged row changes.

`CodeEditor` adapts `ReviewQueryEditor` and the main Monaco editor helpers. It retains editor options, selection execution, snippets, and schema completion.

The package excludes Cloud stores, inline AI requests, file upload, Python execution, and customer database drivers. The host supplies all query actions.

The [extraction record](extraction-ui.md) lists source paths, Git blobs, source hashes, and adaptations.

## License status

The project owner authorized the extraction and open-source distribution of the SyneHQ-owned components. The repository license is Apache-2.0.

The standalone chart module uses MIT. Retain its license and all required third-party notices.

Outerbase source is not part of these packages. The [chart record](chart-provenance.md) identifies the new standalone Syne Charts module and its ECharts dependency.

## Verification boundary

The grid and Monaco extraction passed Linux source checks and the recorded browser workflows. See the [validation record](validation.md) for revisions, results, and limits.

Browser checks, clean installation, database workflows, and Cloud adoption need their own evidence. Type checking alone does not verify them.
