import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { initials } from "@/lib/ui";
import { logout } from "../login/actions";
import { NavLink } from "./nav-link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-4 bg-ink px-5 py-3 text-white">
        <Link href="/tickets" className="flex items-center gap-2.5 text-lg font-extrabold">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
            <rect width="28" height="28" rx="8" fill="#0E7C66" />
            <path d="M8 14a6 6 0 0 1 12 0M11 14a3 3 0 0 1 6 0" stroke="#FFF" strokeWidth="2" fill="none" strokeLinecap="round" />
            <circle cx="14" cy="18" r="1.6" fill="#FFF" />
          </svg>
          Ozvena
        </Link>
        <nav aria-label="Hlavná navigácia" className="flex flex-wrap gap-1">
          <NavLink href="/tickets">Tikety</NavLink>
          {user.role === "ADMIN" && <NavLink href="/settings/mailboxes">Nastavenia</NavLink>}
        </nav>
        <div className="flex flex-1 items-center justify-end gap-3">
          <span className="hidden text-sm text-[#D1D5DB] sm:inline">{user.workspace.name}</span>
          <span
            title={user.name}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FDE68A] text-sm font-extrabold text-[#78350F]"
          >
            {initials(user.name)}
          </span>
          <form action={logout}>
            <button className="h-10 rounded-lg border border-white/20 px-3 text-[13px] font-semibold hover:bg-white/10">
              Odhlásiť
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
