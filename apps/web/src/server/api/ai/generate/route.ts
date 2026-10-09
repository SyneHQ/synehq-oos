import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { body, endpoint, response, targetSchema } from "@/server/http";
import { generateSql } from "@/server/ai";
export const POST = endpoint(async (request: Request) => {
  const owner = await requireOwner(request);
  const input = await body(
    request,
    z
      .object({
        target: targetSchema,
        prompt: z.string().min(1).max(8192),
        includeSchema: z.boolean().default(false),
      })
      .strict(),
  );
  return response(
    await generateSql(owner, input.target, input.prompt, input.includeSchema, request.signal),
  );
});
