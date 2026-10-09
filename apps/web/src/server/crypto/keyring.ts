import {
  constants,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from "node:crypto";

const MAX_SECRET_BYTES = 64 * 1024;
const FILE_MODE = 0o600;

export type SecretScope = { installationId: string; recordId: string; purpose: string };
type EncryptionKeyring = {
  version: 1;
  installationId: string;
  activeKeyId: string;
  keys: Record<string, string>;
};
export type SecretEnvelope = {
  version: 1;
  algorithm: "aes-256-gcm";
  keyId: string;
  nonce: string;
  ciphertext: string;
  tag: string;
};
export type RuntimeIdentity = {
  installationId: string;
  sessionSecret: string;
  servicePrivateKeyPem: string;
  servicePublicKeyPem: string;
  serviceToken: string;
};

export function keyDirectory(): string {
  return resolve(process.env.OOS_KEY_DIR ?? join(process.env.OOS_DATA_DIR ?? "data", "keys"));
}

function checkServer(): void {
  if (typeof window !== "undefined") throw new Error("Secret storage is server-only.");
}

function privateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error("The key directory must be private and must not be a symbolic link.");
  }
}

function syncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function writePrivate(path: string, value: string, replace = false): void {
  const target = replace ? `${path}.${randomUUID()}.tmp` : path;
  const fd = openSync(
    target,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    FILE_MODE,
  );
  try {
    writeFileSync(fd, value, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    if (replace) renameSync(target, path);
    syncDirectory(dirname(path));
  } catch (error) {
    if (replace && existsSync(target)) unlinkSync(target);
    throw error;
  }
}

function readPrivate(path: string): string {
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o077) !== 0 ||
    stat.size > 256 * 1024
  ) {
    throw new Error("A key file is invalid or its permissions are too broad.");
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    return readFileSync(fd, "utf8");
  } finally {
    closeSync(fd);
  }
}

function base64(value: unknown, expected?: number): Buffer {
  if (
    typeof value !== "string" ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new Error("Invalid encrypted secret.");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value || (expected !== undefined && bytes.length !== expected))
    throw new Error("Invalid encrypted secret.");
  return bytes;
}

function aad(scope: SecretScope): Buffer {
  if (!scope.installationId || !scope.recordId || !scope.purpose)
    throw new Error("Secret scope is required.");
  return Buffer.from(
    JSON.stringify(["synehq-oos-secret", 1, scope.installationId, scope.recordId, scope.purpose]),
    "utf8",
  );
}

/** Initialize keys only while creating a new metadata instance. Never call this from decryption. */
export function initializeRuntimeKeys(installationId: string, directory = keyDirectory()): void {
  checkServer();
  privateDirectory(directory);
  const keyPath = join(directory, "encryption-keyring.json");
  if (!existsSync(keyPath)) {
    const keyId = randomUUID();
    writePrivate(
      keyPath,
      JSON.stringify({
        version: 1,
        installationId,
        activeKeyId: keyId,
        keys: { [keyId]: randomBytes(32).toString("base64") },
      }),
    );
  }
  readKeyring(installationId, directory);
  const sessionPath = join(directory, "session.key");
  if (!existsSync(sessionPath)) writePrivate(sessionPath, randomBytes(32).toString("base64"));
  const servicePath = join(directory, "service-signing.json");
  if (!existsSync(servicePath)) {
    const pair = generateKeyPairSync("ed25519");
    writePrivate(
      servicePath,
      JSON.stringify({
        version: 1,
        installationId,
        privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }),
        publicKey: pair.publicKey.export({ type: "spki", format: "pem" }),
        token: randomBytes(32).toString("base64url"),
      }),
    );
  }
  runtimeIdentity(installationId, directory);
}

export function existingInstallationId(directory = keyDirectory()): string | null {
  if (!existsSync(join(directory, "encryption-keyring.json"))) return null;
  const value = JSON.parse(readPrivate(join(directory, "encryption-keyring.json")));
  if (typeof value.installationId !== "string" || !value.installationId)
    throw new Error("Invalid encryption keyring.");
  return value.installationId;
}

