import { createServer, type Server } from "node:https";
import type { IncomingMessage } from "node:http";
import { finished } from "node:stream/promises";
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
  bindExecutionFileSnapshot,
  publishExecutionFile,
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
import {
  createSnapshot,
  readSnapshot,
  removeSnapshot,
  publishSnapshot,
  snapshotBindingSchema,
  snapshotDescriptorSchema,
  withSqliteSource,
  type SnapshotBinding,
} from "./sqlite-files";

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
const fileReadSchema = resolveSchema
  .extend({ source_revision: digest, snapshot: snapshotDescriptorSchema })
  .strict();
const fileCommitSchema = fileReadSchema
  .extend({
    publication: z
      .object({
        version: z.literal(1),
        operation_id: id,
        request_sha256: digest,
        original: snapshotDescriptorSchema,
        replacement: snapshotDescriptorSchema,
      })
      .strict(),
  })
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
const sourceRevision = (record: ExecutionRecord) =>
  sha256(
    JSON.stringify([
      record.executionEpoch,
      record.connectionId,
      record.connectionRevision,
      record.authVersion,
      record.sessionId,
    ]),
  );

async function readJson(req: IncomingMessage, max: number): Promise<unknown> {
  let count = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    count += chunk.length;
    if (count > max) throw new Error("Request exceeds limit.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function commitHeader(req: IncomingMessage) {
  const iterator = req[Symbol.asyncIterator]();
  let prefix = Buffer.alloc(0);
  let length: number | undefined;
  while (length === undefined || prefix.length < length + 4) {
    const chunk = await iterator.next();
    if (chunk.done) throw new Error("The publication header is incomplete.");
    prefix = Buffer.concat([prefix, chunk.value]);
    if (prefix.length >= 4 && length === undefined) {
      length = prefix.readUInt32BE(0);
      if (length < 1 || length > 300 * 1024)
        throw new Error("The publication header exceeds the limit.");
    }
  }
  if (length === undefined) throw new Error("The publication header is incomplete.");
  const value: unknown = JSON.parse(prefix.subarray(4, length + 4).toString("utf8"));
  return { value, prefix: prefix.subarray(length + 4), iterator };
}

export function sourceDescriptor(
  connection: ConnectionSummary & ConnectionCredentials,
  snapshot?: { version: 1; format: "sqlite"; bytes: number; sha256: string },
): {
  source: {
    id: string;
    type: string;
    options?: Record<string, string>;
    dsn_env?: string;
    url_env?: string;
    username_env?: string;
    password_env?: string;
  };
  secrets: Record<string, string>;
} {
  if (connection.engine === "sqlite") {
    if (!snapshot || connection.tlsMode !== "disable" || connection.database !== "main")
      throw new Error("A verified SQLite snapshot is required.");
    return {
      source: {
        id: "source_1",
        type: "sqlite",
        options: {
          file_format: "sqlite",
          file_bytes: String(snapshot.bytes),
          file_sha256: snapshot.sha256,
        },
      },
      secrets: {},
    };
  }
  if (connection.tlsMode !== "verify-full" || /[\0\r\n]/.test(connection.password))
    throw new Error("The database credential format is unsupported.");
  const host = connection.host.includes(":") ? `[${connection.host}]` : connection.host;
  let dsn: string;
  if (connection.engine === "postgres") {
    const url = new URL(`postgres://${host}:${connection.port}`);
    url.username = connection.username;
    url.password = connection.password;
    url.pathname = `/${encodeURIComponent(connection.database)}`;
    url.searchParams.set("connect_timeout", "5");
    url.searchParams.set("sslmode", "verify-full");
    dsn = url.toString();
  } else if (connection.engine === "mysql") {
    if (/[\0\r\n:]/.test(connection.username))
      throw new Error("This MySQL username cannot be encoded safely.");
    dsn = `${connection.username}:${connection.password}@tcp(${host}:${connection.port})/${encodeURIComponent(connection.database)}?parseTime=true&tls=true&timeout=5s&time_zone=%27%2B00%3A00%27&loc=UTC`;
  } else if (connection.engine === "clickhouse") {
    const url = new URL(`https://${host}:${connection.port}/`);
    url.searchParams.set("database", connection.database);
    return {
      source: {
        id: "source_1",
        type: "clickhouse",
        url_env: "KELVO_SOURCE_REQUEST_0_URL",
        username_env: "KELVO_SOURCE_REQUEST_0_USERNAME",
        password_env: "KELVO_SOURCE_REQUEST_0_PASSWORD",
        ...(connection.tlsCa ? { options: { tls_ca_pem: connection.tlsCa } } : {}),
      },
      secrets: {
        KELVO_SOURCE_REQUEST_0_URL: url.toString(),
        KELVO_SOURCE_REQUEST_0_USERNAME: connection.username,
        KELVO_SOURCE_REQUEST_0_PASSWORD: connection.password,
      },
    };
  } else if (connection.engine === "mongodb") {
    const url = new URL(`mongodb://${host}:${connection.port}/`);
    url.username = connection.username;
    url.password = connection.password;
    url.searchParams.set("tls", "true");
    url.searchParams.set("authSource", connection.authSource || "admin");
    dsn = url.toString();
  } else if (connection.engine === "oracle") {
    const url = new URL(
      `oracle://${host}:${connection.port}/${encodeURIComponent(connection.serviceName || connection.database)}`,
    );
    url.username = connection.username;
    url.password = connection.password;
    url.searchParams.set("SSL", "enable");
    url.searchParams.set("SSL VERIFY", "true");
    dsn = url.toString();
  } else {
    throw new Error("This database engine is unsupported.");
  }
  return {
    source: {
      id: "source_1",
      type: connection.engine,
      dsn_env: "KELVO_SOURCE_REQUEST_0_DSN",
      options: {
        ...(connection.tlsCa ? { tls_ca_pem: connection.tlsCa } : {}),
        ...(connection.engine === "mongodb" ? { database: connection.database } : {}),
      },
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
      let publicationStarted = false;
      const reply = (status: number, data?: unknown) => {
        if (res.headersSent) {
          res.destroy();
          return;
        }
        res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(data === undefined ? undefined : JSON.stringify(data));
      };
      try {
        if (
          !(req.socket instanceof TLSSocket) ||
          !req.socket.authorized ||
          !req.socket.getPeerCertificate().raw
        ) {
          reply(403);
          return;
        }
        const certificate = new X509Certificate(req.socket.getPeerCertificate().raw);
        if (certificate.subjectAltName !== expectedPeer) {
          reply(403);
          return;
        }
        const peerExpires = Math.floor(Date.parse(certificate.validTo) / 1000);
        const routes = [
          "/internal/kelvo/resolve-operation",
          "/internal/kelvo/complete-operation",
          "/internal/kelvo/operation-file",
          "/internal/kelvo/operation-file-commit",
        ];
        const isCommit = req.url === "/internal/kelvo/operation-file-commit";
        if (
          req.method !== "POST" ||
          !routes.includes(req.url ?? "") ||
          req.headers["content-type"]?.split(";")[0] !==
            (isCommit ? "application/vnd.kelvo.file-update" : "application/json")
        ) {
          reply(404);
          return;
        }
        const checkOperation = async (input: z.infer<typeof resolveSchema>) => {
          const operation = input.operation as OperationRequest;
          const claims = verifyGrant(
            input.grant,
            identity.servicePublicKeyPem,
            identity.installationId,
            operation,
          );
          let record = await getExecutionForResolver(claims.jti);
          if (
            claims.subject.id !== record.ownerId ||
            sha256(input.grant) !== record.grantDigest ||
            !isDeepStrictEqual(JSON.parse(record.requestJson), operation) ||
            !isDeepStrictEqual(JSON.parse(record.claimsJson), claims)
          )
            throw new Error("Request does not match retained authority.");
          const binding = { worker_id: input.worker_id, owner: input.owner, claim: input.claim };
          const leaseUntil = await kelvoClient(4000).lease(
            input.operation_id,
            input.grant,
            binding,
          );
          const custodyValue: ExecutionCustody = {
            kelvoOperationId: input.operation_id,
            requestDigest: record.operationDigest,
            grantDigest: record.grantDigest,
            workerId: input.worker_id,
            workerOwner: input.owner,
            claim: input.claim,
          };
          record = await bindExecutionCustody(record.operationId, custodyValue);
          const connection = await decryptConnection(
            ownerOf(record),
            record.connectionId,
            record.connectionRevision,
          );
          await authorizeExecution(authorityOf(record));
          const validUntil = Math.min(
            leaseUntil,
            claims.exp,
            peerExpires,
            Math.floor(Date.now() / 1000) + 5,
          );
          if (
            validUntil <= Math.floor(Date.now() / 1000) ||
            req.aborted ||
            req.socket.destroyed ||
            res.destroyed
          )
            throw new Error("The operation lease expired.");
          return { record, connection, validUntil, claims, custodyValue };
        };
        const checkedSnapshot = (
          record: ExecutionRecord,
          input: z.infer<typeof fileReadSchema>,
          filePath?: string,
        ): SnapshotBinding => {
          if (!record.fileSnapshotJson || record.schema !== null || record.database !== "main")
            throw new Error("The operation has no SQLite snapshot.");
          const snapshot = snapshotBindingSchema.parse(JSON.parse(record.fileSnapshotJson));
          if (
            snapshot.filePath !== filePath ||
            snapshot.sourceRevision !== input.source_revision ||
            !isDeepStrictEqual(snapshot.snapshot, input.snapshot)
          )
            throw new Error("The snapshot does not match the retained operation.");
          return snapshot;
        };
        if (isCommit) {
          const body = await commitHeader(req);
          const input = fileCommitSchema.parse(body.value);
          const before = await checkOperation(input);
          if (
            before.connection.engine !== "sqlite" ||
            before.record.operationDigest !== input.publication.request_sha256 ||
            input.publication.operation_id !== input.operation_id ||
            !before.record.write ||
            (input.operation as OperationRequest).kind !== "statement.execute" ||
            !isDeepStrictEqual(input.publication.original, input.snapshot)
          )
            throw new Error("The publication does not match the approved SQLite write.");
          const snapshot = checkedSnapshot(before.record, input, before.connection.filePath);
          let size = body.prefix.length;
          if (size > input.publication.replacement.bytes)
            throw new Error("The publication exceeds its declared size.");
          const chunks = [body.prefix];
          while (true) {
            if (Date.now() >= before.validUntil * 1000)
              throw new Error("The publication upload authority expired.");
            const next = await body.iterator.next();
            if (next.done) break;
            size += next.value.length;
            if (size > input.publication.replacement.bytes)
              throw new Error("The publication exceeds its declared size.");
            chunks.push(next.value);
          }
          const bytes = Buffer.concat(chunks);
          if (
            bytes.length !== input.publication.replacement.bytes ||
            sha256(bytes) !== input.publication.replacement.sha256
          )
            throw new Error("The publication bytes do not match its descriptor.");
          try {
            const committed = await withSqliteSource(snapshot.filePath, async () => {
              const current = await checkOperation(input);
              checkedSnapshot(current.record, input, current.connection.filePath);
              return publishExecutionFile(
                authorityOf(current.record),
                current.custodyValue,
                current.record.fileSnapshotJson!,
                async (authorityValidUntil) => {
                  verifyGrant(
                    input.grant,
                    identity.servicePublicKeyPem,
                    identity.installationId,
                    input.operation as OperationRequest,
                  );
                  const lease = await kelvoClient(4000).lease(input.operation_id, input.grant, {
                    worker_id: input.worker_id,
                    owner: input.owner,
                    claim: input.claim,
                  });
                  const until = Math.min(
                    lease,
                    current.claims.exp,
                    peerExpires,
                    authorityValidUntil,
                    Math.floor(Date.now() / 1000) + 5,
                  );
                  if (
                    req.aborted ||
                    req.socket.destroyed ||
                    res.destroyed ||
                    until <= Math.floor(Date.now() / 1000)
                  )
                    throw new Error("The publication authority expired.");
                  publicationStarted = true;
                  return publishSnapshot(snapshot, input.publication.replacement, bytes, until);
                },
              );
            });
            reply(committed ? 200 : 409, {
              version: 1,
              operation_id: input.operation_id,
              request_sha256: input.publication.request_sha256,
              replacement_sha256: input.publication.replacement.sha256,
              committed,
            });
          } finally {
            bytes.fill(0);
          }
          return;
        }
        const value = await readJson(
          req,
          req.url?.endsWith("complete-operation") ? 2048 : 300 * 1024,
        );
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
          if (
            record.fileSnapshotJson &&
            record.receiptJson &&
            ["succeeded", "failed", "cancelled"].includes(record.status)
          ) {
            try {
              removeSnapshot(snapshotBindingSchema.parse(JSON.parse(record.fileSnapshotJson)));
            } catch {
              /* Custody is closed. Cleanup can be repeated without database execution. */
            }
          }
          reply(204);
          return;
        }
        if (req.url === "/internal/kelvo/operation-file") {
          const input = fileReadSchema.parse(value);
          const checked = await checkOperation(input);
          if (checked.connection.engine !== "sqlite")
            throw new Error("This operation does not use a file source.");
          const snapshot = checkedSnapshot(checked.record, input, checked.connection.filePath);
          const bytes = readSnapshot(snapshot);
          try {
            const transfer = await checkOperation(input);
            res.writeHead(200, {
              "Content-Type": "application/octet-stream",
              "Cache-Control": "no-store",
              "X-Kelvo-File-SHA256": snapshot.snapshot.sha256,
              Trailer: "X-Kelvo-File-Verified, X-Kelvo-Source-Valid-Until",
            });
            res.flushHeaders();
            for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
              if (Date.now() >= transfer.validUntil * 1000 || res.destroyed)
                throw new Error("The snapshot transfer authority expired.");
              await new Promise<void>((resolve, reject) =>
                res.write(bytes.subarray(offset, offset + 64 * 1024), (error) =>
                  error ? reject(error) : resolve(),
                ),
              );
            }
            const final = await checkOperation(input);
            checkedSnapshot(final.record, input, final.connection.filePath);
            res.addTrailers({
              "X-Kelvo-File-Verified": snapshot.snapshot.sha256,
              "X-Kelvo-Source-Valid-Until": String(final.validUntil),
            });
            const sent = finished(res, { cleanup: true });
            res.end();
            await sent;
          } finally {
            bytes.fill(0);
          }
          return;
        }
        const input = resolveSchema.parse(value);
        let checked = await checkOperation(input);
        let snapshot: SnapshotBinding | undefined;
        if (checked.connection.engine === "sqlite") {
          if (!checked.connection.filePath || checked.record.schema !== null)
            throw new Error("The SQLite file scope is invalid.");
          snapshot = await withSqliteSource(checked.connection.filePath, async () => {
            checked = await checkOperation(input);
            if (checked.record.fileSnapshotJson)
              return snapshotBindingSchema.parse(JSON.parse(checked.record.fileSnapshotJson));
            const created = createSnapshot(
              checked.connection.filePath!,
              sourceRevision(checked.record),
            );
            try {
              const record = await bindExecutionFileSnapshot(
                authorityOf(checked.record),
                JSON.stringify(created),
              );
              const bound = snapshotBindingSchema.parse(JSON.parse(record.fileSnapshotJson!));
              if (bound.retainedFile !== created.retainedFile) removeSnapshot(created);
              return bound;
            } catch (error) {
              /* A lost metadata response can hide a committed binding. Retain its snapshot. */ throw error;
            }
          });
        }
        checked = await checkOperation(input);
        reply(200, {
          version: 1,
          grant_sha256: checked.record.grantDigest,
          request_sha256: checked.record.operationDigest,
          source_revision: snapshot?.sourceRevision ?? sourceRevision(checked.record),
          valid_until: checked.validUntil,
          ...sourceDescriptor(checked.connection, snapshot?.snapshot),
        });
      } catch {
        reply(publicationStarted ? 503 : 403, {
          error: publicationStarted
            ? "The publication outcome is unknown."
            : "Operation authority is unavailable.",
        });
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
