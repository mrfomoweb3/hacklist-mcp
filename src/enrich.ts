import type { Eligibility, Opportunity, PrizeInfo, RawOpportunity } from "./types.js";

/* ------------------------------------------------------------------ */
/* Dates                                                                */
/* ------------------------------------------------------------------ */

/** Current time; HACKLIST_NOW (ISO) pins it for tests. */
export function clock(): Date {
  return process.env.HACKLIST_NOW ? new Date(process.env.HACKLIST_NOW) : new Date();
}

export function todayIso(now = clock()): string {
  return now.toISOString().slice(0, 10);
}

/** Whole days from today (UTC) to the deadline date. 0 = ends today. */
export function daysUntil(deadline: string | undefined, now = clock()): number | null {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}/.test(deadline)) return null;
  const d = Date.UTC(+deadline.slice(0, 4), +deadline.slice(5, 7) - 1, +deadline.slice(8, 10));
  const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((d - t) / 86_400_000);
}

/* ------------------------------------------------------------------ */
/* Prize parsing                                                        */
/* ------------------------------------------------------------------ */

// Rough conversion so different currencies can be ranked together. Not for accounting.
const FX: Record<string, number> = { usd: 1, usdc: 1, usdt: 1, dai: 1, eur: 1.08, gbp: 1.27, inr: 0.012, ngn: 0.00065, cad: 0.73, aud: 0.66, sgd: 0.74, chf: 1.12, jpy: 0.0067 };
const SYMBOL: Record<string, string> = { $: "usd", "€": "eur", "£": "gbp", "₹": "inr", "₦": "ngn" };

function toNumber(raw: string, suffix?: string): number {
  // Handles 1,000,000 / 7,50,000 (Indian grouping) / 25k / 1.5M / ₹18 lakh / ₹1.5L / ₹2 crore
  let n = Number(raw.replace(/[,\s]/g, ""));
  const s = (suffix ?? "").toLowerCase();
  if (s === "k") n *= 1e3;
  else if (s === "m" || s === "mm" || s === "million") n *= 1e6;
  else if (s === "b" || s === "billion") n *= 1e9;
  else if (/^(l|lakhs?|lacs?)$/.test(s)) n *= 1e5;
  else if (/^(cr|crores?)$/.test(s)) n *= 1e7;
  return n;
}

export function parsePrize(text: string | undefined): PrizeInfo {
  const notes: string[] = [];
  if (!text || !text.trim()) return { usd: null, nonCash: false, status: "unspecified", notes };
  const t = text.trim();
  if (/^(none|no cash|n\/a)\b/i.test(t) || /\bno cash prize\b/i.test(t)) return { usd: 0, nonCash: true, status: "none", notes: ["No cash prize"] };
  if (/^not (specified|listed|stated)|^tbd$|^tba$|stipend provided|^stipend not listed/i.test(t)) {
    return { usd: null, nonCash: false, status: "unspecified", notes: [] };
  }

  const amounts: Array<{ usd: number; ctx: string }> = [];
  // Judge cash vs credits per clause: "1st: 1,000 USDC; 2nd: 600 API credits" has a cash first prize.
  const clauses = t.split(/[;()+]|\bplus\b|\band\b(?= \$| up to)/i).map((c) => c.trim()).filter(Boolean);
  const re = /([$€£₹₦])\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|mm|million|billion|b|lakhs?|lacs?|l|crores?|cr)?\b(?!\s*\/\s*(?:mo|month|yr|year))|(\d[\d,]*(?:\.\d+)?)\s?(k|m|million)?\s?(usdc|usdt|usd|dai|eur|gbp|inr|ngn|cad|aud|sgd|chf|jpy)\b|\b(usd|usdc|usdt)\s?(\d[\d,]*(?:\.\d+)?)/gi;
  for (const clause of clauses) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(clause))) {
      let cur: string, n: number;
      if (m[1]) { cur = SYMBOL[m[1]]; n = toNumber(m[2], m[3]); }
      else if (m[7]) { cur = m[7].toLowerCase(); n = toNumber(m[8]); }
      else { cur = m[6].toLowerCase(); n = toNumber(m[4], m[5]); }
      if (!Number.isFinite(n) || n <= 0) continue;
      amounts.push({ usd: n * (FX[cur] ?? 1), ctx: clause.toLowerCase() });
      if (!["usd", "usdc", "usdt", "dai"].includes(cur)) notes.push(`Converted from ${cur.toUpperCase()} at an approximate rate`);
    }
  }

  const creditish = /credit|in-kind|in kind|subscription|hardware|swag|compute|voucher|total value|worth of/;
  const cashWord = (s: string) => /\bcash\b/.test(s) && !/not cash|non-cash/.test(s);
  const hasCashWord = cashWord(t.toLowerCase()) || /usdc|usdt|\$\d/.test(t.toLowerCase());
  const cashAmounts = amounts.filter((a) => !creditish.test(a.ctx) || cashWord(a.ctx));
  const nonCash = amounts.length > 0 ? cashAmounts.length === 0 : creditish.test(t.toLowerCase()) && !hasCashWord;
  if (/may change|still developing|subject to change|tbd/i.test(t)) notes.push("Organizer says the prize pool may change");
  if (/requires? .*subscription|subscription to redeem/i.test(t)) notes.push("Prize needs a paid subscription to redeem");
  if (/per[- ]track|per track|breakdown (not stated|tbd)/i.test(t)) notes.push("Per-track breakdown not stated");

  if (!amounts.length) {
    const crypto = t.match(/\b(eth|sol|btc|op|arb|matic|pol|sui|near|apt|avax|bnb|ton)\b/i);
    if (crypto) notes.push(`Paid in ${crypto[1].toUpperCase()}; no USD estimate (price moves)`);
    return { usd: null, nonCash, status: /\d/.test(t) ? "stated" : "unspecified", notes };
  }
  const pool = (cashAmounts.length ? cashAmounts : amounts).map((a) => a.usd);
  // "Total" lines usually lead with the headline; take the max as the headline value.
  return { usd: Math.round(Math.max(...pool)), nonCash, status: "stated", notes: Array.from(new Set(notes)) };
}

