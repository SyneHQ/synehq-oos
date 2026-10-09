import type { Server } from "node:http";

/** Stop new requests and limit the time available for active HTTP responses. */
export async function drainHttpServer(server: Server | undefined, graceMs = 5_000): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve) => {
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      resolve();
    }, graceMs);
    deadline.unref();
    server.close(() => {
      clearTimeout(deadline);
      resolve();
    });
  });
}
