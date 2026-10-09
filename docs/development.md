# Linux source installation

This guide runs the current source on a Linux host. For the separate container setup, see [Container installation](container.md).

Read the [validation record](validation.md) before choosing a deployment revision. A source build does not qualify every installation or maintenance procedure.

The source runtime uses two long-running processes. The Node process serves the static dashboard, API, and private resolver. Kelvo starts query workers when needed.

| Listener               | Default address  | Purpose                                                       |
| ---------------------- | ---------------- | ------------------------------------------------------------- |
| Node public server     | `127.0.0.1:3100` | Serves the dashboard, owner login, API, and query approvals   |
| Node private resolver  | `127.0.0.1:3101` | Resolves database credentials for authorized Kelvo operations |
| Kelvo application mode | `127.0.0.1:8443` | Runs contained operations for the six supported databases     |

Next.js exports the dashboard during the build. The installation runs the compiled Node server from `dist/server.mjs`.

The resolver and Kelvo use TLS. The resolver also requires a trusted client certificate.

## Host requirements

- Linux with unified cgroup v2, Landlock ABI 3 or later, and usable `clone3` support.
- systemd with cgroup delegation for the Kelvo service.
- Node `24.21.0`, npm, OpenSSL, SQLite CLI, and a C compiler.
- Go matching the selected Kelvo `go.mod`. The current branch declares Go `1.26.0`.
- The OOS source and the matching Kelvo application-mode source.
- Sufficient disk space for native builds, npm dependencies, and bounded runtime state.

Build and test in an isolated Linux environment. Do not use an installation with customer workloads as the test fixture.

The examples use `/opt/synehq-oos/source`, `/opt/synehq-oos/bin`, and `/var/lib/synehq-oos/runtime`. Replace these paths consistently.

## Prepare the service account

Run these commands as the host administrator. Skip account creation if the dedicated account already exists.

```sh
sudo useradd --system --create-home --shell /usr/sbin/nologin synehq-oos
sudo install -d -m 0755 -o synehq-oos -g synehq-oos /opt/synehq-oos/bin
sudo install -d -m 0700 -o synehq-oos -g synehq-oos /var/lib/synehq-oos/runtime
sudo install -d -m 0750 -o root -g synehq-oos /etc/synehq-oos
```

Place the reviewed source checkout at `/opt/synehq-oos/source`. Give the build account access to that checkout.

Do not store runtime files in the Git checkout. Never commit a setup token, environment file, SQLite file, or private key.

## Set the environment

Create `/etc/synehq-oos/runtime.env` with these values. Use mode `0600` and owner `synehq-oos`.

```dotenv
NODE_ENV=production
OOS_DATA_DIR=/var/lib/synehq-oos/runtime
OOS_KEY_DIR=/var/lib/synehq-oos/runtime/keys
OOS_TLS_DIR=/var/lib/synehq-oos/runtime/keys/tls
OOS_SQLITE_ROOT=/var/lib/synehq-oos/sqlite-databases
OOS_STATIC_DIR=/opt/synehq-oos/source/apps/web/out
DATABASE_URL=file:/var/lib/synehq-oos/runtime/metadata.sqlite
AUTH_URL=http://127.0.0.1:3100
ALLOW_SIGNUP=true
HOST=127.0.0.1
PORT=3100
KELVO_BIN_DIR=/opt/synehq-oos/bin
KELVO_URL=https://127.0.0.1:8443
KELVO_CGROUP_ROOT=/sys/fs/cgroup/system.slice/synehq-oos-kelvo.service/jobs
OOS_RESOLVER_HOST=127.0.0.1
OOS_RESOLVER_PORT=3101
```

`AUTH_URL` must match the browser origin. Remote access requires an HTTPS origin, such as `https://explorer.example.com`.

For local SQLite connections, create `OOS_SQLITE_ROOT` with mode `0700` and owner `synehq-oos`. Keep it separate from runtime metadata and keys. Place a closed, consistent database file there before you add the connection. Other applications must not write files in this directory. See the [database guide](databases.md).

The HTTP example is for local access or an SSH tunnel. Do not expose its HTTP listener as a public login endpoint.

To use a private AI endpoint, add its exact hostname to `OOS_AI_ALLOWED_HOSTS`. Separate multiple hosts with commas.

Open a service-account terminal with `sudo -u synehq-oos -H /bin/bash`. Load the environment before you run source commands:

```sh
cd /opt/synehq-oos/source
set -a
. /etc/synehq-oos/runtime.env
set +a
umask 077
```

## Build Kelvo

Use the matching application-mode checkout, including its reviewed Oracle dependency. Record its commit and binary hashes with the deployment.

The following commands require a disposable Kelvo checkout without an existing `go.work`. They create a Go workspace for the gateway and adapter.

The workspace selects the local `go-ora/v2` v2.9.0 copy. That copy contains the reviewed `LONG_PASSWORD` capability patch. Keep its license and `PATCHES.md` record with the source.

