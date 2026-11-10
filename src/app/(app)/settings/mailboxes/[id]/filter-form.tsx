"use client";

import { useState, useTransition } from "react";
import { conditionFields, conditionOps, fieldLabels, opLabels, type FilterCondition } from "@/lib/mail/filters";
import { createFilter, type FormState } from "../actions";

const emptyCondition: FilterCondition = { field: "subjectOrBody", op: "contains", value: "" };

export function FilterForm({ mailboxId, teams }: { mailboxId: string; teams: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [conditions, setConditions] = useState<FilterCondition[]>([{ ...emptyCondition }]);
  const [actionType, setActionType] = useState<"createTicket" | "skip" | "spam">("createTicket");
  const [teamId, setTeamId] = useState("");
  const [priority, setPriority] = useState("");
  const [tags, setTags] = useState("");
  const [sla, setSla] = useState("");
  const [state, setState] = useState<FormState>(null);
  const [pending, start] = useTransition();

  const update = (i: number, patch: Partial<FilterCondition>) =>
    setConditions((cs) => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  const submit = () =>
    start(async () => {
      const action =
        actionType === "createTicket"
          ? {
              type: "createTicket" as const,
              teamId: teamId || null,
              priority: (priority || null) as "LOW" | "NORMAL" | "HIGH" | "URGENT" | null,
              tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
              slaMinutes: sla ? Number(sla) : null,
            }
          : { type: actionType };
      const res = await createFilter({ mailboxId, name, conditions, action });
      setState(res);
      if (res?.ok) {
        setName("");
        setConditions([{ ...emptyCondition }]);
        setTags("");
        setSla("");
        setOpen(false);
      }
    });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 self-start rounded-[10px] border border-dashed border-[#9CA3AF] px-3.5 text-[13px] font-bold text-[#374151]"
      >
        + Pridať filter
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-[#F9FAFB] p-4">
      <label className="label max-w-md">
        Názov filtra
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Napr. Reklamácie" />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 flex items-center gap-2 text-sm font-extrabold">
          <span className="pill bg-[#FEF3C7] text-[#92400E]">AK</span> všetky podmienky platia
        </legend>
        {conditions.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <label>
              <span className="sr-only">Pole</span>
              <select className="input w-auto" value={c.field} onChange={(e) => update(i, { field: e.target.value as FilterCondition["field"] })}>
                {conditionFields.map((f) => (
                  <option key={f} value={f}>
                    {fieldLabels[f]}
                  </option>
                ))}
              </select>
            </label>
            {c.field === "header" && (
              <label>
                <span className="sr-only">Názov hlavičky</span>
                <input
                  className="input w-44"
                  placeholder="List-Unsubscribe"
                  value={c.header ?? ""}
                  onChange={(e) => update(i, { header: e.target.value })}
                />
              </label>
            )}
            <label>
              <span className="sr-only">Operátor</span>
              <select className="input w-auto" value={c.op} onChange={(e) => update(i, { op: e.target.value as FilterCondition["op"] })}>
                {conditionOps.map((o) => (
                  <option key={o} value={o}>
                    {opLabels[o]}
                  </option>
                ))}
              </select>
            </label>
            {c.op !== "exists" && (
              <label className="min-w-40 flex-1">
                <span className="sr-only">Hodnota</span>
                <input
                  className="input"
                  placeholder="hodnota (viac možností oddeľte čiarkou)"
                  value={c.value}
                  onChange={(e) => update(i, { value: e.target.value })}
                />
              </label>
            )}
            {conditions.length > 1 && (
              <button
                type="button"
                aria-label="Odstrániť podmienku"
                onClick={() => setConditions((cs) => cs.filter((_, k) => k !== i))}
                className="h-11 w-11 rounded-lg text-muted hover:bg-white"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setConditions((cs) => [...cs, { ...emptyCondition }])}
          className="self-start text-[13px] font-bold text-accent underline"
        >
          + Pridať podmienku
        </button>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 flex items-center gap-2 text-sm font-extrabold">
          <span className="pill bg-[#DCFCE7] text-[#166534]">POTOM</span>
        </legend>
        <label>
          <span className="sr-only">Akcia</span>
          <select className="input w-auto" value={actionType} onChange={(e) => setActionType(e.target.value as typeof actionType)}>
            <option value="createTicket">Vytvoriť tiket</option>
            <option value="skip">Nevytvárať tiket (archivovať)</option>
            <option value="spam">Presunúť do spamu</option>
          </select>
        </label>
        {actionType === "createTicket" && (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            <label className="label">
              Tím
              <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">Predvolený tím schránky</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Priorita
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="">Normálna</option>
                <option value="LOW">Nízka</option>
                <option value="HIGH">Vysoká</option>
                <option value="URGENT">Urgentná</option>
              </select>
            </label>
            <label className="label">
              Štítky (čiarkou)
              <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
            </label>
            <label className="label">
              SLA prvej odpovede (min)
              <input className="input" type="number" min={1} value={sla} onChange={(e) => setSla(e.target.value)} />
            </label>
          </div>
        )}
      </fieldset>

      {state && !state.ok && (
        <p role="alert" className="text-sm font-semibold text-[#B91C1C]">
          {state.message}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={pending} className="btn-dark">
          {pending ? "Ukladám…" : "Uložiť filter"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Zrušiť
        </button>
      </div>
    </div>
  );
}
