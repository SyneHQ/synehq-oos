import { managedMode, authenticateControl, managedConfig } from "./hakopod";
import { appStore } from "./store";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { once } from "node:events";
import { authHandler, publicUrl, serverBasePath } from "./auth";
import { stripBasePath } from "../paths";
import { checkOrigin, response } from "./http";
import { StoreError } from "./store";
import * as setup from "./api/setup/route";
import * as session from "./api/session/route";
import * as connections from "./api/connections/route";
import * as connectionTest from "./api/connections/test/route";
import * as connection from "./api/connections/[id]/route";
import * as savedConnectionTest from "./api/connections/[id]/test/route";
import * as schema from "./api/connections/[id]/schema/route";
import * as query from "./api/query/route";
import * as queryPrepare from "./api/query/prepare/route";
import * as operation from "./api/query/[operationId]/route";
import * as operationCancel from "./api/query/[operationId]/cancel/route";
import * as rowsPrepare from "./api/rows/prepare/route";
import * as rowsExecute from "./api/rows/execute/route";
import * as tables from "./api/tables/data/route";
import * as aiSettings from "./api/ai/settings/route";
import * as aiGenerate from "./api/ai/generate/route";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_AUTH_BODY_BYTES = 32 * 1024;
const identifier = "([A-Za-z0-9_-]{1,128})";
type RouteHandler = (request: Request, context: { params: Promise<any> }) => Promise<Response>;
type Route = { pattern: RegExp; methods: Record<string, RouteHandler>; parameter?: string };
const routes: Route[] = [
  { pattern: /^\/api\/setup\/?$/, methods: setup },
  { pattern: /^\/api\/session\/?$/, methods: session },
  { pattern: /^\/api\/connections\/?$/, methods: connections },
  { pattern: /^\/api\/connections\/test\/?$/, methods: connectionTest },
  {
    pattern: new RegExp(`^/api/connections/${identifier}/?$`),
    methods: connection,
    parameter: "id",
  },
  {
    pattern: new RegExp(`^/api/connections/${identifier}/test/?$`),
    methods: savedConnectionTest,
    parameter: "id",
  },
  {
    pattern: new RegExp(`^/api/connections/${identifier}/schema/?$`),
    methods: schema,
    parameter: "id",
  },
  { pattern: /^\/api\/query\/?$/, methods: query },
  { pattern: /^\/api\/query\/prepare\/?$/, methods: queryPrepare },
  {
    pattern: new RegExp(`^/api/query/${identifier}/?$`),
    methods: operation,
    parameter: "operationId",
  },
  {
    pattern: new RegExp(`^/api/query/${identifier}/cancel/?$`),
    methods: operationCancel,
    parameter: "operationId",
  },
  { pattern: /^\/api\/rows\/prepare\/?$/, methods: rowsPrepare },
  { pattern: /^\/api\/rows\/execute\/?$/, methods: rowsExecute },
  { pattern: /^\/api\/tables\/data\/?$/, methods: tables },
  { pattern: /^\/api\/ai\/settings\/?$/, methods: aiSettings },
  { pattern: /^\/api\/ai\/generate\/?$/, methods: aiGenerate },
];

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

export type ServerOptions = {
  host?: string;
  port?: number;
  staticDir?: string;
  isReady?: () => boolean | Promise<boolean>;
};

