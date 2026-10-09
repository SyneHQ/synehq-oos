import { z, ZodError } from "zod";
import { StoreError } from "./store";

export function response(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
export function endpoint(handler: (...args: any[]) => Promise<Response>) {
  return async (...args: any[]): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof StoreError)
        return response({ error: error.message, code: error.code }, error.status);
      if (error instanceof ZodError) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of error.issues) {
          const field = issue.path.join(".");
          if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
        }
        return response({ error: "Check the request fields and try again.", fieldErrors }, 400);
      }
      const code =
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string" &&
        /^P\d{4}$/.test(error.code)
          ? error.code
          : undefined;
      console.error("Request failed:", {
        name: error instanceof Error ? error.name : "UnknownError",
        ...(code ? { code } : {}),
      });
      return response({ error: "The request could not complete. Check the server log." }, 500);
    }
  };
}
export function checkOrigin(request: Request): void {
  const configured = process.env.AUTH_URL ?? process.env.OOS_PUBLIC_URL;
  if (
    !configured ||
    request.headers.get("origin") !== new URL(configured).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new StoreError(403, "This request must come from this installation.");
}
export async function body<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  checkOrigin(request);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new StoreError(415, "Send a JSON request.");
  if (!request.body) throw new StoreError(400, "Request body is required.");
  const reader = request.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.length;
      if (total > 256 * 1024) throw new StoreError(413, "The request is too large.");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new StoreError(400, "The request contains invalid JSON.");
  }
  return schema.parse(parsed);
}
const identifier = z
  .string()
  .min(1)
  .max(256)
  .refine((s) => s.isWellFormed() && !/[\0\r\n]/.test(s));
export const targetSchema = z
  .object({
    connectionId: identifier,
    database: identifier,
    schema: identifier.nullable(),
    connectionRevision: z.number().int().positive(),
  })
  .strict();
export const sqlSchema = z
  .string()
  .min(1)
  .refine(
    (s) =>
      s.trim().length > 0 &&
      s.isWellFormed() &&
      !s.includes("\0") &&
      Buffer.byteLength(s) <= 100000,
    "SQL exceeds the limit or contains an invalid character.",
  );
export const querySchema = z
  .object({
    target: targetSchema,
    sql: sqlSchema.optional(),
    command: sqlSchema.optional(),
    mode: z.enum(["read", "write"]).default("read"),
    operationId: z.string().uuid().optional(),
    approvalId: z.string().uuid().optional(),
    approvalToken: z.string().max(256).optional(),
  })
  .strict()
  .refine(
    (input) => (input.sql !== undefined) !== (input.command !== undefined),
    "Provide either SQL text or a native command.",
  );
