import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { kubernetesRuntime, managedConfig } from "../apps/web/src/server/hakopod";

test("Kubernetes runtime accepts group-readable key files only when opted in", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "oos-runtime-"));
  const saved = { ...process.env };
  t.after(() => {
    process.env = saved;
    rmSync(directory, { recursive: true, force: true });
  });
  const file = join(directory, "control.key");
  writeFileSync(file, "a".repeat(64));
  process.env.OOS_HAKOPOD_SCOPE = "demo/development";
  process.env.OOS_HAKOPOD_KEY_FILE = file;
  process.env.OOS_HAKOPOD_AUTHORITY_URL =
    "http://127.0.0.1:8080/internal/database-explorer/authorize";

  delete process.env.OOS_RUNTIME;
  assert.equal(kubernetesRuntime(), false);
  chmodSync(file, 0o440);
  assert.throws(() => managedConfig(), /must be private/);

  process.env.OOS_RUNTIME = "kubernetes";
  assert.equal(kubernetesRuntime(), true);
  assert.equal(managedConfig().key, "a".repeat(64));
  for (const mode of [0o460, 0o444, 0o442]) {
    chmodSync(file, mode);
    assert.throws(() => managedConfig(), /must be private/);
  }

  process.env.OOS_RUNTIME = "docker";
  assert.throws(() => kubernetesRuntime(), /OOS_RUNTIME/);
});
