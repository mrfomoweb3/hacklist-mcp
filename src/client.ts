import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  BASE_URL, extractFlightObjects, flightToRaw, mergeRaw, parseDetailPage, parseFeed, parseHackListPath, parseListingPage, parseSitemap,
} from "./parse.js";
import { enrichAll } from "./enrich.js";
import type { Kind, Opportunity, RawOpportunity } from "./types.js";

const UA = "hacklist-mcp/0.2 (MCP server for AI assistants)";

export interface ClientOptions {
  baseUrl?: string;
  /** Official JSON feed. Path or full URL; set to null to skip it and scrape pages. */
  feedUrl?: string | null;
  /** How long the listing snapshot stays fresh. */
  listTtlMs?: number;
  /** How long a parsed detail page stays fresh. */
  detailTtlMs?: number;
  concurrency?: number;
  /** Where to persist detail pages between restarts. Set to null to disable. */
  cacheDir?: string | null;
  /** Max detail pages fetched per refresh (politeness cap). */
  maxDetailFetches?: number;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

interface DetailCacheEntry { at: number; raw: RawOpportunity | null }

export interface Snapshot {
  fetchedAt: string;
  items: Opportunity[];
  /** What HackList says it has open (feed count, or the homepage counter). */
  siteActiveCount: number | null;
  /** "feed" when the official JSON feed was used, "pages" when we fell back to scraping. */
  source: "feed" | "pages";
  /** When HackList generated the feed, if known. */
  sourceGeneratedAt: string | null;
  coverage: string[];
}

export class HackListClient {
  private opts: Required<Omit<ClientOptions, "fetchImpl" | "log" | "cacheDir" | "feedUrl">> & { cacheDir: string | null; feedUrl: string | null };
  private fetchImpl: typeof fetch;
  private log: (m: string) => void;
  private snapshot: Snapshot | null = null;
  private inflight: Promise<Snapshot> | null = null;
  private details = new Map<string, DetailCacheEntry>();
  private diskLoaded = false;

  constructor(o: ClientOptions = {}) {
    this.opts = {
      baseUrl: (o.baseUrl ?? process.env.HACKLIST_BASE_URL ?? BASE_URL).replace(/\/$/, ""),
      feedUrl: o.feedUrl === undefined ? (process.env.HACKLIST_FEED_URL ?? "/api/opportunities") : o.feedUrl,
      listTtlMs: o.listTtlMs ?? Number(process.env.HACKLIST_LIST_TTL_MS ?? 20 * 60_000),
      detailTtlMs: o.detailTtlMs ?? 12 * 3_600_000,
      concurrency: o.concurrency ?? 4,
      cacheDir: o.cacheDir === undefined ? (process.env.HACKLIST_CACHE_DIR ?? join(homedir(), ".cache", "hacklist-mcp")) : o.cacheDir,
      maxDetailFetches: o.maxDetailFetches ?? Number(process.env.HACKLIST_MAX_DETAIL_FETCHES ?? 260),
    };
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.log = o.log ?? ((m) => process.stderr.write(`[hacklist-mcp] ${m}\n`));
  }

