import { request, type RequestOptions } from "node:https";
import { isDeepStrictEqual } from "node:util";
import { decodeResult } from "./values";
import {
  encodeOperation,
  operationDigest,
  sha256,
  validId,
  validateAdmissionRejection,
  validateResponse,
  type AdmissionRejection,
  type OperationRequest,
  type OperationResponse,
} from "./protocol";

export interface KelvoConfig {
  url: string;
  token: string;
  ca: string | Buffer;
  cert?: string | Buffer;
  key?: string | Buffer;
  timeoutMs?: number;
}
class KelvoHttpError extends Error {
  constructor(readonly status: number) {
    super("Kelvo did not return a valid response. The operation may have started.");
  }
}
export class KelvoAdmissionRejected extends Error {
  constructor(readonly rejection: AdmissionRejection) {
    super("Kelvo did not admit this operation. No database operation ran.");
  }
}
export class KelvoClient {
  private readonly url: URL;
  constructor(private readonly config: KelvoConfig) {
    this.url = new URL(config.url);
    if (
      this.url.protocol !== "https:" ||
      this.url.pathname !== "/" ||
      this.url.search ||
      this.url.hash ||
      this.url.username ||
      this.url.password ||
      !config.ca ||
      !/^[A-Za-z0-9_-]{40,}$/.test(config.token)
    )
      throw new Error("Invalid Kelvo transport configuration.");
  }
  private async fetch(
    path: string,
    method: string,
    grant: string,
    body?: string,
    maxBytes = 36 * 1024,
    media = "application/json",
    admissionBinding?: { requestDigest: string; grantDigest: string },
  ): Promise<Buffer> {
    if (!/^[A-Za-z0-9_.-]+$/.test(grant) || grant.length > 32768)
      throw new Error("Invalid operation grant.");
    const options: RequestOptions = {
      method,
      ca: this.config.ca,
      cert: this.config.cert,
      key: this.config.key,
      minVersion: "TLSv1.3",
      rejectUnauthorized: true,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "X-Kelvo-Operation-Grant": grant,
        Accept: media,
        "Accept-Encoding": "identity",
        ...(body
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
          : {}),
      },
    };
    return new Promise((resolve, reject) => {
      const req = request(new URL(path, this.url), options, (res) => {
        const chunks: Buffer[] = [];
        let count = 0;
        const admissionRejected = res.statusCode === 429 && admissionBinding !== undefined;
        const responseLimit = admissionRejected ? 1024 : maxBytes;
        if (
          (!admissionRejected && ![200, 201, 202].includes(res.statusCode ?? 0)) ||
          res.headers["content-type"]?.split(";")[0] !== media ||
          (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity")
        ) {
          res.destroy();
          reject(new KelvoHttpError(res.statusCode ?? 0));
          return;
        }
        const declared = res.headers["content-length"];
        if (declared && (!/^\d+$/.test(declared) || Number(declared) > responseLimit)) {
          res.destroy();
          reject(new Error("Kelvo response exceeds the limit."));
          return;
        }
        res.on("data", (chunk: Buffer) => {
          count += chunk.length;
          if (count > responseLimit) {
            res.destroy(new Error("Kelvo response exceeds the limit."));
          } else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          if (!res.complete || (declared && Number(declared) !== count))
            reject(new Error("Kelvo response is incomplete."));
          else if (admissionRejected) {
            try {
              const evidence = validateAdmissionRejection(
                JSON.parse(Buffer.concat(chunks).toString()),
                admissionBinding!.requestDigest,
                admissionBinding!.grantDigest,
              );
              reject(new KelvoAdmissionRejected(evidence));
            } catch (error) {
              reject(error);
            }
          } else resolve(Buffer.concat(chunks));
        });
      });
      const timer = setTimeout(
        () =>
          req.destroy(
            new Error("Kelvo request timed out. Check the operation before you run it again."),
          ),
        this.config.timeoutMs ?? 15_000,
      );
      req.on("close", () => clearTimeout(timer));
      req.on("error", reject);
      req.end(body);
    });
  }
  async submit(operation: OperationRequest, grant: string) {
    const digest = operationDigest(operation);
    return validateResponse(
      JSON.parse(
        (
          await this.fetch(
            "/v1/operations",
            "POST",
            grant,
            encodeOperation(operation),
            36 * 1024,
            "application/json",
            { requestDigest: digest, grantDigest: sha256(grant) },
          )
        ).toString(),
      ),
      digest,
      undefined,
      operation.kind,
    );
  }
  async poll(id: string, digest: string, grant: string) {
    if (!validId(id)) throw new Error("Invalid operation ID.");
    return validateResponse(
      JSON.parse((await this.fetch(`/v1/operations/${id}`, "GET", grant)).toString()),
      digest,
      id,
    );
  }
  async lookup(operation: OperationRequest, grant: string): Promise<OperationResponse | null> {
    if (!operation.idempotency_key)
      throw new Error("Admission lookup requires the original idempotency key.");
    const digest = operationDigest(operation);
    try {
      const body = JSON.stringify({
        version: 1,
        idempotency_key: operation.idempotency_key,
        request_sha256: digest,
      });
      return validateResponse(
        JSON.parse((await this.fetch("/v1/operations/lookup", "POST", grant, body)).toString()),
        digest,
        undefined,
        operation.kind,
      );
    } catch (error) {
      if (error instanceof KelvoHttpError && error.status === 404) return null;
      throw error;
    }
  }
  async cancel(id: string, digest: string, grant: string) {
    if (!validId(id)) throw new Error("Invalid operation ID.");
    return validateResponse(
      JSON.parse((await this.fetch(`/v1/operations/${id}/cancel`, "POST", grant, "{}")).toString()),
      digest,
      id,
    );
  }
  async lease(
    id: string,
    grant: string,
    binding: { worker_id: string; owner: string; claim: string },
  ) {
    if (!validId(id)) throw new Error("Invalid operation ID.");
    const value = JSON.parse(
      (
        await this.fetch(
          `/v1/operations/${id}/connection-lease`,
          "POST",
          grant,
          JSON.stringify(binding),
          4096,
        )
      ).toString(),
    );
    const now = Math.floor(Date.now() / 1000);
    if (
      !Number.isInteger(value.valid_until) ||
      value.valid_until <= now ||
      value.valid_until > now + 5
    )
      throw new Error("The operation lease expired.");
    return value.valid_until as number;
  }
  async result(expected: OperationResponse, grant: string) {
    const current = await this.poll(expected.id, expected.request_sha256, grant);
    if (!isDeepStrictEqual(current, expected)) throw new Error("The operation receipt changed.");
    const ref = expected.receipt?.result;
    if (!ref || ref.rows > 10000 || ref.bytes > 4 * 1024 * 1024)
      throw new Error("Query result exceeds the limit.");
    const bytes = await this.fetch(
      `/v1/operations/${expected.id}/results`,
      "GET",
      grant,
      undefined,
      ref.bytes,
      "application/vnd.apache.arrow.stream",
    );
    if (bytes.length !== ref.bytes || sha256(bytes) !== ref.sha256)
      throw new Error("The query result could not be verified.");
    return decodeResult(bytes, ref.rows);
  }
}
