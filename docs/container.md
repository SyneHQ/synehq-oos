# Single-container installation

The image contains the static dashboard, the Node API, and Kelvo. Only the web port is published. Each installation has one owner and one data volume.

The runtime image uses Distroless Debian 12. It has no shell, package manager, Next.js server, npm, or TypeScript runner.

This is a development image. Read the [validation record](validation.md) for the checks that passed. A local image build is not a public release.

## Host requirements

- Linux with cgroup v2 and Landlock ABI 3 or later.
- Docker with the systemd cgroup driver and Buildx for source builds.
- A local data volume with enough space for settings, query results, and SQLite files.
- Administrator access for the first cgroup setup.

The current launcher targets a Linux Docker host. Docker Desktop, rootless Docker, and other cgroup drivers are not qualified.

Kelvo places each query worker in its own cgroup before the worker starts. Standard Docker mounts cgroup controls as read-only. The launcher therefore creates a dedicated host slice and gives this installation access to its job subtree. It does not give the container access to the Docker socket or writable host-wide cgroup controls.

The slice contains both the application container and its query workers. Its CPU, memory, and process limits cover both. `docker stats` reports the application cgroup only; use the slice counters to measure the full service.

## Build the image

Use the exact Kelvo revision recorded in `deploy/kelvo-revision`. Include its `third_party` directory; the Oracle driver has a documented compatibility patch.

From the OOS source root:

```sh
docker buildx build \
  --platform linux/amd64 \
  --build-context "kelvo_source=https://github.com/SyneHQ/kelvo-go.git#$(cat deploy/kelvo-revision)" \
  --load -t synehq-oos:local .
```

The image builds the dashboard as static files. It compiles the backend to JavaScript and Kelvo to native binaries. Build tools remain in the build stages.

The Dockerfile pins its Node, Go, and Distroless base images by digest. CI builds each image on a native runner for `linux/amd64` or `linux/arm64`. Each runner checks owner setup, a SQLite query through Kelvo, clean shutdown, and persisted restart. The six-engine live acceptance record remains separate.

## GitHub container builds

The `Check` workflow builds the complete container after the web checks pass. Pull requests build the image without a registry login or push. A push to `main` builds and publishes these tags:

| Image tag                                                 | Use                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| `ghcr.io/synehq/synehq-oos:edge`                          | The latest successful build from `main`. This tag can change. |
| `ghcr.io/synehq/synehq-oos:sha-<full-commit-sha>`         | The build for a specific OOS source commit.                   |
| `ghcr.io/synehq/synehq-oos:edge-hakopod`                  | The latest successful `/synehq` build from `main`.            |
| `ghcr.io/synehq/synehq-oos:sha-<full-commit-sha>-hakopod` | The `/synehq` build for a specific OOS source commit.         |

The workflow reads `deploy/kelvo-revision` and supplies that public Git commit as the `kelvo_source` build context. It builds `linux/amd64` and `linux/arm64` with separate caches. Both native runtime checks must pass before the publication job creates the shared tags. Docker selects the matching image when you pull a shared tag. It authenticates to GHCR with the job's `GITHUB_TOKEN`; no personal access token is required.

After the first publication, a repository administrator must check the GHCR package visibility. Set it to public to allow anonymous pulls. A public source repository does not automatically make its container package public.

To use a published development image on a supported host:

```sh
docker pull ghcr.io/synehq/synehq-oos:edge
sudo sh deploy/run-container.sh ghcr.io/synehq/synehq-oos:edge
```

Use a matching source checkout for the launcher. For repeatable installations, record the image digest and pass `ghcr.io/synehq/synehq-oos@sha256:<digest>` to the launcher. Commit tags identify source; a digest pins the image content.

An image publication is not a qualified release or a deployment. The workflow does not publish a `latest` tag, start a service, or update an existing installation. See the [validation record](validation.md) for remaining release checks.

Architecture-specific images also have `sha-<full-commit-sha>-amd64` and `sha-<full-commit-sha>-arm64` tags. A failed architecture keeps the previous shared `edge` tag unchanged.

Hakopod images add `-hakopod` before the architecture suffix. Both path variants use the same Docker host requirements.
The prefixed image keeps the normal OOS owner login. Shared Hakopod login and automatic connection import remain incomplete.
See the [Hakopod integration plan](hakopod-integration.md) for the remaining work.

## Start the installation

Run the launcher from the source checkout on the Docker host:

```sh
sudo sh deploy/run-container.sh synehq-oos:local
```

Open `http://localhost:3100`. The launcher publishes the port on loopback only.

For a different local port, set both values:

```sh
sudo env OOS_PORT=3200 AUTH_URL=http://localhost:3200 \
  sh deploy/run-container.sh synehq-oos:local
```

