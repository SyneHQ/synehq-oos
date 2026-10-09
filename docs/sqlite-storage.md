# SQLite storage

SQLite connections use files in one managed server directory. Kelvo executes all SQLite queries. The web service only transfers and publishes file bytes.

Set `OOS_SQLITE_ROOT` to an absolute directory owned by the app user. Give the directory mode `0700`. Keep it separate from the app runtime, metadata, and key directories.

Enter a relative file path when you create a connection. The file must already exist and contain a valid SQLite header. Each file can contain at most 50 MiB.

Use closed database copies in this directory. Concurrent external writers are unsupported. Do not share the directory between installations or resolver processes.

The service rejects symbolic links, hard links, and files with WAL, journal, or SHM companions. Close the other application and create a consistent, checkpointed copy. Do not delete journal files manually.

For each operation, the service retains a private snapshot. Its size and SHA-256 digest identify the exact bytes that Kelvo receives. A write requires browser approval.

Before publication, the service checks the original file again. A changed source causes a conflict. An unchanged source receives the completed replacement through an atomic rename.

The service holds its source lock and metadata authorization lock during publication. The worker lease, grant, certificate, and owner session must remain valid.

A publication marker prevents a second publication after an uncertain result. Confirmed terminal receipts and closed worker custody permit snapshot cleanup. Unknown outcomes retain their evidence.

## Retained storage limit

The default retained snapshot limit is 512 MiB. Set `OOS_SQLITE_SNAPSHOT_MAX_BYTES` to change the limit in bytes. The value must be an integer of at least 100.

The limit includes retained snapshot and publication-marker file bytes. It excludes the managed source files and temporary replacement files. The service checks the limit before creating each retained file.

When the limit is reached, new snapshots fail without deleting unknown-operation evidence. Investigate those operations before releasing their evidence. Increasing the limit requires enough server storage.

Snapshot files contain database data. Protect the runtime directory and include retained evidence in your recovery procedure.
