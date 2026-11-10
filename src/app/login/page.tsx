"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={action} className="card flex w-full max-w-sm flex-col gap-4 p-6">
        <div className="flex items-center gap-2 text-lg font-extrabold">
          <span aria-hidden className="h-7 w-7 rounded-lg bg-accent" />
          Ozvena
        </div>
        <h1 className="text-xl font-extrabold">Prihlásenie agenta</h1>
        <label className="label">
          E-mail
          <input className="input" name="email" type="email" autoComplete="username" required />
        </label>
        <label className="label">
          Heslo
          <input className="input" name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && (
          <p role="alert" className="text-sm font-semibold text-[#B91C1C]">
            {error}
          </p>
        )}
        <button className="btn-primary" disabled={pending}>
          {pending ? "Prihlasujem…" : "Prihlásiť sa"}
        </button>
      </form>
    </main>
  );
}
