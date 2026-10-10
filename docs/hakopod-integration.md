# Hakopod database explorer

Hakopod can open this explorer with its current browser session. The browser does not receive a database password, an OOS control key, or a second login cookie.

Use a separate OOS instance for each Hakopod project and environment. Cloud scopes also require a fixed workspace binding. Each instance needs its own metadata, encryption keys, data volume, and query containment boundary. Do not point two scopes at one instance.

## Configuration

Use a digest-pinned image built with `/synehq`. Set these variables in the OOS service:

| Variable                    | Value                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `OOS_BASE_PATH`             | `/synehq`                                                                          |
| `OOS_HAKOPOD_SCOPE`         | The exact scope string from the Hakopod target configuration                       |
| `OOS_HAKOPOD_KEY_FILE`      | A private file with a separate 32-byte key, encoded as 64 lowercase hex characters |
| `OOS_HAKOPOD_AUTHORITY_URL` | The engine URL ending in `/internal/database-explorer/authorize`                   |
| `AUTH_URL`                  | The OOS upstream origin, without a path                                            |

The authority URL must use HTTPS. Loopback HTTP is allowed on the same host. The key file must have mode 0600 or stricter and must be readable by the OOS service user. Keep this key separate from session, encryption, TLS, and Kelvo keys.

Start with new metadata. Managed mode cannot take over an existing standalone owner. The first authenticated source sync creates a managed owner record with no password login. The scope is then fixed in metadata. Local signup and password login are unavailable in managed mode.

Use the normal containment launcher and its reviewed deployment controls. Environment variables alone do not make a Kubernetes pod compatible with Kelvo. The existing restricted-pod probe failed its containment checks; Kubernetes deployment remains unqualified.

## Private protocol

`POST /synehq/internal/hakopod/sync` accepts a complete version 1 source snapshot. It requires the instance control key as a bearer token. Hakopod's browser proxy never forwards this route.

Each source has a stable managed database ID, a connection fingerprint, and validated OOS connection fields. The snapshot has at most 64 sources. Hosts, passwords, and CA certificates enter the existing AES-256-GCM store. Repeated snapshots keep connection IDs and revisions. Changed sources increment the local revision and invalidate approvals. Missing sources are soft-deleted. Manually added connections remain intact.

Hakopod passes an opaque authority ticket to OOS on each proxied request. OOS asks the configured authority server to validate it. The server checks the current human session, scope, and grants. Credential resolution also checks the live source fingerprint and write permission. An unavailable authority server denies access.

Managed sessions retain the real actor. Each human session gets its own approval scope and audit identity. Session tickets are encrypted in metadata. A broker restart invalidates its outstanding tickets; reopening the explorer obtains new authority.

## Browser routes

Hakopod opens `/synehq/s/<scope>/connections/`. The encoded scope selects a route only; it grants no access. Each tab keeps the same project, environment, and Cloud workspace. Asset, API, and Monaco paths retain that scope.

Users with connection-management permission can add other databases. Imported connection removal and changes remain in Hakopod. Query writes still require the existing browser review and approval.

Standalone mode keeps its one-owner login and root-path support.
