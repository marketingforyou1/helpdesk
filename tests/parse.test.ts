import { describe, expect, it } from "vitest";
import { matchCondition } from "@/lib/mail/filters";
import { parseRawEmail } from "@/lib/mail/parse";

const raw = [
  "From: =?UTF-8?Q?Eva_Nagyov=C3=A1?= <Eva@Example.sk>",
  "To: podpora@vasobchod.sk",
  "Subject: =?UTF-8?Q?Re:_Reklam=C3=A1cia_[#10005]?=",
  "Message-ID: <reply@example.sk>",
  "In-Reply-To: <orig@vasobchod.sk>",
  "References: <first@vasobchod.sk> <orig@vasobchod.sk>",
  "List-Unsubscribe: <mailto:u@shop.example>",
  "X-Spam-Score: 6.5",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Ďakujem.",
  "",
].join("\r\n");

describe("parseRawEmail", () => {
  it("extracts sender, threading headers and raw header values", async () => {
    const e = await parseRawEmail(raw);
    expect(e.fromEmail).toBe("eva@example.sk");
    expect(e.fromName).toBe("Eva Nagyová");
    expect(e.subject).toBe("Re: Reklamácia [#10005]");
    expect(e.inReplyTo).toBe("<orig@vasobchod.sk>");
    expect(e.references).toEqual(["<first@vasobchod.sk>", "<orig@vasobchod.sk>"]);
    expect(e.spamScore).toBe(6.5);
    expect(e.text.trim()).toBe("Ďakujem.");
    expect(matchCondition(e, { field: "header", header: "List-Unsubscribe", op: "exists", value: "" })).toBe(true);
    expect(matchCondition(e, { field: "header", header: "list-unsubscribe", op: "contains", value: "shop.example" })).toBe(true);
  });
});
