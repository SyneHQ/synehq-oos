import { Auth, type AuthConfig } from "@auth/core";
import type { DefaultSession, Session } from "@auth/core/types";
import Credentials from "@auth/core/providers/credentials";
import { runtimeIdentity } from "../crypto/keyring";
import {
  assertOwnerIdentity,
  authenticateOwner,
  revokeSession,
  StoreError,
  type OwnerIdentity,
} from "../store";

declare module "@auth/core/types" {
  interface User {
    authVersion?: number;
    sessionId?: string;
  }
  interface Session {
    user: DefaultSession["user"] & { id: string; authVersion: number; sessionId: string };
  }
}

export function publicUrl(): URL {
  const configured = process.env.AUTH_URL ?? process.env.OOS_PUBLIC_URL;
  if (!configured && process.env.NODE_ENV === "production")
    throw new Error("Set AUTH_URL to the public app URL.");
  const url = new URL(configured ?? "http://localhost:3100");
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("AUTH_URL must be an HTTP or HTTPS origin.");
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Remote authentication requires HTTPS.");
  return url;
}

export function sessionConfig(): AuthConfig {
  if (typeof window !== "undefined") throw new Error("Authentication is server-only.");
  const origin = publicUrl();
  return {
    basePath: "/api/auth",
    secret: runtimeIdentity().sessionSecret,
    trustHost: true,
    session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
    pages: { signIn: "/login" },
    useSecureCookies: origin.protocol === "https:",
    cookies: {
      sessionToken: {
        name: origin.protocol === "https:" ? "__Host-oos.session-token" : "oos.session-token",
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: origin.protocol === "https:",
        },
      },
    },
    providers: [
      Credentials({
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials, request) {
          const suppliedOrigin = request.headers.get("origin");
          if (suppliedOrigin && suppliedOrigin !== origin.origin) return null;
          if (typeof credentials.email !== "string" || typeof credentials.password !== "string")
            return null;
          return authenticateOwner(credentials.email, credentials.password);
        },
      }),
    ],
    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          token.sub = user.id;
          token.authVersion = user.authVersion;
          token.sessionId = user.sessionId;
        }
        if (
          typeof token.sub !== "string" ||
          typeof token.authVersion !== "number" ||
          typeof token.sessionId !== "string"
        )
          return null;
        try {
          await assertOwnerIdentity({
            id: token.sub,
            authVersion: token.authVersion,
            sessionId: token.sessionId,
          });
        } catch (error) {
          if (error instanceof StoreError && error.status === 401) return null;
          throw error;
        }
        return token;
      },
      session({ session, token }) {
        session.user.id = token.sub!;
        session.user.authVersion = token.authVersion as number;
        session.user.sessionId = token.sessionId as string;
        return session;
      },
      redirect({ url }) {
        const target = new URL(url, origin);
        return target.origin === origin.origin ? target.toString() : origin.toString();
      },
    },
    events: {
      async signOut(message) {
        if ("token" in message && typeof message.token?.sessionId === "string")
          await revokeSession(message.token.sessionId);
      },
    },
    logger: {
      error(error) {
        console.error("Authentication request failed.", { name: error.name });
      },
    },
  };
}

export function authHandler(request: Request): Promise<Response> {
  return Auth(request, sessionConfig());
}

export const handlers = { GET: authHandler, POST: authHandler };

export async function currentOwner(request: Request): Promise<OwnerIdentity | null> {
  const sessionResponse = await Auth(
    new Request(new URL("/api/auth/session", publicUrl()), {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      signal: request.signal,
    }),
    sessionConfig(),
  );
  if (!sessionResponse.ok)
    throw new StoreError(503, "Authentication is unavailable. Check the server log.");
  const session = (await sessionResponse.json()) as Session | null;
  if (!session?.user?.id) return null;
  try {
    return await assertOwnerIdentity(session.user);
  } catch (error) {
    if (error instanceof StoreError && error.status === 401) return null;
    throw error;
  }
}

export async function requireOwner(request: Request): Promise<OwnerIdentity> {
  const owner = await currentOwner(request);
  if (!owner) throw new StoreError(401, "Sign in to continue.", "UNAUTHORIZED");
  return owner;
}
