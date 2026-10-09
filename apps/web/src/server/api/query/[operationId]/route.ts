import { requireOwner } from "@/server/auth";
import { endpoint, response } from "@/server/http";
import { readOperation } from "@/server/kelvo/operations";
export const GET = endpoint(async (r: Request, c: { params: Promise<{ operationId: string }> }) =>
  response(await readOperation(await requireOwner(r), (await c.params).operationId)),
);
