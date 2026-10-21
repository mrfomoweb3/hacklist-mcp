import * as cheerio from "cheerio";
import type { Kind, RawOpportunity } from "./types.js";

export const BASE_URL = "https://hacklist.io";

const KINDS: Kind[] = ["hackathon", "program", "grant", "bounty", "job"];
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH_RE = new RegExp(`^(?:https?://(?:www\\.)?hacklist\\.io)?/(${KINDS.join("|")})/(${UUID})/?(?:[?#].*)?$`, "i");
const UUID_RE = new RegExp(`^${UUID}$`, "i");

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const DATE_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.? (\d{1,2}),? (\d{4})$/i;
const RELATIVE_RE = /^(\d+ days? left|ends today|ends tomorrow|ended|closed|expired|\d+ days? ago)$/i;
const PRIZE_LABELS = ["Total prizes", "Prize Pool", "Prize pool", "Prizes", "Stipend", "Funding", "Reward", "Rewards", "Grant size", "Grant", "Compensation", "Salary"];
const DETAIL_LABELS = [
  ...PRIZE_LABELS, "Category", "Format", "Deadline", "Type", "Duration", "Location", "Eligibility",
  "Team size", "Starts", "Start date", "Ends", "End date", "Organizer", "Posted", "Listed", "Added", "Updated",
];
const CATEGORY_TOKENS = new Set(["ai", "web3", "ai + web3", "both", "defi", "gaming", "other"]);
const FORMAT_TOKENS = new Set(["online", "remote", "in-person", "in person", "hybrid", "irl"]);
const SUBTYPES = new Set(["fellowship", "residency", "accelerator", "incubator", "internship", "grant program", "bootcamp", "cohort"]);

export function parseHackListPath(href: string): { kind: Kind; id: string } | null {
  const m = href.trim().match(PATH_RE);
  if (!m) return null;
  return { kind: m[1].toLowerCase() as Kind, id: m[2].toLowerCase() };
}

export function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

