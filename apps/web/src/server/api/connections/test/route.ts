import { randomUUID } from "node:crypto";
import { requireOwner } from "@/server/auth";
import { body, endpoint, response } from "@/server/http";
import { createConnectionDraft } from "@/server/store";
import { connectionDraftSchema } from "@/server/store/connection-input";
import { startOperation } from "@/server/kelvo/operations";

export const POST = endpoint(async (request: Request) => {
  const owner = await requireOwner(request);
  const input = await body(request, connectionDraftSchema);
  const draft = await createConnectionDraft(owner, input);
  const operationId = randomUUID();
  const operation = await startOperation(
    owner,
    {
      connectionId: draft.id,
      connectionRevision: draft.revision,
      database: draft.database,
      schema: null,
    },
    {
      version: 1,
      kind: "connection.test",
      connection: { id: draft.id, database: draft.database },
      idempotency_key: operationId,
      spec: {},
    },
  );
  return response({ ...operation, draftId: draft.id, expiresAt: draft.expiresAt }, 202);
});
