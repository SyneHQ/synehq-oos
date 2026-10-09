import { createServer, type Server } from "node:https";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { X509Certificate } from "node:crypto";
import { TLSSocket } from "node:tls";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { serviceScope, sha256, verifyGrant, type OperationRequest } from "@synehq-oos/kelvo-client";
import { runtimeIdentity } from "../crypto/keyring";
import {
  authorizeExecution,
  bindExecutionCustody,
  completeExecutionCustody,
  decryptConnection,
  getExecutionForResolver,
  getExecutionByKelvoId,
  type ConnectionCredentials,
  type ExecutionCustody,
  type ExecutionRecord,
  type OwnerIdentity,
} from "../store";
import type { ConnectionSummary } from "@synehq-oos/explorer-contracts";
import { kelvoClient, tlsDirectory } from "./config";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const custody = {
  operation_id: id,
  worker_id: z.literal("application"),
  owner: z.string().regex(/^[a-f0-9]{32}$/),
  claim: z.string().regex(/^[a-f0-9]{32}$/),
};
const resolveSchema = z
  .object({ ...custody, grant: z.string().max(32768), operation: z.unknown() })
  .strict();
const completeSchema = z
  .object({ ...custody, version: z.literal(1), request_sha256: digest, grant_sha256: digest })
  .strict();
const ownerOf = (record: ExecutionRecord): OwnerIdentity => ({
  id: record.ownerId,
  authVersion: record.authVersion,
  sessionId: record.sessionId,
  name: "",
  email: "",
});
const authorityOf = (record: ExecutionRecord) => ({
  ...ownerOf(record),
  operationId: record.operationId,
  connectionId: record.connectionId,
  connectionRevision: record.connectionRevision,
  database: record.database,
  schema: record.schema,
  operationDigest: record.operationDigest,
  executionEpoch: record.executionEpoch,
});

export function sourceDescriptor(connection: ConnectionSummary & ConnectionCredentials) {
  if (
    connection.tlsMode !== "verify-full" ||
    !connection.password ||
    /[\0\r\n]/.test(connection.password)
  )
    throw new Error("The database credential format is unsupported.");
  const host = connection.host.includes(":") ? `[${connection.host}]` : connection.host;
  let dsn: string;
  if (connection.engine === "postgres") {
    const url = new URL(`postgres://${host}:${connection.port}`);
    url.username = connection.username;
    url.password = connection.password;
    url.pathname = `/${connection.database}`;
    url.searchParams.set("connect_timeout", "5");
    url.searchParams.set("sslmode", "verify-full");
    dsn = url.toString();
  } else {
    if (/[\0\r\n:]/.test(connection.username))
      throw new Error("This MySQL username cannot be encoded safely.");
    dsn = `${connection.username}:${connection.password}@tcp(${host}:${connection.port})/${encodeURIComponent(connection.database)}?parseTime=true&tls=true&timeout=5s&time_zone=%27%2B00%3A00%27&loc=UTC`;
  }
  return {
    source: {
      id: "source_1",
      type: connection.engine,
      dsn_env: "KELVO_SOURCE_REQUEST_0_DSN",
      ...(connection.tlsCa ? { options: { tls_ca_pem: connection.tlsCa } } : {}),
    },
    secrets: { KELVO_SOURCE_REQUEST_0_DSN: dsn },
  };
}
export function startResolver(): Server {
  const tls = tlsDirectory();
  const identity = runtimeIdentity();
  const expectedPeer = `URI:spiffe://kelvo/tenant/${serviceScope(identity.installationId).cluster_tenant}/worker/application`;
  const server = createServer(
    {
      minVersion: "TLSv1.3",
      ca: readFileSync(join(tls, "ca.crt")),
      cert: readFileSync(join(tls, "resolver.crt")),
      key: readFileSync(join(tls, "resolver.key")),
      requestCert: true,
      rejectUnauthorized: true,
    },
    async (req, res) => {
      const reply = (status: number, data?: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(data === undefined ? undefined : JSON.stringify(data));
      };
      try {
        if (
          !(req.socket instanceof TLSSocket) ||
          !req.socket.authorized ||
          !req.socket.getPeerCertificate().raw ||
          new X509Certificate(req.socket.getPeerCertificate().raw).subjectAltName !== expectedPeer
        ) {
          reply(403);
          return;
        }
        if (
          req.method !== "POST" ||
          !["/internal/kelvo/resolve-operation", "/internal/kelvo/complete-operation"].includes(
            req.url ?? "",
          ) ||
          req.headers["content-type"]?.split(";")[0] !== "application/json"
        ) {
          reply(404);
          return;
        }
        const max = req.url?.endsWith("complete-operation") ? 2048 : 300 * 1024;
        let count = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          count += chunk.length;
          if (count > max) throw new Error("Request exceeds limit.");
          chunks.push(chunk);
        }
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (req.url?.endsWith("complete-operation")) {
          const input = completeSchema.parse(value);
          const record = await getExecutionByKelvoId(input.operation_id);
          await completeExecutionCustody(record.operationId, {
            kelvoOperationId: input.operation_id,
            requestDigest: input.request_sha256,
            grantDigest: input.grant_sha256,
            workerId: input.worker_id,
            workerOwner: input.owner,
            claim: input.claim,
          });
          reply(204);
          return;
        }
        const input = resolveSchema.parse(value);
        const operation = input.operation as OperationRequest;
        const claims = verifyGrant(
          input.grant,
          identity.servicePublicKeyPem,
          identity.installationId,
          operation,
        );
        const record = await getExecutionForResolver(claims.jti);
        if (
          claims.subject.id !== record.ownerId ||
          sha256(input.grant) !== record.grantDigest ||
          !isDeepStrictEqual(JSON.parse(record.requestJson), operation) ||
          !isDeepStrictEqual(JSON.parse(record.claimsJson), claims)
        )
          throw new Error("Request does not match retained authority.");
        const binding = { worker_id: input.worker_id, owner: input.owner, claim: input.claim };
        const validUntil = await kelvoClient().lease(input.operation_id, input.grant, binding);
        const custodyValue: ExecutionCustody = {
          kelvoOperationId: input.operation_id,
          requestDigest: record.operationDigest,
          grantDigest: record.grantDigest,
          workerId: input.worker_id,
          workerOwner: input.owner,
          claim: input.claim,
        };
        await bindExecutionCustody(record.operationId, custodyValue);
        const connection = await decryptConnection(
          ownerOf(record),
          record.connectionId,
          record.connectionRevision,
        );
        await authorizeExecution(authorityOf(record));
        if (validUntil <= Math.floor(Date.now() / 1000))
          throw new Error("The operation lease expired.");
        reply(200, {
          version: 1,
          grant_sha256: record.grantDigest,
          request_sha256: record.operationDigest,
          source_revision: sha256(
            JSON.stringify([
              record.executionEpoch,
              record.connectionId,
              record.connectionRevision,
              record.authVersion,
              record.sessionId,
            ]),
          ),
          valid_until: validUntil,
          ...sourceDescriptor(connection),
        });
      } catch {
        reply(403, { error: "Operation authority is unavailable." });
      }
    },
  );
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.maxConnections = 16;
  server.listen(
    Number(process.env.OOS_RESOLVER_PORT ?? 3101),
    process.env.OOS_RESOLVER_HOST ?? "127.0.0.1",
  );
  return server;
}
