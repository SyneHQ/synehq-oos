import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { body, endpoint, response, targetSchema, sqlSchema } from "@/server/http";
import { prepareQuery } from "@/server/kelvo/operations";
export const POST = endpoint(async (r: Request) => {
  const owner = await requireOwner();
  const input = await body(r, z.object({ target: targetSchema, sql: sqlSchema }).strict());
  return response(await prepareQuery(owner, input.target, input.sql));
});
