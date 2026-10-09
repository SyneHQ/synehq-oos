import { requireOwner } from "@/server/auth";
import { body, endpoint, response } from "@/server/http";
import { browseTable, tableRequestSchema } from "@/server/kelvo/schema";
export const POST = endpoint(async (r: Request) =>
  response(await browseTable(await requireOwner(), await body(r, tableRequestSchema)), 202),
);
