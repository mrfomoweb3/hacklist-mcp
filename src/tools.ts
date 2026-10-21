import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HackListClient } from "./client.js";
import { clock, collapseDuplicates, rank, type BuilderProfile } from "./enrich.js";
import type { Opportunity } from "./types.js";

const READ_ONLY = { readOnlyHint: true, openWorldHint: true, idempotentHint: true, destructiveHint: false } as const;

/** Compact, model-friendly view of one listing. */
export function view(o: Opportunity, full = false) {
  const base: Record<string, unknown> = {
    id: o.id,
    title: o.title,
    kind: o.kind,
    organizer: o.organizer ?? null,
    verified: o.verified ?? false,
    hacklist_url: o.url,
    apply_url: o.applyUrl ?? null,
    deadline: o.deadline ?? (o.deadlineText && !o.deadline ? o.deadlineText : null),
    days_left: o.daysLeft,
    status: o.active ? (o.daysLeft === 0 ? "ends today" : o.daysLeft === null ? "open (no fixed deadline)" : "open") : "closed",
    prize: o.prizeText ?? null,
    prize_usd_estimate: o.prize.usd,
    prize_is_cash: o.prize.status === "stated" ? !o.prize.nonCash : null,
    category: o.category ?? null,
    format: o.format ?? o.location ?? null,
    free_to_enter: o.freeToEnter ?? null,
    posted_on_hacklist: o.listedAt ?? null,
    last_updated_on_hacklist: o.updatedAt ?? null,
    generic_score: o.genericScore,
  };
  if (o.redFlags.length) base.red_flags = o.redFlags;
  if (o.duplicateIds.length) base.duplicate_listings = o.duplicateIds;
  if (full) {
    base.description = o.description ?? null;
    base.location = o.location ?? null;
    base.subtype = o.subtype ?? null;
    base.duration = o.duration ?? null;
    base.eligibility = {
      students_only: o.eligibility.studentsOnly,
      region_locked: o.eligibility.regionLocked,
      in_person_required: o.eligibility.inPersonRequired,
      hybrid: o.eligibility.hybrid,
      application_or_approval_needed: o.eligibility.applicationGated,
      partners_only: o.eligibility.partnerOnly,
      team_size: o.eligibility.teamSize,
    };
    base.specificity_hooks = o.specificityHooks;
    base.prize_notes = o.prize.notes;
    base.date_note = o.listedAt
      ? "posted_on_hacklist is when the listing was created on HackList (from HackList's official feed)."
      : "No posted date is available for this listing; last_updated_on_hacklist is the sitemap's last-modified time, the closest public signal of when it was added or last edited.";
  } else if (o.description) {
    base.summary = o.description.length > 220 ? o.description.slice(0, 217).trimEnd() + "..." : o.description;
  }
  return base;
}

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (msg: string) => ({ content: [{ type: "text" as const, text: msg }], isError: true });

function textMatch(o: Opportunity, q: string): number {
  const words = q.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 1);
  if (!words.length) return 1;
  const title = o.title.toLowerCase();
  const hay = `${o.title} ${o.organizer ?? ""} ${o.description ?? ""} ${o.category ?? ""} ${o.prizeText ?? ""} ${o.location ?? ""}`.toLowerCase();
  let s = 0;
  for (const w of words) {
    if (title.includes(w)) s += 3;
    else if (hay.includes(w)) s += 1;
  }
  return s;
}

const kindEnum = z.enum(["hackathon", "program", "grant", "bounty", "job", "any"]);

