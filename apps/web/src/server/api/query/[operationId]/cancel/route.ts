import { requireOwner } from "@/server/auth";
import { endpoint, response, checkOrigin } from "@/server/http";
import { cancelOperation } from "@/server/kelvo/operations";
export const POST = endpoint(
  async (r: Request, c: { params: Promise<{ operationId: string }> }) => {
    checkOrigin(r);
    return response(await cancelOperation(await requireOwner(r), (await c.params).operationId));
  },
);
