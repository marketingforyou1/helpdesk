/** Ticket number tag placed in outgoing subjects, e.g. "Re: Faktúra [#10482]". */
export function ticketTag(number: number): string {
  return `[#${number}]`;
}

export function withTicketTag(subject: string, number: number): string {
  const tag = ticketTag(number);
  const base = subject.replace(/\s*\[#\d+\]\s*/g, " ").trim();
  return `${base} ${tag}`.trim();
}

export function extractTicketNumber(subject: string): number | null {
  const m = subject.match(/\[#(\d{3,})\]/);
  return m ? Number(m[1]) : null;
}

/** Strip Re:/Fwd:/Odp: prefixes and the ticket tag for a clean ticket subject. */
export function cleanSubject(subject: string): string {
  let s = subject.replace(/\[#\d+\]/g, "");
  const prefix = /^\s*(re|fw|fwd|odp|aw|vs|sv)\s*(\[\d+\])?\s*:\s*/i;
  while (prefix.test(s)) s = s.replace(prefix, "");
  return s.replace(/\s+/g, " ").trim() || "(bez predmetu)";
}

/** Message-IDs this e-mail refers to, most recent first. */
export function referencedIds(inReplyTo?: string | null, references?: string[] | string | null): string[] {
  const refs = Array.isArray(references) ? references : references ? references.split(/\s+/) : [];
  const ids = [inReplyTo ?? "", ...[...refs].reverse()].map((s) => s.trim()).filter(Boolean);
  return [...new Set(ids)];
}
