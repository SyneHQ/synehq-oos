import { currentOwner } from "@/server/auth";
import { endpoint, response } from "@/server/http";
export const GET = endpoint(async () => {
  const owner = await currentOwner();
  return response({ owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null });
});
