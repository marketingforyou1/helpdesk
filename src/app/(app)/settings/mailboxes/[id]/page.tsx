import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { describeCondition } from "@/lib/mail/filters";
import { toFilterRules } from "@/lib/mail/ingest";
import { mailboxTypeLabel, priorityLabel, relativeTime } from "@/lib/ui";
import { deleteFilter, deleteMailbox, moveFilter, syncNow, toggleFilter, updateMailbox } from "../actions";
import { FilterForm } from "./filter-form";
import { FilterTester } from "./filter-tester";

export default async function MailboxDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAdmin();
  const mb = await prisma.mailbox.findFirst({
    where: { id, workspaceId: user.workspaceId },
    include: { filters: { orderBy: { position: "asc" } }, defaultTeam: true },
  });
  if (!mb) notFound();
  const teams = await prisma.team.findMany({ where: { workspaceId: user.workspaceId }, orderBy: { name: "asc" } });
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const rules = toFilterRules(mb.filters);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  const describeAction = (a: (typeof rules)[number]["action"]) => {
    if (a.type === "skip") return "Nevytvárať tiket · archivovať";
    if (a.type === "spam") return "Presunúť do spamu";
    const parts = [`Tiket → ${a.teamId ? `tím ${teamName.get(a.teamId) ?? "?"}` : "predvolený tím"}`];
    if (a.priority) parts.push(`priorita ${priorityLabel[a.priority]}`);
    if (a.tags.length) parts.push(`štítky ${a.tags.join(", ")}`);
    if (a.slaMinutes) parts.push(`SLA ${a.slaMinutes} min`);
    return parts.join(" · ");
  };
  const actionClass = { createTicket: "bg-[#E6F4F0] text-[#0B5F4F]", skip: "bg-[#F3F4F6] text-[#374151]", spam: "bg-[#FEE2E2] text-[#991B1B]" };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/settings/mailboxes" className="text-[13px] font-semibold text-accent underline">
            ← Všetky schránky
          </Link>
          <h1 className="break-all text-[26px] font-extrabold tracking-tight">{mb.address}</h1>
          <p className="text-sm text-muted">
            {mailboxTypeLabel[mb.type]}
            {mb.lastSyncAt ? ` · posledný e-mail ${relativeTime(mb.lastSyncAt)}` : " · zatiaľ žiadny e-mail"}
          </p>
        </div>
        {mb.type === "IMAP" && (
          <form action={syncNow.bind(null, mb.id)}>
            <button className="btn-ghost">Stiahnuť poštu teraz</button>
          </form>
        )}
      </div>

      {mb.lastError && (
        <p role="alert" className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#991B1B]">
          Posledná chyba: {mb.lastError}
        </p>
      )}

      {mb.type === "FORWARD" && (
        <section className="card flex flex-col gap-2 p-5">
          <h2 className="text-[17px] font-extrabold">Prijímanie presmerovaných e-mailov</h2>
          <p className="text-sm leading-relaxed text-[#374151]">
            Nastavte u poskytovateľa pošty (napr. Mailgun, Postmark, SendGrid Inbound Parse alebo vlastný server) odosielanie surových
            e-mailov (MIME) metódou POST na túto adresu:
          </p>
          <code className="break-all rounded-lg border border-line bg-[#F3F4F6] px-3.5 py-3 font-mono text-sm">
            {appUrl}/api/inbound/{mb.inboundToken}
          </code>
          <p className="text-[13px] text-muted">Adresa obsahuje tajný kľúč, nezdieľajte ju.</p>
        </section>
      )}

      <section aria-labelledby="filters-h" className="card flex flex-col gap-3.5 p-5">
        <div className="flex flex-col gap-1">
          <h2 id="filters-h" className="text-[17px] font-extrabold">
            Filtre
          </h2>
          <span className="text-[13px] text-muted">
            Odpovede na existujúce tikety sa pridajú do tiketu automaticky. Ostatné e-maily prechádzajú filtrami zhora nadol, použije sa prvý
            zhodný.
          </span>
        </div>
        <ol className="flex flex-col gap-2">
          {rules.map((f, i) => (
            <li
              key={f.id}
              className={`flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 ${f.enabled ? "" : "opacity-60"}`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F3F4F6] text-[13px] font-extrabold">{i + 1}</span>
              <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
                <span className="text-sm font-bold">{f.name}</span>
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="pill bg-[#FEF3C7] text-[#92400E]">AK</span>
                  <span>{f.conditions.map(describeCondition).join(" a ")}</span>
                  <span className="pill bg-[#DCFCE7] text-[#166534]">POTOM</span>
                  <span className={`rounded-lg px-2.5 py-1 text-[13px] font-bold ${actionClass[f.action.type]}`}>{describeAction(f.action)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <form action={moveFilter.bind(null, f.id, -1)}>
                  <button aria-label="Posunúť vyššie" disabled={i === 0} className="h-11 w-11 rounded-lg hover:bg-[#F3F4F6] disabled:opacity-30">
                    ↑
                  </button>
                </form>
                <form action={moveFilter.bind(null, f.id, 1)}>
                  <button
                    aria-label="Posunúť nižšie"
                    disabled={i === rules.length - 1}
                    className="h-11 w-11 rounded-lg hover:bg-[#F3F4F6] disabled:opacity-30"
                  >
                    ↓
                  </button>
                </form>
                <form action={toggleFilter.bind(null, f.id)}>
                  <button
                    role="switch"
                    aria-checked={f.enabled}
                    aria-label={`Zapnúť filter ${f.name}`}
                    className={`flex h-7 w-12 rounded-full p-[3px] ${f.enabled ? "justify-end bg-accent" : "justify-start bg-[#9CA3AF]"}`}
                  >
                    <span className="block h-[22px] w-[22px] rounded-full bg-white" />
                  </button>
                </form>
                <form action={deleteFilter.bind(null, f.id)}>
                  <button className="h-11 rounded-lg px-3 text-[13px] font-semibold text-[#B91C1C] hover:bg-[#FEF2F2]">Zmazať</button>
                </form>
              </div>
            </li>
          ))}
          <li className="flex items-center gap-3 rounded-xl border border-dashed border-[#D1D5DB] p-3 text-sm text-[#374151]">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F3F4F6] text-[13px] font-extrabold">—</span>
            Všetko ostatné → <strong className="text-ink">tiket pre {mb.defaultTeam ? `tím ${mb.defaultTeam.name}` : "nepriradených"}</strong>
          </li>
        </ol>
        <FilterForm mailboxId={mb.id} teams={teams.map((t) => ({ id: t.id, name: t.name }))} />
      </section>

      <FilterTester mailboxId={mb.id} />

      <section aria-labelledby="settings-h" className="card p-5">
        <h2 id="settings-h" className="mb-4 text-[17px] font-extrabold">
          Nastavenia schránky
        </h2>
        <form action={updateMailbox} className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] items-end gap-4">
          <input type="hidden" name="id" value={mb.id} />
          <label className="label">
            Meno odosielateľa v odpovediach
            <input className="input" name="displayName" defaultValue={mb.displayName ?? ""} />
          </label>
          <label className="label">
            Predvolený tím
            <select className="input" name="defaultTeamId" defaultValue={mb.defaultTeamId ?? ""}>
              <option value="">Bez tímu</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="sendAck" defaultChecked={mb.sendAck} className="h-5 w-5 accent-accent" />
            Posielať potvrdenie prijatia
          </label>
          <div>
            <button className="btn-dark">Uložiť</button>
          </div>
        </form>
        <form action={deleteMailbox.bind(null, mb.id)} className="mt-6 border-t border-line pt-4">
          <button className="text-sm font-semibold text-[#B91C1C] underline">Odpojiť schránku</button>
          <span className="ml-2 text-[13px] text-muted">Tikety zostanú zachované.</span>
        </form>
      </section>
    </>
  );
}