```sh
cd /path/to/kelvo-source
go work init . ./adapters/go
kelvo_sdk_version=$(awk '$1 == "github.com/SYNEHQ/kelvo-go" { print $2 }' adapters/go/go.mod)
go work edit "-replace=github.com/SYNEHQ/kelvo-go@${kelvo_sdk_version}=."
go work edit -replace=github.com/sijms/go-ora/v2@v2.9.0=./third_party/go-ora-v2.9.0
CGO_ENABLED=1 go build -mod=readonly -trimpath -ldflags="-s -w" -o /opt/synehq-oos/bin/kelvo ./cmd/kelvo
cc -O2 -Wall -Wextra -Werror -std=c11 -o /opt/synehq-oos/bin/kelvo-sandbox sandbox/launcher.c
cd adapters/go
CGO_ENABLED=1 go build -mod=readonly -trimpath -ldflags="-s -w" -o /opt/synehq-oos/bin/kelvo-operation-adapter ./cmd/kelvo-adapter-go
sha256sum /opt/synehq-oos/bin/kelvo /opt/synehq-oos/bin/kelvo-sandbox /opt/synehq-oos/bin/kelvo-operation-adapter
```

This build includes the six native database engines. It omits the `duckdb_arrow` build tag. See [Supported databases](databases.md) for engine limits.

The adapter and sandbox output names match `deploy/configure-cli.ts`. Use these names when you install the binaries.

Before an upgrade, stop new requests and wait for active operations to finish. Resolve unknown outcomes before you replace binaries. Update the configured adapter digest to match the tested binary. Preserve the operation ledger path, retention settings, and resource limits.

## Prepare the app

For a new installation, run these commands from the OOS source root with the environment loaded:

```sh
npm ci --include=dev
npm run db:deploy
npm run db:generate
node node_modules/typescript/lib/tsc.js --noEmit
npm test
npm run build
node dist/operator.mjs init
node --import tsx deploy/configure-cli.ts
```

`npm run build` writes the static dashboard to `apps/web/out`. It bundles the server and operator commands into `dist`. The Node runtime still needs the generated Prisma client and its engine in `node_modules`.

Use `npm start` from the repository root to start the compiled API and resolver together. The systemd units below run the same `dist/server.mjs` entry point directly. Keep Kelvo in its separate service.

Keep development dependencies for source builds, configuration, and checks. The compiled server and operator do not require `tsx` at runtime.

Workspace links load a new document. If row changes are staged, the app asks the browser to confirm page navigation. This includes Back and Forward navigation. Complete or discard staged changes first. Browser prompts do not protect against a browser crash or a closed mobile app.

Use `npm install` instead of `npm ci` only when preparing the first lockfile or intentionally changing dependencies.

`init` creates the installation identity and private key files. Run it before `configure-cli.ts` or the application services.

`configure-cli.ts` writes `application.yml`, `kelvo.env`, and local TLS certificates inside the runtime directory. It records the adapter's SHA-256 digest.

The configuration command writes the source defaults. Do not use it to update an existing configuration with custom limits or runtime paths. Follow [Operations](operations.md) for an existing installation.

The generated `application.yml` uses JSON syntax, which is valid YAML. Do not publish it together with private runtime files.

The source configuration allows two concurrent operations and a 30-second query timeout. Query results have limits of 10,000 rows and 4 MiB. Metadata results have a 1 MiB cap.

Kelvo retains up to 512 operations for one hour. Its result store has a 1 GiB budget. Each result reserves its maximum size until expiry.

A full result store rejects new result-producing operations before database access. Connection checks and row writes do not reserve result storage.

## Configure systemd

Use the Node executable from the selected Node installation in each unit. The examples assume `/opt/node/bin/node`.

Create `/etc/systemd/system/synehq-oos-web.service`:

```ini
[Unit]
Description=SyneHQ OOS dashboard, API, and private resolver
After=network-online.target

[Service]
Type=simple
User=synehq-oos
Group=synehq-oos
WorkingDirectory=/opt/synehq-oos/source
EnvironmentFile=/etc/synehq-oos/runtime.env
ExecStart=/opt/node/bin/node /opt/synehq-oos/source/dist/server.mjs
Restart=on-failure
UMask=0077
KillMode=control-group
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
```

Create `/opt/synehq-oos/start-kelvo.sh`. Give it mode `0755` and keep it writable only by the operator.

