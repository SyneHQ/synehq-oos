import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import {
  createServer,
  request,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { drainHttpServer } from "../deploy/http-drain";

function openResponse(server: Server): Promise<IncomingMessage> {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return new Promise((resolve, reject) => {
    const client = request({ hostname: "127.0.0.1", port: address.port, agent: false }, resolve);
    client.once("error", reject);
    client.end();
  });
}

test(
  "public HTTP drain closes a stalled response within its deadline",
  { timeout: 5_000 },
  async (t) => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.write("unfinished response");
    });
    let response: IncomingMessage | undefined;
    t.after(() => {
      response?.destroy();
      server.closeAllConnections();
      if (server.listening) server.close();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    response = await openResponse(server);
    response.on("error", () => {});
    response.resume();
    const responseClosed = new Promise<void>((resolve) => response!.once("close", resolve));
    const serverClosed = once(server, "close");
    const started = performance.now();
    const draining = drainHttpServer(server, 50);
    assert.equal(server.listening, false, "The listener must stop accepting new requests.");
    await draining;
    const elapsed = performance.now() - started;
    assert.ok(elapsed >= 40, "Active responses must receive the grace period.");
    assert.ok(elapsed < 1_000, "A stalled response must not block the remaining shutdown steps.");
    await Promise.all([responseClosed, serverClosed]);
    assert.equal(response.aborted, true);
    assert.equal(response.complete, false);
  },
);

test("public HTTP drain preserves a response that completes during the grace period", async (t) => {
  let outgoing: ServerResponse | undefined;
  const server = createServer((_request, response) => {
    outgoing = response;
    response.write("first");
  });
  let response: IncomingMessage | undefined;
  t.after(() => {
    response?.destroy();
    server.closeAllConnections();
    if (server.listening) server.close();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  response = await openResponse(server);
  let body = "";
  response.setEncoding("utf8");
  response.on("data", (chunk: string) => {
    body += chunk;
  });
  const ended = once(response, "end");
  const draining = drainHttpServer(server, 1_000);
  assert.ok(outgoing);
  outgoing.end(" last");
  await Promise.all([draining, ended]);
  assert.equal(body, "first last");
  assert.equal(response.complete, true);
  assert.equal(response.aborted, false);
});