export function registerTools(server: McpServer, client: HackListClient) {
  /* ---------------------------------------------------------------- */
  server.registerTool(
    "search_opportunities",
    {
      title: "Search HackList",
      description:
        "Search and filter HackList's AI & Web3 hackathons, grants, bounties and programs. Filters by keyword, type, category, format, prize, how soon it closes and how recently it was posted or updated. Duplicate listings of the same event are collapsed by default. Use get_opportunity for the full brief and eligibility details of a result.",
      inputSchema: {
        query: z.string().optional().describe("Keywords, e.g. 'zk privacy', 'trading bot', 'Solana', 'computer vision'."),
        kind: kindEnum.default("any"),
        category: z.enum(["ai", "web3", "any"]).default("any"),
        format: z.enum(["online", "in-person", "hybrid", "any"]).default("any"),
        free_only: z.boolean().default(false),
        min_prize_usd: z.number().min(0).optional().describe("Minimum headline prize in USD (approximate conversion for other currencies)."),
        cash_only: z.boolean().default(false).describe("Exclude rewards that are mostly credits or in-kind."),
        closes_within_days: z.number().int().min(0).optional(),
        updated_within_days: z.number().int().min(0).optional().describe("Only listings posted or updated on HackList in the last N days."),
        include_closed: z.boolean().default(false).describe("Also search past listings from HackList's archive (slower the first time)."),
        collapse_duplicates: z.boolean().default(true),
        sort: z.enum(["relevance", "deadline", "prize", "newest"]).default("relevance"),
        limit: z.number().int().min(1).max(50).default(10),
      },
      annotations: { ...READ_ONLY, title: "Search HackList" },
    },
    async (a) => {
      try {
        const snap = await client.snapshotNow({ includeArchive: a.include_closed });
        let items = snap.items.filter((o) => a.include_closed || o.active);
        if (a.collapse_duplicates) items = collapseDuplicates(items);
        if (a.kind !== "any") items = items.filter((o) => o.kind === a.kind);
        if (a.category !== "any") {
          items = items.filter((o) => {
            const c = `${o.category ?? ""} ${(o.tags ?? []).join(" ")}`.toLowerCase();
            return c.includes(a.category) || c.includes("both") || c.includes("+");
          });
        }
        if (a.format !== "any") {
          items = items.filter((o) => {
            const f = `${o.format ?? ""} ${o.location ?? ""}`.toLowerCase();
            if (a.format === "online") return /online|remote|global|virtual/.test(f) && !/in-?person only/.test(f);
            if (a.format === "hybrid") return /hybrid/.test(f);
            return /in-?person|on-?site|hybrid/.test(f);
          });
        }
        if (a.free_only) items = items.filter((o) => o.freeToEnter !== false);
        if (a.min_prize_usd !== undefined) items = items.filter((o) => (o.prize.usd ?? 0) >= a.min_prize_usd!);
        if (a.cash_only) items = items.filter((o) => o.prize.usd && !o.prize.nonCash);
        if (a.closes_within_days !== undefined) items = items.filter((o) => o.daysLeft !== null && o.daysLeft <= a.closes_within_days!);
        if (a.updated_within_days !== undefined) {
          const cutoff = clock().getTime() - a.updated_within_days * 86_400_000;
          items = items.filter((o) => {
            const t = Date.parse(o.listedAt ?? o.updatedAt ?? "");
            return Number.isFinite(t) && t >= cutoff;
          });
        }
        const q = a.query?.trim();
        let scored = items.map((o) => ({ o, s: q ? textMatch(o, q) : 1 }));
        if (q) scored = scored.filter((x) => x.s > 0);
        const byDeadline = (x: Opportunity, y: Opportunity) => (x.daysLeft ?? 9999) - (y.daysLeft ?? 9999);
        const sorters: Record<string, (x: { o: Opportunity; s: number }, y: { o: Opportunity; s: number }) => number> = {
          relevance: (x, y) => y.s - x.s || byDeadline(x.o, y.o),
          deadline: (x, y) => byDeadline(x.o, y.o),
          prize: (x, y) => (y.o.prize.usd ?? -1) - (x.o.prize.usd ?? -1),
          newest: (x, y) => (y.o.listedAt ?? y.o.updatedAt ?? "").localeCompare(x.o.listedAt ?? x.o.updatedAt ?? ""),
        };
        scored.sort(sorters[a.sort]);
        return json({
          total_matches: scored.length,
          showing: Math.min(scored.length, a.limit),
          data_as_of: snap.sourceGeneratedAt ?? snap.fetchedAt,
          data_source: snap.source,
          results: scored.slice(0, a.limit).map((x) => view(x.o)),
        });
      } catch (e) {
        return fail(`Could not load HackList: ${(e as Error).message}`);
      }
    },
  );

  /* ---------------------------------------------------------------- */
  server.registerTool(
    "get_opportunity",
    {
      title: "Get HackList listing",
      description:
        "Full details for one HackList listing: brief, prize (with USD estimate and cash vs credits), deadline and days left, when it was posted/updated on HackList, apply link, eligibility traps (students only, region-locked, in-person, approval needed) and duplicate listings. Accepts a HackList URL, an id, or a title.",
      inputSchema: { ref: z.string().min(2).describe("HackList URL, listing id, or title (e.g. 'Qloo Agentic Hackathon').") },
      annotations: { ...READ_ONLY, title: "Get HackList listing" },
    },
    async ({ ref }) => {
      try {
        const o = await client.find(ref);
        if (!o) return fail(`No HackList listing matched "${ref}". Try search_opportunities with a keyword.`);
        return json(view(o, true));
      } catch (e) {
        return fail(`Could not load HackList: ${(e as Error).message}`);
      }
    },
  );

  /* ---------------------------------------------------------------- */
  server.registerTool(
    "best_opportunities",
    {
      title: "Rank the best non-generic opportunities",
      description:
        "Ranks open HackList opportunities for a specific builder and explains each pick. Favours specific briefs (a named API, dataset, metric or protocol) over generic 'build anything with AI' events, weighs prize size and whether it is real cash, deadline runway and accessibility, collapses duplicate listings, and drops events the builder can't enter (students only, region-locked, in-person, partners only). Returns why each one ranks and what to watch out for.",
      inputSchema: {
        skills: z.array(z.string()).optional().describe("e.g. ['solidity', 'python', 'langgraph', 'zk']"),
        interests: z.array(z.string()).optional().describe("e.g. ['agents', 'defi', 'fintech', 'africa']"),
        country: z.string().optional().describe("Where the builder is based, for region-locked events."),
        is_student: z.boolean().optional(),
        can_travel: z.boolean().optional().describe("false = drop in-person-only events."),
        cash_only: z.boolean().default(false),
        min_days_left: z.number().int().min(0).default(2),
        max_days_left: z.number().int().min(1).optional(),
        kind: kindEnum.default("hackathon"),
        include_generic: z.boolean().default(false).describe("Set true to stop down-ranking generic briefs."),
        limit: z.number().int().min(1).max(25).default(8),
      },
      annotations: { ...READ_ONLY, title: "Rank the best opportunities" },
    },
    async (a) => {
      try {
        const snap = await client.snapshotNow();
        let items = collapseDuplicates(snap.items.filter((o) => o.active));
        if (a.kind !== "any") items = items.filter((o) => o.kind === a.kind);
        const profile: BuilderProfile = {
          skills: a.skills, interests: a.interests, country: a.country, isStudent: a.is_student, canTravel: a.can_travel,
          cashOnly: a.cash_only, minDaysLeft: a.min_days_left, maxDaysLeft: a.max_days_left, avoidGeneric: !a.include_generic,
        };
        const ranked = rank(items, profile);
        const eligible = ranked.filter((r) => !r.excludedBecause);
        const skipped = ranked.filter((r) => r.excludedBecause);
        const skipCounts: Record<string, number> = {};
        for (const s of skipped) {
          const k = s.excludedBecause!.replace(/\d+/g, "N");
          skipCounts[k] = (skipCounts[k] ?? 0) + 1;
        }
        return json({
          data_as_of: snap.sourceGeneratedAt ?? snap.fetchedAt,
          data_source: snap.source,
          considered: items.length,
          ranking_method:
            "Score = prize (log-scaled, credits discounted) + brief specificity - generic-brief penalty + deadline runway (5-30 days best) + online/free/verified + fit to your skills and interests. Ineligible events are removed, not just down-ranked.",
          picks: eligible.slice(0, a.limit).map((r, i) => ({
            rank: i + 1,
            score: r.score,
            ...view(r.item),
            why: r.why,
            watch_outs: r.watchOuts,
          })),
          filtered_out: skipCounts,
        });
      } catch (e) {
        return fail(`Could not load HackList: ${(e as Error).message}`);
      }
    },
  );

  /* ---------------------------------------------------------------- */
  server.registerTool(
    "whats_new",
    {
      title: "New on HackList",
      description:
        "Listings posted or updated on HackList in the last N days, newest first. Useful for 'what got added this week'. Uses HackList's own posted date when the site exposes it, otherwise its sitemap last-modified time.",
      inputSchema: {
        days: z.number().int().min(1).max(90).default(7),
        open_only: z.boolean().default(true),
        limit: z.number().int().min(1).max(50).default(15),
      },
      annotations: { ...READ_ONLY, title: "New on HackList" },
    },
    async ({ days, open_only, limit }) => {
      try {
        const snap = await client.snapshotNow();
        const cutoff = clock().getTime() - days * 86_400_000;
        const stamp = (o: Opportunity) => Date.parse(o.listedAt ?? o.updatedAt ?? "");
        const items = collapseDuplicates(snap.items)
          .filter((o) => (!open_only || o.active) && Number.isFinite(stamp(o)) && stamp(o) >= cutoff)
          .sort((x, y) => stamp(y) - stamp(x));
        const undated = snap.items.filter((o) => !o.listedAt && !o.updatedAt && o.active).length;
        return json({
          data_as_of: snap.sourceGeneratedAt ?? snap.fetchedAt,
          data_source: snap.source,
          window_days: days,
          count: items.length,
          note: undated ? `${undated} open listing(s) have no posted date and can't appear here.` : undefined,
          results: items.slice(0, limit).map((o) => view(o)),
        });
      } catch (e) {
        return fail(`Could not load HackList: ${(e as Error).message}`);
      }
    },
  );

  /* ---------------------------------------------------------------- */
  server.registerTool(
    "closing_soon",
    {
      title: "Closing soon on HackList",
      description: "Open listings whose deadline is within N days, soonest first, with the prize and whether it's worth a sprint.",
      inputSchema: {
        days: z.number().int().min(0).max(60).default(7),
        min_prize_usd: z.number().min(0).optional(),
        limit: z.number().int().min(1).max(50).default(15),
      },
      annotations: { ...READ_ONLY, title: "Closing soon" },
    },
    async ({ days, min_prize_usd, limit }) => {
      try {
        const snap = await client.snapshotNow();
        const items = collapseDuplicates(snap.items)
          .filter((o) => o.active && o.daysLeft !== null && o.daysLeft <= days)
          .filter((o) => min_prize_usd === undefined || (o.prize.usd ?? 0) >= min_prize_usd)
          .sort((x, y) => (x.daysLeft ?? 0) - (y.daysLeft ?? 0) || (y.prize.usd ?? 0) - (x.prize.usd ?? 0));
        return json({ data_as_of: snap.sourceGeneratedAt ?? snap.fetchedAt,
          data_source: snap.source, count: items.length, results: items.slice(0, limit).map((o) => view(o)) });
      } catch (e) {
        return fail(`Could not load HackList: ${(e as Error).message}`);
      }
    },
  );

  /* ---------------------------------------------------------------- */
  server.registerTool(
    "hacklist_overview",
    {
      title: "HackList overview",
      description:
        "A snapshot of HackList right now: how many open listings by type and category, total listed prize money, the biggest prizes, duplicate listings found, and how fresh/complete this server's data is. Pass refresh=true to re-fetch.",
      inputSchema: { refresh: z.boolean().default(false) },
      annotations: { ...READ_ONLY, title: "HackList overview" },
    },
    async ({ refresh }) => {
      try {
        const snap = await client.snapshotNow({ force: refresh });
        const open = snap.items.filter((o) => o.active);
        const unique = collapseDuplicates(open);
        const count = (f: (o: Opportunity) => string) => unique.reduce<Record<string, number>>((m, o) => ((m[f(o)] = (m[f(o)] ?? 0) + 1), m), {});
        const cashTotal = unique.filter((o) => o.prize.usd && !o.prize.nonCash).reduce((s, o) => s + (o.prize.usd ?? 0), 0);
        return json({
          data_as_of: snap.sourceGeneratedAt ?? snap.fetchedAt,
          data_source: snap.source,
          hacklist_says_open: snap.siteActiveCount,
          no_fixed_deadline: unique.filter((o) => o.daysLeft === null).length,
          open_listings_loaded: open.length,
          open_after_collapsing_duplicates: unique.length,
          by_kind: count((o) => o.kind),
          by_category: count((o) => o.category ?? "unknown"),
          approx_cash_prize_total_usd: Math.round(cashTotal),
          biggest_prizes: [...unique].sort((x, y) => (y.prize.usd ?? 0) - (x.prize.usd ?? 0)).slice(0, 5).map((o) => ({ title: o.title, prize: o.prizeText, deadline: o.deadline, id: o.id })),
          duplicate_groups: open.filter((o) => o.duplicateIds.length).length,
          coverage: snap.coverage,
        });
      } catch (e) {
        return fail(`Could not load HackList: ${(e as Error).message}`);
      }
    },
  );

  /* ---------------------------------------------------------------- */
  /* ChatGPT connectors / deep research expect exactly `search` + `fetch`. */
  server.registerTool(
    "search",
    {
      title: "Search HackList (connector)",
      description:
        "Search open HackList hackathons, grants and programs by keyword. Returns ids to pass to fetch. (Compatibility tool for ChatGPT connectors and deep research.)",
      inputSchema: { query: z.string().describe("Search keywords") },
      annotations: { ...READ_ONLY, title: "Search HackList" },
    },
    async ({ query }) => {
      try {
        const snap = await client.snapshotNow();
        const items = collapseDuplicates(snap.items.filter((o) => o.active))
          .map((o) => ({ o, s: textMatch(o, query) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s || (a.o.daysLeft ?? 999) - (b.o.daysLeft ?? 999))
          .slice(0, 20);
        return json({ results: items.map(({ o }) => ({ id: o.id, title: o.title, url: o.url })) });
      } catch (e) {
        return fail(`Could not load HackList: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch HackList listing (connector)",
      description: "Fetch the full HackList listing for an id returned by search. (Compatibility tool for ChatGPT connectors and deep research.)",
      inputSchema: { id: z.string().describe("Listing id from search") },
      annotations: { ...READ_ONLY, title: "Fetch HackList listing" },
    },
    async ({ id }) => {
      try {
        const o = await client.find(id);
        if (!o) return fail(`No HackList listing with id ${id}`);
        const v = view(o, true);
        const text = [
          `${o.title}${o.organizer ? ` by ${o.organizer}` : ""}`,
          `Type: ${o.kind}${o.subtype ? ` (${o.subtype})` : ""} | Category: ${o.category ?? "n/a"} | Format: ${o.format ?? o.location ?? "n/a"}`,
          `Prize: ${o.prizeText ?? "not stated"}${o.prize.usd ? ` (~$${o.prize.usd.toLocaleString("en-US")}${o.prize.nonCash ? ", mostly non-cash" : ""})` : ""}`,
          `Deadline: ${o.deadline ?? o.deadlineText ?? "none (rolling)"}${o.daysLeft !== null ? ` (${o.daysLeft} days left)` : ""}`,
          `Posted on HackList: ${o.listedAt ?? "not shown"} | Last updated: ${o.updatedAt ?? "n/a"}`,
          `Apply: ${o.applyUrl ?? o.url}`,
          "",
          o.description ?? "",
        ].join("\n");
        return json({ id: o.id, title: o.title, text, url: o.url, metadata: v });
      } catch (e) {
        return fail(`Could not load HackList: ${(e as Error).message}`);
      }
    },
  );
}
