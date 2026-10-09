# Validation record

Record date: 9 October 2026.

The r4 container passed the six-engine live suite and the SQL WHERE checks using host networking. The current source gate passed 117 tests. The r4 default Docker bridge launcher and full SQLite workflow also passed.

Checks used an isolated Linux environment and disposable database fixtures. They did not use production customer connections.

A passed check applies only to its recorded source and scope. This document does not declare a release ready.

## Source and environment

| Item                                 | Recorded value                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| SyneHQ source used for UI extraction | `664256bb66f54a3dbec912efae6f7fdbdf44fc8b`                                                                          |
| Kelvo source baseline                | `d1c1f3840e460c7ec4515d02d194ce28ea5fc57c`. Final tested source commits remain to be recorded.                      |
| OOS source                           | Working source. A committed revision for the r4 image remains to be recorded.                                       |
| Node.js                              | `24.21.0`                                                                                                           |
| Go                                   | `1.26.8`, `linux/amd64`                                                                                             |
| Preview runtime                      | Static source build after r4, including custom dropdowns and isolated Monaco modules. No Next.js server.            |
| Local r4 container image             | `sha256:3c033dcbbf0f41715cd32b970aa9dc00659c348e122e9d98bfe71f75ac2c6d93`                                           |
| r4 network scope                     | Host networking for six engines and SQL WHERE. Default bridge networking for the launcher and full SQLite workflow. |

The six-engine run used these database fixtures:

| Engine      | Recorded version                                            |
| ----------- | ----------------------------------------------------------- |
| PostgreSQL  | `16.15`                                                     |
| MySQL       | `8.4.11`                                                    |
| ClickHouse  | `26.9.7.9`                                                  |
| MongoDB     | `8.0.32`                                                    |
| Oracle Free | `23.26.3`                                                   |
| SQLite      | Local fixture file. An engine version is not recorded here. |

These hashes identify the binaries from the earlier lean six-engine check. They do not identify the r4 image or a published release.

| Binary            | SHA-256                                                            |
| ----------------- | ------------------------------------------------------------------ |
| Kelvo             | `434c5beeba7f1263fdde616d97ff51c3d15cd92a33cbd7acbc0797bce84c0170` |
| Operation adapter | `b51dde6babf51e9bfd0f26ae63fc4c780a7a88392cd900d13ddaee1c13340780` |
| Sandbox           | `edf49e1acc28fe31d9a3a893aa7097dae62ef36360270dad4ab5b1dc51faa7c5` |

The lean runtime omits DuckDB. The six supported engines use their native adapters or the verified SQLite file adapter.

## Completed checks

| Check                        | Recorded result                  | Scope and limit                                                                                                                                  |
| ---------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Six-engine live suite        | Passed on r4                     | PostgreSQL, MySQL, ClickHouse, MongoDB, SQLite, and Oracle. The container used host networking.                                                  |
| Connection workflow          | Passed for all six engines       | Test a hidden draft, reject invalid promotion, save a completed test, repeat promotion, and test the saved connection.                           |
| Read workflow                | Passed for all six engines       | Inspect metadata, browse tables or collections, read precise values, and reject unsupported controls.                                            |
| Approved write workflow      | Passed for all six engines       | Reject missing approval and changed input. Insert one row or document, repeat the completed request, and delete the test data.                   |
| SQL WHERE workflows          | Passed for all five SQL engines  | WHERE expressions, exact values, pagination, and read-only guards passed on r4 with host networking.                                             |
| Current Node suite           | 117 passed, no failures or skips | Includes bounded HTTP drain, WHERE, MongoDB insertion, and three real-module Monaco asset checks.                                                |
| Direct TypeScript check      | Passed                           | Passed after the custom dropdowns and Monaco asset preparation change.                                                                           |
| Go helper tests              | 2 passed                         | Certificate preservation and existing RSA key pairs passed after the HTTP drain change.                                                          |
| MongoDB document tests       | 3 passed                         | Canonical Extended JSON, nested documents, escaped strings, and empty or invalid documents.                                                      |
| r4 container build           | Passed on Linux                  | The source preview now includes later UI changes from its separate static source build.                                                          |
| Bridge SQLite workflow       | Passed on r4                     | The actual default launcher, default storage paths, smoke checks, and full SQLite workflow passed.                                               |
| SQL WHERE browser check      | Passed                           | The source preview serves the r4 static files. The WHERE input and filtered result were checked in the browser.                                  |
| MongoDB browser workflows    | Passed the recorded checks       | Document copy, collapse controls, a native console read, and its displayed result.                                                               |
| MongoDB Add document browser | Passed the recorded workflow     | Exact target and command review, one approval, success notice, collection refresh, ObjectId, exact large integer and decimal, and nested fields. |

