import type { Channel, Priority, TicketStatus } from "@prisma/client";

export const statusLabel: Record<TicketStatus, string> = {
  NEW: "Nové",
  OPEN: "Otvorené",
  WAITING: "Čaká na zákazníka",
  RESOLVED: "Vyriešené",
};

export const statusClass: Record<TicketStatus, string> = {
  NEW: "text-[#92400E] bg-[#FEF3C7]",
  OPEN: "text-[#1E3A8A] bg-[#DBEAFE]",
  WAITING: "text-[#374151] bg-[#F3F4F6]",
  RESOLVED: "text-[#166534] bg-[#DCFCE7]",
};

export const channelLabel: Record<Channel, string> = {
  EMAIL: "E-mail",
  CHAT: "Chat",
  PHONE: "Telefón",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
};

export const channelClass: Record<Channel, string> = {
  EMAIL: "text-[#1D4ED8] bg-[#E8EEFD]",
  CHAT: "text-[#0E7C66] bg-[#E6F4F0]",
  PHONE: "text-[#6D28D9] bg-[#F1EAFE]",
  FACEBOOK: "text-[#1E40AF] bg-[#E5EAF8]",
  WHATSAPP: "text-[#15803D] bg-[#E7F6EC]",
  INSTAGRAM: "text-[#BE185D] bg-[#FCE7F1]",
};

export const priorityLabel: Record<Priority, string> = {
  LOW: "Nízka",
  NORMAL: "Normálna",
  HIGH: "Vysoká",
  URGENT: "Urgentná",
};

const rtf = new Intl.RelativeTimeFormat("sk", { numeric: "auto" });

export function relativeTime(d: Date, now = new Date()): string {
  const min = Math.round((d.getTime() - now.getTime()) / 60000);
  if (Math.abs(min) < 60) return rtf.format(min, "minute");
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return rtf.format(h, "hour");
  return rtf.format(Math.round(h / 24), "day");
}

export function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("sk", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

/** Remaining first-response time, e.g. "12 min", "1 h 40 min", or "prekročené". */
export function slaRemaining(due: Date | null, respondedAt: Date | null, now = new Date()): string | null {
  if (!due || respondedAt) return null;
  const min = Math.round((due.getTime() - now.getTime()) / 60000);
  if (min < 0) return "prekročené";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export const mailboxTypeLabel = { IMAP: "IMAP / SMTP", FORWARD: "Presmerovanie", GMAIL: "Gmail", M365: "Microsoft 365" } as const;
