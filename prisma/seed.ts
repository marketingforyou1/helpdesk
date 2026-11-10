/**
 * Demo data: workspace, admin, teams, a forwarding mailbox with filters, and sample tickets.
 * Run: npm run db:seed   (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD override the login)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ingestEmail } from "../src/lib/mail/ingest";

const db = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@ozvena.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ozvena123";
  if (await db.user.findUnique({ where: { email } })) {
    console.log("Seed už existuje, preskakujem.");
    return;
  }

  const ws = await db.workspace.create({ data: { name: "[VÁŠ OBCHOD]" } });
  const [prva, rekl, fakt] = await Promise.all(
    ["Prvá línia", "Reklamácie", "Fakturácia"].map((name) => db.team.create({ data: { workspaceId: ws.id, name } })),
  );
  const admin = await db.user.create({
    data: {
      workspaceId: ws.id,
      email,
      name: "Admin",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(password, 12),
      teams: { connect: [{ id: prva!.id }] },
    },
  });

  const mb = await db.mailbox.create({
    data: {
      workspaceId: ws.id,
      address: "podpora@vasobchod.sk",
      displayName: "Zákaznícka podpora",
      type: "FORWARD",
      defaultTeamId: prva!.id,
      sendAck: false,
      filters: {
        create: [
          {
            position: 1,
            name: "Newslettery a automatické správy",
            conditions: [{ field: "header", header: "List-Unsubscribe", op: "exists", value: "" }],
            action: { type: "skip" },
          },
          { position: 2, name: "Spam", conditions: [{ field: "spamScore", op: "gt", value: "5" }], action: { type: "spam" } },
          {
            position: 3,
            name: "Reklamácie",
            conditions: [{ field: "subjectOrBody", op: "contains", value: "reklamácia, pokazené, pokazený" }],
            action: { type: "createTicket", teamId: rekl!.id, priority: "HIGH", tags: ["Reklamácia"], slaMinutes: 240 },
          },
          {
            position: 4,
            name: "VIP zákazníci",
            conditions: [{ field: "customerTag", op: "contains", value: "VIP" }],
            action: { type: "createTicket", priority: "HIGH", tags: ["VIP"], slaMinutes: 15 },
          },
          {
            position: 5,
            name: "Faktúry",
            conditions: [{ field: "subjectOrBody", op: "contains", value: "faktúra, dobropis" }],
            action: { type: "createTicket", teamId: fakt!.id, tags: ["Fakturácia"], slaMinutes: 480 },
          },
        ],
      },
    },
  });

  await db.customer.create({
    data: { workspaceId: ws.id, name: "Jana Kováčová", email: "jana.kovacova@example.sk", tags: ["VIP"] },
  });

  const samples = [
    { from: "jana.kovacova@example.sk", name: "Jana Kováčová", subject: "Neprišiel mi zľavový kód", text: "Dobrý deň, prihlásila som sa na newsletter, ale zľavový kód na 10 % mi stále neprišiel." },
    { from: "fakturacia@horvath-sro.example", name: "Martin Horváth", subject: "Faktúra 2026-1043 – nesprávna adresa", text: "Dobrý deň,\nna faktúre je uvedená stará adresa sídla. Prosím o opravnú faktúru.\n\nĎakujem, M. Horváth" },
    { from: "peter.varga@example.sk", name: "Peter Varga", subject: "Pokazený zips na bunde", text: "Zips sa pokazil po týždni. Objednávka #57902." },
    { from: "lucia.b@example.sk", name: "Lucia Bieliková", subject: "Kedy doručíte objednávku?", text: "Objednávala som v piatok a stále nič." },
  ];
  for (const s of samples) {
    await ingestEmail(db, mb.id, {
      fromEmail: s.from,
      fromName: s.name,
      to: [mb.address],
      subject: s.subject,
      text: s.text,
      headers: {},
      attachments: [],
      references: [],
      date: new Date(),
      messageId: `<seed-${Math.random().toString(36).slice(2)}@example.sk>`,
    });
  }
  console.log(`Hotovo. Prihlásenie: ${admin.email} / ${password}`);
}

main().finally(() => db.$disconnect());
