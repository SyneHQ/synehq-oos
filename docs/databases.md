# Supported databases

SyneHQ OOS supports six database engines. Each connection belongs to the installation owner.

| Database     | Connection                             | Console              | Table or collection browser                                                     | Inline row changes      |
| ------------ | -------------------------------------- | -------------------- | ------------------------------------------------------------------------------- | ----------------------- |
| ClickHouse   | HTTPS, port `8443` by default          | SQL                  | Read rows and sort. Use SQL for value filters.                                  | No                      |
| MySQL        | Verified TLS, port `3306`              | SQL                  | Read, filter, sort, and page through rows.                                      | Yes, with a primary key |
| PostgreSQL   | Verified TLS, port `5432`              | SQL                  | Read, filter, sort, and page through rows.                                      | Yes, with a primary key |
| MongoDB      | Verified TLS, port `27017`             | Native JSON commands | Read documents as Extended JSON. Use the console to filter, sort, or aggregate. | No                      |
| Local SQLite | Existing file in the managed directory | SQL                  | Read, filter, sort, and page through rows.                                      | No                      |
| Oracle       | TCPS, port `2484`                      | SQL                  | Read, filter, sort, and page through rows.                                      | No                      |

SQL writes and MongoDB write commands require a write-enabled connection and approval of the exact operation. Database permissions still apply.

PostgreSQL, MySQL, SQLite, and Oracle expose declared primary keys and foreign keys. Their relationship diagrams use those declarations. MongoDB and ClickHouse do not show a relationship diagram.

## Add a connection

1. Select **Add connection**.
2. Choose a database.
3. Enter a connection name and the database details.
4. If the server uses a private certificate authority, open **Advanced** and add its CA certificate.
5. Select **Test connection**. Correct any errors.
6. Select **Save connection** after the test passes.

You can also select **Test and save** to complete the last two steps together. The app saves only a successful test of the same configuration. An edit requires a new test.

Test drafts expire after 15 minutes. They do not appear in the saved connection list and cannot run queries.

Network connections verify the server certificate and hostname. The app does not offer an option to skip certificate verification.

## ClickHouse

Use the HTTPS port. The native TCP port, often `9440`, is not supported by this connector.

The table browser can sort rows. Value filters use the SQL console because this Kelvo adapter does not bind ClickHouse query parameters.

ClickHouse writes use autocommit. They do not provide a transaction rollback. Each write still requires an exact approval.

## MySQL

The write console uses a required transaction in the selected database. Use an unqualified table name, such as `UPDATE accounts`, for these writes. Database-qualified write targets are rejected. Reads can use qualified names.

## MongoDB

Enter the database to explore and the authentication database. The authentication database defaults to `admin`.

The console accepts one JSON command. It does not execute shell scripts or arbitrary `runCommand` calls.

```json
{
  "command": "find",
  "collection": "accounts",
  "filter": { "name": "Northwind" },
  "sort": { "name": 1 }
}
```

Read commands are `find`, `find_one`, `aggregate`, `count`, and `list_indexes`. Write commands include inserts, updates, deletes, and collection or index changes.

Use canonical Extended JSON for ObjectIds, dates, large integers, decimals, and floating-point values. This keeps the original type and value.

```json
{
  "command": "find",
  "collection": "accounts",
  "filter": { "account_id": { "$numberLong": "9007199254740993" } }
}
```

An aggregation pipeline that writes data is not a read command. Kelvo rejects it on the read path.

## Local SQLite

Set `OOS_SQLITE_ROOT` to a private directory owned by the app service account. Place the database file inside that directory.

Enter a relative path, such as `reports/analytics.sqlite`. The browser does not upload a file. The database target is `main`. A database file can be at most 50 MiB.

Use an existing, closed SQLite database. Active WAL, SHM, and journal files are rejected. Symbolic links, hard links, parent path segments, and app metadata or key files are rejected.

The managed directory belongs to SyneHQ OOS. Do not let another application write these files while OOS uses them.

Node handles file bytes and verifies their hashes. Kelvo opens the snapshot and executes SQL. After an approved write, the app checks the original file and replaces it with the completed result.

The final comparison detects changes before replacement. It does not lock out an external SQLite writer. Shared live SQLite files require a different storage design.

Retained snapshots have a 512 MiB default budget. When the budget is full, new snapshots stop. Unknown-operation evidence remains available. See [SQLite storage](sqlite-storage.md) for configuration and recovery limits.

## Oracle

Use a TCPS listener and a service name, such as `FREEPDB1`. A SID is not accepted as a service name.

The schema selector controls the query schema. Oracle normally stores unquoted identifiers in uppercase.

## Limits

All results have configured row and byte limits. The console reports an interrupted or unknown outcome and does not repeat a write automatically.

The connection form accepts individual fields. Connection URI parsing, MongoDB SRV discovery, SSH tunnels, and browser SQLite uploads are not included.

See the [validation record](validation.md) for tested database versions and workflows. See the [logo record](database-logo-assets.json) for the PNG asset sources.
