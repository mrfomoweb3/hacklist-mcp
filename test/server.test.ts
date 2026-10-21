process.env.HACKLIST_NOW = "2026-10-15T12:00:00Z";

import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HackListClient } from "../src/client.js";
import { registerTools } from "../src/tools.js";
import { extractFlightObjects, flightToRaw, parseDetailPage, parseFeed, parseListingPage, parseSitemap, toIsoDate } from "../src/parse.js";
import { enrichAll, parsePrize } from "../src/enrich.js";
import { CARDS, FEED_GRANT, detailHtml, fakeFetch, fakeFetchWithFeed, feedJson, homepageHtml, sitemapXml } from "./fixtures.js";

/* ---------------- parsing ---------------- */

test("dates", () => {
  assert.equal(toIsoDate("Oct 5, 2026"), "2026-10-05");
  assert.equal(toIsoDate("Sept 30, 2026"), "2026-09-30");
  assert.equal(toIsoDate("2 days left"), undefined);
});

test("listing cards parse every field", () => {
  const { cards, totalShown } = parseListingPage(homepageHtml());
  assert.equal(totalShown, 18);
  assert.equal(cards.length, CARDS.length);
  const qloo = cards.find((c) => c.title === "Qloo Agentic Hackathon")!;
  assert.equal(qloo.organizer, "Qloo");
  assert.equal(qloo.verified, true);
  assert.equal(qloo.prizeText, "$25,000 cash");
  assert.equal(qloo.prizeLabel, "Total prizes");
  assert.equal(qloo.deadline, "2026-10-30");
  assert.equal(qloo.location, "Online");
  assert.equal(qloo.freeToEnter, true);
  assert.match(qloo.description!, /taste graph API/);
  const nea = cards.find((c) => c.kind === "program")!;
  assert.equal(nea.subtype, "Fellowship");
  assert.equal(nea.prizeLabel, "Stipend");
  const soso = cards.find((c) => c.title.includes("SoSoValue"))!;
  assert.equal(soso.verified, false);
  assert.equal(soso.organizer, "SoSoValue");
});

test("detail page parses labels, about and apply link", () => {
  const html = detailHtml({ kind: "hackathon", id: "15a10c51-6785-4e91-810e-1eea545efabe", title: "Qloo Agentic Hackathon", org: "Qloo",
    desc: "Build agentic tools with Qloo's taste graph API.", prize: "$25,000 cash", deadline: "Oct 30, 2026", apply: "https://qloo.devpost.com/" });
  const d = parseDetailPage(html, "hackathon", "15a10c51-6785-4e91-810e-1eea545efabe");
  assert.equal(d.title, "Qloo Agentic Hackathon");
  assert.equal(d.organizer, "Qloo");
  assert.equal(d.verified, true);
  assert.equal(d.prizeText, "$25,000 cash");
  assert.equal(d.deadline, "2026-10-30");
  assert.equal(d.format, "Online");
  assert.equal(d.applyUrl, "https://qloo.devpost.com/");
  assert.match(d.description!, /taste graph/);
});

test("glued 'OrgVerified' token (as the live page renders it) is split", () => {
  const html = `<html><body><main><span>QlooVerified</span><h1>Qloo Agentic Hackathon</h1><p>Prize Pool</p><p>$25,000 cash</p></main></body></html>`;
  const d = parseDetailPage(html, "hackathon", "15a10c51-6785-4e91-810e-1eea545efabe");
  assert.equal(d.organizer, "Qloo");
  assert.equal(d.verified, true);
});

test("sitemap", () => {
  const s = parseSitemap(sitemapXml());
  assert.ok(s.length > 10);
  assert.ok(s.every((e) => e.kind === "hackathon"));
  assert.ok(s.find((e) => e.lastmod === "2026-06-04T15:07:37.326Z"));
});

