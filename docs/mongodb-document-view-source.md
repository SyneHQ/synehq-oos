# MongoDB document view source

The OOS document view adapts the main SyneHQ JSON document list.
The source repository is `SyneHQ/app.ts`.
The source checkout remains read-only.

| Item              | Value                                                              |
| ----------------- | ------------------------------------------------------------------ |
| Source revision   | `664256bb66f54a3dbec912efae6f7fdbdf44fc8b`                         |
| Source file       | `src/components/table/json-document-view.tsx`                      |
| Source Git blob   | `615351e5ca81f5951b8300a210dcf19a9700bfc7`                         |
| Source SHA-256    | `9a3b707ffd1c7248d0cf9dba0b3d92581445f378bbad13a64c1eddbaf9792fbb` |
| OOS component     | `packages/explorer/src/json-document-view.tsx`                     |
| OOS source reader | `packages/explorer/src/json-document.ts`                           |

The component reuses the source's `DocumentCard`, recursive `FieldValue`, copy action, and empty-state patterns.
It uses the existing Probe button, Lucide icons, React, and Sonner.
It adds no dependency.
It replaces the source's fixed-height list and external JSON viewer with a compact list and expandable fields.

MongoDB collection browsing and native console results use the same view.
Each document shows its fields immediately.
Nested objects and arrays can expand or collapse.
Each page contains at most 100 documents.
Each open container first shows at most 100 fields or array items.
The owner can reveal the remaining fields without another database request.

The reader uses `JSON.parse` only to check syntax.
It displays the original source ranges for keys and values.
It preserves numeric tokens, duplicate keys, key order, and all Extended JSON type markers.
The copy action writes the original document text.
It reports success only after the clipboard write succeeds.

The header shows the document's position in the result.
It does not invent an ObjectId or another database field.
The view has no table, row selection, edit, or delete controls.
Approved MongoDB writes remain in the native console.

The host retains the existing result limits, server paging, refresh action, and error states.
Console paging uses the already returned result.
Collection paging requests the next page from the server.
The parser tests cover exact numbers, canonical EJSON, escaped strings, duplicate keys, and invalid documents.
The [validation record](validation.md) records the checks that actually ran.
