import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { body, checkOrigin, endpoint, response } from "@/server/http";
import { deleteConnection, getConnection, updateConnection } from "@/server/store";
type Context = { params: Promise<{ id: string }> };
const inputSchema = z
  .object({
    revision: z.number().int().positive(),
    label: z.string().optional(),
    engine: z.enum(["postgres", "mysql"]).optional(),
    host: z.string().optional(),
    port: z.number().optional(),
    database: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    tlsMode: z.literal("verify-full").optional(),
    tlsCa: z.string().optional(),
    readOnly: z.boolean().optional(),
  })
  .strict();
export const GET = endpoint(async (_: Request, c: Context) =>
  response(await getConnection(await requireOwner(), (await c.params).id)),
);
export const PATCH = endpoint(async (r: Request, c: Context) =>
  response(
    await updateConnection(await requireOwner(), (await c.params).id, await body(r, inputSchema)),
  ),
);
export const DELETE = endpoint(async (r: Request, c: Context) => {
  checkOrigin(r);
  await deleteConnection(await requireOwner(), (await c.params).id);
  return response({ deleted: true });
});
