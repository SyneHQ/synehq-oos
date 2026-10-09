import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { body, endpoint, response } from "@/server/http";
import { createConnection, listConnections } from "@/server/store";
const inputSchema = z
  .object({
    label: z.string(),
    engine: z.enum(["postgres", "mysql"]),
    host: z.string(),
    port: z.number(),
    database: z.string(),
    username: z.string(),
    password: z.string(),
    tlsMode: z.literal("verify-full").default("verify-full"),
    tlsCa: z.string().optional(),
    readOnly: z.boolean().default(true),
  })
  .strict();
export const GET = endpoint(async () =>
  response({ connections: await listConnections(await requireOwner()) }),
);
export const POST = endpoint(async (request: Request) => {
  const owner = await requireOwner();
  return response(
    { connection: await createConnection(owner, await body(request, inputSchema)) },
    201,
  );
});
