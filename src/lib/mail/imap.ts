import { ImapFlow } from "imapflow";
import type { PrismaClient } from "@prisma/client";
import { openCreds, type ServerCreds } from "./credentials";
import { ingestEmail } from "./ingest";
import { parseRawEmail } from "./parse";
import { ACK_TEXT, sendTicketReply, smtpTransport } from "./send";

function client(c: ServerCreds) {
  return new ImapFlow({ host: c.host, port: c.port, secure: c.secure, auth: { user: c.user, pass: c.pass }, logger: false });
}

export async function testImap(c: ServerCreds): Promise<string | null> {
  const imap = client(c);
  try {
    await imap.connect();
    await imap.mailboxOpen("INBOX", { readOnly: true });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  } finally {
    await imap.logout().catch(() => {});
  }
}

export async function testSmtp(c: ServerCreds): Promise<string | null> {
  try {
    await smtpTransport(c).verify();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Pulls new messages (UID > lastUid) from INBOX and runs them through the ingest pipeline. */
export async function syncImapMailbox(db: PrismaClient, mailboxId: string) {
  const mb = await db.mailbox.findUniqueOrThrow({ where: { id: mailboxId } });
  const creds = openCreds(mb.credentials).imap;
  if (!creds) return { processed: 0 };
  const imap = client(creds);
  let processed = 0;
  let lastUid = mb.lastUid;
  try {
    await imap.connect();
    const lock = await imap.getMailboxLock("INBOX");
    try {
      // On first sync only take the newest message window, not the whole history.
      const status = await imap.status("INBOX", { uidNext: true });
      const from = lastUid > 0 ? lastUid + 1 : Math.max(1, (status.uidNext ?? 1) - 50);
      for await (const msg of imap.fetch(`${from}:*`, { uid: true, source: true }, { uid: true })) {
        if (msg.uid <= lastUid || !msg.source) continue;
        const parsed = await parseRawEmail(msg.source);
        const res = await ingestEmail(db, mb.id, parsed);
        if (res.kind === "created" && mb.sendAck) {
          await sendTicketReply(db, { ticketId: res.ticketId, authorId: null, text: ACK_TEXT(res.ticketNumber), isAck: true });
        }
        lastUid = Math.max(lastUid, msg.uid);
        processed++;
      }
    } finally {
      lock.release();
    }
    await db.mailbox.update({ where: { id: mb.id }, data: { lastUid, lastSyncAt: new Date(), lastError: null } });
  } catch (e) {
    await db.mailbox.update({
      where: { id: mb.id },
      data: { lastUid, lastError: e instanceof Error ? e.message : String(e) },
    });
  } finally {
    await imap.logout().catch(() => {});
  }
  return { processed };
}