/* ------------------------------------------------------------------ */
/* Eligibility traps                                                    */
/* ------------------------------------------------------------------ */

const REGION_PATTERNS: Array<[RegExp, string]> = [
  [/\b(in|across|from) india\b|indian (students|citizens|residents)|\bindia only\b/i, "India"],
  [/\bu\.?s\.? (universities|residents|citizens|only|fellowship|-based)|united states only|\bus only\b/i, "United States"],
  [/\b(uk|united kingdom) (only|residents|citizens)/i, "United Kingdom"],
  [/\beu (only|residents)|european union residents/i, "European Union"],
  [/\bnigeria(n)? (only|residents|citizens)|\bin nigeria\b/i, "Nigeria"],
  [/\bcanada (only|residents)|canadian residents/i, "Canada"],
  [/\bsingapore(an)? (only|residents)/i, "Singapore"],
  [/-affiliated participants|campus (edition|semi-final)|students of [A-Z]/i, "Single campus/university"],
];

export function detectEligibility(o: RawOpportunity): Eligibility {
  const text = [o.title, o.description, o.location, o.format, o.prizeText, o.subtype].filter(Boolean).join(" \n ");
  const lower = text.toLowerCase();
  let region: string | null = null;
  for (const [re, name] of REGION_PATTERNS) if (re.test(text)) { region = name; break; }
  const fmt = `${o.format ?? ""} ${o.location ?? ""}`.toLowerCase();
  const hybrid = /hybrid/.test(fmt);
  const inPersonRequired = !hybrid && /in-?person|on-?site|irl/.test(fmt) && !/online|remote|virtual/.test(fmt);
  const team = text.match(/teams? of (\d+\s?(?:–|-|to)\s?\d+)|(\d+\s?(?:–|-|to)\s?\d+) (?:people|members)|solo or teams? (?:of )?up to (\d+)/i);
  return {
    studentsOnly:
      /students? only|only students|college\/university students|current (undergraduate|graduate|university) students|student hackathon|open to students|campus/i.test(text) &&
      !/working professionals|students (and|or) professionals|open to all/i.test(lower),
    regionLocked: region,
    inPersonRequired,
    hybrid,
    applicationGated: /apply to (spend|join|participate)|application[- ]based|must be approved|to be approved|approved (participants|request)|shortlist|selected (teams|participants|companies)|by application|requires signing up/i.test(text),
    partnerOnly: /partners? only|for aws partners|must (be|create) .*partner|ace opportunity/i.test(text),
    teamSize: team ? (team[1] ?? team[2] ?? `1-${team[3]}`) : null,
  };
}

/* ------------------------------------------------------------------ */
/* "Is this brief generic?"                                             */
/* ------------------------------------------------------------------ */

