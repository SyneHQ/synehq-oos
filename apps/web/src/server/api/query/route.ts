import { randomUUID } from "node:crypto";
import { requireOwner } from "@/server/auth";
import { body, endpoint, response, querySchema } from "@/server/http";
import { StoreError } from "@/server/store";
import { connectionQueryRequest, startOperation } from "@/server/kelvo/operations";
export const POST = endpoint(async (r: Request) => {
  const owner = await requireOwner(r);
  const input = await body(r, querySchema);
  if (input.mode === "write" && (!input.operationId || !input.approvalId || !input.approvalToken))
    throw new StoreError(403, "Review and confirm this write first.");
  if (input.mode === "read" && (input.approvalId || input.approvalToken))
    throw new StoreError(400, "Read operations cannot use a write approval.");
  const id = input.operationId ?? randomUUID();
  return response(
    await startOperation(
      owner,
      input.target,
      await connectionQueryRequest(
        owner,
        input.target,
        { sql: input.sql, command: input.command },
        input.mode,
        id,
        input.approvalId,
      ),
      id,
      input.approvalToken,
    ),
    202,
  );
});
