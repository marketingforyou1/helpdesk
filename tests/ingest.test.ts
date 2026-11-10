import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ingestEmail } from "@/lib/mail/ingest";
import type { ParsedEmail } from "@/lib/mail/parse";
import { decryptJson, encryptJson } from "@/lib/crypto";

const db = new PrismaClient();
let mailboxId = "";
let workspaceId = "";
let reklamacieTeamId = "";

const mail = (over: Partial<ParsedEmail> = {}): ParsedEmail => ({
  fromEmail: "jana@example.sk",
  fromName: "Jana",
  to: ["podpora@vasobchod.sk"],
  subject: "Otázka",
  text: "Dobrý deň",
  headers: {},
  attachments: [],
  references: [],
  date: new Date(),
  messageId: `<${Math.random().toString(36).slice(2)}@example.sk>`,
  ...over,
});

beforeEach(async () => {
  await db.workspace.deleteMany();
  const ws = await db.workspace.create({ data: { name: "Test" } });
  workspaceId = ws.id;
  const prva = await db.team.create({ data: { workspaceId, name: "Prvá línia" } });
  const rekl = await db.team.create({ data: { workspaceId, name: "Reklamácie" } });
  reklamacieTeamId = rekl.id;
  const mb = await db.mailbox.create({
    data: {
      workspaceId,
      address: "podpora@vasobchod.sk",
      type: "FORWARD",
      defaultTeamId: prva.id,
      filters: {
        create: [
          {
            position: 1,
            name: "Newslettery",
            conditions: [{ field: "header", header: "List-Unsubscribe", op: "exists", value: "" }],
            action: { type: "skip" },
          },
          {
            position: 2,
            name: "Reklamácie",
            conditions: [{ field: "subjectOrBody", op: "contains", value: "reklamácia, pokazené" }],
            action: { type: "createTicket", teamId: rekl.id, priority: "HIGH", tags: ["Reklamácia"], slaMinutes: 60 },
          },
        ],
      },
    },
  });
  mailboxId = mb.id;
});

afterAll(() => db.$disconnect());

describe("ingestEmail", () => {
  it("creates a ticket with the default team when no filter matches", async () => {
    const r = await ingestEmail(db, mailboxId, mail({ subject: "Fwd: Otázka k veľkosti" }));
    expect(r.kind).toBe("created");
    const t = await db.ticket.findFirstOrThrow({ include: { team: true, messages: true, customer: true } });
    expect(t.subject).toBe("Otázka k veľkosti");
    expect(t.team?.name).toBe("Prvá línia");
    expect(t.messages).toHaveLength(1);
    expect(t.customer.email).toBe("jana@example.sk");
    expect(t.number).toBe(10001);
  });

  it("applies the first matching filter's action", async () => {
    const r = await ingestEmail(db, mailboxId, mail({ subject: "Reklamácia bundy" }));
    expect(r.kind).toBe("created");
    const t = await db.ticket.findFirstOrThrow();
    expect(t.teamId).toBe(reklamacieTeamId);
    expect(t.priority).toBe("HIGH");
    expect(t.tags).toEqual(["Reklamácia"]);
    expect(t.firstResponseDue).not.toBeNull();
  });

  it("does not create a ticket for skipped mail", async () => {
    const r = await ingestEmail(db, mailboxId, mail({ headers: { "list-unsubscribe": "<mailto:u@x>" } }));
    expect(r).toMatchObject({ kind: "skipped", reason: "skip" });
    expect(await db.ticket.count()).toBe(0);
  });

  it("threads replies by In-Reply-To and by ticket number", async () => {
    const first = mail({ messageId: "<orig@example.sk>" });
    const created = await ingestEmail(db, mailboxId, first);
    if (created.kind !== "created") throw new Error("expected created");

    const byHeader = await ingestEmail(db, mailboxId, mail({ subject: "Re: Otázka", inReplyTo: "<orig@example.sk>" }));
    expect(byHeader).toMatchObject({ kind: "appended", ticketId: created.ticketId });

    const byNumber = await ingestEmail(db, mailboxId, mail({ subject: `Re: Otázka [#${created.ticketNumber}]` }));
    expect(byNumber).toMatchObject({ kind: "appended", ticketId: created.ticketId });

    // A stranger quoting the number gets a new ticket instead of joining someone else's.
    const stranger = await ingestEmail(db, mailboxId, mail({ fromEmail: "iny@example.sk", subject: `[#${created.ticketNumber}]` }));
    expect(stranger.kind).toBe("created");

    expect(await db.message.count({ where: { ticketId: created.ticketId } })).toBe(3);
  });

  it("ignores duplicates by Message-ID", async () => {
    const m = mail({ messageId: "<same@example.sk>" });
    await ingestEmail(db, mailboxId, m);
    expect((await ingestEmail(db, mailboxId, m)).kind).toBe("duplicate");
    expect(await db.ticket.count()).toBe(1);
  });
});

describe("crypto", () => {
  it("round-trips encrypted JSON", () => {
    const enc = encryptJson({ pass: "tajné" });
    expect(enc).not.toContain("tajné");
    expect(decryptJson<{ pass: string }>(enc).pass).toBe("tajné");
  });
});
