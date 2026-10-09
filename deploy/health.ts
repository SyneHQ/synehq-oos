import { request } from "node:https";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runtimeIdentity } from "../apps/web/src/server/crypto/keyring";
import { tlsDirectory } from "../apps/web/src/server/kelvo/config";

/** Check actual Kelvo readiness. Idle installations do not run a polling timer. */
export function readinessProbe() {
  const ca = readFileSync(join(tlsDirectory(), "ca.crt"));
  const token = runtimeIdentity().serviceToken;
  const url = new URL("/healthz", process.env.KELVO_URL ?? "https://127.0.0.1:8443");
  let expires = 0;
  let pending: Promise<boolean> | undefined;
  return (): Promise<boolean> => {
    if (pending && Date.now() < expires) return pending;
    expires = Date.now() + 1000;
    pending = new Promise<boolean>((resolve) => {
      const req = request(
        url,
        { ca, timeout: 1000, headers: { Authorization: `Bearer ${token}` } },
        (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        },
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
    return pending;
  };
}
