import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { AppStore } from "../apps/web/src/server/store/core";
import { authenticateControl } from "../apps/web/src/server/hakopod";

test("managed sessions preserve actors, encryption, approval scope and live revocation", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "oos-hakopod-"));
  const path = join(directory, "metadata.sqlite");
  const sql = new DatabaseSync(path);
  for (const name of readdirSync(resolve("apps/web/prisma/migrations")).sort()) {
    if (name === "migration_lock.toml") continue;
    sql.exec(readFileSync(resolve("apps/web/prisma/migrations", name, "migration.sql"), "utf8"));
  }
  sql.close();
  const key = "a".repeat(64),
    ticket = "b".repeat(64),
    otherTicket = "c".repeat(64),
    session = "d".repeat(64),
    otherSession = "e".repeat(64);
  writeFileSync(join(directory, "control.key"), key, { mode: 0o600 });
  let allowed = true,
    canWrite = false,
    canManage = false,
    fingerprint = "1".repeat(64);
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    if (
      req.headers.authorization !== `Bearer ${key}` ||
      !allowed ||
      ![ticket, otherTicket].includes(body.ticket) ||
      body.scope !== "demo/development" ||
      (body.source && body.fingerprint !== fingerprint) ||
      (body.write && !canWrite) ||
      (body.manage && !canManage)
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        version: 1,
        scope: body.scope,
        session: body.ticket === ticket ? session : otherSession,
        actor: body.ticket === ticket ? "alice" : "bob",
        name: body.ticket === ticket ? "Alice" : "Bob",
        email: "user@example.test",
        canWrite,
        canManage,
      }),
    );
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const variables = [
    "OOS_HAKOPOD_SCOPE",
    "OOS_HAKOPOD_KEY_FILE",
    "OOS_HAKOPOD_AUTHORITY_URL",
  ] as const;
  const old = variables.map((name) => process.env[name]);
  process.env.OOS_HAKOPOD_SCOPE = "demo/development";
  process.env.OOS_HAKOPOD_KEY_FILE = join(directory, "control.key");
  process.env.OOS_HAKOPOD_AUTHORITY_URL = `http://127.0.0.1:${address.port}/authorize`;
  const db = new PrismaClient({
    datasourceUrl: `file:${path}?connection_limit=1&socket_timeout=10`,
    log: [],
  });
  const store = new AppStore(db, join(directory, "keys"));
  t.after(async () => {
    for (const [i, name] of variables.entries()) {
      if (old[i] === undefined) delete process.env[name];
      else process.env[name] = old[i];
    }
    server.close();
    await db.$disconnect();
    rmSync(directory, { recursive: true });
  });
  await store.initializeMetadata();
  const connection = {
    engine: "postgres",
    label: "Managed PostgreSQL",
    host: "private.db.internal",
    port: 5432,
    database: "app",
    username: "app",
    password: "private-source-password",
    tlsMode: "verify-full",
    readOnly: false,
  };
  const sync = () =>
    store.importManagedConnections({
      version: 1,
      scope: "demo/development",
      connections: [{ source: "f".repeat(32), fingerprint, connection }],
    });
  await assert.rejects(
    store.importManagedConnections({ version: 1, scope: "another/project", connections: [] }),
  );
  await sync();
  assert.throws(() => authenticateControl(new Request("http://localhost/internal/hakopod/sync")));
  authenticateControl(
    new Request("http://localhost/internal/hakopod/sync", {
      headers: { authorization: `Bearer ${key}` },
    }),
  );
  await assert.rejects(store.managedIdentity("forged"));
  const alice = await store.managedIdentity(ticket),
    bob = await store.managedIdentity(otherTicket);
  assert.equal(alice.actor, "alice");
  assert.equal(bob.actor, "bob");
  assert.notEqual(alice.sessionId, bob.sessionId);
  const row = await db.connection.findFirstOrThrow();
  assert.equal(row.host, "");
  assert.ok(row.credentials);
  assert.ok(!JSON.stringify(row).includes(connection.password));
  assert.ok(!JSON.stringify(row).includes(connection.host));
  assert.ok(!(await db.ownerSession.findFirstOrThrow()).managedTicket?.includes(ticket));
  await sync();
  assert.equal(
    (await db.connection.findUniqueOrThrow({ where: { id: row.id } })).revision,
    row.revision,
  );
  await assert.rejects(store.createConnection(alice, connection as never));
  const instance = await store.getInstance();
  const approval = {
    connectionId: row.id,
    connectionRevision: row.revision,
    database: "app",
    schema: null,
    operationDigest: "a".repeat(64),
    executionEpoch: instance.executionEpoch,
    approvalId: "approval-one",
    operationId: "operation-one",
  };
  await assert.rejects(store.createQueryApproval(alice, approval));
  canWrite = true;
  const grant = await store.createQueryApproval(alice, approval);
  assert.equal(
    (await db.actionLog.findFirstOrThrow({ where: { action: "query.approval.issue" } })).actor,
    "alice",
  );
  await assert.rejects(store.checkQueryApproval(bob, { ...approval, token: grant.token }));
  allowed = false;
  await assert.rejects(store.decryptConnection(alice, row.id));
  await assert.rejects(store.checkQueryApproval(alice, { ...approval, token: grant.token }));
  allowed = true;
  fingerprint = "2".repeat(64);
  await assert.rejects(store.decryptConnection(alice, row.id));
  connection.host = "rotated.db.internal";
  connection.password = "rotated-private-password";
  await sync();
  const updated = await db.connection.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(updated.revision, row.revision + 1);
  assert.equal((await store.decryptConnection(alice, row.id)).host, connection.host);
  assert.ok(
    (await db.queryApproval.findUniqueOrThrow({ where: { id: approval.approvalId } })).consumedAt,
  );
  canManage = true;
  await assert.rejects(
    store.updateConnection(alice, row.id, { revision: updated.revision, label: "Spoofed source" }),
  );
  const custom = await store.createConnection(alice, {
    ...connection,
    label: "Manual connection",
  } as never);
  const draft = await store.createConnectionDraft(alice, connection as never);
  const ai = {
    enabled: true,
    endpoint: "https://llm.example.test/v1",
    model: "example",
    apiKey: "private-provider-key",
  };
  const savedAi = await store.saveAiSettings(alice, ai);
  assert.equal(savedAi.model, ai.model);
  assert.equal(
    (await db.actionLog.findFirstOrThrow({ where: { action: "ai.settings.change" } })).actor,
    "alice",
  );
  canManage = false;
  const permissionDenied = (error: unknown) =>
    Boolean(error && typeof error === "object" && "status" in error && error.status === 403);
  await assert.rejects(
    store.saveTestedConnection(alice, draft.id, "not-dispatched"),
    permissionDenied,
  );
  await assert.rejects(
    store.saveAiSettings(alice, { ...ai, revision: savedAi.revision }),
    permissionDenied,
  );
  await assert.rejects(
    store.updateConnection(alice, custom.id, {
      revision: custom.revision,
      label: "Forbidden change",
    }),
    permissionDenied,
  );
  await assert.rejects(store.deleteConnection(alice, custom.id), permissionDenied);
  await store.importManagedConnections({ version: 1, scope: "demo/development", connections: [] });
  await assert.rejects(store.getConnection(alice, row.id));
  assert.equal((await store.getConnection(alice, custom.id)).label, "Manual connection");
  assert.ok(requests.some((request) => request.write === true));
  assert.ok(requests.some((request) => request.source === "f".repeat(32)));
});
