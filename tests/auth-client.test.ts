import assert from "node:assert/strict";
import test from "node:test";
import { signInOwner, signOutOwner } from "../apps/web/src/app/components/auth-client";

test("static sign-in submits an encoded CSRF form and confirms the owner session", async (context) => {
  const requests: Array<{ path: string; options?: RequestInit }> = [];
  const responses = [
    { csrfToken: "one-time-csrf" },
    { url: "https://oos.example/connections/" },
    { owner: { id: "owner", name: "Owner", email: "owner+test@example.com" } },
  ];
  context.mock.method(globalThis, "fetch", async (path: string, options?: RequestInit) => {
    requests.push({ path, options });
    return Response.json(responses.shift());
  });
  await signInOwner("owner+test@example.com", "special & = + password");
  assert.deepEqual(
    requests.map((request) => request.path),
    ["/api/auth/csrf", "/api/auth/callback/credentials", "/api/session"],
  );
  const submitted = requests[1].options!;
  assert.equal(submitted.method, "POST");
  assert.equal(submitted.credentials, "same-origin");
  assert.equal(submitted.redirect, "error");
  const headers = new Headers(submitted.headers);
  assert.equal(headers.get("Content-Type"), "application/x-www-form-urlencoded");
  assert.equal(headers.get("X-Auth-Return-Redirect"), "1");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(String(submitted.body))), {
    csrfToken: "one-time-csrf",
    email: "owner+test@example.com",
    password: "special & = + password",
    callbackUrl: "/connections/",
  });
});

test("an Auth.js error response cannot enter the workspace", async (context) => {
  const requests: string[] = [];
  context.mock.method(globalThis, "fetch", async (path: string) => {
    requests.push(path);
    return Response.json(
      path.endsWith("csrf")
        ? { csrfToken: "csrf" }
        : { url: "/login/?error=CredentialsSignin&code=credentials" },
    );
  });
  await assert.rejects(
    signInOwner("owner@example.com", "incorrect"),
    /Check your email and password/,
  );
  assert.equal(requests.includes("/api/session"), false);
});

test("a successful auth reply without an owner session is not sign-in proof", async (context) => {
  context.mock.method(globalThis, "fetch", async (path: string) =>
    Response.json(
      path.endsWith("csrf")
        ? { csrfToken: "csrf" }
        : path.endsWith("credentials")
          ? { url: "/connections/" }
          : { owner: null },
    ),
  );
  await assert.rejects(signInOwner("owner@example.com", "password"), /Sign-in failed/);
});

test("the browser sends no credential form when the CSRF token is missing", async (context) => {
  const fetch = context.mock.method(globalThis, "fetch", async () => Response.json({}));
  await assert.rejects(signInOwner("owner@example.com", "password"), /token could not be verified/);
  assert.equal(fetch.mock.callCount(), 1);
});

test("static sign-out confirms that the owner session is revoked", async (context) => {
  const requests: string[] = [];
  context.mock.method(globalThis, "fetch", async (path: string, options?: RequestInit) => {
    requests.push(path);
    if (path.endsWith("csrf")) return Response.json({ csrfToken: "csrf" });
    if (path.endsWith("signout")) {
      assert.equal(new URLSearchParams(String(options?.body)).get("csrfToken"), "csrf");
      assert.equal(options?.method, "POST");
      return Response.json({ url: "/login/" });
    }
    return Response.json({ owner: null });
  });
  await signOutOwner();
  assert.deepEqual(requests, ["/api/auth/csrf", "/api/auth/signout", "/api/session"]);
});

test("sign-out does not report success while an owner session remains", async (context) => {
  context.mock.method(globalThis, "fetch", async (path: string) =>
    Response.json(
      path.endsWith("csrf")
        ? { csrfToken: "csrf" }
        : path.endsWith("signout")
          ? { url: "/login/" }
          : { owner: { id: "owner" } },
    ),
  );
  await assert.rejects(signOutOwner(), /could not be confirmed/);
});

test("a lost authentication response does not become a confirmed session", async (context) => {
  const requests: string[] = [];
  context.mock.method(globalThis, "fetch", async (path: string) => {
    requests.push(path);
    if (path.endsWith("csrf")) return Response.json({ csrfToken: "csrf" });
    throw new TypeError("Network response lost");
  });
  await assert.rejects(signInOwner("owner@example.com", "password"), /Network response lost/);
  assert.equal(requests.includes("/api/session"), false);
});
