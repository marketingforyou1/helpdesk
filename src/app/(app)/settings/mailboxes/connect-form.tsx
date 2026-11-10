"use client";

import { useActionState, useState } from "react";
import { createMailbox, type FormState } from "./actions";

const methods = [
  { id: "IMAP", label: "IMAP / SMTP" },
  { id: "FORWARD", label: "Presmerovanie" },
  { id: "GMAIL", label: "Gmail / Google Workspace" },
  { id: "M365", label: "Microsoft 365 / Outlook" },
] as const;

export function ConnectForm({ teams }: { teams: { id: string; name: string }[] }) {
  const [method, setMethod] = useState<(typeof methods)[number]["id"]>("IMAP");
  const [state, action, pending] = useActionState<FormState, FormData>(createMailbox, null);
  const oauth = method === "GMAIL" || method === "M365";

  return (
    <section aria-labelledby="connect-h" className="card flex flex-col gap-4 p-5">
      <h2 id="connect-h" className="text-[17px] font-extrabold">
        Pripojiť novú schránku
      </h2>
      <div role="tablist" aria-label="Spôsob pripojenia" className="flex flex-wrap gap-2">
        {methods.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={m.id === method}
            onClick={() => setMethod(m.id)}
            className={`min-h-11 rounded-[10px] border px-3.5 text-sm font-bold ${m.id === method ? "border-ink bg-ink text-white" : "border-[#D1D5DB] bg-white"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {oauth ? (
        <p className="text-sm leading-relaxed text-[#374151]">
          Prihlásenie cez {method === "GMAIL" ? "Google" : "Microsoft"} (OAuth) pripravujeme. Zatiaľ môžete schránku pripojiť cez
          IMAP/SMTP s heslom aplikácie, alebo nastaviť presmerovanie.
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="type" value={method} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
            <label className="label">
              E-mailová adresa
              <input className="input" name="address" type="email" required placeholder="podpora@vasobchod.sk" />
            </label>
            <label className="label">
              Meno odosielateľa
              <input className="input" name="displayName" placeholder="Zákaznícka podpora" />
            </label>
            <label className="label">
              Predvolený tím
              <select className="input" name="defaultTeamId" defaultValue={teams[0]?.id ?? ""}>
                <option value="">Bez tímu</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {method === "IMAP" ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
              <label className="label">
                Heslo / heslo aplikácie
                <input className="input" name="password" type="password" required autoComplete="new-password" />
              </label>
              <label className="label">
                IMAP server
                <input className="input" name="imapHost" required placeholder="imap.vasobchod.sk" />
              </label>
              <label className="label">
                IMAP port
                <select className="input" name="imapPort" defaultValue="993">
                  <option value="993">993 · SSL/TLS</option>
                  <option value="143">143 · STARTTLS</option>
                </select>
              </label>
              <label className="label">
                SMTP server (odosielanie)
                <input className="input" name="smtpHost" required placeholder="smtp.vasobchod.sk" />
              </label>
              <label className="label">
                SMTP port
                <select className="input" name="smtpPort" defaultValue="465">
                  <option value="465">465 · SSL/TLS</option>
                  <option value="587">587 · STARTTLS</option>
                </select>
              </label>
            </div>
          ) : (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">Vlastný SMTP server na odosielanie odpovedí (voliteľné)</summary>
              <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                <label className="label">
                  SMTP server
                  <input className="input" name="smtpHost" placeholder="smtp.vasobchod.sk" />
                </label>
                <label className="label">
                  SMTP port
                  <select className="input" name="smtpPort" defaultValue="465">
                    <option value="465">465 · SSL/TLS</option>
                    <option value="587">587 · STARTTLS</option>
                  </select>
                </label>
                <label className="label">
                  Používateľ
                  <input className="input" name="smtpUser" />
                </label>
                <label className="label">
                  Heslo
                  <input className="input" name="smtpPass" type="password" autoComplete="new-password" />
                </label>
              </div>
              <p className="mt-2 text-muted">Bez neho sa odpovede posielajú cez server nastavený v SMTP_URL.</p>
            </details>
          )}

          {state && !state.ok && (
            <p role="alert" className="text-sm font-semibold text-[#B91C1C]">
              {state.message}
            </p>
          )}
          <div>
            <button className="btn-dark" disabled={pending}>
              {pending ? "Overujem pripojenie…" : method === "IMAP" ? "Otestovať a uložiť" : "Vytvoriť schránku"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
