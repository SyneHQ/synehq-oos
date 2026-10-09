import { requireOwner } from "@/server/auth";
import { body, checkOrigin, endpoint, response } from "@/server/http";
import { deleteConnection, getConnection, updateConnection } from "@/server/store";
import { connectionUpdateSchema } from "@/server/store/connection-input";
type Context = { params: Promise<{ id: string }> };
export const GET = endpoint(async (r: Request, c: Context) =>
  response(await getConnection(await requireOwner(r), (await c.params).id)),
);
export const PATCH = endpoint(async (r: Request, c: Context) =>
  response(
    await updateConnection(
      await requireOwner(r),
      (await c.params).id,
      await body(r, connectionUpdateSchema),
    ),
  ),
);
export const DELETE = endpoint(async (r: Request, c: Context) => {
  checkOrigin(r);
  await deleteConnection(await requireOwner(r), (await c.params).id);
  return response({ deleted: true });
});
