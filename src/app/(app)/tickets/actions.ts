"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { TicketStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendTicketReply } from "@/lib/mail/send";

async function ownTicket(ticketId: string) {
  const user = await requireUser();
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, workspaceId: user.workspaceId } });
  if (!ticket) throw new Error("Tiket neexistuje.");
  return { user, ticket };
}

export type ComposerState = { ok: boolean; message: string } | null;

export async function postMessage(_prev: ComposerState, form: FormData): Promise<ComposerState> {
  const parsed = z
    .object({ ticketId: z.string(), mode: z.enum(["reply", "note"]), text: z.string().trim().min(1, "Správa je prázdna.") })
    .safeParse({ ticketId: form.get("ticketId"), mode: form.get("mode"), text: form.get("text") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
  const { ticketId, mode, text } = parsed.data;
  const { user, ticket } = await ownTicket(ticketId);

  if (mode === "note") {
    await prisma.message.create({ data: { ticketId, direction: "OUT", kind: "NOTE", authorId: user.id, bodyText: text } });
    await prisma.ticket.update({ where: { id: ticketId }, data: { lastActivityAt: new Date() } });
    revalidatePath("/tickets");
    return { ok: true, message: "Poznámka uložená." };
  }

  let result: { sent: boolean; error?: string } = { sent: true };
  if (ticket.channel === "EMAIL") {
    result = await sendTicketReply(prisma, { ticketId, authorId: user.id, text });
  } else {
    await prisma.message.create({ data: { ticketId, direction: "OUT", kind: "PUBLIC", authorId: user.id, bodyText: text } });
  }
  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      lastActivityAt: new Date(),
      firstRespondedAt: ticket.firstRespondedAt ?? new Date(),
      status: ticket.status === "NEW" || ticket.status === "OPEN" ? "WAITING" : ticket.status,
      assigneeId: ticket.assigneeId ?? user.id,
    },
  });
  revalidatePath("/tickets");
  return result.sent
    ? { ok: true, message: "Odpoveď odoslaná." }
    : { ok: false, message: `Odpoveď je uložená, ale e-mail sa neodoslal: ${result.error}` };
}

export async function setStatus(ticketId: string, status: TicketStatus) {
  await ownTicket(ticketId);
  await prisma.ticket.update({ where: { id: ticketId }, data: { status, lastActivityAt: new Date() } });
  revalidatePath("/tickets");
}

export async function assign(form: FormData) {
  const ticketId = String(form.get("ticketId"));
  const value = String(form.get("assignee") ?? "");
  const { user } = await ownTicket(ticketId);
  if (value.startsWith("team:")) {
    const team = await prisma.team.findFirst({ where: { id: value.slice(5), workspaceId: user.workspaceId } });
    if (team) await prisma.ticket.update({ where: { id: ticketId }, data: { teamId: team.id, assigneeId: null } });
  } else if (value.startsWith("user:")) {
    const agent = await prisma.user.findFirst({ where: { id: value.slice(5), workspaceId: user.workspaceId } });
    if (agent) await prisma.ticket.update({ where: { id: ticketId }, data: { assigneeId: agent.id } });
  } else {
    await prisma.ticket.update({ where: { id: ticketId }, data: { assigneeId: null } });
  }
  revalidatePath("/tickets");
}

export async function addCustomerTag(form: FormData) {
  const user = await requireUser();
  const customerId = String(form.get("customerId"));
  const tag = String(form.get("tag") ?? "").trim();
  if (!tag) return;
  const c = await prisma.customer.findFirst({ where: { id: customerId, workspaceId: user.workspaceId } });
  if (c && !c.tags.includes(tag)) {
    await prisma.customer.update({ where: { id: c.id }, data: { tags: [...c.tags, tag] } });
  }
  revalidatePath("/tickets");
}
