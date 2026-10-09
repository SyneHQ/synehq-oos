import { execFileSync } from "node:child_process";
import { createPublicKey, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  chmodSync,
  writeFileSync,
  renameSync,
  openSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { keyDirectory, runtimeIdentity } from "../apps/web/src/server/crypto/keyring";
import { serviceScope, sha256 } from "../packages/kelvo-client/src/protocol";

export function configure(options: { preserveExisting?: boolean; compact?: boolean } = {}): void {
  const directory = resolve(process.env.OOS_DATA_DIR ?? "data");
  const bin = resolve(process.env.KELVO_BIN_DIR ?? "bin");
  const cgroup = process.env.KELVO_CGROUP_ROOT;
  if (!cgroup || !isAbsolute(cgroup) || cgroup === "/")
    throw new Error("Set KELVO_CGROUP_ROOT to a delegated, empty cgroup directory.");
  const identity = runtimeIdentity();
  const scope = serviceScope(identity.installationId);
  const tls = resolve(process.env.OOS_TLS_DIR ?? join(keyDirectory(), "tls"));
  mkdirSync(tls, { recursive: true, mode: 0o700 });
  chmodSync(tls, 0o700);
  if (process.env.OOS_TLS_TOOL)
    execFileSync(process.env.OOS_TLS_TOOL, [tls, scope.cluster_tenant], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  const openssl = (...args: string[]) =>
    execFileSync("openssl", args, { cwd: tls, stdio: ["ignore", "pipe", "pipe"] });
  const write = (path: string, data: string) => {
    const temporary = `${path}.${randomUUID()}.tmp`;
    const fd = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(fd, data);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
    const parent = openSync(resolve(path, ".."), "r");
    try {
      fsyncSync(parent);
    } finally {
      closeSync(parent);
    }
  };
  if (!existsSync(join(tls, "ca.key")) && !existsSync(join(tls, "ca.crt"))) {
    openssl(
      "req",
      "-x509",
      "-newkey",
      "rsa:3072",
      "-nodes",
      "-keyout",
      "ca.key",
      "-out",
      "ca.crt",
      "-sha256",
      "-days",
      "3650",
      "-subj",
      "/CN=SyneHQ OOS local CA",
      "-addext",
      "basicConstraints=critical,CA:TRUE",
      "-addext",
      "keyUsage=critical,keyCertSign,cRLSign",
    );
  }
  function certificate(name: string, san: string, usage: string) {
    if (existsSync(join(tls, `${name}.crt`)) || existsSync(join(tls, `${name}.key`))) {
      if (!existsSync(join(tls, `${name}.crt`)) || !existsSync(join(tls, `${name}.key`)))
        throw new Error(`The ${name} certificate pair is incomplete.`);
      return;
    }
    write(
      join(tls, `${name}.ext`),
      `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=${usage}\nsubjectAltName=${san}\n`,
    );
    openssl(
      "req",
      "-new",
      "-newkey",
      "rsa:3072",
      "-nodes",
      "-keyout",
      `${name}.key`,
      "-out",
      `${name}.csr`,
      "-subj",
      `/CN=synehq-oos-${name}`,
    );
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
      "365",
      "-sha256",
      "-extfile",
      `${name}.ext`,
    );
    chmodSync(join(tls, `${name}.key`), 0o600);
  }
  certificate("gateway", "DNS:localhost,IP:127.0.0.1,URI:spiffe://kelvo/gateway", "serverAuth");
  certificate("resolver", "DNS:localhost,DNS:application,IP:127.0.0.1", "serverAuth");
  certificate(
    "worker",
    `URI:spiffe://kelvo/tenant/${scope.cluster_tenant}/worker/application`,
    "clientAuth",
  );
  chmodSync(join(tls, "ca.key"), 0o600);
  for (const name of ["kelvo", "scratch", "containment"])
    mkdirSync(join(directory, name), { recursive: true, mode: 0o700 });
  const publicKey = createPublicKey(identity.servicePublicKeyPem)
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("base64");
  const config = {
    version: 1,
    listen: process.env.KELVO_LISTEN ?? "127.0.0.1:8443",
    state_directory: join(directory, "kelvo"),
    token_env: "KELVO_TOKEN",
    instance_id: scope.cluster_tenant,
    app_scope: identity.installationId,
    issuer: scope.iss,
    audience: scope.aud,
    service_principal: scope.service_principal,
    public_key: publicKey,
    write_mode: "approved",
    tls: { cert_file: join(tls, "gateway.crt"), key_file: join(tls, "gateway.key") },
    resolver: {
      url: process.env.KELVO_RESOLVER_URL ?? "https://127.0.0.1:3101/internal/kelvo/resolve",
      ca_file: join(tls, "ca.crt"),
      cert_file: join(tls, "worker.crt"),
      key_file: join(tls, "worker.key"),
      timeout: "5s",
      max_concurrent: 4,
    },
    adapter: {
      binary: join(bin, "kelvo-operation-adapter"),
      sha256: sha256(readFileSync(join(bin, "kelvo-operation-adapter"))),
    },
    sandbox_path: join(bin, "kelvo-sandbox"),
    scratch_directory: join(directory, "scratch"),
    limits: {
      max_rows: 10000,
      max_bytes: 4 * 1024 * 1024,
      timeout: "30s",
      memory_mb: 128,
      threads: 1,
      max_temp_mb: 64,
    },
    resources: {
      max_concurrent: 2,
      memory_mb: 1024,
      baseline_mb: 128,
      overhead_mb: 256,
      scratch_mb: 128,
    },
    containment: {
      root: cgroup,
      state_directory: join(directory, "containment"),
      max_groups: 2,
      cleanup_timeout: "5s",
      native_overhead_mb: 64,
      parent_overhead_mb: 64,
      max_processes: 64,
    },
    max_retained: 512,
    retention: "1h",
    max_concurrent: 2,
    max_http_requests: 16,
    max_result_bytes: 4 * 1024 * 1024,
    max_metadata_bytes: 1024 * 1024,
    max_stored_bytes: 1024 * 1024 * 1024,
  };
  if (options.compact) {
    config.limits.memory_mb = 64;
    config.resources = {
      max_concurrent: 1,
      memory_mb: 320,
      baseline_mb: 64,
      overhead_mb: 192,
      scratch_mb: 64,
    };
    config.containment.max_groups = 1;
    config.containment.parent_overhead_mb = 64;
    config.max_concurrent = 1;
  }
  const configPath = join(directory, "application.yml");
  if (options.preserveExisting && existsSync(configPath)) {
    const previous = JSON.parse(readFileSync(configPath, "utf8"));
    for (const field of [
      "instance_id",
      "app_scope",
      "issuer",
      "audience",
      "service_principal",
      "public_key",
      "state_directory",
      "scratch_directory",
    ] as const) {
      if (previous[field] !== config[field])
        throw new Error("The existing Kelvo configuration does not match this installation.");
    }
    if (previous.containment?.root !== cgroup || previous.adapter?.binary !== config.adapter.binary)
      throw new Error(
        "The existing runtime paths changed. Use the documented migration procedure.",
      );
    previous.adapter.sha256 = config.adapter.sha256;
    write(configPath, JSON.stringify(previous, null, 2) + "\n");
  } else {
    write(configPath, JSON.stringify(config, null, 2) + "\n");
  }
  write(join(directory, "kelvo.env"), `KELVO_TOKEN=${identity.serviceToken}\n`);
  console.log(
    "TLS certificates and Kelvo configuration are ready. Keep the data directory private.",
  );
}
