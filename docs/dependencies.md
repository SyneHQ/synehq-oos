# Dependency record

Direct dependencies use exact versions. React peer ranges describe compatibility. They do not replace the host's exact version.

The lockfile records the complete dependency graph. Dependency packages retain their own license files and notices.

## Runtime dependencies

| Dependency           | Version   | Reason                                                                                      |
| -------------------- | --------- | ------------------------------------------------------------------------------------------- |
| `next`               | `16.3.4`  | Builds the static dashboard. It is absent from the server runtime.                          |
| `react`, `react-dom` | `19.2.8`  | Renders the existing SyneHQ component family.                                               |
| `@auth/core`         | `0.41.3`  | Retains Auth.js credentials, CSRF, cookies, and session callbacks without a Next.js server. |
| `@prisma/client`     | `6.1.0`   | Stores local installation metadata in SQLite. It does not connect to customer databases.    |
| `zod`                | `3.25.76` | Checks untrusted request and stored-value shapes.                                           |
| `server-only`        | `0.0.1`   | Prevents accidental browser imports of server modules.                                      |
| `apache-arrow`       | `21.0.0`  | Reads Kelvo result batches at the server boundary.                                          |

## Explorer dependencies

These dependency families already exist in the reviewed SyneHQ app. Reuse reduces custom editor and layout code.

| Dependency                      | Version   | Reason                                                                                                             |
| ------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| `monaco-editor`                 | `0.53.0`  | Retains the main app editor, SQL selection, snippets, and schema completion.                                       |
| `@monaco-editor/react`          | `4.7.0`   | Connects the controlled editor to React.                                                                           |
| `@tanstack/react-table`         | `8.21.3`  | Retains the main app grid model, selection, columns, and pagination.                                               |
| `@tanstack/react-virtual`       | `3.13.12` | Renders visible grid rows without changing wire values.                                                            |
| `@radix-ui/react-checkbox`      | `1.3.3`   | Retains accessible row and boolean selection controls.                                                             |
| `@radix-ui/react-dialog`        | `1.1.15`  | Retains accessible dialogs and side sheets.                                                                        |
| `@radix-ui/react-direction`     | `1.1.1`   | Preserves grid direction and keyboard behavior.                                                                    |
| `@radix-ui/react-dropdown-menu` | `2.1.16`  | Retains grid and column action menus.                                                                              |
| `@radix-ui/react-icons`         | `1.3.2`   | Retains source pagination controls.                                                                                |
| `@radix-ui/react-popover`       | `1.1.15`  | Retains floating grid controls.                                                                                    |
| `@radix-ui/react-select`        | `2.2.6`   | Retains bounded page-size and value controls.                                                                      |
| `@radix-ui/react-slot`          | `1.2.4`   | Preserves source button composition.                                                                               |
| `@radix-ui/react-tooltip`       | `1.2.8`   | Retains accessible control hints.                                                                                  |
| `cmdk`                          | `1.1.1`   | Retains searchable value controls in the source grid.                                                              |
| `sonner`                        | `2.0.7`   | Reports staged edits and grid interaction errors.                                                                  |
| `reactflow`                     | `11.11.4` | Displays and moves relationship diagram nodes.                                                                     |
| `@dagrejs/dagre`                | `1.1.5`   | Computes the initial relationship diagram layout.                                                                  |
| `lucide-react`                  | `0.544.0` | Supplies consistent interface icons without copied image assets.                                                   |
| `clsx`                          | `2.1.1`   | Composes conditional class names in Probe controls.                                                                |
| `tailwind-merge`                | `3.3.1`   | Preserves the extracted Probe class helper. Check class behavior when updating Tailwind.                           |
| `echarts`                       | `5.6.0`   | Renders bar, line, and scatter views from completed query results. Modular imports avoid unrelated chart features. |

The host serves Monaco assets at `/monaco/vs`. The build and development commands copy assets from the pinned dependency. The editor does not use a CDN.

The grid reuses the real Cloud TanStack implementation and selected Probe controls. It does not use the unrelated spreadsheet editor.

Date and timestamp columns edit as text. The extraction does not include the calendar or its date conversion dependency.

## Build and type dependencies

