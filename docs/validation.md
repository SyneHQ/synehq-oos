# Validation record

Record date: 9 October 2026.

This document records completed checks and remaining work. It does not declare a release ready.

Checks used an isolated Linux environment and disposable database fixtures. They did not use production customer connections.

A passed check applies to the source and scope listed below. The browser preview uses a production web build.

## Source and environment

| Item                              | Recorded value                             |
| --------------------------------- | ------------------------------------------ |
| SyneHQ source used for extraction | `664256bb66f54a3dbec912efae6f7fdbdf44fc8b` |
| Kelvo source                      | `e06ece832b3fd20b3c2d80666f1683fadcd4c1cc` |
| OOS source revision               | `ee2eeaf82e47cc17b5eda3e183ee09bf925c76b6` |
| Node.js                           | `24.21.0`                                  |
| Go                                | `1.26.8`, `linux/amd64`                    |
| PostgreSQL fixture                | `16.15`                                    |
| MySQL fixture                     | `8.4.11`                                   |

These binary hashes were checked against the running Linux preview on 9 October 2026. They identify the tested binaries, not a published release.

| Binary            | SHA-256                                                            |
| ----------------- | ------------------------------------------------------------------ |
| Kelvo             | `08a26afe888814e6f427a0d09e307eb1cc6d4a26f6f5444dfd648b5fa8b944a9` |
| Operation adapter | `e3d256f366bec80e649465d27579546712b77906f654ea76042b4e538f5d5d49` |
| Sandbox           | `edf49e1acc28fe31d9a3a893aa7097dae62ef36360270dad4ab5b1dc51faa7c5` |

## Completed checks

| Check                      | Recorded result                   | Scope and limit                                                                                                                              |
| -------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests                 | 58 passed                         | The complete Linux unit suite, including six native clipboard regression tests.                                                              |
| TypeScript                 | Passed                            | The direct TypeScript compiler check passed.                                                                                                 |
| Formatting                 | Passed                            | Prettier passed.                                                                                                                             |
| Production web build       | Passed on Linux                   | Next.js `16.3.4`. The grid lifecycle, native clipboard, and admission changes are included.                                                  |
| Live explorer suite        | Passed for both database fixtures | Verified TLS, `SELECT 1`, Arrow results, schemas, primary keys, foreign keys, exact values, browsing, equality filters, and sorting.         |
| Live write approval checks | Passed for both database fixtures | Missing approval rejection, tamper rejection, approved SQL execution, and duplicate-request reconciliation passed within the explorer suite. |
| Live row lifecycle         | Passed for both database fixtures | Insert, update, delete, stale-row conflict, tamper rejection, and duplicate reconciliation. Test rows were removed.                          |
| Browser row workflows      | Passed the recorded checks        | Exact values, cell editing, cancelled review, discarded changes, added rows, and deletion with the original primary key.                     |
| Browser schema workflows   | Passed the recorded checks        | Table structure, declared foreign keys, and switching between public and archive schemas.                                                    |

The production build used a 4 GiB memory limit and a 200% CPU quota. These limits are not measured minimum requirements.

The live explorer suite is `tests/live-explorer.ts`. Keep the final invocation and output with the release evidence.

Fixture metadata cleanup was audited. That audit does not qualify backup, restore, or general data cleanup procedures.

## Runtime limits

The configured query result cap is 4 MiB. The metadata result cap is 1 MiB.

Kelvo has a 1 GiB result store budget. It retains up to 512 operations for one hour.

Result-producing operations reserve their maximum result size before database access. Capacity checks prevent new reservations when the store is full.

These are configuration and admission limits. They are not throughput or capacity benchmark results.

## Additional recovery and browser checks

- The focused auth and admission suite passed all 26 tests.
- The live lost-client-poll recovery check passed.
- A validated Kelvo admission rejection becomes a durable failed operation. It releases the local admission slot.
- Malformed or mismatched rejection evidence remains uncertain. An unknown outcome does not cause automatic resubmission.
- Read and metadata requests can make at most two fresh attempts after a validated rejection. Writes never retry automatically.
- Expired duplicate start and cancel requests return the stored terminal rejection without a new dispatch.
- Migration 003 stores the admission rejection evidence. It was applied to the preview metadata database.
- Browser SQL selection and the Command+Enter shortcut returned the expected rows.
- Bar, line, and scatter charts rendered the completed result. Chart type changes kept the same result.
- Browser navigation attempts retained a staged new row. The automation did not expose the browser's leave-page dialog.
- Native Command+C copied one selected row as five data cells. The selection gutter was excluded.
- Native Command+V staged the exact decimal text `81.12500000`. It did not execute a write.
- Native Command+X copied the selected data cells and marked them for a later paste.
- Copy inside an active numeric input preserved normal text editing.
- Copy worked with table search open and after an empty filtered result remounted the grid.
- A later copy cleared the cut marker. All staged changes were discarded. No browser write was executed during these final UI checks.

## Remaining workflow checks

| Area                   | Remaining evidence                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Browser write recovery | Check partial changes, conflicts, interrupted responses, unknown outcomes, and controls that prevent unsafe retries. |
| Owner and AI flows     | Record final owner setup, login, recovery, and optional AI workflow results.                                         |

Plain tabular clipboard text cannot distinguish SQL `NULL` from an empty string. Copy as JSON preserves this distinction.

Clipboard acceptance used the Codex in-app browser on macOS. A broader Chrome, Firefox, and Safari matrix remains separate work.

## Maintenance qualification

Maintenance procedures remain unqualified. Complete these checks on a separate installation:

1. Create a coordinated backup of app metadata, keys, and configuration. Restore it on a separate installation.
2. Rotate encryption keys. Test recovery from an interrupted rotation.
3. Renew TLS certificates. Check database access after renewal.
4. Upgrade the source installation. Test the documented recovery path.

Use the [operations guide](operations.md) for these procedures. A running preview does not prove that maintenance works.

## Release work

No public release is available. The public installer, release images, and versioned release record remain incomplete.

Record the tested source revision with each release. Keep command outputs and browser results with that revision. The public repository is a development source distribution.

## Cloud adoption

SyneHQ Cloud does not yet consume these packages. Cloud adoption requires its own host adapter and workflow checks.

Cloud must retain its authentication, team scope, audit records, and write approvals. Read the [component boundary](component-sharing.md) before integration.

## Final evidence

The complete Linux gate ran these commands in order:

```sh
npm run format
npm test
node node_modules/typescript/lib/tsc.js --noEmit
npm run format:check
npm run build
```

The standalone Syne Charts module passed seven tests and its Prettier check. Its four TypeScript files match the OOS copy byte for byte.

The final Linux gate passed at 05:30:19 UTC on 9 October 2026. All 58 unit tests, TypeScript, Prettier, and the production build passed. Browser clipboard checks then passed against that production build.

Tested code revision: `ee2eeaf82e47cc17b5eda3e183ee09bf925c76b6`. Later documentation-only commits do not change the checked code.

GitHub runs the repository checks on each push. See the [check workflow](https://github.com/SyneHQ/synehq-oos/actions/workflows/check.yml).

Keep credentials, setup tokens, environment files, cookies, and private keys out of the evidence record.
