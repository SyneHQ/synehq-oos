import { PrismaClient } from "@prisma/client";

let client: PrismaClient | undefined;
const configured = new WeakMap<PrismaClient, Promise<void>>();

export function configureMetadataClient(db: PrismaClient): Promise<void> {
  let ready = configured.get(db);
  if (!ready) {
    ready = (async () => {
      await db.$queryRawUnsafe("PRAGMA journal_mode = WAL");
      await db.$queryRawUnsafe("PRAGMA busy_timeout = 10000");
      await db.$queryRawUnsafe("PRAGMA secure_delete = ON");
    })();
    configured.set(db, ready);
    void ready.catch(() => configured.delete(db));
  }
  return ready;
}

export function metadataClient(): PrismaClient {
  if (typeof window !== "undefined") throw new Error("Metadata storage is server-only.");
  if (!process.env.DATABASE_URL?.startsWith("file:"))
    throw new Error("DATABASE_URL must point to the installation SQLite file.");
  if (!client) {
    const [path, query = ""] = process.env.DATABASE_URL.split("?", 2);
    const parameters = new URLSearchParams(query);
    parameters.set("connection_limit", "1");
    parameters.set("socket_timeout", "10");
    client = new PrismaClient({ datasourceUrl: `${path}?${parameters}`, log: [] });
  }
  return client;
}
