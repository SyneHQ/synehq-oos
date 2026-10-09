"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { Button, Field, Input, Spinner } from "@synehq-oos/ui";
import { api, errorMessage } from "./api";
import { signInOwner } from "./auth-client";
import { Brand } from "./brand";
import "./auth-screen.css";

export function AuthScreen({ mode }: { mode: "setup" | "login" }) {
  const [ready, setReady] = useState(false);
  const [allowSignup, setAllowSignup] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const setup = mode === "setup";
  useEffect(() => {
    let active = true;
    api<{ initialized: boolean; allowSignup: boolean }>("/api/setup")
      .then((state) => {
        if (!active) return;
        if (setup && state.initialized) {
          window.location.replace("/login/");
          return;
        }
        if (!setup && !state.initialized) {
          window.location.replace("/setup/");
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
  }, [setup]);
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
        window.location.replace("/login/");
      } else {
        await signInOwner(String(fields.get("email") ?? ""), String(fields.get("password") ?? ""));
        window.location.replace("/connections/");
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-layout">
      <main className="login-panel">
        <header className="login-header">
          <Brand />
        </header>
        <div className="login-content">
          <div className="login-form-wrap">
            <h1 className="login-title">
              {setup ? "Create your owner account" : "Sign in to SyneHQ"}
            </h1>
            <p className="login-description">
              {setup
                ? "Set up this installation. Only one owner account can be created."
                : "Welcome back to your data workspace."}
            </p>
            {!ready ? (
              <div className="login-loading">
                <Spinner label="Checking installation" />
              </div>
            ) : setup && !allowSignup ? (
              <div className="login-notice">
                Initial web setup is disabled. Create the owner account with this installation's
                local setup command.
              </div>
            ) : (
              <form onSubmit={submit} className="login-form" aria-busy={busy}>
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
                    type={showPassword ? "text" : "password"}
                    autoComplete={setup ? "new-password" : "current-password"}
                    minLength={setup ? 12 : undefined}
                    required
                    suffix={
                      <button
                        type="button"
                        className="login-password-toggle"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        disabled={busy}
                        onClick={() => setShowPassword((visible) => !visible)}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    }
                  />
                </Field>
                {error && (
                  <p role="alert" className="login-error">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={busy}
                  className="login-submit"
                >
                  {setup ? "Create owner account" : "Sign in"}
                </Button>
              </form>
            )}
            {!setup && (
              <p className="login-recovery">
                Lost access? Use the local owner recovery command on this installation's host.
              </p>
            )}
          </div>
        </div>
        <footer className="login-footer">No SyneHQ Cloud account is needed.</footer>
      </main>
      <aside className="login-visual" aria-label="SyneHQ OOS">
        <Image
          src="/auth-portrait.jpg"
          alt=""
          fill
          priority
          sizes="(max-width: 800px) 0px, 50vw"
          className="login-visual-image"
        />
        <div className="login-visual-overlay" />
        <div className="login-visual-content">
          <p className="login-visual-title">Clarity runs on</p>
          <span className="login-visual-badge">
            <Brand light />
          </span>
        </div>
      </aside>
    </div>
  );
}
