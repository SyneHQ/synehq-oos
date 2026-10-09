import { once } from "node:events";
import { startServer, type ServerOptions } from "../apps/web/src/server/runtime";
import { startResolver } from "../apps/web/src/server/kelvo/resolver";

export { createRequestHandler, startServer, writeResponse } from "../apps/web/src/server/runtime";

export async function startServices(options: ServerOptions = {}) {
  const resolverServer = startResolver();
  try {
    await once(resolverServer, "listening");
    const publicServer = await startServer({
      ...options,
      isReady: async () => resolverServer.listening && (await options.isReady?.()) === true,
    });
    return { publicServer, resolverServer };
  } catch (error) {
    resolverServer.close();
    throw error;
  }
}
