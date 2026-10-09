import {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  type BigIntStats,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { keyDirectory } from "../crypto/keyring";

export const MAX_SQLITE_BYTES = 50 * 1024 * 1024;
export const DEFAULT_SNAPSHOT_BUDGET_BYTES = 512 * 1024 * 1024;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const snapshotDescriptorSchema = z
  .object({
    version: z.literal(1),
    format: z.literal("sqlite"),
    bytes: z.number().int().min(100).max(MAX_SQLITE_BYTES),
    sha256: digest,
  })
  .strict();
export type SnapshotDescriptor = z.infer<typeof snapshotDescriptorSchema>;
const relativePath = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      !isAbsolute(value) &&
      !/[\\:?#\0\r\n]/.test(value) &&
      value.split("/").every((part) => part && part !== "." && part !== ".."),
  );
export const snapshotBindingSchema = z
  .object({
    version: z.literal(1),
    filePath: relativePath,
    sourceRevision: digest,
    retainedFile: z.string().uuid(),
    sourceIdentity: z.string().max(256),
    snapshot: snapshotDescriptorSchema,
  })
  .strict();
export type SnapshotBinding = z.infer<typeof snapshotBindingSchema>;

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const inside = (parent: string, child: string) =>
  parent === child || child.startsWith(parent + sep);
const unavailable = () => new Error("The managed SQLite file is unavailable or changed.");

function checkDirectories(path: string): void {
  let current = parse(path).root;
  for (const part of relative(current, path).split(sep).filter(Boolean)) {
    current = join(current, part);
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw unavailable();
  }
}

export function sqliteRoot(): string {
  const value = process.env.OOS_SQLITE_ROOT;
  if (!value || !isAbsolute(value))
    throw new Error("Set OOS_SQLITE_ROOT to an absolute managed directory.");
  const root = resolve(value);
  const metadata = process.env.DATABASE_URL?.replace(/^file:/, "").split("?")[0];
  const protectedPaths = [
    resolve(process.env.OOS_DATA_DIR ?? "data"),
    keyDirectory(),
    resolve(process.env.OOS_TLS_DIR ?? join(keyDirectory(), "tls")),
    dirname(keyDirectory()),
    "/proc",
    "/sys",
    "/dev",
  ];
  if (metadata) {
    protectedPaths.push(dirname(resolve(metadata)));
    if (!isAbsolute(metadata)) protectedPaths.push(dirname(resolve("apps/web/prisma", metadata)));
  }
  if (
    root === parse(root).root ||
    protectedPaths.some((path) => inside(path, root) || inside(root, path))
  )
    throw new Error(
      "The SQLite directory must be separate from runtime, metadata, key, and system directories.",
    );
  checkDirectories(root);
  const stat = lstatSync(root);
  if ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid()))
    throw new Error("The SQLite directory must belong to the app user and use mode 0700.");
  return root;
}

function sourcePath(filePath: string): string {
  relativePath.parse(filePath);
  const root = sqliteRoot();
  const path = join(root, filePath);
  if (!inside(root, path)) throw unavailable();
  checkDirectories(dirname(path));
  return path;
}

function snapshotDirectory(): string {
  const path = join(dirname(keyDirectory()), "sqlite-snapshots");
  mkdirSync(path, { recursive: true, mode: 0o700 });
  checkDirectories(path);
  const stat = lstatSync(path);
  if ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid()))
    throw unavailable();
  return path;
}

function checkSnapshotBudget(directory: string, additionalBytes: number): void {
  const configured = process.env.OOS_SQLITE_SNAPSHOT_MAX_BYTES;
  const maximum = configured === undefined ? DEFAULT_SNAPSHOT_BUDGET_BYTES : Number(configured);
  if (
    (configured !== undefined && !/^[1-9][0-9]*$/.test(configured)) ||
    !Number.isSafeInteger(maximum) ||
    maximum < 100
  )
    throw new Error("OOS_SQLITE_SNAPSHOT_MAX_BYTES must be an integer of at least 100 bytes.");
  let retained = 0;
  for (const name of readdirSync(directory)) {
    const stat = lstatSync(join(directory, name));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw unavailable();
    retained += stat.size;
    if (retained + additionalBytes > maximum)
      throw new Error(
        "The retained SQLite snapshots reached their storage limit. Resolve unknown operations before importing another snapshot.",
      );
  }
  if (retained + additionalBytes > maximum)
    throw new Error("The SQLite snapshot exceeds the remaining storage budget.");
}

function syncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function identity(stat: BigIntStats): string {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
}

function noJournal(path: string): void {
  if (["-wal", "-journal", "-shm"].some((suffix) => existsSync(path + suffix)))
    throw new Error(
      "Use a closed SQLite file. Concurrent external writers and journal files are unsupported.",
    );
}

