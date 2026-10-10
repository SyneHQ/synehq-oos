# Hakopod database explorer

Status: integration started. Subpath support is the first implementation. Automatic provisioning, shared login, and Hakopod deployment remain pending.

## User flow

Support self-hosted Hakopod and Hakopod Cloud.

1. A user creates a supported managed database.
2. Hakopod waits for a usable private endpoint and verified TLS.
3. Hakopod records the explorer connection and its source revision.
4. The database list shows an **Explore your databases** action.
5. The action opens the explorer under `/synehq/` with the user's authorized scope.

Users can also select other registered databases in their authorized Hakopod scope. Discovery alone must not grant access to their credentials.

A database can remain available when explorer provisioning fails. Show the failed explorer state and a bounded retry action separately.

## First implementation: subpath support

The source supports root mode and `/synehq` mode. The default remains root mode.

Build a prefixed image with the existing pinned Kelvo context:

```sh
docker buildx build \
  --build-arg OOS_BASE_PATH=/synehq \
  --build-context "kelvo_source=https://github.com/SyneHQ/kelvo-go.git#$(cat deploy/kelvo-revision)" \
  --load -t synehq-oos:hakopod .
```

For source builds, set `NEXT_PUBLIC_OOS_BASE_PATH=/synehq` when running `npm run build`. Set `OOS_BASE_PATH=/synehq` when starting that build.

The static build records its base path. The server rejects a different runtime path. `AUTH_URL` remains the public origin without a path.

The reverse proxy must preserve `/synehq/` when forwarding requests. It must also preserve the configured public host.

Links, callbacks, API requests, cookies, database logos, and Monaco assets use the prefix. Bare app routes do not bypass the prefix.

The internal `/healthz` endpoint remains available for container health checks. The prefixed build still requires its own owner login until the Hakopod session adapter exists.

The container workflow builds both root mode and `/synehq` mode on native AMD64 and ARM64 runners.
Each build must pass static asset, owner login, SQLite query, shutdown, and restart checks before publication.

After a successful main run, GHCR publishes these tags:

| Mode         | Moving tag     | Commit tag             |
| ------------ | -------------- | ---------------------- |
| Standalone   | `edge`         | `sha-<commit>`         |
| Hakopod path | `edge-hakopod` | `sha-<commit>-hakopod` |

Each tag contains both architectures. Pull-request builds do not publish images.
The Hakopod release must pin the tested prefixed image digest.
The prefixed image still requires the OOS owner login. It does not provide automatic import or shared Hakopod login.

### Verification

Verified on an isolated Linux VM on 10 October 2026:

- TypeScript and Prettier checks passed.
- All 123 tests passed, including the prefixed owner login, logout, CSRF, session revocation, and write-approval checks.
- Root and `/synehq` production static builds passed. Each served five routes and 29 assets, including Monaco files.

CI repeats both static builds and their asset checks. A prefixed container deployment, browser workflow, shared Hakopod login, and automatic connection provisioning still require qualification.

## Access and installation scope

Standalone OOS keeps one owner. Do not add public signup, invitations, or team management for this integration.

Hakopod must select the explorer instance from the authenticated workspace, project, and environment. A request cannot supply an arbitrary upstream address.

Cloud workspaces must have separate explorer data, encryption keys, credential grants, and query history. Do not share one installation owner session across tenants.

Recheck membership and database query permissions for each API request. An open browser page must not preserve access after permission revocation.

Keep scope explicit in navigation and API calls. Switching another browser tab to a different workspace must not redirect an existing query.

The session adapter must retain the real Hakopod actor in audit records. Query approvals must bind the actor, session, target, connection revision, and exact operation.

The browser must not receive a provisioning key or database password. A trusted proxy must remove user-supplied identity headers before setting its own authenticated context.

## Connection provisioning contract

Add a private, versioned control interface. It must not be available through the public `/synehq/` proxy.

Each managed record needs these fields:

| Field                  | Purpose                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| Source identity        | Stable Hakopod installation, workspace, project, environment, and database IDs. |
| Source revision        | Reject stale updates and make retries idempotent.                               |
| Connection identity    | Preserve saved query targets across retries and credential changes.             |
| Endpoint and TLS trust | Use the private endpoint and verify the server identity.                        |
| Credentials            | Encrypt the host and password through the existing OOS keyring.                 |
| State                  | Distinguish pending, ready, failed, suspended, and removed connections.         |

Credential rotation updates the existing connection and invalidates old grants. Database deletion revokes the managed connection without deleting unrelated user-added connections.

A control-plane retry must not repeat a database write. An interrupted write keeps its uncertain outcome until an operator resolves it.

Reuse Hakopod's managed database, external database, binding, and TLS trust services. Do not place credentials in environment dumps, URLs, command arguments, or logs.

## Supported engines

The explorer supports PostgreSQL, MySQL, ClickHouse, MongoDB, SQLite, and Oracle. Redis remains outside this integration.

Do not advertise every Hakopod engine automatically. Vitess needs explicit MySQL-protocol qualification. Other compatible protocols also need a tested mapping.

Local SQLite files stay inside the explorer's managed directory. The explorer must not mount arbitrary files from the Hakopod host.

## Runtime work

Hakopod normally uses K3s and containerd. The current OOS launcher uses Docker and a dedicated cgroup subtree.

Qualify the Hakopod runtime before automatic deployment. Preserve worker cgroups, Landlock, the non-root user, read-only root filesystems, and service resource limits.

Do not mount a Docker socket, cluster credentials, or writable host-wide cgroups into the explorer.

Count the explorer's memory and CPU in Hakopod capacity checks. Creating another managed database must reuse its scope's explorer service.

## Remaining delivery order

1. Verify subpath navigation, login, and editor assets.
2. Implement and test the private provisioning interface.
3. Implement Hakopod scope selection and authenticated sessions.
4. Qualify deployment on the named development cluster for both architectures.
5. Add the database list action and the scoped database picker.
6. Test provisioning, rotation, deletion, revocation, restart, and cross-tenant denial.
7. Publish pinned artifacts and perform a reviewed release rollout.

Passing a container build is not proof of Cloud tenant isolation or a live Hakopod integration.
