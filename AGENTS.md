# SyneHQ OOS contributor instructions

Build a personal database explorer. Each installation has exactly one owner.

- Use simple English. Use no emojis in code, documentation, or UI text.
- Preserve browser approval for writes. AI can generate SQL text but cannot execute it.
- Send all customer database operations through Kelvo. Node can access local app metadata only.
- Store database credentials and provider keys with server-only Node AES-256-GCM encryption.
- Keep session keys, encryption keys, service signing keys, and TLS keys separate.
- Never commit secrets, environment files, runtime databases, or private credentials.
- Keep shared UI independent from auth, Prisma, Cloud routes, teams, billing, charts, and telemetry.
- Reuse reviewed source components. Record their repository, revision, path, and license provenance.
- Use soft deletion for owner-managed records and audit privileged actions.
- Review generated Prisma migration SQL before deployment. Do not change applied migrations.
- Document new dependencies and their purpose in docs/dependencies.md.
- Preserve precise database values and explicit uncertain execution outcomes.
- Use purpose-based branch names. Do not change another agent's assigned files without coordination.
- Build and test in the assigned isolated Linux environment. Local source edits and static checks are permitted.
- Report implemented, tested, published, and deployed states separately.

## Current ownership

- Auth agent: apps/web/src/server/{auth,crypto,store}/, apps/web/prisma/, apps/web/scripts/, related tests.
- Explorer agent: packages/ui/, packages/explorer/, apps/web/src/app/ UI files and global styles.
- Integration lead: root manifests, shared contracts, Kelvo client, app APIs, integration, deployment, and docs.
- Kelvo agent: the separate feature/standalone-explorer Kelvo worktree.
