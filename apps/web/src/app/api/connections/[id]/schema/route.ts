import { requireOwner } from "@/server/auth";
import { endpoint, response } from "@/server/http";
import { inspectSchema } from "@/server/kelvo/schema";
export const GET = endpoint(async (r: Request, c: { params: Promise<{ id: string }> }) =>
  response({
    tables: await inspectSchema(
      await requireOwner(),
      (await c.params).id,
      new URL(r.url).searchParams.get("schema"),
      true,
    ),
  }),
);
