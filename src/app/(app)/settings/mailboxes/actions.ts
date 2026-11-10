"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MailboxCredsSchema, sealCreds, type ServerCreds } from "@/lib/mail/credentials";
import { evaluateFilters, FilterActionSchema, FilterConditionSchema, type IncomingEmail } from "@/lib/mail/filters";
import { syncImapMailbox, testImap, testSmtp } from "@/lib/mail/imap";
import { toFilterRules } from "@/lib/mail/ingest";

export type FormState = { ok: boolean; message: string } | null;

async function ownMailbox(id: string) {
  const user = await requireAdmin();
  const mb = await prisma.mailbox.findFirst({ where: { id, workspaceId: user.workspaceId } });
  if (!mb) throw new Error("Schránka neexistuje.");
  return { user, mb };
}

function server(form: FormData, prefix: "imap" | "smtp"): ServerCreds {
  const port = Number(form.get(`${prefix}Port`));
  return {
    host: String(form.get(`${prefix}Host`) ?? "").trim(),
    port,
    secure: port === 993 || port === 465,
    user: String(form.get(`${prefix}User`) || form.get("address") || "").trim(),
    pass: String(form.get(`${prefix}Pass`) || form.get("password") || ""),
  };
}

export async function createMailbox(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const type = form.get("type") === "FORWARD" ? "FORWARD" : "IMAP";
  const address = z.email().safeParse(String(form.get("address") ?? "").trim().toLowerCase());
  if (!address.success) return { ok: false, message: "Zadajte platnú e-mailovú adresu." };
  const exists = await prisma.mailbox.findFirst({ where: { workspaceId: user.workspaceId, address: address.data } });
  if (exists) return { ok: false, message: "Táto schránka už je pripojená." };
  const defaultTeamId = String(form.get("defaultTeamId") || "") || null;

  let credentials: string | null = null;
  if (type === "IMAP") {
    const creds = MailboxCredsSchema.safeParse({ imap: server(form, "imap"), smtp: server(form, "smtp") });
    if (!creds.success) return { ok: false, message: "Vyplňte servery, porty a heslo." };
    const [imapErr, smtpErr] = await Promise.all([testImap(creds.data.imap!), testSmtp(creds.data.smtp!)]);
    if (imapErr) return { ok: false, message: `IMAP sa nepripojil: ${imapErr}` };
    if (smtpErr) return { ok: false, message: `SMTP sa nepripojil: ${smtpErr}` };
    credentials = sealCreds(creds.data);
  } else if (form.get("smtpHost")) {
    // Optional own SMTP for forwarded mailboxes so replies go out from the original address.
    const creds = MailboxCredsSchema.safeParse({ smtp: server(form, "smtp") });
    if (!creds.success) return { ok: false, message: "Skontrolujte údaje SMTP servera." };
    const smtpErr = await testSmtp(creds.data.smtp!);
    if (smtpErr) return { ok: false, message: `SMTP sa nepripojil: ${smtpErr}` };
    credentials = sealCreds(creds.data);
  }

  const mb = await prisma.mailbox.create({
    data: {
      workspaceId: user.workspaceId,
      address: address.data,
      displayName: String(form.get("displayName") || "") || null,
      type,
      defaultTeamId,
      credentials,
    },
  });
  revalidatePath("/settings/mailboxes");
  redirect(`/settings/mailboxes/${mb.id}`);
}

export async function updateMailbox(form: FormData) {
  const { mb } = await ownMailbox(String(form.get("id")));
  await prisma.mailbox.update({
    where: { id: mb.id },
    data: {
      displayName: String(form.get("displayName") || "") || null,
      defaultTeamId: String(form.get("defaultTeamId") || "") || null,
      sendAck: form.get("sendAck") === "on",
    },
  });
  revalidatePath(`/settings/mailboxes/${mb.id}`);
}

export async function syncNow(id: string) {
  const { mb } = await ownMailbox(id);
  await syncImapMailbox(prisma, mb.id);
  revalidatePath(`/settings/mailboxes/${mb.id}`);
}

export async function deleteMailbox(id: string) {
  const { mb } = await ownMailbox(id);
  await prisma.$transaction([
    prisma.ticket.updateMany({ where: { mailboxId: mb.id }, data: { mailboxId: null } }),
    prisma.mailbox.delete({ where: { id: mb.id } }),
  ]);
  revalidatePath("/settings/mailboxes");
  redirect("/settings/mailboxes");
}

