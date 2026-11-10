import type { Prisma, PrismaClient } from "@prisma/client";
import { evaluateFilters, FilterActionSchema, FilterConditionSchema, type FilterRule } from "./filters";
import type { ParsedEmail } from "./parse";
import { cleanSubject, extractTicketNumber, referencedIds } from "./threading";

export type IngestResult =
  | { kind: "duplicate" }
  | { kind: "appended"; ticketId: string; ticketNumber: number }
  | { kind: "created"; ticketId: string; ticketNumber: number; filterId: string | null }
  | { kind: "skipped"; reason: "skip" | "spam"; filterId: string };

type Db = PrismaClient | Prisma.TransactionClient;

export function toFilterRules(
  rows: { id: string; name: string; enabled: boolean; position: number; conditions: unknown; action: unknown }[],
): FilterRule[] {
  return rows.flatMap((r) => {
    const conditions = FilterConditionSchema.array().safeParse(r.conditions);
    const action = FilterActionSchema.safeParse(r.action);
    if (!conditions.success || !action.success) return [];
    return [{ id: r.id, name: r.name, enabled: r.enabled, position: r.position, conditions: conditions.data, action: action.data }];
  });
}

async function findExistingTicket(db: Db, workspaceId: string, email: ParsedEmail) {
  const ids = referencedIds(email.inReplyTo, email.references);
  if (ids.length) {
    const msg = await db.message.findFirst({
      where: { messageId: { in: ids }, ticket: { workspaceId } },
      select: { ticket: { select: { id: true, number: true } } },
    });
    if (msg) return msg.ticket;
  }
  const num = extractTicketNumber(email.subject);
  if (num !== null) {
    const t = await db.ticket.findUnique({
      where: { workspaceId_number: { workspaceId, number: num } },
      select: { id: true, number: true, customer: { select: { email: true } } },
    });
    // Only thread by number when the sender is the ticket's customer, so a guessed tag can't hijack a ticket.
    if (t && t.customer.email?.toLowerCase() === email.fromEmail.toLowerCase()) return { id: t.id, number: t.number };
  }
  return null;
}

/**
 * Runs one incoming e-mail through the pipeline:
 * duplicate check → reply threading → mailbox filters (first match wins) → default rule.
 */
export async function ingestEmail(db: PrismaClient, mailboxId: string, email: ParsedEmail): Promise<IngestResult> {
  return db.$transaction(async (tx) => {
    if (email.messageId) {
      const dup = await tx.message.findUnique({ where: { messageId: email.messageId }, select: { id: true } });
      if (dup) return { kind: "duplicate" } as const;
    }

    const mailbox = await tx.mailbox.findUniqueOrThrow({
      where: { id: mailboxId },
      include: { filters: true },
    });
    const ws = mailbox.workspaceId;

    const messageData = {
      direction: "IN" as const,
      kind: "PUBLIC" as const,
      fromName: email.fromName ?? null,
      fromEmail: email.fromEmail,
      bodyText: email.text,
      bodyHtml: email.html ?? null,
      messageId: email.messageId ?? null,
      inReplyTo: email.inReplyTo ?? null,
      references: email.references,
      attachments: email.attachments,
      createdAt: email.date,
    };

    const existing = await findExistingTicket(tx, ws, email);
    if (existing) {
      await tx.message.create({ data: { ...messageData, ticketId: existing.id } });
      const t = await tx.ticket.findUniqueOrThrow({ where: { id: existing.id }, select: { status: true } });
      await tx.ticket.update({
        where: { id: existing.id },
        data: { lastActivityAt: new Date(), status: t.status === "NEW" ? "NEW" : "OPEN" },
      });
      return { kind: "appended", ticketId: existing.id, ticketNumber: existing.number } as const;
    }

    const customer = await tx.customer.upsert({
      where: { workspaceId_email: { workspaceId: ws, email: email.fromEmail } },
      create: { workspaceId: ws, email: email.fromEmail, name: email.fromName || email.fromEmail, tags: [] },
      update: {},
    });

    const rule = evaluateFilters({ ...email, customerTags: customer.tags }, toFilterRules(mailbox.filters));
    if (rule && (rule.action.type === "skip" || rule.action.type === "spam")) {
      return { kind: "skipped", reason: rule.action.type, filterId: rule.id } as const;
    }
    const action = rule?.action.type === "createTicket" ? rule.action : null;

    const ws2 = await tx.workspace.update({ where: { id: ws }, data: { counter: { increment: 1 } }, select: { counter: true } });
    const now = new Date();
    const ticket = await tx.ticket.create({
      data: {
        workspaceId: ws,
        number: ws2.counter,
        subject: cleanSubject(email.subject),
        channel: "EMAIL",
        status: "NEW",
        priority: action?.priority ?? "NORMAL",
        tags: action?.tags ?? [],
        customerId: customer.id,
        teamId: action?.teamId ?? mailbox.defaultTeamId,
        mailboxId: mailbox.id,
        firstResponseDue: action?.slaMinutes ? new Date(now.getTime() + action.slaMinutes * 60_000) : null,
        messages: { create: messageData },
      },
    });
    return { kind: "created", ticketId: ticket.id, ticketNumber: ticket.number, filterId: rule?.id ?? null } as const;
  });
}
