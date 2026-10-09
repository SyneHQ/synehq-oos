import { currentOwner } from "@/server/auth";
import { endpoint, response } from "@/server/http";
export const GET = endpoint(async (request: Request) => {
  const owner = await currentOwner(request);
  return response({ owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null });
});
