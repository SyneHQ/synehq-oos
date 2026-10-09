import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

type Migration = {
  id: string;
  checksum: string;
  migration_name: string;
  finished_at: string | null;
  rolled_back_at: string | null;
};

type MigrationFile = { name: string; sql: string; checksum: string };

function readMigrations(migrationDirectory: string): MigrationFile[] {
  const names = readdirSync(migrationDirectory)
    .filter((name) => /^\d{12}_[a-z0-9_]+$/.test(name))
    .sort();
  if (!names.length) throw new Error("The image has no metadata migrations.");
  return names.map((name) => {
    const file = join(migrationDirectory, name, "migration.sql");
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024)
      throw new Error("A metadata migration file is invalid.");
    const sql = readFileSync(file, "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  });
}

function pendingMigrations(files: MigrationFile[], existing: Migration[]): MigrationFile[] {
  const names = new Set(files.map((file) => file.name));
  if (
    existing.some(
      (row) => !row.rolled_back_at && (!row.finished_at || !names.has(row.migration_name)),
    )
  )
    throw new Error(
      "Migration history is incomplete or newer than this image. Restore or use the matching image.",
    );
  return files.filter((file) => {
    const applied = existing.filter(
      (row) => row.migration_name === file.name && !row.rolled_back_at,
    );
    if (applied.length > 1 || (applied[0] && applied[0].checksum !== file.checksum))
      throw new Error("An applied metadata migration changed. Use the matching source.");
    return applied.length === 0;
  });
}

/** Check upgrade safety without creating or changing the metadata database. */
export function assertMetadataUpgradeReady(
  databasePath: string,
  migrationDirectory: string,
  adapterChanged: boolean,
): void {
  const files = readMigrations(migrationDirectory);
  if (!existsSync(databasePath)) return;
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const historyExists = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'")
      .get();
    const existing = historyExists
      ? (db.prepare("SELECT * FROM _prisma_migrations").all() as Migration[])
      : [];
    const pending = pendingMigrations(files, existing);
    // The same version must reopen so it can recover unfinished operations.
    if (!adapterChanged && pending.length === 0) return;
    const executionExists = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'Execution'")
      .get();
    if (!executionExists) return;
    const unfinished = db
      .prepare(
        `SELECT 1 FROM "Execution"
         WHERE status IN ('queued', 'running')
            OR (claim IS NOT NULL AND custodyCompletedAt IS NULL)
            OR (status = 'unknown' AND dispatchedAt IS NOT NULL AND custodyCompletedAt IS NULL)
         LIMIT 1`,
      )
      .get();
    if (unfinished)
      throw new Error("Resolve unfinished operations with the previous image before upgrading.");
  } finally {
    db.close();
  }
}

/** Apply the reviewed SQLite migrations before any app listener opens. */
export function migrateMetadata(databasePath: string, migrationDirectory: string): void {
  const files = readMigrations(migrationDirectory);
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = ON;");
    db.exec(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, finished_at DATETIME,
      migration_name TEXT NOT NULL, logs TEXT, rolled_back_at DATETIME,
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, applied_steps_count INTEGER NOT NULL DEFAULT 0
    )`);
    db.exec("BEGIN IMMEDIATE");
    try {
      const existing = db.prepare("SELECT * FROM _prisma_migrations").all() as Migration[];
      for (const { name, sql, checksum } of pendingMigrations(files, existing)) {
        db.exec(sql);
        db.prepare(
          "INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1)",
        ).run(randomUUID(), checksum, name);
      }
      if (db.prepare("PRAGMA foreign_key_check").all().length)
        throw new Error("Metadata foreign key validation failed.");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }
}
