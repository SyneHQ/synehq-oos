import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KelvoClient } from "@synehq-oos/kelvo-client";
import { runtimeIdentity, keyDirectory } from "../crypto/keyring";

export function tlsDirectory() {
  return process.env.OOS_TLS_DIR ?? join(keyDirectory(), "tls");
}
export function kelvoClient(timeoutMs?: number) {
  return new KelvoClient({
    url: process.env.KELVO_URL ?? "https://127.0.0.1:8443",
    token: runtimeIdentity().serviceToken,
    ca: readFileSync(join(tlsDirectory(), "ca.crt")),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}
