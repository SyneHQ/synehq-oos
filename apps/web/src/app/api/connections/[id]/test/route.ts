import { requireOwner } from "@/server/auth";
import { checkOrigin, endpoint, response } from "@/server/http";
import { getConnection } from "@/server/store";
import { startOperation, awaitOperation } from "@/server/kelvo/operations";
export const POST = endpoint(async (r: Request, c: { params: Promise<{ id: string }> }) => {
  checkOrigin(r);
  const owner = await requireOwner();
  const connection = await getConnection(owner, (await c.params).id);
  const target = {
    connectionId: connection.id,
    connectionRevision: connection.revision,
    database: connection.database,
    schema: null,
  };
  await awaitOperation(
    owner,
    await startOperation(owner, target, {
      version: 1,
      kind: "connection.test",
      connection: { id: connection.id, database: connection.database },
      idempotency_key: "",
      spec: {},
    }),
  );
  return response({ ok: true, message: "Connection verified." });
});