| Dependency            | Version   | Reason                                                                 |
| --------------------- | --------- | ---------------------------------------------------------------------- |
| `prettier`            | `3.6.2`   | Formats repository code and documents consistently.                    |
| `typescript`          | `5.9.3`   | Checks public contracts and application types.                         |
| `tsx`                 | `4.20.6`  | Runs TypeScript tests and local operator commands.                     |
| `prisma`              | `6.1.0`   | Generates the metadata client and deploys reviewed migrations.         |
| `tailwindcss`         | `3.4.17`  | Builds styles used by the extracted Probe controls.                    |
| `tailwindcss-animate` | `1.0.7`   | Preserves the existing Probe overlay and grid menu transitions.        |
| `postcss`             | `8.5.6`   | Processes the application's stylesheet imports and plugins.            |
| `autoprefixer`        | `10.4.21` | Adds required CSS vendor prefixes.                                     |
| `@types/node`         | `24.5.2`  | Checks Node APIs.                                                      |
| `@types/react`        | `19.1.13` | Checks React components.                                               |
| `@types/react-dom`    | `19.1.9`  | Checks React DOM APIs.                                                 |
| `@types/dagre`        | `0.7.53`  | Supplies compatibility types for the selected graph layout dependency. |

Node `24.21.0` is the current build runtime. The declared engine range is `>=24.21.0 <25`.

## Service dependencies

Kelvo has a separate repository. The OOS image includes it as a local process. It is the only route to customer databases.

SQLite stores app metadata. Node's built-in crypto module handles encryption and password derivation. No external secret store is required.

The personal deployment does not add Redis or Python. Its image build pins the Kelvo source revision and documents its service configuration.

The six database connectors reuse Kelvo's existing drivers. They add no Node database driver or runtime dependency.

## Disposable test fixtures

`tests/prepare-extra-fixtures.py` prepares isolated database containers on the assigned Linux test host. Python and Docker are test tools, not app services.

The Oracle slim fixture omits the wallet tools needed for a native TCPS listener. The fixture script installs OpenJDK 17 in that container and uses Oracle's `oraclepki` `23.26.3.0.0` jar from Maven Central. It verifies the jar's SHA-256 before use. These tools are not included in the OOS app or release.

Database logos are static PNG files. The asset preparation used the VM's existing Sharp package. The app adds no image conversion dependency.

## Update rules

1. State the problem before adding a dependency.
2. Check existing components and libraries first.
3. Review the new dependency's source, maintenance, and license.
4. Pin the direct version and update the lockfile.
5. Run checks for the affected behavior in the isolated Linux environment.

The AI integration uses Node HTTP APIs and the provider's OpenAI-compatible interface. It does not require a provider SDK.

The chart module uses ECharts directly. It does not add `echarts-for-react`, a theme provider, or Outerbase Studio source.

ECharts 5.6.0 uses Apache-2.0. Keep its license and notice files during distribution. The [chart review](outerbase-chart-review.md) records the source decision.

## Container build and runtime

- GitHub Actions uses Docker's `setup-buildx-action` v3, `login-action` v3, and `build-push-action` v6 to build the full image, reuse build cache, and publish main-branch images to GHCR. These are CI tools and add no runtime dependencies.
- `esbuild` `0.25.12` bundles server code before deployment. It was already present through the test runner. A direct pin makes the build dependency explicit.
- The container uses Node `24.21.0`, Go `1.26.8`, and Distroless Debian 12 base images pinned by digest in the Dockerfile.
- Tini forwards signals and reaps orphan processes. This is needed because one container runs Node, Kelvo, and temporary query workers.
- A small Go helper uses the standard library to create local TLS certificates, hold the data-volume lock, and check health. It replaces a runtime OpenSSL command and a Node process for each Docker health check.
- Node's built-in SQLite API applies reviewed metadata migrations at startup. Prisma's client remains the metadata API. The Prisma CLI is excluded from the image.
- Brotli and gzip files are produced with Node's build-time compression APIs. The HTTP service adds no compression dependency or runtime compression work.
- The image omits DuckDB and its native library. Both Kelvo binaries use the supported native connectors.

The Moby seccomp source and the one required syscall change are recorded in the [container guide](container.md). The Oracle compatibility patch belongs to Kelvo and retains its upstream source, license, and patch record.
