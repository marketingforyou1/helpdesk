import { z } from "zod";

/** Normalized incoming e-mail used for filter evaluation. */
export interface IncomingEmail {
  fromEmail: string;
  fromName?: string;
  to: string[];
  subject: string;
  text: string;
  headers: Record<string, string>;
  attachments: { filename: string; contentType: string }[];
  spamScore?: number;
  customerTags?: string[];
}

export const conditionFields = [
  "from",
  "fromDomain",
  "to",
  "subject",
  "body",
  "subjectOrBody",
  "header",
  "customerTag",
  "spamScore",
  "hasAttachment",
] as const;

export const conditionOps = [
  "contains",
  "notContains",
  "equals",
  "endsWith",
  "startsWith",
  "regex",
  "exists",
  "gt",
  "lt",
] as const;

export const FilterConditionSchema = z.object({
  field: z.enum(conditionFields),
  op: z.enum(conditionOps),
  /** Comma separated alternatives are OR-ed for text operators. */
  value: z.string().default(""),
  /** Header name when field === "header". */
  header: z.string().optional(),
});
export type FilterCondition = z.infer<typeof FilterConditionSchema>;

export const FilterActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("createTicket"),
    teamId: z.string().nullish(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).nullish(),
    tags: z.array(z.string()).default([]),
    slaMinutes: z.number().int().positive().nullish(),
  }),
  z.object({ type: z.literal("skip") }),
  z.object({ type: z.literal("spam") }),
]);
export type FilterAction = z.infer<typeof FilterActionSchema>;

export interface FilterRule {
  id: string;
  name: string;
  enabled: boolean;
  position: number;
  conditions: FilterCondition[];
  action: FilterAction;
}

/** Lowercase and strip diacritics so "Faktúra" matches "faktura". */
export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function alternatives(value: string): string[] {
  return value
    .split(",")
    .map((v) => normalize(v.trim()))
    .filter(Boolean);
}

function fieldValue(email: IncomingEmail, c: FilterCondition): string | number | boolean | string[] | undefined {
  switch (c.field) {
    case "from":
      return email.fromEmail;
    case "fromDomain":
      return email.fromEmail.split("@")[1] ?? "";
    case "to":
      return email.to.join(", ");
    case "subject":
      return email.subject;
    case "body":
      return email.text;
    case "subjectOrBody":
      return `${email.subject}\n${email.text}`;
    case "header": {
      const name = (c.header ?? "").toLowerCase();
      const key = Object.keys(email.headers).find((k) => k.toLowerCase() === name);
      return key === undefined ? undefined : email.headers[key];
    }
    case "customerTag":
      return email.customerTags ?? [];
    case "spamScore":
      return email.spamScore ?? 0;
    case "hasAttachment":
      return email.attachments.length > 0;
  }
}

function matchText(actual: string, op: FilterCondition["op"], value: string): boolean {
  const a = normalize(actual);
  const alts = alternatives(value);
  switch (op) {
    case "contains":
      return alts.some((v) => a.includes(v));
    case "notContains":
      return !alts.some((v) => a.includes(v));
    case "equals":
      return alts.some((v) => a === v);
    case "endsWith":
      return alts.some((v) => a.endsWith(v));
    case "startsWith":
      return alts.some((v) => a.startsWith(v));
    case "regex":
      try {
        return new RegExp(value, "i").test(actual);
      } catch {
        return false;
      }
    case "exists":
      return true;
    default:
      return false;
  }
}

export function matchCondition(email: IncomingEmail, c: FilterCondition): boolean {
  const v = fieldValue(email, c);
  if (c.op === "exists") {
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "boolean") return v;
    return v !== undefined && v !== "";
  }
  if (typeof v === "number") {
    const n = Number(c.value);
    if (Number.isNaN(n)) return false;
    if (c.op === "gt") return v > n;
    if (c.op === "lt") return v < n;
    if (c.op === "equals") return v === n;
    return false;
  }
  if (typeof v === "boolean") {
    return c.op === "equals" ? String(v) === normalize(c.value) : false;
  }
  if (Array.isArray(v)) {
    const alts = alternatives(c.value);
    const tags = v.map(normalize);
    if (c.op === "notContains") return !alts.some((x) => tags.includes(x));
    return alts.some((x) => tags.includes(x));
  }
  if (v === undefined) return c.op === "notContains";
  return matchText(v, c.op, c.value);
}

/** Filters are checked top to bottom; the first enabled one whose conditions all match wins. */
export function evaluateFilters(email: IncomingEmail, filters: FilterRule[]): FilterRule | null {
  const ordered = [...filters].sort((a, b) => a.position - b.position);
  for (const f of ordered) {
    if (!f.enabled || f.conditions.length === 0) continue;
    if (f.conditions.every((c) => matchCondition(email, c))) return f;
  }
  return null;
}

export const fieldLabels: Record<FilterCondition["field"], string> = {
  from: "Odosielateľ",
  fromDomain: "Doména odosielateľa",
  to: "Príjemca",
  subject: "Predmet",
  body: "Text správy",
  subjectOrBody: "Predmet alebo text",
  header: "Hlavička",
  customerTag: "Štítok zákazníka",
  spamScore: "Spam skóre",
  hasAttachment: "Má prílohu",
};

export const opLabels: Record<FilterCondition["op"], string> = {
  contains: "obsahuje",
  notContains: "neobsahuje",
  equals: "je",
  endsWith: "končí na",
  startsWith: "začína na",
  regex: "zodpovedá regexu",
  exists: "existuje",
  gt: "je väčšie ako",
  lt: "je menšie ako",
};

export function describeCondition(c: FilterCondition): string {
  const field = c.field === "header" ? `Hlavička ${c.header ?? ""}` : fieldLabels[c.field];
  return c.op === "exists" ? `${field} ${opLabels[c.op]}` : `${field} ${opLabels[c.op]} „${c.value}“`;
}
