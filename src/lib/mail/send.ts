import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { PrismaClient } from "@prisma/client";
import { openCreds, type ServerCreds } from "./credentials";
import { withTicketTag } from "./threading";

export function smtpTransport(c: ServerCreds) {
  return nodemailer.createTransport({ host: c.host, port: c.port, secure: c.secure, auth: { user: c.user, pass: c.pass } });
}

/** Fallback transport for mailboxes without own SMTP (forwarding): SMTP_URL, e.g. smtps://user:pass@smtp.host:465 */
function fallbackTransport() {
  return process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
}

export interface SendResult {
  messageId: string;
  sent: boolean;
  error?: string;
}

/**
 * Sends a public reply on an e-mail ticket with proper threading headers and stores it as an OUT message.
 * The message is stored even when sending fails, with the error kept in a system note.
 */
export async function sendTicketReply(
  db: PrismaClient,
  opts: { ticketId: string; authorId: string | null; text: string; isAck?: boolean },
): Promise<SendResult> {
  const ticket = await db.ticket.findUniqueOrThrow({
    where: { id: opts.ticketId },
    include: {
      customer: true,
      mailbox: true,
      workspace: { select: { name: true } },
      messages: { where: { messageId: { not: null } }, orderBy: { createdAt: "asc" }, select: { messageId: true } },
    },
  });
  const to = ticket.customer.email;
  const from = ticket.mailbox?.address;
  const domain = (from ?? "ozvena.local").split("@")[1];
  const messageId = `<${randomUUID()}@${domain}>`;
  const refs = ticket.messages.map((m) => m.messageId!).slice(-10);
  const subject = withTicketTag(`Re: ${ticket.subject}`, ticket.number);

  let sent = false;
  let error: string | undefined;
  if (!to || !from) {
    error = "Tiket nemá e-mail zákazníka alebo schránku na odoslanie.";
  } else {
    const creds = openCreds(ticket.mailbox?.credentials);
    const transport = creds.smtp ? smtpTransport(creds.smtp) : fallbackTransport();
    if (!transport) {
      error = "Schránka nemá nastavený SMTP server a SMTP_URL nie je nastavené.";
    } else {
      try {
        await transport.sendMail({
          from: { name: ticket.mailbox?.displayName || ticket.workspace.name, address: from },
          to,
          subject,
          text: opts.text,
          messageId,
          inReplyTo: refs.at(-1),
          references: refs,
        });
        sent = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
  }

  await db.message.create({
    data: {
      ticketId: ticket.id,
      direction: "OUT",
      kind: "PUBLIC",
      authorId: opts.authorId,
      fromEmail: from ?? null,
      bodyText: opts.text,
      messageId,
      inReplyTo: refs.at(-1) ?? null,
      references: refs,
    },
  });
  if (error) {
    await db.message.create({
      data: { ticketId: ticket.id, direction: "OUT", kind: "SYSTEM", bodyText: `E-mail sa nepodarilo odoslať: ${error}` },
    });
  }
  return { messageId, sent, error };
}

export const ACK_TEXT = (number: number) =>
  `Dobrý deň,\n\nďakujeme za vašu správu. Prijali sme ju pod číslom ${number} a odpovieme vám čo najskôr.\nAk nám chcete niečo doplniť, jednoducho odpovedzte na tento e-mail.\n`;
