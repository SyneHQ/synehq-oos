import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  activateEncryptionKey,
  decryptSecret,
  encryptSecret,
  initializeRuntimeKeys,
  runtimeIdentity,
} from "../apps/web/src/server/crypto/keyring";
import { hashPassword, verifyPassword } from "../apps/web/src/server/crypto/password";

test("stored secrets authenticate the record, installation, nonce, and ciphertext", (t) => {
  const directory = mkdtempSync(join(process.env.OOS_TEST_TMPDIR ?? tmpdir(), "oos-crypto-"));
  t.after(() => rmSync(directory, { recursive: true }));
  const installationId = randomUUID(),
    scope = { installationId, recordId: "connection-a", purpose: "connection" };
  initializeRuntimeKeys(installationId, directory);
  const first = encryptSecret(
    { password: "fixture password", unicode: "数据库" },
    scope,
    directory,
  );
  const second = encryptSecret(
    { password: "fixture password", unicode: "数据库" },
    scope,
    directory,
  );
  assert.notEqual(first, second);
  assert.deepEqual(decryptSecret(first, scope, directory), {
    password: "fixture password",
    unicode: "数据库",
  });
  assert.equal(first.includes("fixture password"), false);
  assert.throws(
    () => decryptSecret(first, { ...scope, recordId: "connection-b" }, directory),
    /could not be decrypted/,
  );
  assert.throws(
    () => decryptSecret(first, { ...scope, purpose: "ai-provider" }, directory),
    /could not be decrypted/,
  );
  assert.throws(
    () => decryptSecret(first, { ...scope, installationId: randomUUID() }, directory),
    /could not be decrypted/,
  );
  for (const field of ["nonce", "ciphertext", "tag"]) {
    const envelope = JSON.parse(first);
    const bytes = Buffer.from(envelope[field], "base64");
    bytes[0] ^= 1;
    envelope[field] = bytes.toString("base64");
    assert.throws(
      () => decryptSecret(JSON.stringify(envelope), scope, directory),
      /could not be decrypted/,
    );
  }
  assert.throws(
    () => decryptSecret("plaintext is never a fallback", scope, directory),
    /could not be decrypted/,
  );
});

test("rotation preserves prior envelopes and keys remain distinct and private", (t) => {
  const directory = mkdtempSync(join(process.env.OOS_TEST_TMPDIR ?? tmpdir(), "oos-rotation-"));
  t.after(() => rmSync(directory, { recursive: true }));
  const installationId = randomUUID(),
    scope = { installationId, recordId: "connection-a", purpose: "connection" };
  initializeRuntimeKeys(installationId, directory);
  const identity = runtimeIdentity(installationId, directory);
  const before = encryptSecret({ password: "retained backup" }, scope, directory);
  const oldId = JSON.parse(before).keyId;
  const newId = activateEncryptionKey(installationId, directory);
  const after = encryptSecret({ password: "new value" }, scope, directory);
  assert.notEqual(oldId, newId);
  assert.equal(JSON.parse(after).keyId, newId);
  assert.deepEqual(decryptSecret(before, scope, directory), { password: "retained backup" });
  assert.deepEqual(runtimeIdentity(installationId, directory), identity);
  const ring = JSON.parse(readFileSync(join(directory, "encryption-keyring.json"), "utf8"));
  assert.notEqual(ring.keys[ring.activeKeyId], identity.sessionSecret);
  assert.notEqual(identity.serviceToken, identity.sessionSecret);
  for (const file of ["session.key", "service-signing.json", "encryption-keyring.json"])
    assert.equal(statSync(join(directory, file)).mode & 0o777, 0o600);
  chmodSync(join(directory, "session.key"), 0o644);
  assert.throws(() => runtimeIdentity(installationId, directory), /permissions/);
  chmodSync(join(directory, "session.key"), 0o600);
  unlinkSync(join(directory, "encryption-keyring.json"));
  assert.throws(() => decryptSecret(after, scope, directory), /could not be decrypted/);
  assert.throws(() => runtimeIdentity(installationId, directory));
});

test("password hashes are salted, bounded, and reject altered parameters", async () => {
  const password = "a long fixture passphrase";
  const first = await hashPassword(password),
    second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("a different password", first), false);
  assert.equal(await verifyPassword(password, first.replace("$32768$", "$1073741824$")), false);
  assert.equal(await verifyPassword("x".repeat(1025), first), false);
  await assert.rejects(hashPassword("short"), /at least 12/);
});
