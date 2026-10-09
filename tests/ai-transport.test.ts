import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { aiEndpoint, requestSqlDraft } from "../apps/web/src/server/ai";

test("AI cancellation stops the provider request and permits a later draft", async (t) => {
  let calls = 0;
  let acceptRequest!: () => void;
  const accepted = new Promise<void>((resolve) => {
    acceptRequest = resolve;
  });
  let closeRequest!: () => void;
  const closed = new Promise<void>((resolve) => {
    closeRequest = resolve;
  });
  const server = createServer((request, response) => {
    calls += 1;
    request.resume();
    if (calls === 1) {
      response.once("close", closeRequest);
      acceptRequest();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "SELECT 1" } }] }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const endpoint = {
    url: new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`),
    address: "127.0.0.1",
    family: 4 as const,
  };
  const alreadyCancelled = new AbortController();
  alreadyCancelled.abort();
  await assert.rejects(requestSqlDraft(endpoint, null, {}, alreadyCancelled.signal), /cancelled/);
  assert.equal(calls, 0);
  const controller = new AbortController();
  const result = requestSqlDraft(endpoint, null, {}, controller.signal);
  const rejected = assert.rejects(result, /cancelled/);
  await accepted;
  controller.abort();
  await rejected;
  await closed;
  assert.equal(await requestSqlDraft(endpoint, null, {}), "SELECT 1");
  assert.equal(calls, 2);
});

test("AI endpoint resolution blocks private and metadata addresses unless explicitly allowed", async () => {
  const previous = process.env.OOS_AI_ALLOWED_HOSTS;
  process.env.OOS_AI_ALLOWED_HOSTS = "127.0.0.1,169.254.169.254";
  try {
    assert.equal((await aiEndpoint("http://127.0.0.1:11434/v1")).address, "127.0.0.1");
    await assert.rejects(aiEndpoint("https://10.0.0.1/v1"), /private AI host/);
    await assert.rejects(aiEndpoint("http://169.254.169.254/latest"), /not allowed/);
    await assert.rejects(aiEndpoint("https://user:secret@example.test/v1"), /no credentials/);
  } finally {
    if (previous === undefined) delete process.env.OOS_AI_ALLOWED_HOSTS;
    else process.env.OOS_AI_ALLOWED_HOSTS = previous;
  }
});
