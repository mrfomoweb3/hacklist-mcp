#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { HackListClient } from "./client.js";
import { registerTools } from "./tools.js";

const VERSION = "0.2.0";
const INSTRUCTIONS =
  "Live data from HackList (hacklist.io), a directory of AI and Web3 hackathons, grants, bounties and programs. " +
  "For 'what should I enter' questions call best_opportunities with the user's skills and constraints. " +
  "For a specific event call get_opportunity. Prize USD values are estimates; quote the original prize text too. " +
  "posted_on_hacklist is the real creation date from HackList's feed; if only last_updated_on_hacklist is present, say that instead. Listings with no fixed deadline are rolling.";

function makeServer(client: HackListClient) {
  const server = new McpServer({ name: "hacklist", version: VERSION }, { instructions: INSTRUCTIONS });
  registerTools(server, client);
  return server;
}

async function runStdio() {
  const client = new HackListClient();
  const server = makeServer(client);
  await server.connect(new StdioServerTransport());
  process.stderr.write(`[hacklist-mcp] v${VERSION} ready on stdio\n`);
}

async function runHttp(port: number) {
  const client = new HackListClient(); // shared cache across requests
  const token = process.env.HACKLIST_MCP_TOKEN;
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.type("text/plain").send(`hacklist-mcp ${VERSION}\nMCP endpoint: POST /mcp\n`);
  });
  app.get("/healthz", (_req, res) => res.json({ ok: true, version: VERSION }));

  app.post("/mcp", async (req, res) => {
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
      return;
    }
    // Stateless: a fresh server + transport per request, sharing one data client.
    const server = makeServer(client);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      process.stderr.write(`[hacklist-mcp] request error: ${(e as Error).message}\n`);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  });
  const notAllowed = (_req: express.Request, res: express.Response) =>
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server)" }, id: null });
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);

  app.listen(port, () => process.stderr.write(`[hacklist-mcp] v${VERSION} listening on http://0.0.0.0:${port}/mcp\n`));
  // Warm the cache so the first tool call is fast.
  client.snapshotNow().catch((e) => process.stderr.write(`[hacklist-mcp] warmup failed: ${e.message}\n`));
}

async function runCheck() {
  const client = new HackListClient({ log: (m) => process.stderr.write(`  ${m}\n`) });
  const t0 = Date.now();
  const snap = await client.snapshotNow({ force: true });
  const open = snap.items.filter((o) => o.active);
  const field = (f: (o: (typeof open)[number]) => unknown) => `${open.filter((o) => f(o) !== undefined && f(o) !== null).length}/${open.length}`;
  process.stdout.write(
    [
      `Loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      `Source: ${snap.source === "feed" ? `official feed${snap.sourceGeneratedAt ? ` (generated ${snap.sourceGeneratedAt})` : ""}` : "page scraping (feed unavailable)"}`,
      `HackList says open: ${snap.siteActiveCount ?? "?"} | open loaded: ${open.length} | total incl. closed: ${snap.items.length}`,
      `Coverage: ${snap.coverage.join(", ")}`,
      `Field fill rate (open): deadline ${field((o) => o.deadline)}, prize ${field((o) => o.prizeText)}, organizer ${field((o) => o.organizer)}, description ${field((o) => o.description)}, apply link ${field((o) => o.applyUrl)}, posted date ${field((o) => o.listedAt)}, updated date ${field((o) => o.updatedAt)}`,
      "",
      ...open.slice(0, 5).map((o) => `- ${o.title} | ${o.organizer ?? "?"} | ${o.prizeText ?? "?"} | ${o.deadline ?? "?"} | ${o.applyUrl ?? "no apply link"}`),
      "",
    ].join("\n"),
  );
}

const args = process.argv.slice(2);
if (args.includes("--check")) {
  runCheck().catch((e) => {
    process.stderr.write(`check failed: ${e.message}\n`);
    process.exit(1);
  });
} else if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`hacklist-mcp ${VERSION}\n\nUsage:\n  hacklist-mcp            run over stdio (Claude Desktop, Claude Code, Cursor...)\n  hacklist-mcp --http     run a Streamable HTTP server on $PORT (default 3000) for ChatGPT / claude.ai connectors\n  hacklist-mcp --check    fetch HackList once and report what was parsed\n`);
} else if (args.includes("--http") || process.env.MCP_TRANSPORT === "http") {
  const pIdx = args.indexOf("--port");
  const port = Number(pIdx >= 0 ? args[pIdx + 1] : process.env.PORT ?? 3000);
  runHttp(port);
} else {
  runStdio().catch((e) => {
    process.stderr.write(`[hacklist-mcp] fatal: ${e?.stack ?? e}\n`);
    process.exit(1);
  });
}
