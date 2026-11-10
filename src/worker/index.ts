/**
 * Background worker: periodically pulls mail from all IMAP mailboxes.
 * Run alongside the web app: `npm run worker`.
 */
import { PrismaClient } from "@prisma/client";
import { syncImapMailbox } from "../lib/mail/imap";

const db = new PrismaClient();
const INTERVAL_MS = Number(process.env.MAIL_POLL_SECONDS ?? 60) * 1000;

async function tick() {
  const boxes = await db.mailbox.findMany({ where: { type: "IMAP" }, select: { id: true, address: true } });
  for (const b of boxes) {
    const { processed } = await syncImapMailbox(db, b.id);
    if (processed) console.log(`[mail] ${b.address}: spracovaných ${processed} správ`);
  }
}

async function main() {
  console.log(`[mail] worker beží, interval ${INTERVAL_MS / 1000} s`);
  for (;;) {
    await tick().catch((e) => console.error("[mail] chyba:", e));
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

void main();
