# Linux source installation

This guide runs the current source on a Linux host. The public installer and release images are not available yet.

Read the [validation record](validation.md) before choosing a deployment revision. A source build does not qualify every installation or maintenance procedure.

The source runtime starts three processes:

| Process                | Default listener | Purpose                                                                   |
| ---------------------- | ---------------- | ------------------------------------------------------------------------- |
| Web app                | `127.0.0.1:3100` | Owner login, explorer, settings, and query approvals                      |
| Private resolver       | `127.0.0.1:3101` | Resolves short-lived database credentials for authorized Kelvo operations |
| Kelvo application mode | `127.0.0.1:8443` | Runs contained PostgreSQL and MySQL operations                            |

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
DATABASE_URL=file:/var/lib/synehq-oos/runtime/metadata.sqlite
AUTH_URL=http://127.0.0.1:3100
ALLOW_SIGNUP=true
KELVO_BIN_DIR=/opt/synehq-oos/bin
KELVO_URL=https://127.0.0.1:8443
KELVO_CGROUP_ROOT=/sys/fs/cgroup/system.slice/synehq-oos-kelvo.service/jobs
OOS_RESOLVER_HOST=127.0.0.1
OOS_RESOLVER_PORT=3101
```

`AUTH_URL` must match the browser origin. Remote access requires an HTTPS origin, such as `https://explorer.example.com`.

The HTTP example is for local access or an SSH tunnel. Do not expose its HTTP listener as a public login endpoint.

To use a private AI endpoint, add its exact hostname to `OOS_AI_ALLOWED_HOSTS`. Separate multiple hosts with commas.

Open a service-account terminal with `sudo -u synehq-oos -H /bin/bash`. Load the environment before running source commands:

```sh
cd /opt/synehq-oos/source
set -a
. /etc/synehq-oos/runtime.env
set +a
umask 077
```

## Build Kelvo

Use the matching application-mode checkout. Record its commit and binary hashes with the deployment.

The following commands run in a disposable Kelvo checkout. They create a local Go workspace for its optional adapter module.

```sh
cd /path/to/kelvo-source
go work init . ./adapters/go
kelvo_sdk_version=$(awk '$1 == "github.com/SYNEHQ/kelvo-go" { print $2 }' adapters/go/go.mod)
go work edit "-replace=github.com/SYNEHQ/kelvo-go@${kelvo_sdk_version}=."
CGO_ENABLED=1 go build -mod=readonly -tags duckdb_arrow -trimpath -o /opt/synehq-oos/bin/kelvo ./cmd/kelvo
cc -O2 -Wall -Wextra -Werror -std=c11 -o /opt/synehq-oos/bin/kelvo-sandbox sandbox/launcher.c
cd adapters/go
CGO_ENABLED=1 go build -mod=readonly -tags duckdb_arrow -trimpath -o /opt/synehq-oos/bin/kelvo-operation-adapter ./cmd/kelvo-adapter-go
sha256sum /opt/synehq-oos/bin/kelvo /opt/synehq-oos/bin/kelvo-sandbox /opt/synehq-oos/bin/kelvo-operation-adapter
```

The adapter and sandbox output names match `deploy/configure.ts`. They differ from the default output names in Kelvo's broader documentation.

Do not replace a running adapter binary. Regenerate the OOS configuration after a controlled adapter update so its digest matches.

## Prepare the app

Run from the OOS source root with the environment loaded:

```sh
npm ci --include=dev
npm run db:deploy
npm run db:generate
node --import tsx apps/web/scripts/operator.ts init
node --import tsx deploy/configure.ts
node node_modules/typescript/lib/tsc.js --noEmit
npm test
npm run build
```

Keep development dependencies installed in this source deployment. The resolver and operator commands use `tsx` at runtime.

Workspace links load a new document. When row changes are staged, the app asks the browser to confirm before leaving the page, including Back and Forward navigation. Complete or discard staged changes first. Browser prompts do not protect against a browser crash or a closed mobile app.

Use `npm install` instead of `npm ci` only when preparing the first lockfile or intentionally changing dependencies.

`init` creates the installation identity and private key files. Run it before `configure.ts` or the application services.

`configure.ts` writes `application.yml`, `kelvo.env`, and local TLS certificates inside the runtime directory. It records the adapter's SHA-256 digest.

The generated `application.yml` uses JSON syntax, which is valid YAML. Do not publish it together with private runtime files.

