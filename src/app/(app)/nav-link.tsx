"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const active = usePathname().startsWith(href.split("/").slice(0, 2).join("/"));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg px-3.5 py-2.5 text-sm font-semibold ${active ? "bg-white/12 text-white" : "text-[#D1D5DB] hover:text-white"}`}
    >
      {children}
    </Link>
  );
}