function failure(error: unknown, pathname?: string, notSubmitted = false): Response {
  const known = error instanceof StoreError;
  if (!known)
    console.error("HTTP request failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
  return response(
    {
      error: known ? error.message : "The request could not complete. Check the server log.",
      ...(known && error.code ? { code: error.code } : {}),
      ...(notSubmitted && (pathname === "/api/rows/execute" || pathname === "/api/rows/execute/")
        ? { notSubmitted: true }
        : {}),
    },
    known ? error.status : 500,
  );
}

export function requestPath(target: string): string {
  if (
    target.length > 8192 ||
    !target.startsWith("/") ||
    target.startsWith("//") ||
    /[\\\0\r\n#]/.test(target)
  )
    throw new StoreError(400, "The request path is invalid.");
  const rawPath = target.split("?", 1)[0];
  if (/%(?:2f|5c)/i.test(rawPath)) throw new StoreError(400, "The request path is invalid.");
  let pathname: string;
  try {
    pathname = decodeURIComponent(rawPath);
  } catch {
    throw new StoreError(400, "The request path is invalid.");
  }
  if (/[\\\0]/.test(pathname) || pathname.split("/").some((part) => part === "." || part === ".."))
    throw new StoreError(400, "The request path is invalid.");
  return pathname;
}

async function staticResponse(
  request: Request,
  pathname: string,
  staticDir: string,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  if (pathname.split("/").some((part) => part.startsWith(".")) || /\.(?:br|gz)$/.test(pathname))
    return response({ error: "Not found." }, 404);
  const root = await realpath(staticDir);
  const explorer = /^\/explorer\/[A-Za-z0-9_-]{1,128}(?:\/console)?\/?$/.test(pathname);
  let candidate = explorer ? join(root, "explorer", "index.html") : resolve(root, `.${pathname}`);
  try {
    if ((await stat(candidate)).isDirectory()) candidate = join(candidate, "index.html");
    const file = await realpath(candidate);
    const pathFromRoot = relative(root, file);
    if (isAbsolute(pathFromRoot) || pathFromRoot === ".." || pathFromRoot.startsWith("../"))
      return response({ error: "Not found." }, 404);
    let details = await stat(file);
    if (!details.isFile()) return response({ error: "Not found." }, 404);
    let servedFile = file;
    let encoding: string | undefined;
    const accepted = new Map<string, number>();
    for (const entry of (request.headers.get("accept-encoding") ?? "").split(",")) {
      const [name, ...parameters] = entry.trim().toLowerCase().split(";");
      const quality = parameters.find((value) => value.trim().startsWith("q="));
      const value = quality ? Number(quality.trim().slice(2)) : 1;
      accepted.set(name, Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0);
    }
    const encodings = ["br", "gzip"]
      .map((name) => ({ name, quality: accepted.get(name) ?? accepted.get("*") ?? 0 }))
      .filter((entry) => entry.quality > 0)
      .sort((a, b) => b.quality - a.quality);
    for (const entry of encodings) {
      try {
        const variant = await realpath(file + (entry.name === "br" ? ".br" : ".gz"));
        const relativeVariant = relative(root, variant);
        if (
          isAbsolute(relativeVariant) ||
          relativeVariant === ".." ||
          relativeVariant.startsWith("../")
        )
          continue;
        const variantStat = await stat(variant);
        if (!variantStat.isFile()) continue;
        servedFile = variant;
        details = variantStat;
        encoding = entry.name;
        break;
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
          continue;
        throw error;
      }
    }
    const headers: Record<string, string> = {
      "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
      "Content-Length": String(details.size),
      "Cache-Control": pathname.startsWith("/_next/static/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      "X-Content-Type-Options": "nosniff",
      Vary: "Accept-Encoding",
    };
    if (encoding) headers["Content-Encoding"] = encoding;
    if (request.method === "HEAD") return new Response(null, { headers });
    const stream = createReadStream(servedFile, { signal: request.signal });
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { headers });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["ENOENT", "ENOTDIR"].includes(String(error.code))
    )
      return response({ error: "Not found." }, 404);
    throw error;
  }
}

export function createRequestHandler(options: ServerOptions = {}) {
  const origin = publicUrl();
  if (managedMode()) managedConfig();
  const basePath = serverBasePath();
  const staticDir = resolve(options.staticDir ?? process.env.OOS_STATIC_DIR ?? "apps/web/out");
  const buildConfig = join(staticDir, "oos-build.json");
  if (existsSync(buildConfig)) {
    if (JSON.parse(readFileSync(buildConfig, "utf8")).basePath !== basePath)
      throw new Error("The static dashboard and server must use the same base path.");
  } else if (basePath) {
    throw new Error("Build the static dashboard with the configured base path before starting.");
  }
  return async function handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    let pathname: string | undefined;
    let dispatched = false;
    try {
      if (url.origin !== origin.origin)
        throw new StoreError(403, "This request must come from this installation.");
      pathname = requestPath(url.pathname);
      if (pathname !== "/healthz") {
        const unprefixed = stripBasePath(pathname, basePath);
        if (unprefixed === null) return response({ error: "Not found." }, 404);
        pathname = unprefixed;
      }
      if (pathname === "/healthz") {
        if (request.method !== "GET" && request.method !== "HEAD")
          return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
        const ready = (await options.isReady?.()) === true;
        const health = response({ status: ready ? "ready" : "starting" }, ready ? 200 : 503);
        return request.method === "HEAD"
          ? new Response(null, { status: health.status, headers: health.headers })
          : health;
      }
      if (pathname.startsWith("/api/") && options.isReady && (await options.isReady()) !== true)
        return failure(
          new StoreError(503, "The service is starting. Try again shortly.", "NOT_READY"),
          pathname,
          true,
        );
      if (managedMode() && pathname === "/internal/hakopod/sync") {
        authenticateControl(request);
        if (request.method !== "POST") return response({ error: "Use POST." }, 405);
        await appStore().importManagedConnections(await request.json());
        return response({ synced: true });
      }
      if (managedMode() && (pathname === "/api/setup" || pathname.startsWith("/api/auth/"))) {
        if (pathname === "/api/setup" && request.method === "GET")
          return response({ initialized: true, allowSignup: false, recoveryRequired: false });
        return response({ error: "Manage your login in Hakopod." }, 403);
      }
      if (pathname.startsWith("/api/auth/")) {
        if (request.method !== "GET" && request.method !== "POST")
          return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
        if (request.method === "POST") checkOrigin(request);
        const result = await authHandler(request);
        const headers = new Headers(result.headers);
        headers.set("Cache-Control", "no-store");
        return new Response(result.body, {
          status: result.status,
          statusText: result.statusText,
          headers,
        });
      }
      for (const route of routes) {
        const match = route.pattern.exec(pathname);
        if (!match) continue;
        const handler = route.methods[request.method];
        if (!handler)
          return new Response(null, {
            status: 405,
            headers: { Allow: Object.keys(route.methods).join(", ") },
          });
        dispatched = true;
        return await handler(request, {
          params: Promise.resolve(route.parameter ? { [route.parameter]: match[1] } : {}),
        });
      }
      if (
        pathname === "/api" ||
        pathname.startsWith("/api/") ||
        pathname === "/internal" ||
        pathname.startsWith("/internal/")
      )
        return response({ error: "Not found." }, 404);
      return await staticResponse(request, pathname, staticDir);
    } catch (error) {
      return failure(error, pathname, !dispatched);
    }
  };
}

