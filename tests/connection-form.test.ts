import assert from "node:assert/strict";
import test from "node:test";
import type {
  ConnectionSummary,
  ConnectionTestResult,
  QueryOperation,
} from "../packages/explorer-contracts/src/index";
import {
  ConnectionSaveRejected,
  connectionSavePayload,
  reconcileConnectionSave,
  submitConnectionSave,
  waitForConnectionTest,
} from "../apps/web/src/app/components/connection-test";
import {
  connectionPayload,
  createConnectionDraft,
  validateConnectionDraft,
} from "../apps/web/src/app/components/database-catalog";

test("a queued test waits for its final result and retains the tested draft", async (context) => {
  const states: QueryOperation[] = [
    { operationId: "test-1", status: "running" },
    { operationId: "test-1", status: "succeeded" },
  ];
  const requests: string[] = [];
  context.mock.method(globalThis, "fetch", async (path: string) => {
    requests.push(path);
    return Response.json(states.shift());
  });
  const initial: ConnectionTestResult = {
    operationId: "test-1",
    status: "queued",
    draftId: "draft-1",
    expiresAt: "2026-10-09T12:15:00Z",
  };
  const result = await waitForConnectionTest(initial);
  assert.deepEqual(requests, ["/api/query/test-1", "/api/query/test-1"]);
  assert.deepEqual(result, { ...initial, status: "succeeded" });
});

test("a failed, cancelled, or unknown test never becomes a passed test", async (context) => {
  const fetch = context.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected poll");
  });
  for (const status of ["failed", "cancelled", "unknown"] as const) {
    await assert.rejects(waitForConnectionTest({ operationId: "test-1", status }));
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("a different operation cannot verify the connection draft", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json({ operationId: "another-test", status: "succeeded" }),
  );
  await assert.rejects(
    waitForConnectionTest({ operationId: "test-1", status: "queued" }),
    /different connection test/,
  );
});

test("test cancellation and timeout do not return a successful result", async (context) => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    waitForConnectionTest({ operationId: "test-1", status: "queued" }, controller.signal),
    { name: "AbortError" },
  );
  let reads = 0;
  context.mock.method(Date, "now", () => (reads++ ? 61_000 : 0));
  await assert.rejects(
    waitForConnectionTest({ operationId: "test-1", status: "queued" }),
    /did not finish/,
  );
});

test("saving promotes only the exact unexpired draft that passed its test", () => {
  const result: ConnectionTestResult = {
    operationId: "test-1",
    draftId: "draft-1",
    status: "succeeded",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  assert.deepEqual(connectionSavePayload(result), { draftId: "draft-1", operationId: "test-1" });
  assert.throws(() => connectionSavePayload({ ...result, status: "running" }), /incomplete/);
  assert.throws(() => connectionSavePayload({ ...result, draftId: undefined }), /incomplete/);
  assert.throws(() => connectionSavePayload({ ...result, expiresAt: "invalid" }), /incomplete/);
  assert.throws(
    () => connectionSavePayload({ ...result, expiresAt: new Date(Date.now() - 1).toISOString() }),
    /expired/,
  );
});

test("a lost save response can recover the exact connection after the test expires", async (context) => {
  const tested: ConnectionTestResult = {
    operationId: "test-1",
    draftId: "draft-1",
    status: "succeeded",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const attempt = connectionSavePayload(tested);
  const connection: ConnectionSummary = {
    id: "draft-1",
    label: "Database",
    engine: "postgres",
    host: "db.example.com",
    port: 5432,
    database: "data",
    username: "owner",
    tlsMode: "verify-full",
    readOnly: true,
    revision: 1,
    hasSecret: true,
  };
  const requests: { path: string; method?: string }[] = [];
  context.mock.method(globalThis, "fetch", async (path: string, options: RequestInit) => {
    requests.push({ path, method: options.method });
    if (options.method === "POST") throw new Error("The save response was lost.");
    return Response.json({ connections: [connection] });
  });
  await assert.rejects(submitConnectionSave(attempt), /response was lost/);
  context.mock.method(Date, "now", () => Date.parse(tested.expiresAt!) + 1);
  assert.throws(() => connectionSavePayload(tested), /expired/);
  assert.deepEqual(await reconcileConnectionSave(attempt), connection);
  assert.deepEqual(requests, [
    { path: "/api/connections", method: "POST" },
    { path: "/api/connections", method: undefined },
  ]);
});

test("save recovery ignores matching labels and retries only the retained draft", async (context) => {
  const attempt = { draftId: "draft-1", operationId: "test-1" };
  const calls: RequestInit[] = [];
  context.mock.method(globalThis, "fetch", async (_path: string, options: RequestInit) => {
    calls.push(options);
    return options.method === "POST"
      ? Response.json({ connection: { id: "draft-1", label: "Database" } })
      : Response.json({ connections: [{ id: "other-connection", label: "Database" }] });
  });
  assert.equal((await reconcileConnectionSave(attempt)).id, "draft-1");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body, JSON.stringify(attempt));
});

test("save recovery cannot continue while the saved connection list is unavailable", async (context) => {
  const fetch = context.mock.method(globalThis, "fetch", async () => {
    throw new Error("The saved list is unavailable.");
  });
  await assert.rejects(
    reconcileConnectionSave({ draftId: "draft-1", operationId: "test-1" }),
    /list is unavailable/,
  );
  assert.equal(fetch.mock.callCount(), 1);
});

test("only an explicit save rejection can clear a retained attempt", async (context) => {
  const attempt = { draftId: "draft-1", operationId: "test-1" };
  context.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "The draft is gone.", code: "CONNECTION_TEST_GONE" }, { status: 404 }),
  );
  await assert.rejects(
    submitConnectionSave(attempt),
    (error: unknown) => error instanceof ConnectionSaveRejected,
  );
  await assert.rejects(
    reconcileConnectionSave(attempt),
    (error: unknown) => !(error instanceof ConnectionSaveRejected),
  );
});

test("SQLite input cannot retain network credentials from another engine", () => {
  const draft = {
    ...createConnectionDraft("postgres"),
    label: "Local data",
    filePath: "reports/data.sqlite",
    host: "db.example.com",
    database: "old-db",
    username: "old-user",
    password: "old-secret",
    tlsCa: "old-ca",
  };
  assert.deepEqual(connectionPayload("sqlite", draft, false), {
    label: "Local data",
    engine: "sqlite",
    filePath: "reports/data.sqlite",
    readOnly: true,
  });
  for (const filePath of [
    "/tmp/data.sqlite",
    "../data.sqlite",
    "a/./data.sqlite",
    "a//data.sqlite",
    "C:\\data.sqlite",
    "file:data.sqlite?mode=ro",
  ]) {
    assert.ok(validateConnectionDraft("sqlite", { ...draft, filePath }).filePath, filePath);
  }
});

test("Oracle uses its service name and network input requires verified TLS", () => {
  const draft = {
    ...createConnectionDraft("oracle"),
    label: "Oracle data",
    host: "db.example.com",
    serviceName: "FREEPDB1",
    database: "stale-database",
    username: "owner",
    password: "  exact secret  ",
  };
  const payload = connectionPayload("oracle", draft, true);
  assert.equal(payload.serviceName, "FREEPDB1");
  assert.equal(payload.database, undefined);
  assert.equal(payload.password, "  exact secret  ");
  assert.equal(payload.tlsMode, "verify-full");
  assert.equal(payload.readOnly, false);
});