test("Next.js flight payload yields full rows with created_at", () => {
  const row = { id: "15a10c51-6785-4e91-810e-1eea545efabe", title: "Qloo Agentic Hackathon", type: "hackathon", organizer: "Qloo", prize: "$25,000 cash", deadline: "2026-10-30T23:59:00Z", apply_url: "https://qloo.devpost.com/", created_at: "2026-09-04T11:22:00Z" };
  const chunk = `0:["$","div",null,{"items":[${JSON.stringify(row)}]}]`;
  const html = `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`;
  const objs = extractFlightObjects(html);
  assert.equal(objs.length, 1);
  const raw = flightToRaw(objs[0])!;
  assert.equal(raw.listedAt, "2026-09-04T11:22:00Z");
  assert.equal(raw.deadline, "2026-10-30");
  assert.equal(raw.applyUrl, "https://qloo.devpost.com/");
});

/* ---------------- enrichment ---------------- */

test("prize parsing handles currencies, credits and empties", () => {
  assert.equal(parsePrize("$138,000 cash").usd, 138000);
  assert.equal(parsePrize("4,000 USDT").usd, 4000);
  assert.equal(parsePrize("$1,000,000 cash prize pool").usd, 1_000_000);
  const inr = parsePrize("₹7,50,000 total cash prizes (3 × ₹2,50,000)");
  assert.ok(inr.usd! > 8000 && inr.usd! < 10000, `INR converted: ${inr.usd}`);
  const credits = parsePrize("$1,600 in Backboard.io platform credits (not cash, requires active $5/mo Backboard subscription to redeem) + up to $1,000 in a discretionary cash seed fund");
  assert.equal(credits.usd, 1000, "headline should be the cash part");
  assert.ok(credits.notes.some((n) => /subscription/.test(n)));
  assert.equal(parsePrize("None — community recognition").status, "none");
  assert.equal(parsePrize("Not specified").status, "unspecified");
  assert.equal(parsePrize("Stipend provided").usd, null);
});

test("eligibility traps, duplicates and specificity", () => {
  const raws = parseListingPage(homepageHtml()).cards;
  const items = enrichAll(raws);
  const by = (t: string) => items.find((o) => o.title.includes(t))!;
  assert.equal(by("Kompact").eligibility.regionLocked, "India");
  assert.equal(by("Kompact").eligibility.studentsOnly, false, "students AND professionals");
  assert.equal(by("NEA").eligibility.studentsOnly, true);
  assert.equal(by("Arm +").eligibility.inPersonRequired, true);
  assert.equal(by("AWS Communication").eligibility.partnerOnly, true);
  assert.equal(by("Meta Global").eligibility.applicationGated, true);
  assert.equal(by("Kompact").daysLeft, 0);
  // Amazon and GenAI Works are each listed twice on HackList.
  const amazon = items.filter((o) => o.title.startsWith("Build, Ship, Shape"));
  assert.equal(amazon[0].duplicateIds.length, 1);
  const genai = items.filter((o) => o.title === "Open Agent Hackathon 2026");
  assert.equal(genai[0].duplicateIds.length, 1, "same event, different deadlines listed (Oct 20 vs 27)? should still match within window");
  // Specific vs generic
  assert.ok(by("RSNA").genericScore < by("Apps Built With AI").genericScore, "Kaggle MRI brief is more specific than a no-code build-a-thon");
  assert.ok(by("Apps Built With AI").genericScore >= 0.6, `no-code build-a-thon is generic (${by("Apps Built With AI").genericScore})`);
});

/* ---------------- MCP end-to-end ---------------- */

async function connect(mode: "pages" | "feed" | "brokenFeed" = "pages") {
  const log: string[] = [];
  const fetchImpl = mode === "pages" ? fakeFetch({ log }) : fakeFetchWithFeed({ log, brokenFeed: mode === "brokenFeed" });
  const data = new HackListClient({ fetchImpl, cacheDir: null, log: () => {} });
  const server = new McpServer({ name: "hacklist", version: "test" });
  registerTools(server, data);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r: any = await client.callTool({ name, arguments: args });
    assert.ok(!r.isError, `${name} errored: ${r.content?.[0]?.text}`);
    return JSON.parse(r.content[0].text);
  };
  return { client, call, log };
}

