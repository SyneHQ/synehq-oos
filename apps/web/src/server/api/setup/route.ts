import { z } from "zod";
import { body, endpoint, response } from "@/server/http";
import { createOwner, setupStatus } from "@/server/store";
export const GET = endpoint(async () => response(await setupStatus()));
export const POST = endpoint(async (request: Request) => {
  const input = await body(
    request,
    z
      .object({
        token: z.string().max(256),
        email: z.string().email().max(254),
        name: z.string().min(1).max(120),
        password: z.string().min(12).max(128),
      })
      .strict(),
  );
  await createOwner(input);
  return response({ initialized: true }, 201);
});
