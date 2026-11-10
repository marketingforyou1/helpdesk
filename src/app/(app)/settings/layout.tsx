import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="flex flex-1 flex-wrap items-stretch">
      <aside aria-label="Nastavenia" className="flex max-w-full flex-[1_1_220px] flex-col gap-0.5 border-r border-line bg-white px-3 py-5">
        <div className="eyebrow px-2.5 pb-2">Kanály</div>
        <Link href="/settings/mailboxes" className="flex min-h-10 items-center rounded-lg bg-[#F3F4F6] px-2.5 text-sm font-bold">
          E-mailové schránky
        </Link>
        <span className="flex min-h-10 items-center px-2.5 text-sm text-muted">Chat widgety (Fáza 2)</span>
        <div className="eyebrow px-2.5 pb-2 pt-4">Pracovný postup</div>
        <span className="flex min-h-10 items-center px-2.5 text-sm text-muted">Automatizácia (Fáza 3)</span>
      </aside>
      <main className="flex min-w-0 max-w-full flex-[999_1_640px] flex-col gap-6 px-4 pb-12 pt-7 sm:px-6">{children}</main>
    </div>
  );
}