const GENERIC_PHRASES = [
  /build (anything|whatever)/i, /any (idea|project|problem)/i, /open[- ]ended/i, /all (ideas|skill levels) welcome/i,
  /innovative (solutions|ideas|projects)/i, /solve real[- ]world problems/i, /real[- ]world (challenges|problems|impact)/i,
  /leverag(e|ing) (ai|the power of ai)/i, /ai[- ]powered (app|application|solution)s?/i, /(cutting|bleeding)[- ]edge/i,
  /without coding|no[- ]code/i, /turn (an|your) idea into/i, /ship (a|your) (product|project)/i, /next[- ]gen(eration)?/i,
  /for social good/i, /\bgeneral track\b/i, /build the future/i, /intelligent experiences/i, /high[- ]performance ai applications/i,
];

/** Things that make a brief concrete: a named API/SDK, dataset, metric, scope, or protocol. */
const HOOK_PATTERNS: Array<[RegExp, string]> = [
  [/\b(api|sdk|cli|runtime|protocol|platform)\b/i, "named API/SDK/platform"],
  [/\b(dataset|data from|fastq|vcf|mri|scans|genomic|corpus|benchmark)\b/i, "real dataset or benchmark"],
  [/\b(auc|f1|leaderboard|scored by|accuracy|latency|kaggle)\b/i, "objective scoring metric"],
  [/\b(subnet|validator|miner|zero[- ]knowledge|zk|side[- ]channel|aes|ebpf|kernel|rocm|edge ai|on[- ]device)\b/i, "deep technical scope"],
  [/\btracks? ?(:|\(|covering|include)|\btrack 1\b|four tracks|three tracks|\bpaths?:/i, "defined tracks"],
  [/\b(1st|first)( place| prize)?\s*[:\-–]\s*\$?[\d,]+.*\b(2nd|second)\b|\(\$?[\d,]+ ?\/ ?\$?[\d,]+/i, "per-place prize breakdown"],
  [/\b(single winner|first[- ]across[- ]the[- ]line)\b/i, "single-objective challenge"],
  [/\b(lifecycle|devsecops|review, security|compliance|reconcil|indicators?|backtest|carbon markets|legal tech|radiology|rare disease)\b/i, "specific problem domain"],
];

/** Capitalised product-ish words that are not sentence starts or common words. */
function properNouns(text: string): string[] {
  const stop = new Set(["The", "A", "An", "Build", "Builders", "Buildathon", "Teams", "Entries", "Submissions", "Submit", "Compete", "Online", "Global", "Apply", "Use", "Prizes", "Hackathon", "Track", "Tracks", "Strong", "Includes", "Optional", "Projects", "Open", "Students", "Second", "First", "Third", "Formerly", "No", "Bonus", "Each", "This", "AI", "Web3", "USD", "APIs", "API", "National", "International", "India", "Africa", "Europe", "Asia", "Pitch", "Judged", "Prize", "Winners", "Finalists"]);
  const found = new Set<string>();
  for (const m of text.matchAll(/(?<![.!?:]\s)(?<!^)\b([A-Z][a-zA-Z0-9+]+(?:[ -][A-Z0-9][a-zA-Z0-9+]+)*)/g)) {
    const w = m[1];
    if (!stop.has(w.split(/[ -]/)[0]) && w.length > 2) found.add(w);
  }
  return [...found];
}

export function assessSpecificity(o: RawOpportunity): { genericScore: number; hooks: string[] } {
  const text = `${o.title}. ${o.description ?? ""}`;
  const hooks = new Set<string>();
  for (const [re, label] of HOOK_PATTERNS) if (re.test(text)) hooks.add(label);
  const genericHits = GENERIC_PHRASES.filter((re) => re.test(text)).length;
  const nouns = properNouns(o.description ?? "").filter((n) => !(o.organizer ?? "").includes(n));
  if (nouns.length >= 3) hooks.add(`named tech: ${nouns.slice(0, 4).join(", ")}`);

  const descLen = (o.description ?? "").length;
  let score = 0.5;
  score += 0.12 * genericHits;
  score -= 0.1 * Math.min(hooks.size, 5);
  if (descLen < 80) score += 0.15; // thin brief
  if (descLen > 300) score -= 0.05;
  score = Math.max(0, Math.min(1, score));
  return { genericScore: Math.round(score * 100) / 100, hooks: [...hooks] };
}

/* ------------------------------------------------------------------ */
/* Red flags                                                            */
/* ------------------------------------------------------------------ */

function redFlags(o: RawOpportunity, prize: PrizeInfo, el: Eligibility): string[] {
  const f: string[] = [];
  if (prize.status === "none") f.push("No cash prize");
  else if (prize.status === "unspecified" && o.kind === "hackathon") f.push("Prize not specified");
  if (prize.nonCash && prize.status === "stated") f.push("Reward is mainly credits or in-kind, not cash");
  f.push(...prize.notes.filter((n) => !/converted/i.test(n)));
  if (o.freeToEnter === false) f.push("Entry fee");
  if (el.partnerOnly) f.push("Restricted to company partners");
  if (/deadline extended/i.test(o.description ?? "")) f.push("Deadline was extended (often a sign of low turnout, which can be good for odds)");
  if (/travel and accommodation not covered/i.test(o.description ?? "")) f.push("Travel not covered for the on-site phase");
  if (!o.verified && o.sources.some((s) => s !== "sitemap")) f.push("Not marked Verified on HackList");
  return Array.from(new Set(f));
}

/* ------------------------------------------------------------------ */
/* Duplicate listings                                                   */
/* ------------------------------------------------------------------ */

function normTitle(t: string): Set<string> {
  const drop = new Set(["the", "a", "an", "of", "for", "and", "with", "hackathon", "challenge", "competition", "global", "2025", "2026", "2027", "powered", "by", "on", "your"]);
  return new Set(t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !drop.has(w)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return i / (a.size + b.size - i);
}

/** Groups listings that are the same event posted twice (HackList has several). */
export function findDuplicates(items: RawOpportunity[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const norm = items.map((o) => ({ o, t: normTitle(o.title), apply: (o.applyUrl ?? "").replace(/\/+$/, "").toLowerCase() }));
  for (let i = 0; i < norm.length; i++) {
    for (let j = i + 1; j < norm.length; j++) {
      const A = norm[i], B = norm[j];
      const dd = A.o.deadline && B.o.deadline ? Math.abs((daysUntil(A.o.deadline) ?? 0) - (daysUntil(B.o.deadline) ?? 0)) : 99;
      const sameApply = A.apply && A.apply === B.apply;
      const sim = jaccard(A.t, B.t);
      // Same event is sometimes listed with a registration deadline and a submission deadline.
      const identical = sim === 1 && dd <= 14;
      if (sameApply || identical || (dd <= 2 && sim >= 0.5) || (dd <= 2 && sim >= 0.34 && sameOrg(A.o, B.o))) {
        map.set(A.o.id, [...(map.get(A.o.id) ?? []), B.o.id]);
        map.set(B.o.id, [...(map.get(B.o.id) ?? []), A.o.id]);
      }
    }
  }
  return map;
}

function sameOrg(a: RawOpportunity, b: RawOpportunity): boolean {
  const x = (a.organizer ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const y = (b.organizer ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return !!x && !!y && (x.includes(y) || y.includes(x) || x.slice(0, 5) === y.slice(0, 5));
}

/* ------------------------------------------------------------------ */
/* Enrich                                                               */
/* ------------------------------------------------------------------ */

const TRACKING_PARAM = /^(utm_.+|_gl|gclid|fbclid|msclkid|mc_cid|mc_eid|ref_feature|ref_medium|ref_content)$/i;

/** Drops analytics/tracking query params so apply links are clean and compare equal. */
export function cleanUrl(u: string | undefined): string | undefined {
  if (!u) return u;
  try {
    const url = new URL(u);
    for (const k of [...url.searchParams.keys()]) if (TRACKING_PARAM.test(k)) url.searchParams.delete(k);
    return url.toString().replace(/\?$/, "");
  } catch {
    return u;
  }
}

export function enrichAll(raws: RawOpportunity[], now = clock()): Opportunity[] {
  raws = raws.map((r) => (r.applyUrl ? { ...r, applyUrl: cleanUrl(r.applyUrl) } : r));
  const dups = findDuplicates(raws);
  return raws.map((r) => {
    const prize = parsePrize(r.prizeText);
    const eligibility = detectEligibility(r);
    const { genericScore, hooks } = assessSpecificity(r);
    const daysLeft = daysUntil(r.deadline, now);
    return {
      ...r,
      daysLeft,
      active: daysLeft === null ? true : daysLeft >= 0,
      prize,
      eligibility,
      genericScore,
      specificityHooks: hooks,
      redFlags: redFlags(r, prize, eligibility),
      duplicateIds: dups.get(r.id) ?? [],
    };
  });
}

/** Eligibility traps found on any copy of an event apply to the event. */
function mergeEligibility(group: Opportunity[]): Eligibility {
  const [first, ...rest] = group.map((g) => g.eligibility);
  return rest.reduce<Eligibility>((m, e) => ({
    studentsOnly: m.studentsOnly || e.studentsOnly,
    regionLocked: m.regionLocked ?? e.regionLocked,
    inPersonRequired: m.inPersonRequired || e.inPersonRequired,
    hybrid: m.hybrid || e.hybrid,
    applicationGated: m.applicationGated || e.applicationGated,
    partnerOnly: m.partnerOnly || e.partnerOnly,
    teamSize: m.teamSize ?? e.teamSize,
  }), first);
}

/** Pick one listing per duplicate group (the one with the richest data), keeping every copy's eligibility traps. */
export function collapseDuplicates(items: Opportunity[]): Opportunity[] {
  const byId = new Map(items.map((o) => [o.id, o]));
  const done = new Set<string>();
  const out: Opportunity[] = [];
  const richness = (o: Opportunity) => (o.description?.length ?? 0) + (o.applyUrl ? 200 : 0) + (o.prize.usd ? 100 : 0) + (o.verified ? 50 : 0);
  for (const o of items) {
    if (done.has(o.id)) continue;
    const group = [o, ...o.duplicateIds.map((id) => byId.get(id)).filter(Boolean) as Opportunity[]];
    group.forEach((g) => done.add(g.id));
    group.sort((a, b) => richness(b) - richness(a));
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const eligibility = mergeEligibility(group);
    out.push({ ...group[0], eligibility, redFlags: redFlags(group[0], group[0].prize, eligibility) });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Ranking                                                              */
/* ------------------------------------------------------------------ */

export interface BuilderProfile {
  skills?: string[];
  interests?: string[];
  country?: string;
  isStudent?: boolean;
  canTravel?: boolean;
  minDaysLeft?: number;
  maxDaysLeft?: number;
  cashOnly?: boolean;
  avoidGeneric?: boolean;
}

const SYNONYMS: Record<string, string[]> = {
  agents: ["agent", "agents", "agentic", "autonomous", "multi-agent", "langgraph", "crewai", "mcp"],
  zk: ["zk", "zero-knowledge", "zero knowledge", "privacy", "noir", "circuit", "aztec", "midnight"],
  defi: ["defi", "on-chain finance", "onchain finance", "trading", "perps", "dex", "liquidity", "lending", "finance"],
  trading: ["trading", "indicator", "backtest", "perps", "options", "market data", "alpha"],
  fintech: ["fintech", "payments", "payment", "merchant", "bookkeeping", "reconcil", "remittance", "stablecoin"],
  solidity: ["solidity", "evm", "smart contract", "base", "arbitrum", "monad", "ethereum"],
  rust: ["rust", "solana", "ink!", "substrate", "polkadot"],
  python: ["python", "ml", "machine learning", "kaggle", "pytorch"],
  vision: ["vision", "opencv", "image", "video", "camera"],
  health: ["health", "medical", "radiology", "genomic", "clinical", "disease"],
  climate: ["climate", "carbon", "energy", "sustainab"],
  security: ["security", "side-channel", "exploit", "audit", "devsecops"],
  africa: ["africa", "african", "nigeria", "lagos", "abuja", "kenya", "ghana"],
  voice: ["voice", "alexa", "speech", "audio"],
  hardware: ["hardware", "edge", "iot", "jetson", "raspberry", "arm"],
};

/** Each term becomes a group of words to look for; terms that land in the same group count once. */
function expandTerms(terms: string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const t of terms) {
    const k = t.toLowerCase().trim();
    if (!k) continue;
    const hit = SYNONYMS[k] ? [k, SYNONYMS[k]] as const : Object.entries(SYNONYMS).find(([, list]) => list.includes(k));
    const label = hit ? hit[0] : k;
    const words = hit ? [k, ...hit[1]] : [k];
    groups.set(label, Array.from(new Set([...(groups.get(label) ?? [label]), ...words])));
  }
  return [...groups.values()];
}

export interface Ranked {
  item: Opportunity;
  score: number;
  why: string[];
  watchOuts: string[];
  excludedBecause?: string;
}

export function rank(items: Opportunity[], p: BuilderProfile = {}): Ranked[] {
  const terms = expandTerms([...(p.skills ?? []), ...(p.interests ?? [])]);
  const minDays = p.minDaysLeft ?? 2;
  const out: Ranked[] = [];

  for (const o of items) {
    const why: string[] = [];
    const watch: string[] = [...o.redFlags];
    let score = 0;
    let excluded: string | undefined;

    if (!o.active) excluded = "deadline passed";
    if (o.daysLeft !== null && o.daysLeft < minDays) excluded ??= `only ${o.daysLeft} day(s) left`;
    if (p.maxDaysLeft !== undefined && o.daysLeft !== null && o.daysLeft > p.maxDaysLeft) excluded ??= `deadline is ${o.daysLeft} days away`;
    if (o.eligibility.studentsOnly && p.isStudent === false) excluded ??= "students only";
    if (o.eligibility.inPersonRequired && p.canTravel === false) excluded ??= "in-person only";
    if (o.eligibility.partnerOnly) excluded ??= "restricted to company partners";
    if (o.eligibility.regionLocked && p.country && !o.eligibility.regionLocked.toLowerCase().includes(p.country.toLowerCase())) {
      excluded ??= `limited to ${o.eligibility.regionLocked}`;
    }
    if (p.cashOnly && (o.prize.nonCash || !o.prize.usd)) excluded ??= "no confirmed cash prize";

    // Prize: log-scaled, 0..30
    if (o.prize.usd && o.prize.usd > 0) {
      const pts = Math.min(30, Math.max(0, (Math.log10(o.prize.usd) - 2.5) * 10));
      score += o.prize.nonCash ? pts * 0.4 : pts;
      why.push(`${o.prize.nonCash ? "~" : ""}$${o.prize.usd.toLocaleString("en-US")}${o.prize.nonCash ? " in credits/in-kind" : " prize"}`);
    }

    // Specificity: 0..20, minus generic penalty
    const spec = (1 - o.genericScore) * 20;
    score += spec;
    if (o.genericScore <= 0.35 && o.specificityHooks.length) why.push(`Specific brief (${o.specificityHooks.slice(0, 2).join("; ")})`);
    if (o.genericScore >= 0.6) {
      watch.push("Generic brief: expect many look-alike entries");
      if (p.avoidGeneric !== false) score -= 12;
    }

    // Runway: best between 5 and 30 days.
    if (o.daysLeft !== null) {
      if (o.daysLeft < 5) { score -= 8; watch.push(`Tight: ${o.daysLeft} day(s) left`); }
      else if (o.daysLeft <= 30) { score += 8; why.push(`${o.daysLeft} days of runway`); }
      else score += 4;
    } else {
      score += 4;
      why.push(`No fixed deadline${o.deadlineText ? ` (${o.deadlineText})` : ""}: apply when ready`);
    }
    if (o.prize.usd === null && o.prize.notes.some((n) => /^Paid in/.test(n))) {
      score += 8; // real money, just not convertible to a fixed USD figure
      why.push(o.prize.notes.find((n) => /^Paid in/.test(n))!.split(";")[0]);
    }

    // Access
    if (o.freeToEnter) score += 2;
    if (/online|remote|global/i.test(`${o.format} ${o.location}`)) score += 4;
    if (o.eligibility.hybrid) watch.push("Hybrid: some phases may be in person");
    if (o.eligibility.applicationGated) watch.push("Needs an application/approval first");
    if (o.eligibility.studentsOnly && p.isStudent === undefined) watch.push("Students only");
    if (o.eligibility.regionLocked && !p.country) watch.push(`Appears limited to ${o.eligibility.regionLocked}`);
    if (o.verified) score += 2;

    // Fit to the builder
    if (terms.length) {
      const hay = `${o.title} ${o.description ?? ""} ${o.organizer ?? ""} ${o.category ?? ""}`.toLowerCase();
      const matched = terms.filter((group) => group.some((w) => hay.includes(w))).map((g) => g[0]);
      if (matched.length) {
        score += Math.min(25, 9 * matched.length);
        why.unshift(`Matches your ${matched.join(", ")}`);
      } else score -= 6;
    }

    out.push({ item: o, score: Math.round(score * 10) / 10, why, watchOuts: Array.from(new Set(watch)), excludedBecause: excluded });
  }
  return out.sort((a, b) => b.score - a.score);
}
