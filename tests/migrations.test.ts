import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { assertMetadataUpgradeReady, migrateMetadata } from "../deploy/migrate";

test("bundled migrations initialize once and preserve an existing installation", () => {
  const root = mkdtempSync(join(tmpdir(), "oos-migrate-"));
  try {
    const path = join(root, "metadata.sqlite");
    const migrations = resolve("apps/web/prisma/migrations");
    migrateMetadata(path, migrations);
    const db = new DatabaseSync(path);
    const before = db
      .prepare("SELECT checksum FROM _prisma_migrations ORDER BY migration_name")
      .all();
    assert.equal(before.length, 4);
    db.close();
    migrateMetadata(path, migrations);
    const after = new DatabaseSync(path);
    assert.deepEqual(
      after.prepare("SELECT checksum FROM _prisma_migrations ORDER BY migration_name").all(),
      before,
    );
    assert.ok(
      after
        .prepare("PRAGMA table_info(Connection)")
        .all()
        .some((row) => row.name === "filePath"),
    );
    after.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("migration errors roll back all schema changes and changed history is rejected", () => {
  const root = mkdtempSync(join(tmpdir(), "oos-migrate-"));
  try {
    const dir = join(root, "migrations"),
      name = "202610090001_fixture";
    mkdirSync(join(dir, name), { recursive: true });
    const file = join(dir, name, "migration.sql"),
      path = join(root, "metadata.sqlite");
    writeFileSync(file, "CREATE TABLE sample (id INTEGER); INVALID SQL;");
    assert.throws(() => migrateMetadata(path, dir));
    let db = new DatabaseSync(path);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='sample'").all().length, 0);
    db.close();
    writeFileSync(file, "CREATE TABLE sample (id INTEGER);");
    migrateMetadata(path, dir);
    writeFileSync(file, readFileSync(file, "utf8") + "\n-- changed\n");
    const beforePreflight = readFileSync(path);
    assert.throws(
      () => assertMetadataUpgradeReady(path, dir, false),
      /applied metadata migration changed/,
    );
    assert.deepEqual(readFileSync(path), beforePreflight);
    assert.throws(() => migrateMetadata(path, dir), /applied metadata migration changed/);
    db = new DatabaseSync(path);
    assert.equal(db.prepare("SELECT count(*) AS n FROM _prisma_migrations").get()?.n, 1);
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function withOperationMetadata(run: (path: string, migrations: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "oos-upgrade-"));
  try {
    const path = join(root, "metadata.sqlite");
    const migrations = join(root, "migrations");
    const initial = join(migrations, "202610090001_fixture");
    mkdirSync(initial, { recursive: true });
    writeFileSync(
      join(initial, "migration.sql"),
      `CREATE TABLE "Execution" (
        operationId TEXT PRIMARY KEY, status TEXT NOT NULL, claim TEXT,
        dispatchedAt DATETIME, custodyCompletedAt DATETIME
      );`,
    );
    assertMetadataUpgradeReady(path, migrations, false);
    assert.equal(existsSync(path), false, "The preflight must not create metadata.");
    migrateMetadata(path, migrations);
    run(path, migrations);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("same-version restart permits recovery, while an adapter upgrade blocks unfinished operations", () => {
  for (const [status, claim, dispatchedAt] of [
    ["queued", null, null],
    ["running", null, null],
    ["completed", "worker-claim", null],
    ["unknown", null, "2026-10-09 00:00:00"],
  ]) {
    withOperationMetadata((path, migrations) => {
      const db = new DatabaseSync(path);
      db.prepare(
        "INSERT INTO Execution (operationId, status, claim, dispatchedAt) VALUES ('operation', ?, ?, ?)",
      ).run(status, claim, dispatchedAt);
      db.close();
      const before = readFileSync(path);
      assert.doesNotThrow(() => assertMetadataUpgradeReady(path, migrations, false));
      assert.throws(
        () => assertMetadataUpgradeReady(path, migrations, true),
        /Resolve unfinished operations/,
      );
      assert.deepEqual(readFileSync(path), before);
    });
  }
});

test("a metadata migration blocks unknown dispatched work with no claim before any metadata write", () => {
  withOperationMetadata((path, migrations) => {
    const db = new DatabaseSync(path);
    db.exec(
      `INSERT INTO Execution (operationId, status, claim, dispatchedAt)
       VALUES ('operation', 'unknown', NULL, '2026-10-09 00:00:00')`,
    );
    db.close();
    const next = join(migrations, "202610090002_upgrade");
    mkdirSync(next);
    writeFileSync(join(next, "migration.sql"), "ALTER TABLE Execution ADD COLUMN marker TEXT;");
    const before = readFileSync(path);
    assert.throws(
      () => assertMetadataUpgradeReady(path, migrations, false),
      /Resolve unfinished operations/,
    );
    assert.deepEqual(readFileSync(path), before);

    const recovered = new DatabaseSync(path);
    recovered.exec("UPDATE Execution SET custodyCompletedAt = '2026-10-09 00:00:30'");
    recovered.close();
    const afterRecovery = readFileSync(path);
    assert.doesNotThrow(() => assertMetadataUpgradeReady(path, migrations, false));
    assert.deepEqual(readFileSync(path), afterRecovery);
    const inspected = new DatabaseSync(path, { readOnly: true });
    assert.equal(inspected.prepare("SELECT count(*) AS n FROM _prisma_migrations").get()?.n, 1);
    assert.equal(
      inspected
        .prepare("PRAGMA table_info(Execution)")
        .all()
        .some((row) => row.name === "marker"),
      false,
    );
    inspected.close();
  });
});