async function readBody(request: IncomingMessage, maximum: number): Promise<Buffer | undefined> {
  const contentLength = request.headers["content-length"];
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > maximum))
    throw new StoreError(413, "The request is too large.");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    total += chunk.length;
    if (total > maximum) throw new StoreError(413, "The request is too large.");
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return total ? Buffer.concat(chunks, total) : undefined;
}

export async function writeResponse(
  result: Response,
  responseStream: ServerResponse,
): Promise<void> {
  responseStream.statusCode = result.status;
  for (const [name, value] of result.headers)
    if (name !== "set-cookie") responseStream.setHeader(name, value);
  const cookies = result.headers.getSetCookie();
  if (cookies.length) responseStream.setHeader("Set-Cookie", cookies);
  responseStream.setHeader("X-Content-Type-Options", "nosniff");
  responseStream.setHeader("X-Frame-Options", "DENY");
  responseStream.setHeader("Referrer-Policy", "same-origin");
  if (!result.body) {
    responseStream.end();
    return;
  }
  await pipeline(
    Readable.fromWeb(result.body as import("node:stream/web").ReadableStream),
    responseStream,
  );
}

export async function startServer(options: ServerOptions = {}): Promise<Server> {
  const origin = publicUrl();
  const basePath = serverBasePath();
  const handleRequest = createRequestHandler(options);
  const staticDir = resolve(options.staticDir ?? process.env.OOS_STATIC_DIR ?? "apps/web/out");
  if (!(await stat(staticDir)).isDirectory())
    throw new Error("The static dashboard directory is missing.");
  const port = options.port ?? Number(process.env.PORT ?? 3100);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("PORT must be a valid TCP port.");
  let activeApi = 0;
  let activeCredentials = 0;
  const server = createServer({ maxHeaderSize: 16384 }, async (request, outgoing) => {
    const controller = new AbortController();
    request.once("aborted", () => controller.abort());
    outgoing.once("close", () => {
      if (!outgoing.writableFinished) controller.abort();
    });
    let pathname: string | undefined;
    let countedApi = false;
    let countedCredentials = false;
    let dispatched = false;
    try {
      pathname = requestPath(request.url ?? "/");
      const host = request.headers.host;
      const healthFromLoopback =
        pathname === "/healthz" &&
        ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress ?? "");
      pathname = stripBasePath(pathname, basePath) ?? pathname;
      let validHost = false;
      try {
        validHost = Boolean(
          host &&
            !/[\/\\?#@\s]/.test(host) &&
            new URL(`${origin.protocol}//${host}`).origin === origin.origin,
        );
      } catch {
        /* Reject malformed Host values below. */
      }
      if (!healthFromLoopback && !validHost)
        throw new StoreError(403, "This request must come from this installation.");
      if (pathname.startsWith("/api/")) {
        if (activeApi >= 16) throw new StoreError(503, "The server is busy. Try again shortly.");
        activeApi++;
        countedApi = true;
      }
      if (request.method === "POST" && /^\/api\/auth\/callback\/credentials\/?$/.test(pathname)) {
        if (activeCredentials >= 2)
          throw new StoreError(503, "The server is busy. Try again shortly.");
        activeCredentials++;
        countedCredentials = true;
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers))
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      const method = request.method ?? "GET";
      const payload = await readBody(
        request,
        pathname === "/internal/hakopod/sync" && managedMode()
          ? 2 * 1024 * 1024
          : pathname.startsWith("/api/auth/")
            ? MAX_AUTH_BODY_BYTES
            : MAX_BODY_BYTES,
      );
      if ((method === "GET" || method === "HEAD") && payload)
        throw new StoreError(400, "This request method cannot include a body.");
      const webRequest = new Request(new URL(request.url ?? "/", origin), {
        method,
        headers,
        body: payload ? new Uint8Array(payload) : undefined,
        signal: controller.signal,
      });
      dispatched = true;
      await writeResponse(await handleRequest(webRequest), outgoing);
    } catch (error) {
      if (outgoing.headersSent || outgoing.destroyed) outgoing.destroy();
      else {
        outgoing.setHeader("Connection", "close");
        try {
          await writeResponse(failure(error, pathname, !dispatched), outgoing);
        } catch {
          outgoing.destroy();
        }
      }
    } finally {
      if (countedApi) activeApi--;
      if (countedCredentials) activeCredentials--;
    }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 15000;
  server.keepAliveTimeout = 5000;
  server.maxConnections = 64;
  server.maxRequestsPerSocket = 1000;
  server.listen(port, options.host ?? process.env.HOST ?? "127.0.0.1");
  await once(server, "listening");
  return server;
}
