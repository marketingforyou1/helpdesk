import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestEmail } from "@/lib/mail/ingest";
import { parseRawEmail } from "@/lib/mail/parse";
import { ACK_TEXT, sendTicketReply } from "@/lib/mail/send";

/**
 * Inbound endpoint for forwarded mail. Point your mail provider's inbound webhook
 * (raw MIME in the body) at /api/inbound/<inboundToken of the mailbox>.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const mailbox = await prisma.mailbox.findUnique({ where: { inboundToken: token }, select: { id: true, sendAck: true } });
  if (!mailbox) return NextResponse.json({ error: "not found" }, { status: 404 });

  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length === 0 || raw.length > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "invalid size" }, { status: 400 });
  }
  const parsed = await parseRawEmail(raw);
  const result = await ingestEmail(prisma, mailbox.id, parsed);
  if (result.kind === "created" && mailbox.sendAck) {
    await sendTicketReply(prisma, { ticketId: result.ticketId, authorId: null, text: ACK_TEXT(result.ticketNumber), isAck: true });
  }
  await prisma.mailbox.update({ where: { id: mailbox.id }, data: { lastSyncAt: new Date(), lastError: null } });
  return NextResponse.json(result);
}
