import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  channelClass,
  channelLabel,
  formatDateTime,
  initials,
  priorityLabel,
  relativeTime,
  slaRemaining,
  statusClass,
  statusLabel,
} from "@/lib/ui";
import { addCustomerTag, assign, setStatus } from "./actions";
import { Composer } from "./composer";

const views = {
  all: { label: "Všetky otvorené", where: { status: { not: "RESOLVED" } } },
  mine: { label: "Moje", where: { status: { not: "RESOLVED" } } },
  unassigned: { label: "Nepriradené", where: { status: { not: "RESOLVED" }, assigneeId: null } },
  waiting: { label: "Čaká na zákazníka", where: { status: "WAITING" } },
  resolved: { label: "Vyriešené", where: { status: "RESOLVED" } },
} satisfies Record<string, { label: string; where: Prisma.TicketWhereInput }>;
type ViewId = keyof typeof views;

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ view?: string; t?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const viewId: ViewId = sp.view && sp.view in views ? (sp.view as ViewId) : "all";
  const q = sp.q?.trim();

  const whereFor = (id: ViewId): Prisma.TicketWhereInput => ({
    workspaceId: user.workspaceId,
    ...views[id].where,
    ...(id === "mine" ? { assigneeId: user.id } : {}),
  });
  const search: Prisma.TicketWhereInput = q
    ? {
        OR: [
          { subject: { contains: q, mode: "insensitive" } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
          { customer: { email: { contains: q, mode: "insensitive" } } },
          ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : []),
        ],
      }
    : {};

  const [counts, tickets, agents, teams] = await Promise.all([
    Promise.all((Object.keys(views) as ViewId[]).map((id) => prisma.ticket.count({ where: whereFor(id) }))),
    prisma.ticket.findMany({
      where: { AND: [whereFor(viewId), search] },
      orderBy: [{ firstResponseDue: { sort: "asc", nulls: "last" } }, { lastActivityAt: "desc" }],
      take: 100,
      include: {
        customer: { select: { name: true } },
        messages: { where: { kind: { not: "SYSTEM" } }, orderBy: { createdAt: "desc" }, take: 1, select: { bodyText: true } },
      },
    }),
    prisma.user.findMany({ where: { workspaceId: user.workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ where: { workspaceId: user.workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const selectedId = sp.t ?? tickets[0]?.id;
  const sel = selectedId
    ? await prisma.ticket.findFirst({
        where: { id: selectedId, workspaceId: user.workspaceId },
        include: {
          customer: { include: { tickets: { orderBy: { createdAt: "desc" }, take: 6, select: { id: true, subject: true, createdAt: true } } } },
          messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
          team: true,
          assignee: true,
          mailbox: { select: { address: true } },
        },
      })
    : null;

  const href = (p: { view?: string; t?: string }) => {
    const u = new URLSearchParams();
    u.set("view", p.view ?? viewId);
    if (p.t) u.set("t", p.t);
    if (q) u.set("q", q);
    return `/tickets?${u}`;
  };

  return (
    <div className="flex flex-1 flex-wrap items-stretch">
      <aside aria-label="Zobrazenia" className="flex min-w-0 max-w-full flex-[1_1_210px] flex-col gap-5 border-r border-line bg-white px-3 py-4">
        <form action="/tickets" className="flex flex-col gap-2">
          <input type="hidden" name="view" value={viewId} />
          <label>
            <span className="sr-only">Hľadať</span>
            <input name="q" defaultValue={q} type="search" placeholder="Hľadať tiket, zákazníka…" className="input" />
          </label>
        </form>
        <nav className="flex flex-col gap-0.5">
          <div className="eyebrow px-2.5 pb-1.5">Zobrazenia</div>
          {(Object.keys(views) as ViewId[]).map((id, i) => (
            <Link
              key={id}
              href={href({ view: id })}
              aria-current={id === viewId ? "page" : undefined}
              className={`flex min-h-10 items-center justify-between rounded-lg px-2.5 text-sm ${id === viewId ? "bg-[#F3F4F6] font-bold text-ink" : "font-medium text-[#374151]"}`}
            >
              <span>{views[id].label}</span>
              <span className="text-xs font-bold">{counts[i]}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <section aria-label="Zoznam tiketov" className="flex min-w-0 max-w-full flex-[1_1_320px] flex-col border-r border-line bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-line p-4">
          <h1 className="text-lg font-extrabold">{views[viewId].label}</h1>
          {q && (
            <Link href={`/tickets?view=${viewId}`} className="text-[13px] font-semibold text-accent underline">
              Zrušiť hľadanie
            </Link>
          )}
        </div>
        {tickets.length === 0 && <p className="p-4 text-sm text-muted">Žiadne tikety.</p>}
        <ul>
          {tickets.map((t) => {
            const on = t.id === sel?.id;
            const sla = slaRemaining(t.firstResponseDue, t.firstRespondedAt);
            return (
              <li key={t.id}>
                <Link
                  href={href({ t: t.id })}
                  aria-current={on ? "true" : undefined}
                  className={`flex flex-col gap-1.5 border-b border-l-[3px] border-b-line px-4 py-3.5 ${on ? "border-l-accent bg-accent-soft" : "border-l-transparent bg-white hover:bg-[#F9FAFB]"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{t.customer.name}</span>
                    <span className="text-xs text-muted">{relativeTime(t.lastActivityAt)}</span>
                  </div>
                  <div className="truncate text-sm">{t.subject}</div>
                  <div className="truncate text-[13px] text-muted">{t.messages[0]?.bodyText.slice(0, 140)}</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`pill ${channelClass[t.channel]}`}>{channelLabel[t.channel]}</span>
                    <span className={`pill ${statusClass[t.status]}`}>{statusLabel[t.status]}</span>
                    {t.priority === "HIGH" || t.priority === "URGENT" ? (
                      <span className="pill bg-[#FEE2E2] text-[#991B1B]">{priorityLabel[t.priority]}</span>
                    ) : null}
                    {sla && <span className="text-xs font-bold text-[#B45309]">SLA {sla}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {sel ? (
        <>
          <main aria-label="Konverzácia" className="flex min-w-0 max-w-full flex-[999_1_480px] flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-6 py-4">
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="text-xl font-extrabold">{sel.subject}</h2>
                <div className="text-[13px] text-muted">
                  #{sel.number} · {channelLabel[sel.channel]}
                  {sel.mailbox ? ` · ${sel.mailbox.address}` : ""} · vytvorené {formatDateTime(sel.createdAt)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <form action={assign} className="flex items-center gap-2">
                  <input type="hidden" name="ticketId" value={sel.id} />
                  <label className="flex items-center gap-1.5 text-[13px] text-muted">
                    Riešiteľ
                    <select
                      name="assignee"
                      defaultValue={sel.assigneeId ? `user:${sel.assigneeId}` : sel.teamId ? `team:${sel.teamId}` : ""}
                      className="input h-10 w-auto"
                    >
                      <option value="">Nepriradený</option>
                      <optgroup label="Agenti">
                        {agents.map((a) => (
                          <option key={a.id} value={`user:${a.id}`}>
                            {a.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Tímy">
                        {teams.map((t) => (
                          <option key={t.id} value={`team:${t.id}`}>
                            {t.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                  <button className="btn-ghost h-10">Priradiť</button>
                </form>
                {sel.status !== "WAITING" && sel.status !== "RESOLVED" && (
                  <form action={setStatus.bind(null, sel.id, "WAITING")}>
                    <button className="btn-ghost h-10">Čaká na zákazníka</button>
                  </form>
                )}
                {sel.status === "RESOLVED" ? (
                  <form action={setStatus.bind(null, sel.id, "OPEN")}>
                    <button className="btn-ghost h-10">Znovu otvoriť</button>
                  </form>
                ) : (
                  <form action={setStatus.bind(null, sel.id, "RESOLVED")}>
                    <button className="btn-dark h-10">Vyriešiť</button>
                  </form>
                )}
              </div>
            </div>

            <ol className="flex min-h-[360px] flex-1 flex-col gap-4 p-4 sm:p-6">
              {sel.messages.map((m) => {
                const mine = m.direction === "OUT";
                const box =
                  m.kind === "NOTE"
                    ? "bg-[#FEF9C3] border-[#FDE68A]"
                    : m.kind === "SYSTEM"
                      ? "bg-[#F3F4F6] border-line"
                      : mine
                        ? "bg-[#E6F4F0] border-[#C7E6DD]"
                        : "bg-white border-line";
                const who =
                  m.kind === "SYSTEM"
                    ? "Systém"
                    : m.author
                      ? `${m.author.name}${m.kind === "NOTE" ? " (interná poznámka)" : ""}`
                      : mine
                        ? "Automatická odpoveď"
                        : m.fromName || m.fromEmail || sel.customer.name;
                return (
                  <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[640px] rounded-xl border px-3.5 py-3 ${box}`}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="text-[13px] font-bold">{who}</span>
                        <time className="text-xs text-muted" dateTime={m.createdAt.toISOString()}>
                          {formatDateTime(m.createdAt)}
                        </time>
                      </div>
                      <div className="whitespace-pre-line break-words text-sm leading-relaxed">{m.bodyText}</div>
                      {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                        <div className="mt-2 text-xs text-muted">
                          Prílohy: {(m.attachments as { filename: string }[]).map((a) => a.filename).join(", ")}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

            <Composer ticketId={sel.id} customerName={sel.customer.name} channel={channelLabel[sel.channel]} />
          </main>

          <aside aria-label="Detail zákazníka" className="flex min-w-0 max-w-full flex-[1_1_280px] flex-col gap-5 border-l border-line bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E0E7FF] font-extrabold text-[#3730A3]">
                {initials(sel.customer.name)}
              </div>
              <div>
                <div className="text-base font-extrabold">{sel.customer.name}</div>
                <div className="text-[13px] text-muted">{sel.customer.company ?? "Zákazník"}</div>
              </div>
            </div>
            <dl className="grid gap-3 text-[13px]">
              <div>
                <dt className="text-muted">E-mail</dt>
                <dd className="break-all font-semibold">{sel.customer.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Telefón</dt>
                <dd className="font-semibold">{sel.customer.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Zákazníkom od</dt>
                <dd className="font-semibold">{formatDateTime(sel.customer.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted">Tím</dt>
                <dd className="font-semibold">{sel.team?.name ?? "—"}</dd>
              </div>
            </dl>
            <div className="flex flex-col gap-2">
              <div className="eyebrow">Štítky zákazníka</div>
              <div className="flex flex-wrap gap-1.5">
                {sel.customer.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-[#F3F4F6] px-2.5 py-1 text-xs font-semibold text-[#374151]">
                    {tag}
                  </span>
                ))}
              </div>
              <form action={addCustomerTag} className="flex gap-1.5">
                <input type="hidden" name="customerId" value={sel.customer.id} />
                <label className="flex-1">
                  <span className="sr-only">Nový štítok</span>
                  <input name="tag" placeholder="Pridať štítok" className="input h-9" />
                </label>
                <button className="btn-ghost h-9 px-3">Pridať</button>
              </form>
            </div>
            {sel.tags.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="eyebrow">Štítky tiketu</div>
                <div className="flex flex-wrap gap-1.5">
                  {sel.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-[#F3F4F6] px-2.5 py-1 text-xs font-semibold text-[#374151]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <div className="eyebrow">Konverzácie zákazníka</div>
              {sel.customer.tickets.map((h) => (
                <Link
                  key={h.id}
                  href={href({ t: h.id })}
                  className={`flex justify-between gap-2 rounded-lg border px-3 py-2.5 text-[13px] ${h.id === sel.id ? "border-accent" : "border-line"}`}
                >
                  <span className="truncate">{h.subject}</span>
                  <span className="whitespace-nowrap text-muted">{relativeTime(h.createdAt)}</span>
                </Link>
              ))}
            </div>
          </aside>
        </>
      ) : (
        <main className="flex flex-[999_1_480px] items-center justify-center p-8 text-muted">Vyberte tiket zo zoznamu.</main>
      )}
    </div>
  );
}
