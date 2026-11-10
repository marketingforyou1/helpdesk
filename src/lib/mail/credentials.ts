import { z } from "zod";
import { decryptJson, encryptJson } from "../crypto";

export const ServerSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().min(1),
  pass: z.string().min(1),
});
export type ServerCreds = z.infer<typeof ServerSchema>;

export const MailboxCredsSchema = z.object({
  imap: ServerSchema.optional(),
  smtp: ServerSchema.optional(),
});
export type MailboxCreds = z.infer<typeof MailboxCredsSchema>;

export function sealCreds(c: MailboxCreds): string {
  return encryptJson(MailboxCredsSchema.parse(c));
}

export function openCreds(sealed: string | null | undefined): MailboxCreds {
  if (!sealed) return {};
  return MailboxCredsSchema.parse(decryptJson(sealed));
}
