// Fixtures modelled on real HackList listings (Oct 15, 2026). Markup is an approximation of the
// live site: cards are <li> with an <h3><a href="/hackathon/{id}"> title and one element per field.

export interface Card {
  kind: string; id: string; title: string; org: string; verified: boolean; desc: string;
  tags: string[]; prize: string; prizeLabel?: string; deadline: string; rel: string; loc: string;
  apply?: string; lastmod?: string; category?: string; format?: string;
}

export const CARDS: Card[] = [
  { kind: "hackathon", id: "d96e4e24-a1a5-4701-9771-7f39b0d9f88b", title: "Build Next 2026 — Kompact AI Hackathon", org: "ZIROH LABS", verified: true,
    desc: "National-level AI challenge for college/university students and working professionals in India. Teams of 1–5; finalists build with the Kompact AI Runtime.",
    tags: ["AI", "Free to enter"], prize: "₹7,50,000 total cash prizes (3 × ₹2,50,000)", prizeLabel: "Total prizes", deadline: "Oct 15, 2026", rel: "Ends today",
    loc: "Phase 1 online; Phase 2 may be hybrid, with physical venue to be announced", lastmod: "2026-10-01T10:00:00.000Z" },
  { kind: "program", id: "4adf8c01-5cc2-476b-bfe4-0adff2299c0b", title: "NEA Fellowship", org: "NEA", verified: true,
    desc: "Spring semester part-time fellowship for current undergraduate students at U.S. universities to work directly with the NEA investment team, gaining hands-on experience in venture capital.",
    tags: ["AI + Web3", "Fellowship"], prize: "Stipend provided", prizeLabel: "Stipend", deadline: "Oct 16, 2026", rel: "1 day left", loc: "Remote", apply: "https://www.neafellowship.com/" },
  { kind: "hackathon", id: "05508ad6-88c9-48e1-8d4f-127013482cd7", title: "Arm + ExecuTorch: Edge AI Challenge", org: "Arm / Meta / San Francisco State University", verified: true,
    desc: "An in-person edge AI challenge for teams building intelligent experiences using Arm and ExecuTorch technologies.",
    tags: ["AI", "Free to enter"], prize: "Not specified", prizeLabel: "Total prizes", deadline: "Oct 17, 2026", rel: "2 days left", loc: "In-Person", lastmod: "2026-10-10T08:00:00.000Z" },
  { kind: "hackathon", id: "9270c985-e2e3-4879-a003-a6a9e397b49a", title: "Midnight: Build Privacy-First Apps — Wave 2", org: "Midnight", verified: true,
    desc: "Build privacy-enhanced applications using Midnight's zero-knowledge technology. Second wave of a three-wave grant program, part of a 12,500 USDT total pool. Submit before the wave deadline to be judged and eligible for the grant.",
    tags: ["Web3", "Free to enter"], prize: "4,000 USDT", prizeLabel: "Total prizes", deadline: "Oct 17, 2026", rel: "2 days left", loc: "Online", lastmod: "2026-10-12T08:00:00.000Z" },
  { kind: "hackathon", id: "8b0762b2-e1f0-4c88-89c8-71d8b244f49f", title: "Open Agent Hackathon 2026", org: "GenAI.works", verified: true,
    desc: "A fully online hackathon focused on building production-oriented AI agents that solve real-world problems. Builders can compete across tracks covering connected agent context, autonomous agents, explainable agents, and reasoning architecture, with an additional tinkerer track for extending existing projects using sponsor technologies.",
    tags: ["AI", "Free to enter"], prize: "Up to $20,000", prizeLabel: "Total prizes", deadline: "Oct 20, 2026", rel: "5 days left", loc: "Online", lastmod: "2026-09-20T08:00:00.000Z" },
  { kind: "hackathon", id: "30de6dae-e20f-47b7-8671-de65bc4b59ce", title: "RSNA Knee Abnormality Detection", org: "Radiological Society of North America (RSNA)", verified: true,
    desc: "Kaggle code competition to build multimodal machine learning models that detect twelve clinically important abnormalities on knee MRI, using scans paired with radiology reports. Scored by macro-averaged AUC ROC, with submissions made through Kaggle Notebooks with internet disabled. Includes a separate Efficiency track.",
    tags: ["AI", "Free to enter"], prize: "$77,000 ($59,000 main leaderboard + $18,000 efficiency track)", prizeLabel: "Total prizes", deadline: "Oct 22, 2026", rel: "7 days left", loc: "Online", lastmod: "2026-09-01T08:00:00.000Z" },
  { kind: "hackathon", id: "7a2f49c8-55a4-4489-96e9-c54eb8c26923", title: "Build, Ship, Shape: Amazon Developer Hackathon", org: "Amazon Developer", verified: true,
    desc: "Build or significantly update working applications for Fire TV, Alexa+, Ring, and Bee tracks using Amazon developer tools. Compete for cash prizes and AWS credits.",
    tags: ["AI", "Free to enter"], prize: "$138,000 cash", prizeLabel: "Total prizes", deadline: "Oct 23, 2026", rel: "8 days left", loc: "Online", lastmod: "2026-09-02T08:00:00.000Z" },
  { kind: "hackathon", id: "6c6475ec-54a6-4770-a1d8-0d7ea6eca265", title: "2026 Unusual Whales Hackathon", org: "Unusual Whales", verified: true,
    desc: "Build a dashboard, alert, backtest, bot, agent, or other project using the Unusual Whales API. API trial keys are eligible.",
    tags: ["AI", "Free to enter"], prize: "1st: 1,000 USDC; 2nd: 600 UW API credits; 3rd: 400 UW API credits", prizeLabel: "Total prizes", deadline: "Oct 23, 2026", rel: "8 days left", loc: "Online", lastmod: "2026-10-14T08:00:00.000Z" },
  { kind: "hackathon", id: "5837f52a-e872-4c37-9574-ea26c36b4005", title: "Build, Ship, Shape: Amazon Developer Hackathon", org: "Amazon", verified: true,
    desc: "Global online hackathon where developers build working demos on Fire TV, Alexa+, Bee or Ring, with optional AWS Builder and Open Source mini challenges. Submissions need a GitHub repo, a demo video under 3 minutes and product feedback. Prizes include cash, AWS credits and meetings with the Amazon Developer team.",
    tags: ["AI", "Free to enter"], prize: "$138,000 in cash plus AWS credits (up to $190,000 total value)", prizeLabel: "Total prizes", deadline: "Oct 23, 2026", rel: "8 days left", loc: "Online", lastmod: "2026-09-25T08:00:00.000Z" },
  { kind: "hackathon", id: "04ec47b7-2bf9-45de-a3e3-36e87d43b0bf", title: "Meta Global AI Developer Hackathon", org: "Meta", verified: true,
    desc: "Apply to spend ten days building with Meta's newest models. Use the Muse Spark series, Muse Image and SAM 3.1 through Meta Model API, run Meta open weights models, and code faster with Muse Code agentic coding agent. Compete for a share in the $1,000,000 cash prize pool across indie developer and startup tracks.",
    tags: ["AI", "Free to enter"], prize: "$1,000,000 cash prize pool", prizeLabel: "Total prizes", deadline: "Oct 25, 2026", rel: "10 days left", loc: "Online / Global", lastmod: "2026-10-13T08:00:00.000Z" },
  { kind: "hackathon", id: "16175828-54c6-46fb-b97f-b31cf91c0d22", title: "Open Agent Hackathon 2026", org: "GenAI Works", verified: true,
    desc: "Build an agent that does real work. A six-day online sprint (Oct 22-27) across three tracks (Solving Fragmented Intelligence, The Agent That Can Explain Why, Reasoning Architecture) plus a Wildcard track for extending an existing project with Zetaris and Meterless. Teams of 1-5.",
    tags: ["AI", "Free to enter"], prize: "Up to $20,000 ($15,000 cash + $5,000 in-kind)", prizeLabel: "Total prizes", deadline: "Oct 27, 2026", rel: "12 days left", loc: "Online", lastmod: "2026-10-05T08:00:00.000Z" },
  { kind: "hackathon", id: "b2e9cfbe-36b0-4d4a-b7fe-1e7bf57fdbcd", title: "AWS Communication Developer Services (CDS) Agentic AI Partner Hackathon", org: "AWS", verified: true,
    desc: "Build conversational solutions on AWS CDS (RCS, SMS, WhatsApp, SES). Recommended to incorporate Amazon Bedrock AgentCore for agentic AI. For AWS Partners; must create ACE opportunity.",
    tags: ["AI", "Free to enter"], prize: "$40,000 cash", prizeLabel: "Total prizes", deadline: "Oct 28, 2026", rel: "13 days left", loc: "Online", lastmod: "2026-09-10T08:00:00.000Z" },
  { kind: "hackathon", id: "15a10c51-6785-4e91-810e-1eea545efabe", title: "Qloo Agentic Hackathon", org: "Qloo", verified: true,
    desc: "Build agentic tools, agent-powered apps, or integrate Qloo’s taste graph API (250M+ entities) so agents make culturally grounded recommendations. Bonus: Jason Calacanis personal investment of additional $25k into his favorite.",
    tags: ["AI", "Free to enter"], prize: "$25,000 cash", prizeLabel: "Total prizes", deadline: "Oct 30, 2026", rel: "15 days left", loc: "Online", apply: "https://qloo.devpost.com/", lastmod: "2026-09-05T08:00:00.000Z" },
  { kind: "hackathon", id: "f1e186fe-51e9-48a4-8e5a-31536b66b607", title: "Build Your One-Person On-Chain Finance Business with SoSoValue", org: "SoSoValue", verified: false,
    desc: "Buildathon on AKINDO to build on-chain finance tools using SoSoValue data, news feeds, index tools, trading APIs and the ValueChain L1. Projects are judged on user value, working demo, workflow design, data and API integration, and UX.",
    tags: ["AI", "Free to enter"], prize: "10,000 USDC total", prizeLabel: "Total prizes", deadline: "Oct 30, 2026", rel: "15 days left", loc: "Online", lastmod: "2026-10-09T08:00:00.000Z" },
  { kind: "hackathon", id: "4de7668b-0355-499c-9382-56fc7e4592cc", title: "Galuxium Nexus V2", org: "Galuxium", verified: true,
    desc: "Build a fully deployed, revenue-generating SaaS platform with a live monetization engine, not a prototype. Open to all ages and occupations globally, despite Devpost's student-only platform tag.",
    tags: ["AI", "Free to enter"], prize: "$1,600 in Backboard.io platform credits (not cash, requires active $5/mo Backboard subscription to redeem) + up to $1,000 in a discretionary cash seed fund", prizeLabel: "Total prizes", deadline: "Oct 31, 2026", rel: "16 days left", loc: "Online", lastmod: "2026-10-02T08:00:00.000Z" },
  { kind: "hackathon", id: "3fb6f20e-1c81-4daa-9875-bec52eed0617", title: "Apps Built With AI Build-A-Thon", org: "Apps Built With AI (Justin Burns)", verified: true,
    desc: "4-day live guided virtual build-a-thon (Oct 20-23) to turn an idea or business problem into a working AI app without coding. Pitch and plan for first 100 users.",
    tags: ["AI", "Free to enter"], prize: "$7,000 cash", prizeLabel: "Total prizes", deadline: "Oct 23, 2026", rel: "8 days left", loc: "Online", lastmod: "2026-10-11T08:00:00.000Z" },
];

