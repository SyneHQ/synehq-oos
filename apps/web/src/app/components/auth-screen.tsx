"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, Database, KeyRound, Network, Terminal } from "lucide-react";
import { Button, Field, Input, Spinner } from "@synehq-oos/ui";
import { api, errorMessage } from "./api";
import { Brand } from "./brand";

export function AuthScreen({ mode }: { mode: "setup" | "login" }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [allowSignup, setAllowSignup] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setup = mode === "setup";
  useEffect(() => {
    let active = true;
    api<{ initialized: boolean; allowSignup: boolean }>("/api/setup")
      .then((state) => {
        if (!active) return;
        if (setup && state.initialized) {
          router.replace("/login");
          return;
        }
        if (!setup && !state.initialized) {
          router.replace("/setup");
          return;
        }
        setAllowSignup(state.allowSignup);
        setReady(true);
      })
      .catch((cause) => {
        if (active) {
          setError(errorMessage(cause));
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [router, setup]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (setup) {
        await api("/api/setup", {
          method: "POST",
          body: JSON.stringify({
            token: fields.get("token"),
            name: fields.get("name"),
            email: fields.get("email"),
            password: fields.get("password"),
          }),
        });
        router.replace("/login");
      } else {
        const result = await signIn("credentials", {
          redirect: false,
          email: fields.get("email"),
          password: fields.get("password"),
        });
        if (result?.error) throw new Error("Sign-in failed. Check your email and password.");
        router.replace("/connections");
        router.refresh();
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Brand light />
        <div className="auth-story-main">
          <p className="eyebrow">YOUR PERSONAL DATA WORKSPACE</p>
          <h1>
            Your database.
            <br />A clearer view.
          </h1>
          <p>
            Explore your tables, understand their relationships, and write SQL. Connect to your
            databases without importing them.
          </p>
          <div className="auth-capabilities">
            <span>
              <Database /> Browse tables
            </span>
            <span>
              <Network /> See relationships
            </span>
            <span>
              <Terminal /> Write SQL
            </span>
          </div>
        </div>
        <div className="auth-story-footer">
          <span className="status-dot" /> Self-hosted. One owner. Your control.
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-form-wrap">
          <div className="auth-step">
            <KeyRound size={18} />
            <span>{setup ? "INITIAL SETUP" : "OWNER ACCESS"}</span>
          </div>
          <h2>{setup ? "Make this space yours." : "Welcome back."}</h2>
          <p className="auth-description">
            {setup
              ? "Create the owner account for this installation. Setup closes after your account is created."
              : "Sign in to your database workspace."}
          </p>
          {!ready ? (
            <div className="loading-state">
              <Spinner label="Checking installation" />
            </div>
          ) : setup && !allowSignup ? (
            <div className="notice">
              Initial web setup is disabled. Create the owner account with the installation's local
              setup command.
            </div>
          ) : (
            <form onSubmit={submit} className="auth-form">
              {setup && (
                <>
                  <Field
                    label="Setup token"
                    hint="Use the one-time token from your local setup command."
                    required
                  >
                    <Input name="token" autoComplete="off" required autoFocus />
                  </Field>
                  <Field label="Your name" required>
                    <Input name="name" autoComplete="name" required maxLength={100} />
                  </Field>
                </>
              )}
              <Field label="Email" required>
                <Input
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@example.com"
                  required
                  autoFocus={!setup}
                />
              </Field>
              <Field
                label="Password"
                hint={setup ? "Use at least 12 characters." : undefined}
                required
              >
                <Input
                  name="password"
                  type="password"
                  autoComplete={setup ? "new-password" : "current-password"}
                  minLength={setup ? 12 : undefined}
                  required
                />
              </Field>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={busy}
                iconEnd={<ArrowRight />}
              >
                {setup ? "Create owner account" : "Sign in"}
              </Button>
            </form>
          )}
          {!setup && (
            <p className="auth-recovery">
              Lost access? Run the local owner recovery command on this installation's host.
            </p>
          )}
          <p className="auth-footnote">No SyneHQ Cloud account is needed.</p>
        </div>
        <footer className="auth-footer">
          SyneHQ OOS <span>A focused place for your data.</span>
        </footer>
      </main>
    </div>
  );
}