The configuration allows two concurrent operations, a 30-second query timeout, 10,000 result rows, and a 4 MiB query result cap. Metadata results have a 1 MiB cap.

Kelvo retains up to 512 operations for one hour. Its result store has a 1 GiB budget. Each result reserves its maximum size until expiry.

A full result store rejects new result-producing operations before database access. Connection checks and row writes do not reserve result storage.

## Configure systemd

Use the Node executable from the selected Node installation in each unit. The examples assume `/opt/node/bin/node`.

Create `/etc/systemd/system/synehq-oos-resolver.service`:

```ini
[Unit]
Description=SyneHQ OOS private resolver
After=network-online.target

[Service]
Type=simple
User=synehq-oos
Group=synehq-oos
WorkingDirectory=/opt/synehq-oos/source
EnvironmentFile=/etc/synehq-oos/runtime.env
ExecStart=/opt/node/bin/node --import tsx deploy/resolver.ts
Restart=on-failure
UMask=0077
KillMode=control-group

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
exec /opt/synehq-oos/bin/kelvo application --config "$OOS_DATA_DIR/application.yml"
```

This script must run inside the exact delegated service. Running it from an SSH shell does not create valid containment.

Create `/etc/systemd/system/synehq-oos-kelvo.service`:

```ini
[Unit]
Description=SyneHQ OOS Kelvo execution service
Requires=synehq-oos-resolver.service
After=network-online.target synehq-oos-resolver.service

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
KillMode=control-group
TimeoutStopSec=45
Restart=on-failure
UMask=0077

[Install]
WantedBy=multi-user.target
```

The `jobs` cgroup must be empty before Kelvo admits work. Its parent must delegate the CPU, memory, and process controllers.

The whole-service limits include gateway overhead. They are example bounds, not a measured minimum for every workload.

Create `/etc/systemd/system/synehq-oos-web.service`:

```ini
[Unit]
Description=SyneHQ OOS web app
After=network-online.target synehq-oos-kelvo.service

[Service]
Type=simple
User=synehq-oos
Group=synehq-oos
WorkingDirectory=/opt/synehq-oos/source/apps/web
EnvironmentFile=/etc/synehq-oos/runtime.env
ExecStart=/opt/node/bin/node /opt/synehq-oos/source/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100
Restart=on-failure
UMask=0077
KillMode=control-group

[Install]
WantedBy=multi-user.target
```

Start the services:

```sh
sudo systemctl daemon-reload
sudo systemctl start synehq-oos-resolver.service
sudo systemctl start synehq-oos-kelvo.service
sudo systemctl start synehq-oos-web.service
sudo systemctl status synehq-oos-resolver.service synehq-oos-kelvo.service synehq-oos-web.service
```

Keep ports 3101 and 8443 private. Only the web app belongs behind the public HTTPS reverse proxy.

## Create the owner

For browser setup, run this command in the service account's terminal with the environment loaded:

```sh
node --import tsx apps/web/scripts/operator.ts setup-token
```

Open `/setup` and enter the displayed token. The token expires after 30 minutes. Do not place it in a URL or shared log.

For local setup, set `ALLOW_SIGNUP=false` and run:

```sh
node --import tsx apps/web/scripts/operator.ts owner-create
```

The command requests the owner's email, name, and password. Password entry requires an interactive terminal.

Both paths create the same single owner. Setup closes after account creation, regardless of the `ALLOW_SIGNUP` value.

## Check the installation

1. Sign in and create a connection to a disposable PostgreSQL or MySQL database with verified TLS.
2. Test the connection and load its schema.
3. Read a table, apply a filter, and run a SQL query.
4. Check a large integer, a decimal, a timestamp, and a null value in the grid.
5. Open a chart and check the selected columns and limit notice.
6. If writes are enabled, check the exact target and SQL in the approval dialog.
7. Sign out and verify that protected pages require another login.

A running web process does not prove database access. Keep the source revision, binary hashes, and workflow results with the [validation record](validation.md).

## Development loop

Use `npm run dev` for the web process on an isolated host. Keep the resolver and Kelvo running under their existing service boundaries.

Run the required checks after a change:

```sh
node node_modules/typescript/lib/tsc.js --noEmit
npm test
npm run build
npm run format
npm run format:check
```

Use the TypeScript path shown above. A different `tsc` executable on `PATH` may belong to another package.

For schema changes, create a migration without applying it. Review its SQL before deployment, then regenerate the Prisma client.

Read [Operations](operations.md) before backup, restore, recovery, or key rotation.
