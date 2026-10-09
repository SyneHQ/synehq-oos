import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createSnapshot,
  describeSnapshot,
  publishSnapshot,
  readSnapshot,
  sqliteRoot,
} from "../apps/web/src/server/kelvo/sqlite-files";

test("managed SQLite snapshots reject unsafe paths and publish only the exact unchanged source", (t) => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "oos-sqlite-files-")));
  const root = join(directory, "managed"),
    runtime = join(directory, "runtime");
  mkdirSync(root, { mode: 0o700 });
  mkdirSync(runtime, { mode: 0o700 });
  const previous = {
    OOS_SQLITE_ROOT: process.env.OOS_SQLITE_ROOT,
    OOS_KEY_DIR: process.env.OOS_KEY_DIR,
    OOS_DATA_DIR: process.env.OOS_DATA_DIR,
    DATABASE_URL: process.env.DATABASE_URL,
    OOS_TLS_DIR: process.env.OOS_TLS_DIR,
    OOS_SQLITE_SNAPSHOT_MAX_BYTES: process.env.OOS_SQLITE_SNAPSHOT_MAX_BYTES,
  };
  Object.assign(process.env, {
    OOS_SQLITE_ROOT: root,
    OOS_KEY_DIR: join(runtime, "keys"),
    OOS_DATA_DIR: runtime,
    DATABASE_URL: `file:${join(runtime, "metadata.sqlite")}`,
    OOS_TLS_DIR: join(runtime, "tls"),
  });
  t.after(() => {
    rmSync(directory, { recursive: true });
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  // These are transport fixtures. Kelvo validates the database itself.
  const original = Buffer.alloc(4096);
  original.write("SQLite format 3\0");
  original[100] = 1;
  const replacement = Buffer.from(original);
  replacement[100] = 2;
  const path = join(root, "sample.sqlite");
  writeFileSync(path, original, { mode: 0o600 });
  assert.equal(sqliteRoot(), root);
  for (const path of [
    "../outside.sqlite",
    "/etc/passwd",
    "nested/../sample.sqlite",
    "nested\\sample.sqlite",
  ])
    assert.throws(() => createSnapshot(path, "revision"));
  symlinkSync(path, join(root, "symbolic.sqlite"));
  assert.throws(() => createSnapshot("symbolic.sqlite", "revision"));
  mkdirSync(join(directory, "outside"));
  symlinkSync(join(directory, "outside"), join(root, "linked-directory"));
  assert.throws(() => createSnapshot("linked-directory/file.sqlite", "revision"));
  linkSync(path, join(root, "hard.sqlite"));
  assert.throws(() => createSnapshot("hard.sqlite", "revision"));
  rmSync(join(root, "hard.sqlite"));
  for (const suffix of ["-wal", "-journal", "-shm"]) {
    writeFileSync(path + suffix, "retained database state");
    assert.throws(() => createSnapshot("sample.sqlite", "revision"), /external writers/);
    rmSync(path + suffix);
  }
  const snapshot = createSnapshot("sample.sqlite", "revision");
  process.env.OOS_SQLITE_SNAPSHOT_MAX_BYTES = String(original.length);
  assert.throws(() => createSnapshot("sample.sqlite", "budget-denied"), /storage limit/);
  assert.deepEqual(readSnapshot(snapshot), original);
  delete process.env.OOS_SQLITE_SNAPSHOT_MAX_BYTES;
  writeFileSync(path, replacement);
  assert.deepEqual(readSnapshot(snapshot), original);
  assert.equal(
    publishSnapshot(
      snapshot,
      describeSnapshot(replacement),
      replacement,
      Math.floor(Date.now() / 1000) + 5,
    ),
    false,
  );
  assert.deepEqual(readFileSync(path), replacement);
  const current = createSnapshot("sample.sqlite", "revision-2");
  assert.throws(() => publishSnapshot(current, describeSnapshot(original), original, 1), /expired/);
  assert.equal(
    publishSnapshot(
      current,
      describeSnapshot(original),
      original,
      Math.floor(Date.now() / 1000) + 5,
    ),
    true,
  );
  assert.deepEqual(readFileSync(path), original);
  assert.throws(
    () =>
      publishSnapshot(
        current,
        describeSnapshot(original),
        original,
        Math.floor(Date.now() / 1000) + 5,
      ),
    /must not be replayed/,
  );
  chmodSync(root, 0o755);
  assert.throws(() => sqliteRoot(), /0700/);
  chmodSync(root, 0o700);
  process.env.OOS_SQLITE_ROOT = runtime;
  assert.throws(() => sqliteRoot(), /separate/);
});