test("tool list", async () => {
  const { client } = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["best_opportunities", "closing_soon", "fetch", "get_opportunity", "hacklist_overview", "search", "search_opportunities", "whats_new"]);
  assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true));
});

test("search_opportunities: keyword, dedupe, sitemap-only listing, closed excluded", async () => {
  const { call } = await connect();
  const r = await call("search_opportunities", { query: "amazon" });
  assert.equal(r.results.filter((x: any) => x.title.startsWith("Build, Ship, Shape")).length, 1, "two Amazon listings collapsed into one");
  assert.equal(r.results.find((x: any) => x.title.startsWith("Build, Ship, Shape")).duplicate_listings.length, 1);
  const sc = await call("search_opportunities", { query: "side-channel" });
  assert.equal(sc.results[0].title, "RP2350 Hacking Challenge 2", "found via sitemap + detail page");
  assert.ok(sc.results[0].last_updated_on_hacklist);
  const old = await call("search_opportunities", { query: "solana" });
  assert.equal(old.total_matches, 0, "closed listing hidden by default");
  const withClosed = await call("search_opportunities", { query: "solana", include_closed: true });
  assert.equal(withClosed.results[0].status, "closed");
  const big = await call("search_opportunities", { min_prize_usd: 50000, sort: "prize" });
  assert.equal(big.results[0].title, "Meta Global AI Developer Hackathon");
  const cash = await call("search_opportunities", { cash_only: true, query: "galuxium" });
  assert.equal(cash.total_matches, 1, "Galuxium's $1k cash seed fund still counts as cash");
});

test("get_opportunity by title and URL, with dates and eligibility", async () => {
  const { call } = await connect();
  const q = await call("get_opportunity", { ref: "qloo" });
  assert.equal(q.title, "Qloo Agentic Hackathon");
  assert.equal(q.apply_url, "https://qloo.devpost.com/");
  assert.equal(q.last_updated_on_hacklist, "2026-09-05T08:00:00.000Z");
  assert.equal(q.days_left, 15);
  assert.match(q.date_note, /sitemap/);
  const nea = await call("get_opportunity", { ref: "https://hacklist.io/program/4adf8c01-5cc2-476b-bfe4-0adff2299c0b" });
  assert.equal(nea.eligibility.students_only, true);
  assert.equal(nea.eligibility.region_locked, "United States");
});

test("best_opportunities: removes what you can't enter, explains picks", async () => {
  const { call } = await connect();
  const r = await call("best_opportunities", {
    skills: ["solidity", "python", "langgraph", "zk"], interests: ["agents", "defi", "trading"],
    country: "Nigeria", is_student: false, can_travel: false, limit: 6,
  });
  const titles = r.picks.map((p: any) => p.title);
  assert.ok(!titles.some((t: string) => /Kompact|NEA|Arm \+|AWS Communication/.test(t)), `ineligible leaked: ${titles}`);
  assert.ok(r.picks.every((p: any) => p.why.length > 0));
  assert.ok(r.filtered_out["limited to India"] || r.filtered_out["only N day(s) left"]);
  const apps = r.picks.findIndex((p: any) => p.title.startsWith("Apps Built With AI"));
  assert.equal(apps, -1, "generic no-code build-a-thon should not make a top-6 for this builder");
  assert.ok(titles.includes("Qloo Agentic Hackathon") || titles.includes("2026 Unusual Whales Hackathon"), titles.join(" | "));
});

test("whats_new, closing_soon, overview, ChatGPT search/fetch", async () => {
  const { call } = await connect();
  const n = await call("whats_new", { days: 3 });
  assert.equal(n.results[0].title, "2026 Unusual Whales Hackathon");
  const c = await call("closing_soon", { days: 2 });
  assert.ok(c.results.every((x: any) => x.days_left <= 2));
  const o = await call("hacklist_overview");
  assert.equal(o.hacklist_says_open, 18);
  assert.ok(o.duplicate_groups >= 2);
  const s = await call("search", { query: "zero-knowledge privacy" });
  assert.equal(s.results[0].title, "Midnight: Build Privacy-First Apps — Wave 2");
  const f = await call("fetch", { id: s.results[0].id });
  assert.match(f.text, /Deadline: 2026-10-17 \(2 days left\)/);
  assert.equal(f.url, "https://hacklist.io/hackathon/9270c985-e2e3-4879-a003-a6a9e397b49a");
});