```sh
#!/bin/sh
set -eu
service_cgroup=/sys/fs/cgroup/system.slice/synehq-oos-kelvo.service
mkdir -p "$service_cgroup/supervisor" "$KELVO_CGROUP_ROOT"
printf '%s' "$$" > "$service_cgroup/supervisor/cgroup.procs"
printf '+cpu +memory +pids' > "$service_cgroup/cgroup.subtree_control"
/opt/node/bin/node --input-type=module - <<'NODE'
const deadline = Date.now() + 30000;
while (Date.now() < deadline) {
  try {
    const response = await fetch("http://127.0.0.1:3100/healthz", {
      signal: AbortSignal.timeout(1000),
    });
    await response.body?.cancel();
    if (response.status === 200 || response.status === 503) process.exit(0);
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 250));
}
console.error("The Node runtime did not open its listeners.");
process.exit(1);
NODE
exec /opt/synehq-oos/bin/kelvo application --config "$OOS_DATA_DIR/application.yml"
```

This script must run inside the exact delegated service. Running it from an SSH shell does not create valid containment.

The startup wait checks that Node opened its public listener after the private resolver. It accepts `503` because Kelvo has not started yet. The final installation check below requires `200`.

Create `/etc/systemd/system/synehq-oos-kelvo.service`:

```ini
[Unit]
Description=SyneHQ OOS Kelvo execution service
Requires=synehq-oos-web.service
After=network-online.target synehq-oos-web.service

[Service]
Type=simple
User=synehq-oos
Group=synehq-oos
WorkingDirectory=/opt/synehq-oos/source
EnvironmentFile=/etc/synehq-oos/runtime.env
EnvironmentFile=/var/lib/synehq-oos/runtime/kelvo.env
ExecStart=/opt/synehq-oos/start-kelvo.sh
Delegate=yes
MemoryMax=1536M
MemorySwapMax=0
CPUQuota=200%
TasksMax=256
KillMode=mixed
TimeoutStopSec=360
Restart=on-failure
UMask=0077

[Install]
WantedBy=multi-user.target
```

The `jobs` cgroup must be empty before Kelvo admits work. Its parent must delegate the CPU, memory, and process controllers.

The whole-service limits include gateway overhead. They are example bounds. They do not state the measured memory requirement for a workload.

`KillMode=mixed` sends the first stop signal to Kelvo. Kelvo can then drain its query workers. The stop timeout includes the supported five-minute query timeout and cleanup time. Keep the private resolver running until Kelvo stops.

Start the services:

```sh
sudo systemctl daemon-reload
sudo systemctl start synehq-oos-web.service
sudo systemctl start synehq-oos-kelvo.service
sudo systemctl status synehq-oos-web.service synehq-oos-kelvo.service
```

For a planned stop, stop Kelvo before the Node runtime:

```sh
sudo systemctl stop synehq-oos-kelvo.service
sudo systemctl stop synehq-oos-web.service
```

Stop new requests before maintenance. Keep unfinished operation records and retained query files until the [recovery procedure](operations.md) confirms their state.

Keep ports 3101 and 8443 private. Place only port 3100 behind the public HTTPS reverse proxy.

## Create the owner

For browser setup, run this command in the service account's terminal with the environment loaded:

```sh
node dist/operator.mjs setup-token
```

Open `/setup` and enter the displayed token. The token expires after 30 minutes. Do not place it in a URL or shared log.

For local setup, set `ALLOW_SIGNUP=false` and run:

```sh
node dist/operator.mjs owner-create
```

The command requests the owner's email, name, and password. Password entry requires an interactive terminal.

Both paths create the same single owner. Setup closes after account creation, regardless of the `ALLOW_SIGNUP` value.

During development, `node --import tsx apps/web/scripts/operator.ts COMMAND` runs the source operator. Use the compiled operator for this installation.

## Check the installation

1. Check that `GET /healthz` returns `200` through the configured origin.
2. Sign in.
3. Create a connection to a disposable PostgreSQL or MySQL database with verified TLS.
4. Test the connection.
5. Load the schema and its relationships.
6. Read a table and apply a filter.
7. Run a SQL query.
8. Check a large integer, a decimal, a timestamp, and a null value in the grid.
9. Open a chart and check the selected columns and limit notice.
10. If writes are enabled, check the exact target and SQL in the approval dialog.
11. Sign out.
12. Check that protected pages require another login.

The health route checks Kelvo readiness. It does not prove a customer database connection. Keep the source revision, binary hashes, and workflow results with the [validation record](validation.md).

## Development loop

Use an isolated Linux host for complete workflows. Rebuild the dashboard and server after source changes. Restart the Node runtime and Kelvo in the order above.

`npm run dev` starts the Next.js development server. It does not start the compiled API or private resolver. The current configuration has no API proxy for that server. Use the compiled runtime for authentication and database checks.

Run the required checks after a change:

```sh
node node_modules/typescript/lib/tsc.js --noEmit
npm test
npm run build
npm run format:check
```

Use the TypeScript path shown above. A different `tsc` executable on `PATH` may belong to another package.

For schema changes, create a migration without applying it. Review its SQL before deployment. Regenerate the Prisma client after deployment.

Read [Operations](operations.md) before backup, restore, recovery, or key rotation.
