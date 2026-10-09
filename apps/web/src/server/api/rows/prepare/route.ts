import { requireOwner } from "@/server/auth";
import { body, endpoint, response } from "@/server/http";
import { prepareRowChanges, prepareRowsSchema } from "@/server/kelvo/rows";

export const POST = endpoint(async (request: Request) => {
  const owner = await requireOwner(request);
  return response(await prepareRowChanges(owner, await body(request, prepareRowsSchema)));
});
