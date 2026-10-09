import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { body, endpoint, response, targetSchema, sqlSchema } from "@/server/http";
import { prepareQuery } from "@/server/kelvo/operations";
export const POST = endpoint(async (r: Request) => {
  const owner = await requireOwner(r);
  const input = await body(
    r,
    z
      .object({ target: targetSchema, sql: sqlSchema.optional(), command: sqlSchema.optional() })
      .strict()
      .refine(
        (value) => (value.sql !== undefined) !== (value.command !== undefined),
        "Provide either SQL text or a native command.",
      ),
  );
  return response(await prepareQuery(owner, input.target, input.sql ?? "", input.command));
});
