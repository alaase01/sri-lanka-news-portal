"use client";

import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "@/server/auth/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, { error: null, email: "" });
  // Controlled, because React clears uncontrolled fields after every submission
  // and the administrator should not have to retype the email after a typo in the password.
  const [email, setEmail] = useState("");
  const field = "mt-1.5 w-full rounded border border-muted bg-white px-3 py-2.5 text-base text-ink";

  return (
    <form action={action} className="flex flex-col gap-5">
      <div>
        <label htmlFor="email" className="font-semibold">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
      </div>
      <div>
        <label htmlFor="password" className="font-semibold">
          Password
        </label>
        <input id="password" name="password" type="password" aria-describedby={state.error ? "login-error" : undefined} autoComplete="current-password" required maxLength={1024} className={field} />
      </div>
      {state.error && (
        <p id="login-error" role="alert" className="font-semibold text-brand-dark">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="min-h-12 rounded bg-navy px-5 font-bold text-white hover:bg-navy-deep disabled:opacity-70">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
