import { describe, expect, it } from "vitest";
import { evaluateFilters, matchCondition, type FilterRule, type IncomingEmail } from "@/lib/mail/filters";
import { cleanSubject, extractTicketNumber, referencedIds, withTicketTag } from "@/lib/mail/threading";

const email = (over: Partial<IncomingEmail> = {}): IncomingEmail => ({
  fromEmail: "peter.varga@example.sk",
  to: ["podpora@vasobchod.sk"],
  subject: "Pokazený zips",
  text: "Dobrý deň, zips sa pokazil. Objednávka #57902.",
  headers: {},
  attachments: [],
  ...over,
});

const rule = (id: string, position: number, conditions: FilterRule["conditions"], enabled = true): FilterRule => ({
  id,
  name: id,
  enabled,
  position,
  conditions,
  action: { type: "createTicket", tags: [] },
});

describe("matchCondition", () => {
  it("ignores case and diacritics and ORs comma alternatives", () => {
    expect(matchCondition(email(), { field: "subjectOrBody", op: "contains", value: "reklamacia, pokazeny" })).toBe(true);
    expect(matchCondition(email(), { field: "subject", op: "contains", value: "faktúra" })).toBe(false);
  });

  it("matches sender domain and header existence", () => {
    expect(matchCondition(email(), { field: "fromDomain", op: "equals", value: "example.sk" })).toBe(true);
    const nl = email({ headers: { "List-Unsubscribe": "<mailto:x@y>" } });
    expect(matchCondition(nl, { field: "header", header: "list-unsubscribe", op: "exists", value: "" })).toBe(true);
    expect(matchCondition(email(), { field: "header", header: "list-unsubscribe", op: "exists", value: "" })).toBe(false);
  });

  it("compares spam score numerically and customer tags as a set", () => {
    expect(matchCondition(email({ spamScore: 7 }), { field: "spamScore", op: "gt", value: "5" })).toBe(true);
    expect(matchCondition(email({ customerTags: ["VIP"] }), { field: "customerTag", op: "contains", value: "vip" })).toBe(true);
  });

  it("treats an invalid regex as no match", () => {
    expect(matchCondition(email(), { field: "subject", op: "regex", value: "([" })).toBe(false);
  });
});

describe("evaluateFilters", () => {
  it("returns the first enabled match by position", () => {
    const filters = [
      rule("b", 2, [{ field: "subjectOrBody", op: "contains", value: "zips" }]),
      rule("a", 1, [{ field: "subjectOrBody", op: "contains", value: "objednávka" }]),
    ];
    expect(evaluateFilters(email(), filters)?.id).toBe("a");
  });

  it("skips disabled filters and requires all conditions", () => {
    const filters = [
      rule("off", 1, [{ field: "subject", op: "contains", value: "zips" }], false),
      rule("both", 2, [
        { field: "subject", op: "contains", value: "zips" },
        { field: "from", op: "endsWith", value: "@firma.sk" },
      ]),
      rule("last", 3, [{ field: "subject", op: "contains", value: "zips" }]),
    ];
    expect(evaluateFilters(email(), filters)?.id).toBe("last");
  });

  it("returns null when nothing matches", () => {
    expect(evaluateFilters(email(), [rule("x", 1, [{ field: "subject", op: "contains", value: "faktúra" }])])).toBeNull();
  });
});

describe("threading helpers", () => {
  it("extracts and replaces ticket tags", () => {
    expect(extractTicketNumber("Re: Zľava [#10482]")).toBe(10482);
    expect(extractTicketNumber("Bez čísla")).toBeNull();
    expect(withTicketTag("Re: Zľava [#1]", 10482)).toBe("Re: Zľava [#10482]");
  });

  it("cleans reply prefixes", () => {
    expect(cleanSubject("RE: Fwd: Odp: Faktúra [#10001]")).toBe("Faktúra");
    expect(cleanSubject("   ")).toBe("(bez predmetu)");
  });

  it("orders referenced ids most recent first without duplicates", () => {
    expect(referencedIds("<c>", ["<a>", "<b>", "<c>"])).toEqual(["<c>", "<b>", "<a>"]);
  });
});
