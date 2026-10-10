import { readFileSync, statSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { StoreError } from "./store/errors";

export const managedMode = () => process.env.OOS_HAKOPOD_SCOPE !== undefined;
export function managedConfig() {
  const scope = process.env.OOS_HAKOPOD_SCOPE;
  const file = process.env.OOS_HAKOPOD_KEY_FILE;
  const address = process.env.OOS_HAKOPOD_AUTHORITY_URL;
  if (!scope || scope.length > 512 || !file || !address)
    throw new StoreError(503, "Configure the Hakopod scope, authority URL and key file.");
  const url = new URL(address);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    )
  )
    throw new StoreError(503, "The Hakopod authority requires HTTPS or loopback HTTP.");
  if ((statSync(file).mode & 0o077) !== 0)
    throw new StoreError(503, "The Hakopod key file must be private.");
  const key = readFileSync(file, "utf8").trim();
  if (!/^[a-f0-9]{64}$/.test(key))
    throw new StoreError(503, "Use a separate 32-byte Hakopod control key.");
  return { scope, key, url };
}
export function authenticateControl(request: Request) {
  const { key } = managedConfig();
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${key}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    throw new StoreError(401, "Invalid Hakopod control authentication.");
}
export const authoritySchema = z
  .object({
    version: z.literal(1),
    scope: z.string().min(1).max(512),
    session: z.string().regex(/^[a-f0-9]{64}$/),
    actor: z.string().min(1).max(256),
    name: z.string().min(1).max(256),
    email: z.string().max(256),
    canWrite: z.boolean(),
    canManage: z.boolean(),
  })
  .strict();
export type ManagedAuthority = z.infer<typeof authoritySchema>;
export async function checkManagedAuthority(
  ticket: string,
  source?: string | null,
  fingerprint?: string | null,
  write = false,
  manage = false,
) {
  if (!/^[a-f0-9]{64}$/.test(ticket)) throw new StoreError(401, "Open the explorer from Hakopod.");
  const config = managedConfig();
  const result = await fetch(config.url, {
    method: "POST",
    headers: { authorization: `Bearer ${config.key}`, "content-type": "application/json" },
    body: JSON.stringify({
      version: 1,
      scope: config.scope,
      ticket,
      source: source ?? "",
      fingerprint: fingerprint ?? "",
      write,
      manage,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!result.ok)
    throw new StoreError(403, "Hakopod no longer permits this operation. Reopen the explorer.");
  const reader = result.body?.getReader();
  if (!reader) throw new StoreError(503, "Invalid Hakopod authority response.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 4096) {
      await reader.cancel();
      throw new StoreError(503, "Invalid Hakopod authority response.");
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  const authority = authoritySchema.parse(JSON.parse(text));
  if (
    authority.scope !== config.scope ||
    (write && !authority.canWrite) ||
    (manage && !authority.canManage)
  )
    throw new StoreError(403, "Hakopod does not permit this operation.");
  return authority;
}
