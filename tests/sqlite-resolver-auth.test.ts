import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:https";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { initializeRuntimeKeys } from "../apps/web/src/server/crypto/keyring";
import { startResolver } from "../apps/web/src/server/kelvo/resolver";
import { serviceScope } from "../packages/kelvo-client/src/protocol";

test("SQLite callbacks require the exact worker certificate and signed operation authority", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "oos-resolver-auth-"));
  const keys = join(directory, "keys"),
    tls = join(directory, "tls");
  mkdirSync(tls, { mode: 0o700 });
  const installation = randomUUID();
  initializeRuntimeKeys(installation, keys);
  const previous = {
    OOS_KEY_DIR: process.env.OOS_KEY_DIR,
    OOS_TLS_DIR: process.env.OOS_TLS_DIR,
    OOS_RESOLVER_PORT: process.env.OOS_RESOLVER_PORT,
    OOS_RESOLVER_HOST: process.env.OOS_RESOLVER_HOST,
  };
  Object.assign(process.env, {
    OOS_KEY_DIR: keys,
    OOS_TLS_DIR: tls,
    OOS_RESOLVER_PORT: "0",
    OOS_RESOLVER_HOST: "127.0.0.1",
  });
  const openssl = (...args: string[]) =>
    execFileSync("openssl", args, { cwd: tls, stdio: "ignore" });
  openssl(
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    "ca.key",
    "-out",
    "ca.crt",
    "-days",
    "1",
    "-subj",
    "/CN=Resolver Test CA",
    "-addext",
    "basicConstraints=critical,CA:TRUE",
  );
  const tenant = serviceScope(installation).cluster_tenant;
  for (const [name, san, usage] of [
    ["resolver", "IP:127.0.0.1", "serverAuth"],
    ["worker", `URI:spiffe://kelvo/tenant/${tenant}/worker/application`, "clientAuth"],
    ["wrong", `URI:spiffe://kelvo/tenant/${tenant}/worker/other`, "clientAuth"],
  ]) {
    openssl(
      "req",
      "-new",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      `${name}.key`,
      "-out",
      `${name}.csr`,
      "-subj",
      `/CN=${name}`,
    );
    writeFileSync(join(tls, `${name}.ext`), `subjectAltName=${san}\nextendedKeyUsage=${usage}\n`);
    openssl(
      "x509",
      "-req",
      "-in",
      `${name}.csr`,
      "-CA",
      "ca.crt",
      "-CAkey",
      "ca.key",
      "-CAcreateserial",
      "-out",
      `${name}.crt`,
      "-days",
      "1",
      "-extfile",
      `${name}.ext`,
    );
  }
  const server = startResolver();
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(directory, { recursive: true });
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const post = (
    path: string,
    cert: string | null,
    bytes: Buffer,
    contentType = "application/json",
  ) =>
    new Promise<number>((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path,
          method: "POST",
          ca: readFileSync(join(tls, "ca.crt")),
          ...(cert
            ? {
                cert: readFileSync(join(tls, `${cert}.crt`)),
                key: readFileSync(join(tls, `${cert}.key`)),
              }
            : {}),
          headers: { "Content-Type": contentType },
          agent: false,
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode!));
        },
      );
      req.setTimeout(5000, () => req.destroy(new Error("The callback test timed out.")));
      req.on("error", reject);
      req.end(bytes);
    });
  await assert.rejects(post("/internal/kelvo/operation-file", null, Buffer.from("{}")));
  assert.equal(await post("/internal/kelvo/operation-file", "wrong", Buffer.from("{}")), 403);
  const untrusted = {
    operation_id: "operation",
    worker_id: "application",
    owner: "a".repeat(32),
    claim: "b".repeat(32),
    grant: "invalid.grant.signature",
    operation: {},
    source_revision: "0".repeat(64),
    snapshot: { version: 1, format: "sqlite", bytes: 4096, sha256: "1".repeat(64) },
  };
  assert.equal(
    await post("/internal/kelvo/operation-file", "worker", Buffer.from(JSON.stringify(untrusted))),
    403,
  );
  const header = Buffer.from(
    JSON.stringify({
      ...untrusted,
      publication: {
        version: 1,
        operation_id: "operation",
        request_sha256: "2".repeat(64),
        original: untrusted.snapshot,
        replacement: untrusted.snapshot,
      },
    }),
  );
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  assert.equal(
    await post(
      "/internal/kelvo/operation-file-commit",
      "worker",
      Buffer.concat([length, header]),
      "application/vnd.kelvo.file-update",
    ),
    403,
  );
});
