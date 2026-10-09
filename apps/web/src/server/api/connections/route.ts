import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { body, endpoint, response } from "@/server/http";
import { saveTestedConnection, listConnections } from "@/server/store";
const inputSchema = z
  .object({
    draftId: z.string().uuid(),
    operationId: z.string().uuid(),
  })
  .strict();
export const GET = endpoint(async (request: Request) =>
  response({ connections: await listConnections(await requireOwner(request)) }),
);
export const POST = endpoint(async (request: Request) => {
  const owner = await requireOwner(request);
  const input = await body(request, inputSchema);
  return response(
    { connection: await saveTestedConnection(owner, input.draftId, input.operationId) },
    201,
  );
});