function readKeyring(installationId: string, directory: string): EncryptionKeyring {
  checkServer();
  const value = JSON.parse(
    readPrivate(join(directory, "encryption-keyring.json")),
  ) as EncryptionKeyring;
  if (
    value.version !== 1 ||
    value.installationId !== installationId ||
    !value.keys ||
    typeof value.activeKeyId !== "string" ||
    !value.keys[value.activeKeyId]
  ) {
    throw new Error("The encryption keyring does not match this installation.");
  }
  for (const key of Object.values(value.keys)) base64(key, 32);
  return value;
}

export function runtimeIdentity(
  installationId?: string,
  directory = keyDirectory(),
): RuntimeIdentity {
  checkServer();
  const id = installationId ?? existingInstallationId(directory);
  if (!id) throw new Error("Initialize this installation before starting the app.");
  readKeyring(id, directory);
  const sessionSecret = readPrivate(join(directory, "session.key"));
  base64(sessionSecret, 32);
  const service = JSON.parse(readPrivate(join(directory, "service-signing.json")));
  if (
    service.version !== 1 ||
    service.installationId !== id ||
    typeof service.privateKey !== "string" ||
    typeof service.publicKey !== "string" ||
    typeof service.token !== "string" ||
    service.token.length < 40
  ) {
    throw new Error("The service identity does not match this installation.");
  }
  return {
    installationId: id,
    sessionSecret,
    servicePrivateKeyPem: service.privateKey,
    servicePublicKeyPem: service.publicKey,
    serviceToken: service.token,
  };
}

export function encryptSecret(
  value: unknown,
  scope: SecretScope,
  directory = keyDirectory(),
): string {
  const keys = readKeyring(scope.installationId, directory);
  const text = JSON.stringify(value);
  if (typeof text !== "string" || Buffer.byteLength(text) > MAX_SECRET_BYTES)
    throw new Error("Secret exceeds the storage limit.");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", base64(keys.keys[keys.activeKeyId], 32), nonce, {
    authTagLength: 16,
  });
  cipher.setAAD(aad(scope));
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const envelope: SecretEnvelope = {
    version: 1,
    algorithm: "aes-256-gcm",
    keyId: keys.activeKeyId,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
  return JSON.stringify(envelope);
}

export function decryptSecret<T = unknown>(
  stored: string,
  scope: SecretScope,
  directory = keyDirectory(),
): T {
  if (stored.length > MAX_SECRET_BYTES * 2) throw new Error("Invalid encrypted secret.");
  try {
    const keys = readKeyring(scope.installationId, directory);
    const value = JSON.parse(stored) as SecretEnvelope;
    if (
      value.version !== 1 ||
      value.algorithm !== "aes-256-gcm" ||
      !Object.hasOwn(keys.keys, value.keyId)
    )
      throw new Error("Invalid encrypted secret.");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      base64(keys.keys[value.keyId], 32),
      base64(value.nonce, 12),
      { authTagLength: 16 },
    );
    decipher.setAAD(aad(scope));
    decipher.setAuthTag(base64(value.tag, 16));
    const plain = Buffer.concat([decipher.update(base64(value.ciphertext)), decipher.final()]);
    try {
      return JSON.parse(plain.toString("utf8")) as T;
    } finally {
      plain.fill(0);
    }
  } catch {
    throw new Error("Stored credentials could not be decrypted.");
  }
}

/** Caller must hold the metadata maintenance lock. Old keys stay available for existing backups. */
export function activateEncryptionKey(installationId: string, directory = keyDirectory()): string {
  const keys = readKeyring(installationId, directory);
  const keyId = randomUUID();
  keys.keys[keyId] = randomBytes(32).toString("base64");
  keys.activeKeyId = keyId;
  writePrivate(join(directory, "encryption-keyring.json"), JSON.stringify(keys), true);
  return keyId;
}

export function replaceSessionSecret(directory = keyDirectory()): void {
  readPrivate(join(directory, "session.key"));
  writePrivate(join(directory, "session.key"), randomBytes(32).toString("base64"), true);
}
