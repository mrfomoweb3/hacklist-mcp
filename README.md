# hacklist-mcp

An MCP server that gives Claude and ChatGPT live access to [HackList](https://hacklist.io), the directory of AI and Web3 hackathons, grants, bounties and programs.

Ask things like:

- "What should I enter this month? I write Solidity and Python, build agents, I'm in Nigeria and can't travel."
- "When was the Qloo hackathon posted, and what's the actual cash prize?"
- "Anything new on HackList this week over $10k?"
- "Find ZK or privacy hackathons closing in the next 10 days."

## Why it isn't just a scraper

HackList lists everything. This server tells you which listings are worth your weekend:

| Problem on the raw list | What the server does |
|---|---|
| Same event listed twice (Amazon, GitLab, OpenCV, GenAI Works…) | Detects duplicates by title, organizer, deadline and apply link, and collapses them |
| "$190,000 total value" that is mostly AWS credits | Separates cash from credits clause by clause; headline shows the cash |
| ₹, USDC, USDT, € prizes you can't compare | Converts to an approximate USD figure (original text always kept) |
| Events you can't actually enter | Flags students-only, region-locked, in-person-only, partners-only and application-gated events, and drops them from recommendations |
| "Build an AI app that solves real-world problems" | Scores each brief for how generic it is (0 = specific, 1 = generic) and lists the concrete hooks: named APIs, datasets, scoring metrics, tracks |
| Rolling grants and bounties with no deadline | Kept as open ("no fixed deadline") and ranked fairly instead of being dropped or buried |

`best_opportunities` combines all of that with your skills and constraints and explains every pick (`why`) and every risk (`watch_outs`).

## Tools

| Tool | What it does |
|---|---|
| `best_opportunities` | Ranks open opportunities for a builder (skills, interests, country, student, can travel, cash only). Down-ranks generic briefs, removes ineligible ones, explains each pick. |
| `search_opportunities` | Keyword search with filters: type, AI/Web3, online/in-person/hybrid, min prize, cash only, closes within N days, updated within N days, include closed. |
| `get_opportunity` | Full detail for one listing by HackList URL, id or title: brief, prize (USD estimate, cash vs credits), deadline and days left, posted/updated date, apply link, eligibility, duplicates. |
| `whats_new` | Listings posted or updated in the last N days. |
| `closing_soon` | Open listings ending within N days, soonest first. |
| `hacklist_overview` | Counts, cash prize total, biggest prizes, duplicate groups, data coverage. `refresh: true` re-fetches. |
| `search` / `fetch` | The two tools ChatGPT connectors and deep research expect. |

All tools are read-only.

## Install

Requires Node 18.17+.

### Claude Desktop (local, stdio)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hacklist": {
      "command": "npx",
      "args": ["-y", "hacklist-mcp"]
    }
  }
}
```

Before it's on npm, point at a local build instead: `"command": "node", "args": ["/absolute/path/to/hacklist-mcp/dist/index.js"]`.

### Claude Code

```bash
claude mcp add hacklist -- npx -y hacklist-mcp
```

### Cursor, Windsurf, other stdio clients

Same command: `npx -y hacklist-mcp`.

### ChatGPT and claude.ai (remote connector)

These need a public HTTPS URL, so deploy the HTTP mode (below) and add `https://your-host/mcp` as a custom connector:

- **ChatGPT:** enable developer mode in Settings, then add a custom connector/app with your `/mcp` URL. ChatGPT uses the `search` and `fetch` tools for deep research and can call the rest in chat.
- **claude.ai:** Settings → Connectors → add a custom connector with your `/mcp` URL.

## Run the HTTP server

```bash
npm install && npm run build
PORT=3000 npm run start:http          # serves POST /mcp and GET /healthz
```

Stateless Streamable HTTP, so it scales horizontally and works behind any load balancer. One HackList snapshot is shared across requests.

Deploy anywhere that runs Docker:

```bash
docker build -t hacklist-mcp .
docker run -p 3000:3000 hacklist-mcp
```

Works as-is on Render, Railway, Fly.io or Cloud Run (all give you HTTPS). To keep it private, set `HACKLIST_MCP_TOKEN` and the server will require `Authorization: Bearer <token>`. Leave it unset for a public, no-auth connector.

### Cloudflare Workers

`src/worker.ts` serves the same endpoints without Express or a disk cache:

```bash
npx wrangler login
npm run dev:worker                    # local, http://localhost:8787/mcp
npm run deploy:worker                 # https://hacklist-mcp.<your-subdomain>.workers.dev/mcp
npx wrangler secret put HACKLIST_MCP_TOKEN   # optional, same bearer-token behaviour
```

The HackList snapshot is cached per Worker instance, so a cold instance's first call re-fetches the feed (about 2s). If the free plan's 10ms CPU limit trips on cold starts (`Exceeded CPU Limit` in `npx wrangler tail`), move to Workers Paid.

## Check it's reading HackList correctly

```bash
npm run check
```

Prints whether the official feed was used, how many listings were loaded vs. what HackList says is open, and how often each field was filled.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP mode port |
| `HACKLIST_MCP_TOKEN` | unset | Require a bearer token in HTTP mode |
| `HACKLIST_LIST_TTL_MS` | `1200000` (20 min) | How long a snapshot stays fresh |
| `HACKLIST_MAX_DETAIL_FETCHES` | `260` | Cap on detail pages fetched per refresh |
| `HACKLIST_CACHE_DIR` | `~/.cache/hacklist-mcp` | Disk cache for detail pages (restarts are instant) |
| `HACKLIST_BASE_URL` | `https://hacklist.io` | Override for testing or a mirror |
| `HACKLIST_FEED_URL` | `/api/opportunities` | Feed path or full URL |

## How it gets the data

1. **Official feed** (`GET https://hacklist.io/api/opportunities`), provided by HackList. One request per refresh (cached 20 min) returns every open hackathon, program, grant and bounty, with each listing's real `created_at` posting date.
2. **Fallback:** if the feed is down or returns something unexpected, the server reads the public pages instead (homepage, `/sitemap.xml`, detail pages), keyed off visible labels so cosmetic redesigns don't break it.
3. **Closed listings** (`include_closed: true`) come from the sitemap and detail pages, since the feed only lists open ones.

`hacklist_overview` and every result report `data_source` (`feed` or `pages`) and `data_as_of` (when HackList generated the feed).

Thanks to HackList ([@0xbeni](https://x.com/0xbeni), [Telegram](https://t.me/hacklistwithbeni)) for exposing the feed. This project is not affiliated with HackList.

## Develop

```bash
npm install
npm test        # 19 tests: feed + page parsers, fallback, prize/eligibility/duplicate logic, full MCP round-trips
npm run dev     # stdio server via tsx
```

## Limits

- Prize USD figures are estimates (fixed approximate FX rates). The original prize text is always returned alongside.
- Prizes paid in crypto (ETH, SOL…) get no USD estimate because the price moves; they're labeled instead.
- In page-scraping fallback mode, programs, grants and bounties beyond the homepage's first page may be missing (the sitemap only covers hackathons).
- "Generic" scoring is heuristic. It's tuned to separate briefs like "build any AI app" from briefs like "detect 12 knee MRI abnormalities, scored by AUC", and `include_generic: true` turns the penalty off.

MIT licensed.