The current source passed Prettier. Final documentation changes receive a separate formatting check.

The MongoDB browser check preserved `9007199254740993` and `1234567890123456.12345678` without rounding. Its result is shown in `assets/mongodb-insert-preview.jpg`.

The approval footer fix passed at 1280 × 720 pixels. The document body scrolls while Cancel and Approve remain visible. The layout-only review was cancelled without a database write.

Custom selector checks passed for sorting, query schema, query access mode, relationship schema, chart type, and chart axes. Arrow keys, Enter, Escape, and typeahead passed. SQL and JSON editors loaded after the module isolation fix.

## Six-engine coverage

The live suite is `tests/live-supported-databases.ts`. The current container evidence is `container-six-engine-where-r4.log`. The earlier source-runtime evidence is `six-engine-live-r6-final.log`.

The suite checks these boundaries:

- Network database connections use verified TLS. SQLite uses a verified file snapshot.
- Test drafts remain hidden from saved connections and cannot run normal queries before promotion.
- PostgreSQL, MySQL, SQLite, and Oracle expose the fixture primary keys and foreign keys.
- ClickHouse and MongoDB metadata do not invent relational keys or relationships.
- MongoDB exposes one JSON document column. Results preserve ObjectIds, integer widths, decimals, and `null` through canonical Extended JSON.
- SQL results preserve the large fixture integer, decimal text, timestamp fraction, and `NULL` value.
- SQL table sorting passes. PostgreSQL, MySQL, ClickHouse, SQLite, and Oracle pass WHERE-expression, precision, pagination, and read-only guard checks.
- The API rejects SQL WHERE expressions and table sorting for MongoDB. MongoDB keeps its native document pagination.
- Grid row editing remains limited to PostgreSQL and MySQL. The API rejects that path for the other four engines.
- Approved SQL or native commands insert and delete exact fixture values. A repeated completed insert does not create another row.

The automated six-engine suite deleted its test rows and documents. The separate MongoDB browser test document was removed by its exact ObjectId and name. Both original fixture documents remain. These checks do not qualify backup, restore, or general data cleanup procedures.

## Earlier extraction checks

The earlier extraction gate passed 58 Node tests, TypeScript, formatting, and the production web build at 05:30:19 UTC on 9 October 2026.

That gate checked OOS commit `ee2eeaf82e47cc17b5eda3e183ee09bf925c76b6`. It does not replace the final gate for the current static runtime.

The earlier PostgreSQL and MySQL live checks covered row insert, update, delete, stale-row conflicts, changed input, and duplicate reconciliation.

Earlier browser checks covered these workflows:

- Exact values, cell editing, cancelled review, discarded changes, added rows, and deletion with the original primary key.
- Table structure, declared foreign keys, and switching between public and archive schemas.
- SQL selection, the Command+Enter shortcut, and bar, line, and scatter charts.
- Native copy, paste, and cut. Paste preserved the decimal text `81.12500000` without executing a write.
- Copy inside an active numeric input, with table search open, and after an empty result remounted the grid.
- Navigation with a staged new row. The automation did not expose the browser's leave-page dialog.

The earlier focused auth and admission suite passed 26 tests. The live lost-client-poll recovery check also passed.

Those checks covered durable admission rejection, uncertain rejection evidence, read retry limits, and stored rejection responses for expired duplicate requests.

The standalone Syne Charts module passed seven tests and its formatting check. At that check, its four TypeScript files matched the OOS copy.

## Runtime limits

The configured query result cap is 4 MiB. The metadata result cap is 1 MiB.

Kelvo has a 1 GiB result store budget. It retains up to 512 operations for one hour.

Result-producing operations reserve their maximum result size before database access. Capacity checks prevent new reservations when the store is full.

The container profile permits one operation at a time and sets a 30-second query timeout. See the [container guide](container.md) for its resource limits.

These are configuration and admission limits. They are not throughput measurements or measured minimum requirements.

The Linux build checks used a 4 GiB memory limit and a 200% CPU quota. Those limits do not describe idle runtime memory.

A renewed quiet CPU sample remains pending.

## Remaining checks

