import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { runtimeIdentity } from "../apps/web/src/server/crypto/keyring";
import { appStore } from "../apps/web/src/server/store";
import { metadataClient } from "../apps/web/src/server/store/database";
import { sha256 } from "../packages/kelvo-client/src/protocol";
import { configure } from "./configure";
import { assertMetadataUpgradeReady, migrateMetadata } from "./migrate";
import { startServices } from "./server";
import { readinessProbe } from "./health";
import { drainHttpServer } from "./http-drain";

let ready = false;
let stopping = false;
let child: ChildProcess | undefined;
let exited: Promise<number> | undefined;
let services: Awaited<ReturnType<typeof startServices>> | undefined;

function privateDirectory(path: string) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
    throw new Error("A runtime directory is not private.");
}

async function close(server: Server | undefined) {
  if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function shutdown(code: number) {
  if (stopping) return;
  stopping = true;
  ready = false;
  const deadline = setTimeout(() => {
    child?.kill("SIGKILL");
    process.exit(1);
  }, 80_000);
  deadline.unref();
  await drainHttpServer(services?.publicServer);
  if (child?.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  const childExit = await exited;
  await close(services?.resolverServer);
  if (process.env.DATABASE_URL) await metadataClient().$disconnect();
  clearTimeout(deadline);
  process.exit(code || childExit || 0);
}

async function main() {
  process.umask(0o077);
  const data = resolve(process.env.OOS_DATA_DIR ?? "/data/runtime");
  process.env.OOS_DATA_DIR = data;
  process.env.OOS_KEY_DIR ??= join(data, "keys");
  process.env.OOS_TLS_DIR ??= join(process.env.OOS_KEY_DIR, "tls");
  process.env.OOS_SQLITE_ROOT ??= join(data, "sqlite-databases");
  process.env.DATABASE_URL ??= `file:${join(data, "metadata.sqlite")}`;
  process.env.KELVO_BIN_DIR ??= "/app/bin";
  process.env.KELVO_URL ??= "https://127.0.0.1:8443";
  process.env.KELVO_CGROUP_ROOT ??= "/run/kelvo-cgroup";
  if (process.env.DATABASE_URL !== `file:${join(data, "metadata.sqlite")}`)
    throw new Error("The container metadata file must be inside its data volume.");
  const origin = new URL(process.env.AUTH_URL ?? "http://localhost:3100");
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("AUTH_URL must contain the public origin only.");
  process.env.AUTH_URL = origin.origin;
  privateDirectory(data);
  privateDirectory(process.env.OOS_SQLITE_ROOT);
  const metadata = join(data, "metadata.sqlite");
  if (existsSync(metadata)) {
    const stat = lstatSync(metadata);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0)
      throw new Error("The metadata file is invalid or not private.");
  }
  const previousPath = join(data, "application.yml");
  let adapterChanged = existsSync(metadata);
  if (existsSync(previousPath)) {
    const previous = JSON.parse(readFileSync(previousPath, "utf8"));
    if (previous.limits?.timeout !== "30s")
      throw new Error(
        "This container requires a 30-second query timeout. Review existing limits before migration.",
      );
    const nextDigest = sha256(
      readFileSync(join(process.env.KELVO_BIN_DIR, "kelvo-operation-adapter")),
    );
    adapterChanged = previous.adapter?.sha256 !== nextDigest;
  }
  const migrations = fileURLToPath(new URL("./migrations", import.meta.url));
  assertMetadataUpgradeReady(metadata, migrations, adapterChanged);
  migrateMetadata(metadata, migrations);
  await appStore().initializeMetadata();
  configure({ preserveExisting: true, compact: true });
  const probe = readinessProbe();
  services = await startServices({ isReady: () => ready && probe() });
  child = spawn(
    join(process.env.KELVO_BIN_DIR, "kelvo"),
    ["application", "--config", previousPath],
    {
      stdio: ["ignore", "inherit", "inherit"],
      env: {
        ...process.env,
        KELVO_TOKEN: runtimeIdentity().serviceToken,
        GOMEMLIMIT: "192MiB",
        GOMAXPROCS: "2",
      },
    },
  );
  exited = new Promise<number>((resolve) => {
    child!.once("exit", (code, signal) => {
      resolve(signal ? 1 : (code ?? 1));
      if (!stopping) void shutdown(1);
    });
    child!.once("error", () => {
      resolve(1);
      if (!stopping) void shutdown(1);
    });
  });
  const until = Date.now() + 30_000;
  while (!stopping && Date.now() < until) {
    if (await probe()) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("Kelvo did not pass startup checks.");
  console.log("SyneHQ OOS is ready. Open the configured public URL.");
  if (!(await appStore().setupStatus()).initialized)
    console.log("Run the local setup-token command to create the installation owner.");
}

for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => void shutdown(0));
void main().catch((error) => {
  console.error(
    "Container startup failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  void shutdown(1);
});
