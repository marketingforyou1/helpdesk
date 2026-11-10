"use client";

import { useActionState } from "react";
import { testFilters, type TestResult } from "../actions";

export function FilterTester({ mailboxId }: { mailboxId: string }) {
  const [result, action, pending] = useActionState<TestResult, FormData>(testFilters, null);
  return (
    <section aria-labelledby="tester-h" className="card flex flex-col gap-4 p-5">
      <h2 id="tester-h" className="text-[17px] font-extrabold">
        Otestovať filtre na ukážkovom e-maile
      </h2>
      <form action={action} className="flex flex-wrap gap-4">
        <input type="hidden" name="mailboxId" value={mailboxId} />
        <div className="grid min-w-0 flex-[2_1_360px] grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <label className="label">
            Od
            <input className="input" name="from" type="email" defaultValue="zakaznik@example.sk" required />
          </label>
          <label className="label">
            Predmet
            <input className="input" name="subject" defaultValue="Reklamácia – pokazený zips" />
          </label>
          <label className="label sm:col-span-2">
            Text
            <textarea className="input h-24 py-2" name="body" defaultValue="Dobrý deň, zips sa pokazil po týždni." />
          </label>
          <label className="label">
            Štítky zákazníka (čiarkou)
            <input className="input" name="customerTags" placeholder="VIP" />
          </label>
          <label className="label">
            Spam skóre
            <input className="input" name="spamScore" type="number" step="0.1" defaultValue="0" />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="listUnsubscribe" className="h-5 w-5 accent-accent" /> Je to newsletter (List-Unsubscribe)
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="attachment" className="h-5 w-5 accent-accent" /> Má prílohu
          </label>
          <div>
            <button className="btn-ghost" disabled={pending}>
              {pending ? "Testujem…" : "Otestovať"}
            </button>
          </div>
        </div>
        <div role="status" className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5 rounded-xl border border-[#C7E6DD] bg-accent-soft p-4">
          <span className="eyebrow text-[#374151]">Výsledok</span>
          {result ? (
            <>
              <span className="text-lg font-extrabold">
                {result.matched ? `Filter ${result.matched.position}: ${result.matched.name}` : "Žiadny filter nesedí"}
              </span>
              <span className="text-sm leading-relaxed text-[#374151]">{result.outcome}</span>
            </>
          ) : (
            <span className="text-sm text-[#374151]">Vyplňte ukážkový e-mail a kliknite na Otestovať.</span>
          )}
        </div>
      </form>
    </section>
  );
}