| Area                      | Remaining evidence                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Final source record       | Record immutable source and image revisions for a versioned release.                                                                  |
| Image release record      | Record image size, native binary hashes, and source revisions for a versioned release. The local r4 image identity is recorded above. |
| Container lifecycle       | Complete the final host and lifecycle qualification, including reboot delegation, bounded shutdown, and restart.                      |
| Quiet runtime measurement | Record a renewed quiet CPU sample for the whole service slice.                                                                        |
| Browser write recovery    | Check partial changes, conflicts, interrupted responses, unknown outcomes, and controls that prevent unsafe retries.                  |
| Owner and AI flows        | Record final owner setup, login, recovery, and optional AI workflow results.                                                          |

Plain tabular clipboard text cannot distinguish SQL `NULL` from an empty string. Copy as JSON preserves this distinction.

Clipboard acceptance used the Codex in-app browser on macOS. A broader Chrome, Firefox, and Safari matrix remains separate work.

## Known query issue

A PostgreSQL literal-only query returned `SOURCE_FAILED` in the source preview:

```sql
SELECT 'Northwind' AS name, 80.25 AS balance
UNION ALL SELECT 'Acme', 120.50
```

`SELECT name, balance FROM public.accounts LIMIT 2` passed in the same session. The cause of the literal-query failure is not established. Track it before release.

## Maintenance qualification

Maintenance procedures remain unqualified. Complete these checks on a separate installation:

1. Create a coordinated backup of app metadata, keys, and configuration. Restore it on a separate installation.
2. Rotate encryption keys. Test recovery from an interrupted rotation.
3. Renew TLS certificates. Check database access after renewal.
4. Upgrade the installation. Test the documented recovery path.

Use the [operations guide](operations.md) for these procedures. A running preview does not prove that maintenance works.

## Release work

No public release is available. Published release images and a versioned release record remain incomplete.

The working source includes the container launcher and the local r4 image. Default bridge checks passed. A container rebuild with the later dropdown and editor changes remains pending.

Record the tested source revision with each release. Keep command outputs and browser results with that revision. The public repository is a development source distribution.

## Cloud adoption

SyneHQ Cloud does not yet consume these packages. Cloud adoption requires its own host adapter and workflow checks.

Cloud must retain its authentication, team scope, audit records, and write approvals. Read the [component boundary](component-sharing.md) before integration.

## Evidence files

The Linux evidence directory is `/home/syenuser/synehq-oos-build-20261009/evidence`.

| File                                                           | Recorded result                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `six-engine-live-r6-final.log`                                 | All six engines passed. The service exited with status `0`.                                  |
| `container-final-image-r4.log`                                 | Built the local r4 image identified above.                                                   |
| `container-six-engine-where-r4.log`                            | All six live workflows and all five SQL WHERE cases passed with host networking.             |
| `container-bridge-sqlite-r3.log`                               | The full SQLite workflow passed on r3 with bridge networking and corrected storage settings. |
| `activate-feature-preview-r4.log`                              | The source preview serves static dashboard files extracted from r4.                          |
| `mongodb-ui-tests-r1.log`                                      | All three document tests passed.                                                             |
| `final-static-http-drain-20261009T080326Z-go.log`              | Two Go helper tests passed after the HTTP drain change.                                      |
| `final-static-mongo-insert-20261009T081910Z-node.log`          | All 114 tests passed.                                                                        |
| `final-static-mongo-insert-20261009T081910Z-types.log`         | Direct TypeScript check passed.                                                              |
| `final-static-mongo-insert-20261009T081910Z-prettier.log`      | Only the validation document needed formatting.                                              |
| `final-static-mongo-insert-copy-20261009T082311Z-types.log`    | Direct TypeScript passed after the final success-message change.                             |
| `final-static-mongo-insert-copy-20261009T082311Z-prettier.log` | Final MongoDB UI files passed scoped formatting.                                             |

Later evidence includes:

- `dropdowns-tests-r2.log`: all 117 tests passed.
- `dropdowns-types-r2.log`: TypeScript passed.
- `dropdowns-build-r2.log`: the static production build passed.
- `activate-dropdowns-preview-r1.log`: the preview uses the new static build.
- `container-bridge-r4-final-smoke.log` and `container-bridge-r4-final-sqlite.log`: default bridge checks passed.
- `container-bridge-r4-final-lifecycle.log`: clean exit and no OOM.
- `mongo-ui-cleanup.log`: the exact browser-test document was removed.
- `assets/mongodb-approval-preview.jpg`: the fixed approval footer at 720 pixels.

The Kelvo idle-CPU candidate passed focused lifecycle and scheduler tests. It is not part of the pinned r4 image. Comparative runtime measurements remain pending.

GitHub runs the repository checks on each push. See the [check workflow](https://github.com/SyneHQ/synehq-oos/actions/workflows/check.yml).

Keep credentials, setup tokens, environment files, cookies, and private keys out of the evidence record.
