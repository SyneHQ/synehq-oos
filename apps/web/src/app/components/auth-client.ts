import { applicationPath } from "../../paths";
import type { OwnerSummary } from "@synehq-oos/explorer-contracts";
import { api } from "./api";

async function authForm(
  action: "callback/credentials" | "signout",
  fields: Record<string, string>,
): Promise<URL> {
  const csrf = await api<{ csrfToken?: unknown }>("/api/auth/csrf");
  if (typeof csrf?.csrfToken !== "string" || !csrf.csrfToken || csrf.csrfToken.length > 256)
    throw new Error("The sign-in token could not be verified. Try again.");
  const result = await api<{ url?: unknown }>(`/api/auth/${action}`, {
    method: "POST",
    redirect: "error",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({ ...fields, csrfToken: csrf.csrfToken }),
  });
  if (typeof result?.url !== "string" || !result.url || result.url.length > 4096)
    throw new Error("The authentication response was incomplete. Try again.");
  try {
    // The response URL reports errors. Navigation uses fixed local paths only.
    return new URL(result.url, "https://oos.invalid");
  } catch {
    throw new Error("The authentication response was incomplete. Try again.");
  }
}

export async function signInOwner(email: string, password: string): Promise<void> {
  const result = await authForm("callback/credentials", {
    email,
    password,
    callbackUrl: applicationPath("/connections/"),
  });
  if (result.searchParams.has("error"))
    throw new Error("Sign-in failed. Check your email and password.");
  const session = await api<{ owner: OwnerSummary | null }>("/api/session");
  if (!session?.owner?.id) throw new Error("Sign-in failed. Check your email and password.");
}

export async function signOutOwner(): Promise<void> {
  const result = await authForm("signout", { callbackUrl: applicationPath("/login/") });
  if (result.searchParams.has("error")) throw new Error("Sign-out could not complete. Try again.");
  const session = await api<{ owner: OwnerSummary | null }>("/api/session");
  if (session?.owner !== null) throw new Error("Sign-out could not be confirmed. Try again.");
}