function readExactFile(path: string, managedSource: boolean): { bytes: Buffer; identity: string } {
  if (managedSource) noJournal(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      before.size < 100n ||
      before.size > BigInt(MAX_SQLITE_BYTES)
    )
      throw unavailable();
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!count) throw unavailable();
      offset += count;
    }
    const after = fstatSync(fd, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    if (
      identity(before) !== identity(after) ||
      identity(after) !== identity(current) ||
      current.isSymbolicLink() ||
      !bytes.subarray(0, 16).equals(Buffer.from("SQLite format 3\0"))
    )
      throw unavailable();
    if (managedSource) noJournal(path);
    return { bytes, identity: identity(after) };
  } finally {
    closeSync(fd);
  }
}

export function describeSnapshot(bytes: Buffer): SnapshotDescriptor {
  if (
    bytes.length < 100 ||
    bytes.length > MAX_SQLITE_BYTES ||
    !bytes.subarray(0, 16).equals(Buffer.from("SQLite format 3\0"))
  )
    throw unavailable();
  return { version: 1, format: "sqlite", bytes: bytes.length, sha256: hash(bytes) };
}

export function createSnapshot(filePath: string, revision: string): SnapshotBinding {
  const path = sourcePath(filePath);
  const source = readExactFile(path, true);
  const snapshot = describeSnapshot(source.bytes);
  const retainedFile = randomUUID();
  const directory = snapshotDirectory();
  try {
    checkSnapshotBudget(directory, source.bytes.length);
  } catch (error) {
    source.bytes.fill(0);
    throw error;
  }
  const target = join(directory, retainedFile);
  const fd = openSync(
    target,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeFileSync(fd, source.bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
    source.bytes.fill(0);
  }
  syncDirectory(dirname(target));
  return {
    version: 1,
    filePath,
    sourceRevision: hash(JSON.stringify([revision, snapshot.sha256, source.identity])),
    retainedFile,
    sourceIdentity: source.identity,
    snapshot,
  };
}

export function readSnapshot(binding: SnapshotBinding): Buffer {
  const value = snapshotBindingSchema.parse(binding);
  const source = readExactFile(join(snapshotDirectory(), value.retainedFile), false);
  if (source.bytes.length !== value.snapshot.bytes || hash(source.bytes) !== value.snapshot.sha256)
    throw unavailable();
  return source.bytes;
}

export function removeSnapshot(binding: SnapshotBinding): void {
  const value = snapshotBindingSchema.parse(binding);
  for (const path of [
    join(snapshotDirectory(), value.retainedFile),
    join(snapshotDirectory(), `${value.retainedFile}.publication`),
  ]) {
    try {
      unlinkSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

const sourceLocks = new Map<string, Promise<void>>();
export async function withSqliteSource<T>(filePath: string, action: () => Promise<T>): Promise<T> {
  const path = sourcePath(filePath);
  const previous = sourceLocks.get(path) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  sourceLocks.set(path, current);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (sourceLocks.get(path) === current) sourceLocks.delete(path);
  }
}

/** The managed directory has no external writers. This function performs no database execution. */
export function publishSnapshot(
  binding: SnapshotBinding,
  replacement: SnapshotDescriptor,
  bytes: Buffer,
  validUntil: number,
): boolean {
  const value = snapshotBindingSchema.parse(binding);
  const expected = snapshotDescriptorSchema.parse(replacement);
  const actual = describeSnapshot(bytes);
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) throw unavailable();
  const path = sourcePath(value.filePath);
  const marker = join(snapshotDirectory(), `${value.retainedFile}.publication`);
  if (existsSync(marker))
    throw new Error("This publication already started. Its outcome must not be replayed.");
  const source = readExactFile(path, true);
  try {
    if (
      source.identity !== value.sourceIdentity ||
      source.bytes.length !== value.snapshot.bytes ||
      hash(source.bytes) !== value.snapshot.sha256
    )
      return false;
  } finally {
    source.bytes.fill(0);
  }
  const staged = join(dirname(path), `.oos-${randomUUID()}.sqlite`);
  let renamed = false;
  try {
    const fd = openSync(
      staged,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(fd, bytes);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    // No awaited operation separates this final check from the publication.
    const current = readExactFile(path, true);
    try {
      if (
        current.identity !== value.sourceIdentity ||
        hash(current.bytes) !== value.snapshot.sha256
      )
        return false;
    } finally {
      current.bytes.fill(0);
    }
    if (Date.now() >= validUntil * 1000) throw new Error("The publication authority expired.");
    const markerContent = JSON.stringify({
      replacement: expected,
      startedAt: new Date().toISOString(),
    });
    checkSnapshotBudget(dirname(marker), Buffer.byteLength(markerContent));
    const markerFd = openSync(
      marker,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(markerFd, markerContent);
      fsyncSync(markerFd);
    } finally {
      closeSync(markerFd);
    }
    syncDirectory(dirname(marker));
    if (Date.now() >= validUntil * 1000) throw new Error("The publication authority expired.");
    renameSync(staged, path);
    renamed = true;
    syncDirectory(dirname(path));
    return true;
  } finally {
    if (!renamed && existsSync(staged)) unlinkSync(staged);
  }
}
