# UI extraction record

Source repository: `SyneHQ/app.ts` (private source).
Source revision: `664256bb66f54a3dbec912efae6f7fdbdf44fc8b`.

The selected source checkout is read-only. The extracted explorer packages contain no Cloud routes, credentials, database drivers, teams, telemetry, or Python runtime.

Result charts use a separate standalone Syne Charts module. The [chart record](chart-provenance.md) describes that module and its source.

The [connection form record](connection-form-source.md) records the reused engine picker, fields, and test-before-save flow.
The [database logo record](database-logos.md) identifies the six vendor PNG assets and their sources.
The [MongoDB document view record](mongodb-document-view-source.md) records the adapted JSON list and exact-value handling.

## Copied and adapted source

| Source path                                        | Source Git blob                            | Source SHA-256                                                     | Destination                                 | Change                                                                        |
| -------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/packages/probe/components/badge.tsx`          | `9a5a0646db17d5ee1bd45811fd9e2621c7e81932` | `c340e555b148139329934679e6f2ceff0eeec948471b0d489abedb265b538db2` | `packages/ui/src/components/badge.tsx`      | Copied; host-independent imports retained                                     |
| `src/packages/probe/components/button.tsx`         | `09f450d62f9d9a334c6aa1300b092e6902e7e2aa` | `dc8c25dc8495400d5b8b5b9673573a27878ac18b52725907a24ff5f1a3341d18` | `packages/ui/src/components/button.tsx`     | Copied; host-independent imports retained                                     |
| `src/packages/probe/components/field.tsx`          | `0abda99668f84a119804f677d2820801fab53259` | `e64061f0545acd7bb6376a072ecab78243a15b98f245ab97887e5cdd67d137e4` | `packages/ui/src/components/field.tsx`      | Copied; host-independent imports retained                                     |
| `src/packages/probe/components/input.tsx`          | `27b3f564d2b1352af26c5c2eb725f7ef773dc689` | `2409c7ce0dd3f6a8a51ee86bd5f729e34addd0830e989f57f636747fd4e3b0b8` | `packages/ui/src/components/input.tsx`      | Copied; host-independent imports retained                                     |
| `src/packages/probe/components/pagination.tsx`     | `eadb16156ee042febe3c06d295388783638e4897` | `6bb49c40fbb24850d8ce5eb9031cd2a46f1c62e1775cb87b0b7319984e9680ff` | `packages/ui/src/components/pagination.tsx` | Copied; host-independent imports retained                                     |
| `src/packages/probe/components/spinner.tsx`        | `376f3ea58ed29c80fb4110cf4a473e8d7b03ae1e` | `2a6f83a5e275a6a086bfcb9bf82106df31d6e85796b47573bfedd85f9b0dc158` | `packages/ui/src/components/spinner.tsx`    | Copied; host-independent imports retained                                     |
| `src/packages/probe/components/table.tsx`          | `eef02ab4dd4aa0b6525e0d234ef38e2d9cca5c9c` | `a48ec24474da26f8968b32f8665ca8d3273c0bb5a294f2e1311823f960f0cfab` | `packages/ui/src/components/table.tsx`      | Copied; host-independent imports retained                                     |
| `src/packages/probe/components/tree-view.tsx`      | `75dfc4e989d40df673a23237aac9613ebde328a3` | `33afbe09b8ae7eb7143dc63e23aec7f83a0c09fe9b33888b3ea968540180fc55` | `packages/ui/src/components/tree-view.tsx`  | Copied; host-independent imports retained                                     |
| `src/packages/probe/lib/cn.ts`                     | `ef23a7f1434338bdf88411de24548cfa1ca82113` | `8981e6c250300b23b0400d9d82c1c2c5a58fb6f419f3f2313a60ced937eaa866` | `packages/ui/src/lib/cn.ts`                 | Copied; host-independent imports retained                                     |
| `src/packages/probe/lib/types.ts`                  | `528deabe6e33c355acf9b3459d387cd4973f5c03` | `350ca80e7d191a39c430c3ffda96f35c6bf00f9c17b0eb15cf9ab68d3e99faa0` | `packages/ui/src/lib/types.ts`              | Copied; host-independent imports retained                                     |
| `src/packages/probe/probe.css`                     | `c2c1fbcc4093672ef26e67dfbd90a3ebc5948d1a` | `a9b5c45c08cae28829002e63a73c97821fa604704062957b979bc600e1998635` | `packages/ui/src/probe.css`                 | Copied; host-independent imports retained                                     |
| `src/packages/probe/tokens/components.css`         | `64c46550bffe7d0f208ae38ceefb4581d9665a71` | `6f9cc89b25acd9f7ed4b9152a2bbf30a8e2c3deeb29084b4af0206fb5f60d265` | `packages/ui/src/tokens/components.css`     | Copied; host-independent imports retained                                     |
| `src/packages/probe/tokens/primitives.css`         | `44b1680f0254b4599143048678bb016a1d0cf9d8` | `0913d08430a76df57c966596b3513a283595921c5d39d2fea16af66f3840593c` | `packages/ui/src/tokens/primitives.css`     | Copied; host-independent imports retained                                     |
| `src/packages/probe/tokens/themes.css`             | `6f68e4028a0df5485fadb0882044fa539623133d` | `58d7f2cad1f62426a79d65f62857eb1bec90c16b3a0d0a308d3e5aee29e44ed3` | `packages/ui/src/tokens/themes.css`         | Copied; host-independent imports retained                                     |
| `src/components/schema-tree.tsx`                   | `e29e2a8e6db0a498d7245a30cd7de1160013fdfc` | `0219b2fa43a4ff324c3c0ed6b49b56560b2610aaacd78b62307c97ab97fd2934` | `packages/explorer/src/schema-tree.tsx`     | Adapted to public schema types; removed Redis branch                          |
| `src/app/database/components/SchemaVisualizer.tsx` | `4035a95e8327c8c01edbc0611f56462618db8068` | `e33c033cf6c87021601d1e7d761031ce491beb3d4aa73bd1d1332311130fd609` | `packages/explorer/src/schema-diagram.tsx`  | Adapted Dagre layout; normalized identities; removed mutation and Cloud state |

## Cloud grid and editor extraction

The [source manifest](cloud-grid-source.json) records each additional source path, Git blob, content hash, and destination.

`DatabaseGrid` adapts the real Cloud `ExplorerTable`, `ExplorerDataGrid`, `useDataGrid`, cell renderers, and staged-edit reducer. It preserves row selection, clipboard actions, search, resizing, column menus, and keyboard navigation.

The host receives a batch of additions, edits, and deletions. The batch contains original rows for identity and concurrent-change checks. The grid cannot execute a database request.

The extraction includes these targeted changes:

- Numeric cells preserve exact integer and decimal text during editing and paste.
- Pasted text, timestamps, and JSON keep their exact text.
- Clipboard quoting keeps tabs, line breaks, and quotes inside their original cells.
- Copy formats use visible column names. JSON copy preserves duplicate names in a column-and-row format.
- Text and boolean cells distinguish `NULL` from empty text and false.
- Date columns retain raw timestamp text. The calendar variant is absent.
- The JSON side sheet uses the shared Monaco editor. It validates syntax but stages the original text.
- A pending review locks editing and prevents duplicate submission.
- Only an explicit `true` result clears staged changes.
- Selected-row deletion uses original rows, including when cells contain staged edits.
- Reverting a cell removes its pending edit. Removing a new row removes its edits.
- The host controls target changes and any partial or unknown write outcome.
- The package excludes the MongoDB document list, Cloud stores, permissions, routes, and telemetry.

`CodeEditor` adapts `ReviewQueryEditor` and the main Monaco editor. It reuses options, selection execution, snippets, and schema completion. The host supplies schema metadata and execution callbacks.

The host serves Monaco assets locally. The package excludes inline Cloud AI calls, file upload, Python execution, and the Cloud SQL dialect dependency.

`SchemaDiagram` uses declared foreign keys only. Node identity includes database, schema, and table. Moving a diagram node does not change database metadata.

## License provenance

The project owner authorized extraction and open-source distribution of SyneHQ-owned source. Those portions use this repository's Apache-2.0 license.

Two helper files adapt Radix Primitives source and retain its MIT terms:

- `packages/explorer/src/cloud/hooks/use-callback-ref.ts`
- `packages/explorer/src/cloud/lib/compose-refs.ts`

These adaptations retain `Copyright (c) 2022 WorkOS`. The [full MIT notice](../third-party-licenses/radix-primitives-MIT.txt) applies to both files.

The reference packages are `@radix-ui/react-use-callback-ref` `1.1.1` and `@radix-ui/react-compose-refs` `1.1.2`. Their release metadata identifies Radix revision `fcef0668a5c827e5a4baac405474d75680f9a4eb`.

The notice preserves the [license at that revision](https://github.com/radix-ui/primitives/blob/fcef0668a5c827e5a4baac405474d75680f9a4eb/LICENSE). Preserve it when distributing these helper adaptations.

The inspected private snapshot had no tracked root license. This historical detail does not change the owner's authorization. Source attribution remains in the table above and in `NOTICES`.

Retained third-party libraries require their existing notices. Dependencies are declared by the repository lead. The [dependency record](dependencies.md) lists exact versions and their purposes. It does not copy images or font binaries from Cloud.

## Validation status

The grid and editor extraction are implemented. The full Linux gate passed 58 unit tests, the direct TypeScript check, and the production application build.

The [validation record](validation.md) tracks browser checks, database workflows, and remaining release work. The [chart record](chart-provenance.md) describes the chart data checks.
