import { managedMode, managedConfig } from "@/server/hakopod";
import { currentOwner } from "@/server/auth";
import { endpoint, response } from "@/server/http";
export const GET = endpoint(async (request: Request) => {
  const owner = await currentOwner(request);
  return response({
    managed: managedMode(),
    scope: managedMode() ? managedConfig().scope : undefined,
    canManage: owner?.canManage ?? !managedMode(),
    owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
  });
});