test("snapshot is cached between calls", async () => {
  const { call, log } = await connect();
  await call("search_opportunities", {});
  const n = log.length;
  await call("closing_soon", {});
  await call("whats_new", {});
  assert.equal(log.length, n, "no extra HTTP requests within TTL");
});

/* ---------------- official feed ---------------- */

test("parseFeed maps the v1 shape", () => {
  const f = parseFeed(feedJson());
  assert.equal(f.version, 1);
  assert.equal(f.count, CARDS.length + 1);
  assert.equal(f.items.length, CARDS.length + 1);
  const grant = f.items.find((o) => o.id === FEED_GRANT.id)!;
  assert.equal(grant.kind, "grant");
  assert.equal(grant.deadline, undefined);
  assert.equal(grant.deadlineText, "Rolling");
  assert.equal(grant.listedAt, FEED_GRANT.created_at);
  const nea = f.items.find((o) => o.kind === "program")!;
  assert.equal(nea.prizeText, undefined, "null prize stays empty");
  assert.equal(nea.prizeLabel, "Stipend");
  // Long-form month in deadline_text only
  const one = parseFeed(JSON.stringify({ items: [{ id: FEED_GRANT.id, title: "X", type: "program", deadline: null, deadline_text: "October 25, 2026" }] }));
  assert.equal(one.items[0].deadline, "2026-10-25");
});

test("feed is used first: one request, real posted dates, no page scraping", async () => {
  const { call, log } = await connect("feed");
  const o = await call("hacklist_overview");
  assert.equal(o.data_source, "feed");
  assert.equal(o.data_as_of, "2026-10-15T06:00:00.000Z");
  assert.ok(o.no_fixed_deadline >= 1);
  const q = await call("get_opportunity", { ref: "qloo" });
  assert.match(q.posted_on_hacklist, /^2026-09-/);
  assert.match(q.date_note, /official feed/);
  assert.deepEqual(log, ["/api/opportunities"], `only the feed should be fetched, got ${log.join(", ")}`);
});

test("feed: rolling grant is open, findable and ranked; whats_new uses created_at", async () => {
  const { call } = await connect("feed");
  const g = await call("search_opportunities", { query: "base grants", kind: "grant" });
  assert.equal(g.results[0].title, "Base Builder Grants");
  assert.equal(g.results[0].deadline, "Rolling");
  assert.equal(g.results[0].status, "open (no fixed deadline)");
  const n = await call("whats_new", { days: 3 });
  assert.deepEqual(n.results.map((r: any) => r.title), ["Base Builder Grants", "2026 Unusual Whales Hackathon"]);
  const b = await call("best_opportunities", { kind: "any", interests: ["solidity"], country: "Nigeria", is_student: false, can_travel: false });
  assert.ok(b.picks.some((p: any) => p.title === "Base Builder Grants"));
  const f = await call("fetch", { id: FEED_GRANT.id });
  assert.match(f.text, /Deadline: Rolling/);
  assert.match(f.text, /Posted on HackList: 2026-10-19/);
});

test("broken feed falls back to scraping pages", async () => {
  const { call, log } = await connect("brokenFeed");
  const o = await call("hacklist_overview");
  assert.equal(o.data_source, "pages");
  assert.ok(log.includes("/") && log.includes("/sitemap.xml"));
  const q = await call("get_opportunity", { ref: "qloo" });
  assert.equal(q.apply_url, "https://qloo.devpost.com/");
});

test("feed + include_closed pulls closed listings from the sitemap", async () => {
  const { call } = await connect("feed");
  const r = await call("search_opportunities", { query: "solana", include_closed: true });
  assert.equal(r.results[0].status, "closed");
});
