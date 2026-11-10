import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { mailboxTypeLabel as typeLabel, relativeTime } from "@/lib/ui";
import { ConnectForm } from "./connect-form";


export default async function MailboxesPage() {
  const user = await requireAdmin();
  const [boxes, teams] = await Promise.all([
    prisma.mailbox.findMany({
      where: { workspaceId: user.workspaceId },
      include: { defaultTeam: true, _count: { select: { filters: true, tickets: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.team.findMany({ where: { workspaceId: user.workspaceId }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-extrabold tracking-tight">E-mailové schránky</h1>
        <p className="text-sm text-muted">Prichádzajúce e-maily prejdú filtrami a podľa pravidiel z nich vzniknú tikety.</p>
      </div>
      {boxes.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
          {boxes.map((b) => {
            const ok = !b.lastError && (b.type !== "FORWARD" || b.lastSyncAt);
            return (
              <Link key={b.id} href={`/settings/mailboxes/${b.id}`} className="card flex flex-col gap-1.5 p-4 hover:border-accent">
                <div className="flex items-center justify-between gap-2">
                  <span className="break-all text-[15px] font-extrabold">{b.address}</span>
                  <span className={`pill whitespace-nowrap ${ok ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#FEF3C7] text-[#92400E]"}`}>
                    {b.lastError ? "Chyba" : ok ? "Pripojené" : "Čaká na prvý e-mail"}
                  </span>
                </div>
                <span className="text-[13px] text-muted">
                  {typeLabel[b.type]} · {b.defaultTeam ? `tím ${b.defaultTeam.name}` : "bez tímu"}
                </span>
                <span className="text-xs text-muted">
                  {b._count.filters} filtrov · {b._count.tickets} tiketov
                  {b.lastSyncAt ? ` · synchronizované ${relativeTime(b.lastSyncAt)}` : ""}
                </span>
              </Link>
            );
          })}
        </div>
      )}
      <ConnectForm teams={teams.map((t) => ({ id: t.id, name: t.name }))} />
    </>
  );
}
