import { requireOwner } from "@/server/auth";
import { body, endpoint, response } from "@/server/http";
import { executeRowMutation, executeRowSchema, RowWriteNotSubmitted } from "@/server/kelvo/rows";
import { StoreError, type OwnerIdentity } from "@/server/store";
import { ZodError } from "zod";
import type { ExecuteRowMutation } from "@synehq-oos/explorer-contracts";

function notSubmitted(cause: unknown): Response {
  if (cause instanceof StoreError)
    return response({ error: cause.message, code: cause.code, notSubmitted: true }, cause.status);
  if (cause instanceof ZodError)
    return response(
      { error: "Check the row change fields and try again.", notSubmitted: true },
      400,
    );
  console.error("Row preflight failed:", {
    name: cause instanceof Error ? cause.name : "UnknownError",
  });
  return response(
    { error: "The row write was not submitted. Check the server log.", notSubmitted: true },
    500,
  );
}

export const POST = endpoint(async (request: Request) => {
  let owner: OwnerIdentity, input: ExecuteRowMutation;
  try {
    owner = await requireOwner();
    input = await body(request, executeRowSchema);
  } catch (cause) {
    return notSubmitted(cause);
  }
  try {
    return response(await executeRowMutation(owner, input), 202);
  } catch (cause) {
    if (cause instanceof RowWriteNotSubmitted) return notSubmitted(cause.cause);
    throw cause;
  }
});