  private async get(path: string, accept = "text/html,application/xml;q=0.9,*/*;q=0.8"): Promise<string> {
    const url = path.startsWith("http") ? path : `${this.opts.baseUrl}${path}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.fetchImpl(url, {
          headers: { "user-agent": UA, accept },
          signal: AbortSignal.timeout(20_000),
        });
        if (res.status === 404) throw Object.assign(new Error(`Not found: ${url}`), { status: 404 });
        if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status} from ${url}`);
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} from ${url}`), { status: res.status });
        return await res.text();
      } catch (e: any) {
        lastErr = e;
        if (e?.status && e.status < 500 && e.status !== 429) break;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1) ** 2));
      }
    }
    throw lastErr;
  }

  /* ---------------- disk cache ---------------- */

  private get cacheFile() {
    return this.opts.cacheDir ? join(this.opts.cacheDir, "details.json") : null;
  }

  private async loadDisk() {
    if (this.diskLoaded || !this.cacheFile) return;
    this.diskLoaded = true;
    try {
      const data = JSON.parse(await readFile(this.cacheFile, "utf8")) as Record<string, DetailCacheEntry>;
      for (const [k, v] of Object.entries(data)) this.details.set(k, v);
    } catch { /* no cache yet */ }
  }

  private async saveDisk() {
    if (!this.cacheFile || !this.opts.cacheDir) return;
    try {
      await mkdir(this.opts.cacheDir, { recursive: true });
      await writeFile(this.cacheFile, JSON.stringify(Object.fromEntries(this.details)), "utf8");
    } catch (e) {
      this.log(`could not write cache: ${(e as Error).message}`);
    }
  }

  /* ---------------- detail pages ---------------- */

  async fetchDetail(kind: Kind, id: string, force = false): Promise<RawOpportunity | null> {
    await this.loadDisk();
    const key = `${kind}/${id}`;
    const hit = this.details.get(key);
    if (!force && hit && Date.now() - hit.at < this.opts.detailTtlMs) return hit.raw;
    try {
      const html = await this.get(`/${kind}/${id}`);
      const raw = parseDetailPage(html, kind, id);
      this.details.set(key, { at: Date.now(), raw });
      return raw;
    } catch (e: any) {
      if (e?.status === 404) { this.details.set(key, { at: Date.now(), raw: null }); return null; }
      if (hit) return hit.raw; // stale is better than nothing
      throw e;
    }
  }

  private async pool<T>(items: T[], fn: (t: T) => Promise<void>) {
    let i = 0;
    const workers = Array.from({ length: Math.min(this.opts.concurrency, items.length) }, async () => {
      while (i < items.length) {
        const t = items[i++];
        try { await fn(t); } catch (e) { this.log(`skip: ${(e as Error).message}`); }
      }
    });
    await Promise.all(workers);
  }

  /* ---------------- full snapshot ---------------- */

  async snapshotNow(opts: { force?: boolean; includeArchive?: boolean } = {}): Promise<Snapshot> {
    const fresh = this.snapshot && Date.now() - Date.parse(this.snapshot.fetchedAt) < this.opts.listTtlMs;
    const needArchive = opts.includeArchive && !this.snapshot?.coverage.includes("archive");
    if (!opts.force && fresh && !needArchive) return this.snapshot!;
    if (this.inflight && !needArchive) return this.inflight;
    this.inflight = this.build(!!opts.includeArchive || !!this.snapshot?.coverage.includes("archive")).finally(() => (this.inflight = null));
    this.snapshot = await this.inflight;
    return this.snapshot;
  }

  private async build(includeArchive: boolean): Promise<Snapshot> {
    await this.loadDisk();
    const coverage: string[] = [];
    const byId = new Map<string, RawOpportunity>();
    const put = (r: RawOpportunity) => byId.set(r.id, byId.has(r.id) ? mergeRaw(byId.get(r.id)!, r) : r);
    const errors: string[] = [];

    // 1. Official feed. When it works it has every open listing with real posted dates,
    //    so no page scraping is needed (one request per refresh).
    let source: Snapshot["source"] = "pages";
    let sourceGeneratedAt: string | null = null;
    let siteActiveCount: number | null = null;
    if (this.opts.feedUrl) {
      try {
        const feed = parseFeed(await this.get(this.opts.feedUrl, "application/json"));
        if (feed.items.length) {
          feed.items.forEach(put);
          source = "feed";
          sourceGeneratedAt = feed.generatedAt;
          siteActiveCount = feed.count ?? feed.items.length;
          coverage.push(`feed: ${feed.items.length} listings${feed.generatedAt ? ` (generated ${feed.generatedAt})` : ""}`);
        } else {
          errors.push("feed: empty");
        }
      } catch (e) {
        errors.push(`feed: ${(e as Error).message}`);
        this.log(`feed unavailable, falling back to pages: ${(e as Error).message}`);
      }
    }

    // 2. Fallback: homepage cards (+ embedded page data if present).
    if (source === "pages") {
      try {
        const html = await this.get("/");
        const { cards, totalShown } = parseListingPage(html);
        siteActiveCount = totalShown;
        cards.forEach(put);
        coverage.push(`homepage cards: ${cards.length}`);
        const flight = extractFlightObjects(html).map(flightToRaw).filter(Boolean) as RawOpportunity[];
        if (flight.length) { flight.forEach(put); coverage.push(`embedded page data: ${flight.length}`); }
      } catch (e) {
        errors.push(`homepage: ${(e as Error).message}`);
        this.log(`homepage failed: ${(e as Error).message}`);
      }
    }

    // 3. Sitemap: needed for the page fallback, or for closed listings (the feed only has open ones).
    let sitemap: ReturnType<typeof parseSitemap> = [];
    if (source === "pages" || includeArchive) {
      try {
        sitemap = parseSitemap(await this.get("/sitemap.xml"));
        coverage.push(`sitemap entries: ${sitemap.length}`);
      } catch (e) {
        errors.push(`sitemap: ${(e as Error).message}`);
        this.log(`sitemap failed: ${(e as Error).message}`);
      }
    }
    if (byId.size === 0 && sitemap.length === 0) {
      throw new Error(`hacklist.io is unreachable from this machine (${errors.join("; ")})`);
    }
    const lastmod = new Map(sitemap.map((s) => [s.id, s.lastmod]));

    // 4. Detail pages. With the feed: only for closed listings when the archive is requested.
    //    Without it: for every known listing, plus sitemap ids if the homepage says we're missing some.
    const want: Array<{ kind: Kind; id: string }> = [];
    if (source === "pages") {
      want.push(...[...byId.values()].map((r) => ({ kind: r.kind, id: r.id })));
      const missingActive = siteActiveCount !== null && byId.size < siteActiveCount;
      if (missingActive || includeArchive) for (const s of sitemap) if (!byId.has(s.id)) want.push({ kind: s.kind, id: s.id });
    } else if (includeArchive) {
      for (const s of sitemap) if (!byId.has(s.id)) want.push({ kind: s.kind, id: s.id });
    }
    if (includeArchive) coverage.push("archive");
    if (want.length) {
      // Newest-modified first, so the cap drops old listings rather than new ones.
      want.sort((a, b) => (lastmod.get(b.id) ?? "").localeCompare(lastmod.get(a.id) ?? ""));
      const capped = want.slice(0, this.opts.maxDetailFetches);
      let fetched = 0;
      await this.pool(capped, async ({ kind, id }) => {
        const d = await this.fetchDetail(kind, id);
        if (d) { put(d); fetched++; }
      });
      coverage.push(`detail pages: ${fetched}/${capped.length}`);
      void this.saveDisk();
    }

    for (const r of byId.values()) {
      const lm = lastmod.get(r.id);
      if (lm && !r.updatedAt) r.updatedAt = lm;
      if (lm) r.sources = Array.from(new Set([...r.sources, "sitemap"]));
    }

    const items = enrichAll([...byId.values()]);
    return { fetchedAt: new Date().toISOString(), items, siteActiveCount, source, sourceGeneratedAt, coverage };
  }

  /** Look up one opportunity by id, HackList URL, or (fuzzy) title. */
  async find(ref: string): Promise<Opportunity | null> {
    const snap = await this.snapshotNow();
    const r = ref.trim();
    const path = parseHackListPath(r);
    const id = path?.id ?? (/^[0-9a-f-]{36}$/i.test(r) ? r.toLowerCase() : null);
    if (id) {
      const known = snap.items.find((o) => o.id === id);
      if (known && known.sources.includes("feed")) return known;
      const kind = path?.kind ?? known?.kind ?? "hackathon";
      const d = await this.fetchDetail(kind, id).catch(() => null);
      if (!known && !d) return null;
      const merged = known && d ? mergeRaw(known, d) : (known ?? d)!;
      return enrichAll([merged, ...snap.items.filter((o) => o.id !== id)])[0];
    }
    const q = r.toLowerCase();
    const exact = snap.items.find((o) => o.title.toLowerCase() === q);
    if (exact) return exact;
    const words = q.split(/\s+/).filter((w) => w.length > 1);
    const scored = snap.items
      .map((o) => ({ o, s: words.filter((w) => `${o.title} ${o.organizer ?? ""}`.toLowerCase().includes(w)).length }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || Number(b.o.active) - Number(a.o.active));
    return scored[0]?.o ?? null;
  }
}
