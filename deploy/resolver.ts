import { startResolver } from "../apps/web/src/server/kelvo/resolver";
const server = startResolver();
server.on("listening", () => console.log("Kelvo resolver is ready."));
server.on("error", (error) => {
  console.error("Kelvo resolver failed:", error.name);
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