const NewFilterSchema = z.object({
  mailboxId: z.string(),
  name: z.string().trim().min(1, "Zadajte názov filtra."),
  conditions: z.array(FilterConditionSchema).min(1, "Pridajte aspoň jednu podmienku."),
  action: FilterActionSchema,
});

export async function createFilter(input: z.input<typeof NewFilterSchema>): Promise<FormState> {
  const parsed = NewFilterSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
  const { mb, user } = await ownMailbox(parsed.data.mailboxId);
  const action = parsed.data.action;
  if (action.type === "createTicket" && action.teamId) {
    const team = await prisma.team.findFirst({ where: { id: action.teamId, workspaceId: user.workspaceId } });
    if (!team) return { ok: false, message: "Neznámy tím." };
  }
  const last = await prisma.mailFilter.aggregate({ where: { mailboxId: mb.id }, _max: { position: true } });
  await prisma.mailFilter.create({
    data: {
      mailboxId: mb.id,
      name: parsed.data.name,
      position: (last._max.position ?? 0) + 1,
      conditions: parsed.data.conditions,
      action,
    },
  });
  revalidatePath(`/settings/mailboxes/${mb.id}`);
  return { ok: true, message: "Filter pridaný." };
}

async function ownFilter(id: string) {
  const user = await requireAdmin();
  const f = await prisma.mailFilter.findFirst({ where: { id, mailbox: { workspaceId: user.workspaceId } } });
  if (!f) throw new Error("Filter neexistuje.");
  return f;
}

export async function toggleFilter(id: string) {
  const f = await ownFilter(id);
  await prisma.mailFilter.update({ where: { id }, data: { enabled: !f.enabled } });
  revalidatePath(`/settings/mailboxes/${f.mailboxId}`);
}

export async function deleteFilter(id: string) {
  const f = await ownFilter(id);
  await prisma.mailFilter.delete({ where: { id } });
  revalidatePath(`/settings/mailboxes/${f.mailboxId}`);
}

export async function moveFilter(id: string, dir: -1 | 1) {
  const f = await ownFilter(id);
  const list = await prisma.mailFilter.findMany({ where: { mailboxId: f.mailboxId }, orderBy: { position: "asc" } });
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  await prisma.$transaction(list.map((x, k) => prisma.mailFilter.update({ where: { id: x.id }, data: { position: k + 1 } })));
  revalidatePath(`/settings/mailboxes/${f.mailboxId}`);
}

export type TestResult = { matched: { name: string; position: number } | null; outcome: string } | null;

export async function testFilters(_prev: TestResult, form: FormData): Promise<TestResult> {
  const { mb } = await ownMailbox(String(form.get("mailboxId")));
  const filters = await prisma.mailFilter.findMany({ where: { mailboxId: mb.id } });
  const headers: Record<string, string> = {};
  if (form.get("listUnsubscribe") === "on") headers["list-unsubscribe"] = "<mailto:unsubscribe@example.com>";
  const email: IncomingEmail = {
    fromEmail: String(form.get("from") ?? "").trim().toLowerCase(),
    to: [mb.address],
    subject: String(form.get("subject") ?? ""),
    text: String(form.get("body") ?? ""),
    headers,
    attachments: form.get("attachment") === "on" ? [{ filename: "subor.pdf", contentType: "application/pdf" }] : [],
    spamScore: Number(form.get("spamScore") || 0),
    customerTags: String(form.get("customerTags") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
  const team = mb.defaultTeamId ? await prisma.team.findUnique({ where: { id: mb.defaultTeamId } }) : null;
  const hit = evaluateFilters(email, toFilterRules(filters));
  if (!hit) return { matched: null, outcome: `Nový tiket pre ${team ? `tím ${team.name}` : "nepriradených"} (predvolené pravidlo).` };
  const a = hit.action;
  let outcome = a.type === "skip" ? "Tiket sa nevytvorí, správa sa archivuje." : a.type === "spam" ? "Správa pôjde do spamu." : "Vytvorí sa tiket";
  if (a.type === "createTicket") {
    const t = a.teamId ? await prisma.team.findUnique({ where: { id: a.teamId } }) : team;
    outcome += ` pre ${t ? `tím ${t.name}` : "nepriradených"}`;
    if (a.priority) outcome += `, priorita ${a.priority}`;
    if (a.tags.length) outcome += `, štítky ${a.tags.join(", ")}`;
    if (a.slaMinutes) outcome += `, SLA ${a.slaMinutes} min`;
    outcome += ".";
  }
  return { matched: { name: hit.name, position: hit.position }, outcome };
}