/** "Oct 15, 2026" -> "2026-10-15". Returns undefined if not a date. */
export function toIsoDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  const m = t.match(DATE_RE);
  if (m) {
    const mon = MONTHS[m[1].toLowerCase()];
    return `${m[3]}-${String(mon).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : undefined;
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Flatten an element into the ordered list of its visible text runs.
 * Each "leaf-ish" element (one with no element children carrying text) becomes one token,
 * which mirrors how the page renders label/value pairs regardless of the CSS used.
 */
export function textTokens($: cheerio.CheerioAPI, root: any): string[] {
  const out: string[] = [];
  const walk = (node: any) => {
    if (node.type === "text") {
      const t = clean(node.data ?? "");
      if (t) out.push(t);
      return;
    }
    if (node.type !== "tag") return;
    const name = node.name?.toLowerCase();
    if (["script", "style", "noscript", "svg", "template", "head"].includes(name)) return;
    for (const c of node.children ?? []) walk(c);
  };
  $(root).each((_, el) => walk(el));
  // Merge text nodes that belong to the same inline run is not needed here; keep raw order.
  return out;
}

function eqi(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function looksLikePrize(s: string): boolean {
  return /[$€£₹₦]|\b(usd|usdc|usdt|eth|sol|cash|prize|credits|stipend|grant|tokens?|k\b)/i.test(s) && /\d/.test(s);
}

/* ------------------------------------------------------------------ */
/* Listing cards (homepage)                                            */
/* ------------------------------------------------------------------ */

export function parseListingPage(html: string): { cards: RawOpportunity[]; totalShown: number | null } {
  const $ = cheerio.load(html);
  const anchors = $("a[href]")
    .toArray()
    .filter((a) => parseHackListPath($(a).attr("href") ?? "") && clean($(a).text()).length > 0);

  // Title anchors are the ones inside headings (cards use h3); fall back to all.
  let titleAnchors = anchors.filter((a) => $(a).closest("h1,h2,h3,h4").length > 0);
  if (titleAnchors.length === 0) titleAnchors = anchors;

  const seen = new Set<string>();
  const cards: RawOpportunity[] = [];
  for (const a of titleAnchors) {
    const ref = parseHackListPath($(a).attr("href")!)!;
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);

    // Card container: highest ancestor that still contains only this one opportunity.
    let container: any = $(a).closest("li,article");
    if (!container.length) {
      let cur: any = $(a);
      while (cur.parent().length) {
        const p = cur.parent();
        const ids = new Set(
          p.find("a[href]").toArray().map((x: any) => parseHackListPath($(x).attr("href") ?? "")?.id).filter(Boolean),
        );
        if (ids.size > 1) break;
        cur = p;
      }
      container = cur;
    }
    const title = clean($(a).text());
    const tokens = textTokens($, container);
    cards.push(cardFromTokens(ref.kind, ref.id, title, tokens));
  }

  const body = clean($("body").text());
  const total = body.match(/(\d+)\s+opportunities/i);
  return { cards, totalShown: total ? Number(total[1]) : null };
}

export function cardFromTokens(kind: Kind, id: string, title: string, tokensIn: string[]): RawOpportunity {
  const tokens = tokensIn.filter((t) => t !== "");
  const ti = tokens.findIndex((t) => t === title);
  const after = ti >= 0 ? tokens.slice(ti + 1) : tokens;

  const o: RawOpportunity = { id, kind, url: `${BASE_URL}/${kind}/${id}`, title, sources: ["card"], tags: [] };

  const verifiedIdx = after.findIndex((t) => eqi(t, "Verified"));
  o.verified = verifiedIdx >= 0;
  // Organizer: first token after the title that is not a badge. It may be glued: "QlooVerified".
  const first = after[0];
  if (first) {
    if (first.endsWith("Verified") && first !== "Verified") {
      o.organizer = first.replace(/Verified$/, "").trim();
      o.verified = true;
    } else if (!eqi(first, "Verified")) {
      o.organizer = first;
    }
  }

  const kindNames = new Set(KINDS.map((k) => k));
  let relIdx = -1;
  for (let i = 0; i < after.length; i++) {
    const t = after[i];
    const tl = t.toLowerCase();
    if (i === 0 && o.organizer === t) continue;
    if (eqi(t, "Verified")) continue;
    if (kindNames.has(tl as Kind)) continue;
    if (CATEGORY_TOKENS.has(tl)) { o.category ??= t; o.tags!.push(t); continue; }
    if (eqi(t, "Free to enter") || eqi(t, "Free")) { o.freeToEnter = true; o.tags!.push("Free to enter"); continue; }
    if (/^paid entry|entry fee/i.test(t)) { o.freeToEnter = false; o.tags!.push(t); continue; }
    if (SUBTYPES.has(tl)) { o.subtype = t; o.tags!.push(t); continue; }
    if (PRIZE_LABELS.some((l) => eqi(l, t))) {
      o.prizeLabel = t;
      const prev = after[i - 1];
      if (prev && !o.prizeText) o.prizeText = prev;
      continue;
    }
    const d = toIsoDate(t);
    if (d && !o.deadline) { o.deadline = d; continue; }
    if (RELATIVE_RE.test(t)) { relIdx = i; continue; }
    if (!o.description && t.length >= 60 && t !== title) { o.description = t; continue; }
  }
  if (!o.prizeText) {
    // Cards without a label ("Stipend not listed") – take the first prize-ish token after description.
    const cand = after.find((t) => looksLikePrize(t) || /not (listed|specified)|^none\b/i.test(t));
    if (cand && cand !== o.description) o.prizeText = cand;
  }
  if (relIdx >= 0 && after[relIdx + 1]) {
    o.location = after[relIdx + 1];
  } else {
    const last = after[after.length - 1];
    if (last && last !== o.prizeText && last !== o.description && !toIsoDate(last)) o.location = last;
  }
  if (o.location && !o.format) {
    const l = o.location.toLowerCase();
    o.format = /hybrid/.test(l) ? "Hybrid" : /in-?person|irl|on-?site/.test(l) ? "In-person" : /online|remote|global|virtual/.test(l) ? "Online" : undefined;
  }
  return o;
}

/* ------------------------------------------------------------------ */
/* Detail page                                                          */
/* ------------------------------------------------------------------ */

export function parseDetailPage(html: string, kind: Kind, id: string): RawOpportunity {
  const $ = cheerio.load(html);
  const main = $("main").length ? $("main") : $("body");
  const tokens = textTokens($, main);
  const h1 = clean($("h1").first().text());
  const metaDesc = $('meta[name="description"]').attr("content")?.trim();
  const titleTag = clean($("title").text()).replace(/\s*\|\s*HackList\s*$/i, "");
  const title = h1 || titleTag;

  const o: RawOpportunity = { id, kind, url: `${BASE_URL}/${kind}/${id}`, title, sources: ["detail"], tags: [] };

  const labelSet = new Set(DETAIL_LABELS.map((l) => l.toLowerCase()));
  const ti = tokens.findIndex((t) => t === title);

  // Organizer / verified badge sit right before the h1.
  if (ti > 0) {
    let k = ti - 1;
    if (eqi(tokens[k], "Verified")) { o.verified = true; k--; }
    const org = tokens[k];
    if (org && !/back to all|discover|launchpad|about|telegram|get free access|list my opportunity/i.test(org)) {
      if (org.endsWith("Verified") && org !== "Verified") { o.organizer = org.replace(/Verified$/, "").trim(); o.verified = true; }
      else o.organizer = org;
    }
  }

  for (let i = 0; i < tokens.length - 1; i++) {
    const label = tokens[i];
    if (!labelSet.has(label.toLowerCase())) continue;
    const value = tokens[i + 1];
    if (!value || labelSet.has(value.toLowerCase())) continue;
    const L = label.toLowerCase();
    if (PRIZE_LABELS.some((p) => p.toLowerCase() === L)) { o.prizeText ??= value; o.prizeLabel ??= label; }
    else if (L === "category") o.category ??= value;
    else if (L === "format" || L === "location") { if (L === "format") o.format ??= value; else o.location ??= value; }
    else if (L === "deadline" || L === "ends" || L === "end date") o.deadline ??= toIsoDate(value);
    else if (L === "type") o.subtype ??= value;
    else if (L === "duration") o.duration ??= value;
    else if (L === "team size") o.tags!.push(`Team: ${value}`);
    else if (L === "organizer") o.organizer ??= value;
    else if (["posted", "listed", "added"].includes(L)) o.listedAt ??= toIsoDate(value) ?? value;
    else if (L === "updated") o.updatedAt ??= toIsoDate(value) ?? value;
  }

  // About section: everything between "About" and the first Apply link text.
  const ai = tokens.findIndex((t) => eqi(t, "About"));
  if (ai >= 0) {
    const parts: string[] = [];
    for (let i = ai + 1; i < tokens.length; i++) {
      const t = tokens[i];
      if (/^apply\b/i.test(t) || /^(eligibility|how to apply|prizes|tracks|judging)$/i.test(t) && parts.length) break;
      if (/^©/.test(t)) break;
      parts.push(t);
      if (parts.join(" ").length > 4000) break;
    }
    if (parts.length) o.description = parts.join("\n");
  }
  if (!o.description && metaDesc && !/best place on the internet/i.test(metaDesc)) o.description = metaDesc;

  for (const t of tokens) {
    const tl = t.toLowerCase();
    if (eqi(t, "Free") || eqi(t, "Free to enter")) o.freeToEnter = true;
    if (SUBTYPES.has(tl)) o.subtype ??= t;
  }

  const apply = $("a[href]")
    .toArray()
    .map((a) => ({ text: clean($(a).text()), href: $(a).attr("href") ?? "" }))
    .find((a) => /^apply/i.test(a.text) && /^https?:\/\//.test(a.href) && !/hacklist\.io/i.test(a.href));
  if (apply) o.applyUrl = apply.href;

  return o;
}

/* ------------------------------------------------------------------ */
/* Sitemap                                                              */
/* ------------------------------------------------------------------ */

export function parseSitemap(xml: string): Array<{ kind: Kind; id: string; lastmod?: string }> {
  const out: Array<{ kind: Kind; id: string; lastmod?: string }> = [];
  const re = /<url>([\s\S]*?)<\/url>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const loc = m[1].match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1];
    const lastmod = m[1].match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i)?.[1];
    if (!loc) continue;
    const ref = parseHackListPath(loc);
    if (ref) out.push({ ...ref, lastmod });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Next.js flight (RSC) payload – opportunistic                         */
/* ------------------------------------------------------------------ */

/**
 * Next.js App Router pages embed their server data as `self.__next_f.push([1,"..."])` chunks.
 * When the listing data is in there we get every opportunity (not just the first page of cards)
 * plus database timestamps such as created_at. This is best-effort: if HackList changes its
 * build, we silently fall back to cards + detail pages.
 */
export function extractFlightObjects(html: string): Record<string, any>[] {
  const chunks: string[] = [];
  const re = /self\.__next_f\.push\(\[\s*1\s*,\s*("(?:[^"\\]|\\.)*")\s*\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try { chunks.push(JSON.parse(m[1])); } catch { /* ignore */ }
  }
  const text = chunks.join("");
  // Also consider classic __NEXT_DATA__ (pages router).
  const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const haystack = text + (nd ? "\n" + nd[1] : "");
  if (!haystack) return [];

  const objs: Record<string, any>[] = [];
  const idRe = new RegExp(`\\{"id":"(${UUID})"`, "gi");
  let im: RegExpExecArray | null;
  while ((im = idRe.exec(haystack))) {
    const start = im.index;
    const end = matchBrace(haystack, start);
    if (end < 0) continue;
    try {
      const obj = JSON.parse(haystack.slice(start, end + 1));
      if (obj && typeof obj === "object" && (obj.title || obj.name)) objs.push(obj);
    } catch { /* not plain JSON */ }
  }
  return objs;
}

function matchBrace(s: string, start: number): number {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length && i - start < 200_000; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

const pick = (o: any, keys: string[]) => {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

/** Map a loosely-shaped DB row from the flight payload onto our fields. */
export function flightToRaw(obj: Record<string, any>): RawOpportunity | null {
  const id = String(obj.id ?? "").toLowerCase();
  if (!isUuid(id)) return null;
  const rawKind = String(pick(obj, ["type", "kind", "opportunity_type", "opportunityType", "category_type"]) ?? "hackathon").toLowerCase();
  const kind = (KINDS.find((k) => rawKind.startsWith(k)) ?? "hackathon") as Kind;
  const asStr = (v: any) => (v === undefined || v === null ? undefined : typeof v === "object" ? JSON.stringify(v) : String(v));
  const date = (v: any) => {
    const s = asStr(v);
    return s ? (toIsoDate(s) ?? s) : undefined;
  };
  const o: RawOpportunity = {
    id,
    kind,
    url: `${BASE_URL}/${kind}/${id}`,
    title: String(pick(obj, ["title", "name"])),
    organizer: asStr(pick(obj, ["organizer", "organizer_name", "organizerName", "host", "company", "sponsor"])),
    verified: typeof obj.verified === "boolean" ? obj.verified : typeof obj.is_verified === "boolean" ? obj.is_verified : undefined,
    description: asStr(pick(obj, ["description", "summary", "short_description", "shortDescription", "about"])),
    category: asStr(pick(obj, ["category", "ecosystem", "track"])),
    format: asStr(pick(obj, ["format", "mode", "location_type", "locationType"])),
    location: asStr(pick(obj, ["location", "location_text", "locationText", "venue"])),
    prizeText: asStr(pick(obj, ["prize", "prize_pool", "prizePool", "prize_text", "prizes", "total_prize", "stipend", "funding", "reward"])),
    deadline: date(pick(obj, ["deadline", "end_date", "endDate", "submission_deadline", "ends_at", "endsAt"])),
    applyUrl: asStr(pick(obj, ["apply_url", "applyUrl", "url", "link", "website", "registration_url"])),
    listedAt: asStr(pick(obj, ["created_at", "createdAt", "posted_at", "postedAt", "published_at", "publishedAt", "listed_at", "inserted_at"])),
    updatedAt: asStr(pick(obj, ["updated_at", "updatedAt", "modified_at"])),
    freeToEnter: typeof obj.free === "boolean" ? obj.free : typeof obj.is_free === "boolean" ? obj.is_free : undefined,
    sources: ["rsc"],
    tags: Array.isArray(obj.tags) ? obj.tags.map(String) : [],
  };
  if (o.applyUrl && /hacklist\.io/i.test(o.applyUrl)) o.applyUrl = undefined;
  return o;
}

/* ------------------------------------------------------------------ */
/* Official JSON feed: GET /api/opportunities                           */
/* ------------------------------------------------------------------ */

export interface FeedResult {
  version: number | null;
  generatedAt: string | null;
  count: number | null;
  items: RawOpportunity[];
}

/**
 * Parse HackList's official feed. Shape (v1):
 * { version, source, generated_at, count, items: [{ id, type, title, organizer, verified, description,
 *   category, format, prize, prize_label, deadline, deadline_text, apply_url, url, created_at }] }
 * Unknown extra fields are ignored; missing ones stay undefined.
 */
export function parseFeed(body: string): FeedResult {
  const data = JSON.parse(body);
  const rows: any[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  if (!rows.length && !Array.isArray(data?.items)) throw new Error("Feed has no items array");
  const str = (v: any) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const items: RawOpportunity[] = [];
  for (const r of rows) {
    const id = String(r?.id ?? "").toLowerCase();
    const title = str(r?.title);
    if (!isUuid(id) || !title) continue;
    const t = String(r.type ?? "hackathon").toLowerCase();
    const kind = (KINDS.find((k) => t.startsWith(k)) ?? "hackathon") as Kind;
    const deadlineText = str(r.deadline_text);
    const apply = str(r.apply_url);
    items.push({
      id,
      kind,
      url: str(r.url) ?? `${BASE_URL}/${kind}/${id}`,
      title,
      organizer: str(r.organizer),
      verified: typeof r.verified === "boolean" ? r.verified : undefined,
      description: str(r.description),
      category: str(r.category),
      format: str(r.format),
      location: str(r.location),
      subtype: str(r.subtype),
      prizeText: str(r.prize),
      prizeLabel: str(r.prize_label),
      deadline: toIsoDate(str(r.deadline)) ?? toIsoDate(deadlineText),
      deadlineText,
      applyUrl: apply && !/hacklist\.io/i.test(apply) ? apply : undefined,
      listedAt: str(r.created_at),
      updatedAt: str(r.updated_at),
      freeToEnter: typeof r.free_to_enter === "boolean" ? r.free_to_enter : typeof r.free === "boolean" ? r.free : undefined,
      tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
      sources: ["feed"],
    });
  }
  return {
    version: typeof data?.version === "number" ? data.version : null,
    generatedAt: str(data?.generated_at) ?? null,
    count: typeof data?.count === "number" ? data.count : null,
    items,
  };
}

/** Merge b into a: keep a's values, fill gaps from b. Longer description wins. */
export function mergeRaw(a: RawOpportunity, b: RawOpportunity): RawOpportunity {
  const out: any = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined || v === null || v === "") continue;
    if (k === "sources") continue;
    if (k === "tags") { out.tags = Array.from(new Set([...(a.tags ?? []), ...(v as string[])])); continue; }
    if (k === "description") { if (!a.description || String(v).length > a.description.length) out.description = v; continue; }
    if (out[k] === undefined || out[k] === null || out[k] === "") out[k] = v;
  }
  out.sources = Array.from(new Set([...a.sources, ...b.sources]));
  return out;
}
