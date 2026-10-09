import { startServices } from "./server";
import { readinessProbe } from "./health";
import { metadataClient } from "../apps/web/src/server/store/database";

const services = await startServices({ isReady: readinessProbe() });
console.log("Static dashboard, API, and private resolver are listening.");
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, async () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 45_000);
    timeout.unref();
    await new Promise<void>((resolve) => services.publicServer.close(() => resolve()));
    await new Promise<void>((resolve) => services.resolverServer.close(() => resolve()));
    await metadataClient().$disconnect();
    clearTimeout(timeout);
  });