/** A listing that exists only in the sitemap (beyond the first page of cards). */
export const EXTRA_DETAIL = {
  kind: "hackathon", id: "b78a74cb-b783-437d-a0f5-a355a35540fb", title: "RP2350 Hacking Challenge 2", org: "Raspberry Pi",
  desc: "First-across-the-line hardware security challenge to use side-channel analysis (power, EM or timing) on the RP2350 self-decrypting AES boot and leak enough key material to decrypt the payload. A single winner or winning team takes the prize.",
  prize: "$20,000 USD (single winner or team)", deadline: "Oct 31, 2026", format: "Online", category: "AI", apply: "https://www.raspberrypi.com/news/rp2350-hacking-challenge-2/", lastmod: "2026-10-03T08:00:00.000Z",
};

/** An old, closed listing in the sitemap. */
export const OLD_DETAIL = {
  kind: "hackathon", id: "3eda57d0-e469-4b02-ac57-0649b88fbd5c", title: "Summer Solana Sprint", org: "Solana Foundation",
  desc: "Build consumer apps on Solana using Anchor and the Solana Pay API.", prize: "$50,000", deadline: "Jun 30, 2026", format: "Online", category: "Web3",
  apply: "https://example.org/solana", lastmod: "2026-06-04T15:07:37.326Z",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function homepageHtml(totalShown = 18): string {
  const cards = CARDS.map((c) => `
    <li class="card">
      <div class="logo">${esc(c.org.slice(0, 2).toUpperCase())}</div>
      <h3><a href="/${c.kind}/${c.id}">${esc(c.title)}</a></h3>
      <div><span>${esc(c.org)}</span>${c.verified ? '<span class="badge">Verified</span>' : ""}</div>
      <p>${esc(c.desc)}</p>
      <div class="tags"><span>${c.kind[0].toUpperCase() + c.kind.slice(1)}</span>${c.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div>
      <div><strong>${esc(c.prize)}</strong></div><div><small>${esc(c.prizeLabel ?? "")}</small></div>
      <div><time>${esc(c.deadline)}</time></div><div><span>${esc(c.rel)}</span></div>
      <div><span>${esc(c.loc)}</span></div>
    </li>`).join("\n");
  return `<!doctype html><html><head><title>HackList</title></head><body>
    <nav><a href="/">HackList</a><a href="/#discover">Discover</a></nav>
    <main><h1>Turn your hackathon project into a billion dollar company Onchain</h1>
    <section id="discover"><h2>${totalShown} opportunities</h2><ul>${cards}</ul><button>Show more (1 left)</button></section></main>
    <footer>© 2026 HackList. Not affiliated with any hackathon organizer.</footer></body></html>`;
}

export function detailHtml(d: { kind: string; id: string; title: string; org: string; desc: string; prize: string; deadline: string; format?: string; category?: string; apply?: string; verified?: boolean }): string {
  return `<!doctype html><html><head><title>${esc(d.title)} | HackList</title><meta name="description" content="${esc(d.desc)}"></head><body>
  <nav><a href="/">HackList</a></nav>
  <main><a href="/?type=hackathons#discover">← Back to all hackathons</a>
    <div><span>${esc(d.org)}</span>${d.verified === false ? "" : "<span>Verified</span>"}</div>
    <h1>${esc(d.title)}</h1>
    <div><p>Prize Pool</p><p>${esc(d.prize)}</p></div>
    <div><span>${esc(d.category ?? "AI")}</span><span>${esc(d.format ?? "Online")}</span><span>Free</span></div>
    <dl><dt>Category</dt><dd>${esc(d.category ?? "AI")}</dd><dt>Format</dt><dd>${esc(d.format ?? "Online")}</dd><dt>Deadline</dt><dd>${esc(d.deadline)}</dd></dl>
    <h2>About</h2><p>${esc(d.desc)}</p>
    ${d.apply ? `<a href="${esc(d.apply)}">Apply to ${esc(d.title)}</a><a href="${esc(d.apply)}">Apply Now</a>` : ""}
  </main><footer>© 2026 HackList.</footer></body></html>`;
}

export function sitemapXml(): string {
  const entries = [
    ...CARDS.filter((c) => c.kind === "hackathon").map((c) => ({ id: c.id, lastmod: c.lastmod })),
    { id: EXTRA_DETAIL.id, lastmod: EXTRA_DETAIL.lastmod },
    { id: OLD_DETAIL.id, lastmod: OLD_DETAIL.lastmod },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://hacklist.io</loc></url><url><loc>https://hacklist.io/about</loc></url>
  ${entries.map((e) => `<url><loc>https://hacklist.io/hackathon/${e.id}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`).join("\n")}
  </urlset>`;
}

/** Fake fetch that serves the fixtures like hacklist.io would. */
export function fakeFetch(opts: { log?: string[] } = {}): typeof fetch {
  return (async (input: any) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    opts.log?.push(url.pathname);
    const ok = (body: string, type = "text/html") => new Response(body, { status: 200, headers: { "content-type": type } });
    if (url.pathname === "/") return ok(homepageHtml());
    if (url.pathname === "/sitemap.xml") return ok(sitemapXml(), "application/xml");
    const m = url.pathname.match(/^\/(\w+)\/([0-9a-f-]{36})$/);
    if (m) {
      const card = CARDS.find((c) => c.id === m[2]);
      if (card) return ok(detailHtml({ ...card, format: card.loc, category: card.tags[0], apply: card.apply ?? `https://apply.example/${card.id.slice(0, 8)}` }));
      if (m[2] === EXTRA_DETAIL.id) return ok(detailHtml(EXTRA_DETAIL));
      if (m[2] === OLD_DETAIL.id) return ok(detailHtml(OLD_DETAIL));
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

/* ---------------- official feed (GET /api/opportunities, v1) ---------------- */

export const FEED_GRANT = {
  id: "a1b2c3d4-0000-4000-8000-000000000001", type: "grant", title: "Base Builder Grants", organizer: "Base", verified: true,
  description: "Retroactive grants for onchain apps shipped on Base. Rolling review by the Base ecosystem team; strongest fit is consumer and payments apps.",
  category: "Web3", format: "Online", prize: "1–5 ETH per project", prize_label: "Funding", deadline: null, deadline_text: "Rolling",
  apply_url: "https://paragraph.com/@grants.base.eth", url: "https://hacklist.io/grant/a1b2c3d4-0000-4000-8000-000000000001",
  created_at: "2026-10-19T09:00:00.000000+00:00",
};

export function feedJson(): string {
  const toIso = (d: string) => {
    const m: Record<string, string> = { Oct: "10", Nov: "11", Sep: "09" };
    const [mon, day, yr] = d.replace(",", "").split(" ");
    return `${yr}-${m[mon.slice(0, 3)]}-${day.padStart(2, "0")}`;
  };
  const items = CARDS.map((c, i) => ({
    id: c.id, type: c.kind, title: c.title, organizer: c.org, verified: c.verified, description: c.desc,
    category: c.tags[0], format: c.loc, prize: c.kind === "program" ? null : c.prize, prize_label: c.prizeLabel ?? null,
    deadline: toIso(c.deadline), deadline_text: c.deadline,
    apply_url: c.apply ?? `https://apply.example/${c.id.slice(0, 8)}`, url: `https://hacklist.io/${c.kind}/${c.id}`,
    // Unusual Whales newest; the rest spread over the previous weeks.
    created_at: c.id.startsWith("6c6475ec") ? "2026-10-14T18:30:00.000000+00:00" : `2026-09-${String(10 + (i % 18)).padStart(2, "0")}T12:00:00.000000+00:00`,
  }));
  items.push(FEED_GRANT as any);
  return JSON.stringify({ version: 1, source: "https://hacklist.io", generated_at: "2026-10-15T06:00:00.000Z", count: items.length, items });
}

/** Like fakeFetch, but also serves the official feed. */
export function fakeFetchWithFeed(opts: { log?: string[]; brokenFeed?: boolean } = {}): typeof fetch {
  const pages = fakeFetch(opts);
  return (async (input: any, init?: any) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/api/opportunities") {
      opts.log?.push(url.pathname);
      if (opts.brokenFeed) return new Response("<html>oops</html>", { status: 200, headers: { "content-type": "text/html" } });
      return new Response(feedJson(), { status: 200, headers: { "content-type": "application/json" } });
    }
    return pages(input, init);
  }) as typeof fetch;
}
