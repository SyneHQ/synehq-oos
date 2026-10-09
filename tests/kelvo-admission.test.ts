import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  KelvoAdmissionRejected,
  KelvoClient,
  operationDigest,
  sha256,
  type AdmissionRejection,
  type OperationRequest,
} from "../packages/kelvo-client/src/index";

test("TLS transport accepts only a bounded HTTP 429 rejection bound to the exact request and grant", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "oos-kelvo-admission-"));
  const key = join(directory, "key.pem"),
    certificate = join(directory, "cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      certificate,
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
    ],
    { stdio: "ignore" },
  );
  const operation: OperationRequest = {
    version: 1,
    kind: "query.read",
    connection: { id: "fixture", database: "fixture" },
    idempotency_key: "fixture-read",
    spec: { query: { sql: "SELECT 1" } },
  };
  const grant = "fixture.signed.grant",
    digest = operationDigest(operation);
  const evidence: AdmissionRejection = {
    version: 1,
    admission: "not_admitted",
    code: "RESOURCE_EXHAUSTED",
    request_sha256: digest,
    grant_sha256: sha256(grant),
  };
  let status = 429,
    body: unknown = evidence;
  const server = createServer(
    { key: readFileSync(key), cert: readFileSync(certificate), minVersion: "TLSv1.3" },
    async (request, response) => {
      for await (const _chunk of request) {
        /* Consume the request before returning the test response. */
      }
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(typeof body === "string" ? body : JSON.stringify(body));
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(directory, { recursive: true });
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const client = new KelvoClient({
    url: `https://127.0.0.1:${address.port}`,
    token: "x".repeat(43),
    ca: readFileSync(certificate),
  });
  await assert.rejects(client.submit(operation, grant), (error) => {
    assert.ok(error instanceof KelvoAdmissionRejected);
    assert.deepEqual(error.rejection, evidence);
    return true;
  });
  const unconfirmed = async () =>
    assert.rejects(client.submit(operation, grant), (error) => {
      assert.equal(error instanceof KelvoAdmissionRejected, false);
      return true;
    });
  for (const invalid of [
    { ...evidence, grant_sha256: "0".repeat(64) },
    { ...evidence, request_sha256: "0".repeat(64) },
    { ...evidence, grant_sha256: undefined },
    { ...evidence, extra: true },
    { ...evidence, code: "UNAVAILABLE" },
    "{",
    " ".repeat(1025) + JSON.stringify(evidence),
  ]) {
    body = invalid;
    await unconfirmed();
  }
  body = evidence;
  status = 503;
  await unconfirmed();
  status = 429;
  await assert.rejects(client.poll("operation", digest, grant), (error) => {
    assert.equal(error instanceof KelvoAdmissionRejected, false);
    return true;
  });
});
