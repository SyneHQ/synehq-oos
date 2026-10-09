import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { body, endpoint, response } from "@/server/http";
import { getAiSettings, saveAiSettings } from "@/server/store";
import { aiEndpoint } from "@/server/ai";
export const GET = endpoint(async (request: Request) =>
  response(await getAiSettings(await requireOwner(request))),
);
export const PUT = endpoint(async (request: Request) => {
  const owner = await requireOwner(request);
  const input = await body(
    request,
    z
      .object({
        enabled: z.boolean(),
        endpoint: z.string().max(2048),
        model: z.string().min(1).max(256),
        apiKey: z.string().max(16384).nullable().optional(),
        revision: z.number().int().positive().optional(),
      })
      .strict(),
  );
  await aiEndpoint(input.endpoint);
  return response(await saveAiSettings(owner, input));
});
