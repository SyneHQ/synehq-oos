# Connection form source

The OOS connection flow adapts the main SyneHQ connection form.
The source repository is `SyneHQ/app.ts`.
The inspected source revision is `664256bb66f54a3dbec912efae6f7fdbdf44fc8b`.
The source checkout remains read-only.

All paths below begin with `src/app/data-sources/connections/components/connection-form/`.

| Source path                       | Source Git blob                            | Reused behavior                                    |
| --------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| `ConnectorPicker.tsx`             | `abc755b6feff619cd4fc62678dd9e96722b674f1` | Database cards before configuration                |
| `ConnectionConfiguration.tsx`     | `84c41ef4b248016f4ee64df56145fc2120cb8fca` | Selected database and configuration step           |
| `ConnectionFields.tsx`            | `207643749cd3a891f52dcd553dc17c59273aa8a0` | Fields defined by the selected connector           |
| `hooks/use-connection-actions.ts` | `20d071b40a452a08881132877b81f0f842ecd777` | Test before save and a synchronous submission lock |
| `model.ts`                        | `535a72a99c6646af9ee0076964d1463dbe833361` | Shared connector and field types                   |
| `catalog.tsx`                     | `29a2dcf317ba439a1420960eec266820df40b59e` | Connector labels, defaults, and fields             |

The OOS implementation uses these files:

- `apps/web/src/app/components/database-catalog.ts` defines the six engines and their fields.
- `apps/web/src/app/components/connection-form.tsx` renders the picker and configuration form.
- `apps/web/src/app/components/connection-test.ts` waits for a terminal test result.
- `apps/web/src/app/components/database-icon.tsx` renders the shared PNG assets.

The form reuses the extracted Probe `Button`, `Field`, and `Input` components.
The [UI extraction record](extraction-ui.md) records their source and license.

The OOS form adapts the flow to an installation with one owner.
It excludes Cloud teams, tunnels, uploads, OAuth, and business connectors.
It requires verified TLS for network databases.
SQLite uses an existing file inside the configured data directory.

## Test and save

1. Validate the current fields.
2. Send those fields to `POST /api/connections/test`.
3. Poll the returned operation while its status is `queued` or `running`.
4. Require a `succeeded` result for that exact operation.
5. Send only the draft ID and operation ID to `POST /api/connections`.

The server promotes the encrypted draft that passed the test.
The browser does not submit a second credential payload during save.
An HTTP 202 response does not mean the database connection succeeded.
A failed, cancelled, expired, or unknown test cannot save a connection.

The form blocks duplicate submissions while a test or save runs.
Unmounting the form aborts its browser requests.
Test connection reports success without saving the draft.
After a successful test, Save connection promotes that exact draft.
Any field, engine, or write-access change clears the successful test.
The test also expires after the server's stated deadline.
Without a current successful test, Test and save runs the full sequence.

An attempted save retains only its draft ID and operation ID in the browser tab.
If the response is lost, the form checks the saved connection list for that exact ID.
It can repeat the same save request when the list contains no match.
It does not match by label or create a second draft while the save remains uncertain.
This recovery remains available after the original test expires.

## Engine behavior

| Engine     | Connection fields                                                       | Console              | Browse controls                                 |
| ---------- | ----------------------------------------------------------------------- | -------------------- | ----------------------------------------------- |
| ClickHouse | Host, HTTPS port, database, credentials, optional CA                    | SQL                  | Sort rows. Use SQL for value filters.           |
| MySQL      | Host, port, database, credentials, optional CA                          | SQL                  | Filter and sort rows                            |
| PostgreSQL | Host, port, database, credentials, optional CA                          | SQL                  | Filter and sort rows                            |
| MongoDB    | Host, port, database, credentials, authentication database, optional CA | Native JSON commands | Page documents. Use commands to filter or sort. |
| SQLite     | Relative file path                                                      | SQL                  | Filter and sort rows                            |
| Oracle     | Host, TCPS port, service name, credentials, optional CA                 | SQL                  | Filter and sort rows                            |

MongoDB uses a JSON editor and sends the original command text to the API.
The editor does not convert MongoDB commands to SQL.
Extended JSON preserves exact BSON values.
MongoDB and SQLite send no query schema, even when metadata supplies a database label.

Only PostgreSQL and MySQL expose row editing in the grid.
All six engines can expose approved console writes when the connection allows writes.
Every write requires a review of the exact text and target.
An unknown write outcome remains unknown until the server supplies a final result.

These are implementation details. The [validation record](validation.md) records the checks that actually ran.