For remote access, set `AUTH_URL` to the exact HTTPS origin and place the loopback listener behind your HTTPS reverse proxy. Preserve the public `Host` header. The application does not trust forwarded host headers.

The launcher installs a small host preparation unit. It recreates the private cgroup delegation before Docker restores the container after a host reboot. It does not run another application service.

The container runs as user `65532`. Its root filesystem is read-only. All Linux capabilities are dropped. The default AppArmor profile remains active. The outer seccomp profile permits `clone3` for Kelvo's placement step; the worker sandbox then denies `clone3` and namespace creation.

## Create the owner

Read a setup token through the local operator command:

```sh
docker exec synehq-oos /nodejs/bin/node /app/dist/operator.mjs setup-token
```

Open `/setup`. Enter the token and create the owner. The token expires after 30 minutes. Initial setup closes after the owner exists.

To use terminal setup instead:

```sh
docker exec -it synehq-oos /nodejs/bin/node /app/dist/operator.mjs owner-create
```

Do not put a setup token in a URL, a shared log, or a support report.

## Runtime layout

| Item                     | Purpose                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `/app/public`            | Static HTML, scripts, styles, database logos, and editor assets.                       |
| Node process             | Same-origin APIs, owner sessions, encrypted credentials, and private TLS resolver.     |
| Kelvo process            | Operation admission, durable results, and contained database workers.                  |
| `/data/runtime`          | Settings, separate key files, TLS identities, operation history, and retained results. |
| `/data/sqlite-databases` | Managed local SQLite files.                                                            |
| `/run/kelvo-cgroup`      | The installation's delegated job controls.                                             |

The API and resolver use one Node process. The resolver and Kelvo listen on container loopback. A small init process forwards signals and reaps orphan processes.

A file lock prevents two containers from using the same data volume at once. Startup applies reviewed metadata migrations. It checks migration hashes and rejects changed or newer history.

The image retains existing keys and operation records. If an adapter upgrade finds unresolved operations, startup stops before applying migrations. Resolve those operations with the previous image first. Unknown writes are never replayed automatically.

## Resource limits

The initial profile permits one database operation at a time:

| Limit                               | Value                                                  |
| ----------------------------------- | ------------------------------------------------------ |
| Whole service memory                | 768 MiB, including the application and worker cgroups. |
| Whole service CPU                   | At most two CPU cores.                                 |
| Whole service processes and threads | 256.                                                   |
| Query timeout                       | 30 seconds.                                            |
| Query result                        | 10,000 rows or 4 MiB.                                  |
| Metadata result                     | 1 MiB.                                                 |
| Worker memory                       | 128 MiB, including its native overhead.                |
| Retained result storage             | 1 GiB.                                                 |
| Retained operations                 | 512 records for one hour.                              |

These are enforced limits and configured budgets. They are not idle memory measurements or a promise that every query fits. Database permissions and server-side limits still apply.

Static assets are compressed during the build. Requests serve existing Brotli or gzip files. The service does not compress the dashboard on demand. It starts no idle database workers and uses no continuous readiness polling timer.

The image omits DuckDB support and its native library. The six supported engines do not require DuckDB.

## Health and shutdown

`/healthz` succeeds only when the private resolver and authenticated Kelvo health check are ready. Query admission stays closed during startup and drain. An unhealthy Kelvo response does not cause automatic write resubmission.

Stop the service with enough time to drain:

```sh
docker stop --time 90 synehq-oos
```

The wrapper closes public admission and allows active HTTP responses five seconds to finish. It then closes stalled connections and asks Kelvo to drain. The resolver stays available until Kelvo exits. A failed Kelvo shutdown produces a failed container exit.

The container profile requires a 30-second query timeout. Custom configurations with a longer timeout need a matching reviewed shutdown profile.

## Data and updates

The `synehq-oos-data` volume holds the installation. Keep this volume when you replace the container. Do not start two containers with it.

Read the [operations guide](operations.md) before backups, restores, password recovery, or key rotation. Backup and upgrade qualification remain separate from the normal query checks.

Before replacing an image, finish or resolve active operations, stop the container, and make a coordinated backup of the data volume. Keep the prior image digest. An older image can reject metadata that a newer image has migrated; image rollback alone is not a database rollback.

TLS certificates are generated locally. The CA lasts ten years; service certificates last one year. The image does not silently replace expired or incomplete certificate pairs. Follow the TLS renewal procedure before expiry.

## Source records

The seccomp profile is based on Moby profiles revision `2ceae35d351c156cb5a8efc0fdc4a08cf94569d8`, file `seccomp/default.json`. The only policy change removes its `clone3` denial and permits that syscall. Moby retains its Apache-2.0 license.

Distroless, Node, Go, Prisma, Auth.js, Tini, Kelvo, and database drivers retain their own license terms. See [NOTICES](../NOTICES) and the [dependency record](dependencies.md).
