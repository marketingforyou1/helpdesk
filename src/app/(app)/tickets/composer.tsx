"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { postMessage, type ComposerState } from "./actions";

export function Composer({ ticketId, customerName, channel }: { ticketId: string; customerName: string; channel: string }) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [state, action, pending] = useActionState<ComposerState, FormData>(postMessage, null);
  const formRef = useRef<HTMLFormElement>(null);
  const note = mode === "note";

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  const tab = (on: boolean, color: string) =>
    `min-h-11 px-4 text-[13px] font-bold border-b-2 ${on ? `text-ink ${color}` : "text-muted border-transparent"}`;

  return (
    <form ref={formRef} action={action} className="mx-4 mb-6 overflow-hidden rounded-xl border border-[#D1D5DB] bg-white sm:mx-6">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="mode" value={mode} />
      <div role="tablist" aria-label="Typ odpovede" className="flex border-b border-line">
        <button type="button" role="tab" aria-selected={!note} onClick={() => setMode("reply")} className={tab(!note, "border-accent")}>
          Odpoveď zákazníkovi
        </button>
        <button type="button" role="tab" aria-selected={note} onClick={() => setMode("note")} className={tab(note, "border-[#CA8A04]")}>
          Interná poznámka
        </button>
      </div>
      <label className="block">
        <span className="sr-only">Text správy</span>
        <textarea
          name="text"
          rows={4}
          required
          placeholder={note ? "Poznámku uvidia len kolegovia…" : `Odpoveď pre ${customerName} (${channel})…`}
          className={`block w-full resize-y p-3.5 text-sm leading-relaxed outline-none ${note ? "bg-[#FEFCE8]" : "bg-white"}`}
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2.5">
        <p role="status" className={`text-[13px] font-semibold ${state && !state.ok ? "text-[#B91C1C]" : "text-muted"}`}>
          {state?.message}
        </p>
        <button className="btn-primary" disabled={pending}>
          {pending ? "Odosielam…" : note ? "Uložiť poznámku" : "Odoslať"}
        </button>
      </div>
    </form>
  );
}
