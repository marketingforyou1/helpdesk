import { simpleParser, type AddressObject } from "mailparser";
import type { IncomingEmail } from "./filters";

export interface ParsedEmail extends IncomingEmail {
  messageId?: string;
  inReplyTo?: string;
  references: string[];
  html?: string;
  date: Date;
}

function addresses(a?: AddressObject | AddressObject[]): { address: string; name: string }[] {
  if (!a) return [];
  const list = Array.isArray(a) ? a : [a];
  return list.flatMap((o) => o.value.map((v) => ({ address: (v.address ?? "").toLowerCase(), name: v.name ?? "" })));
}

/** Parses a raw RFC 822 message into the shape the ingest pipeline expects. */
export async function parseRawEmail(raw: Buffer | string): Promise<ParsedEmail> {
  const m = await simpleParser(raw);
  const from = addresses(m.from)[0] ?? { address: "", name: "" };
  const headers: Record<string, string> = {};
  for (const [k, v] of m.headers) {
    headers[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  const spam = m.headers.get("x-spam-score");
  const refs = m.references ? (Array.isArray(m.references) ? m.references : [m.references]) : [];
  return {
    fromEmail: from.address,
    fromName: from.name || undefined,
    to: addresses(m.to).map((x) => x.address),
    subject: m.subject ?? "",
    text: m.text ?? "",
    html: typeof m.html === "string" ? m.html : undefined,
    headers,
    attachments: m.attachments.map((a) => ({ filename: a.filename ?? "príloha", contentType: a.contentType })),
    spamScore: spam !== undefined ? Number(spam) : undefined,
    messageId: m.messageId,
    inReplyTo: m.inReplyTo,
    references: refs,
    date: m.date ?? new Date(),
  };
}
