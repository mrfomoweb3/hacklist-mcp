// Cloudflare Workers entry: same endpoints as `hacklist-mcp --http` (/, /healthz, POST /mcp), no Express.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { HackListClient } from "./client.js";
import { makeServer, VERSION } from "./server.js";

interface Env {
  HACKLIST_MCP_TOKEN?: string;
}

// One client per isolate, so the snapshot is shared across requests that land on it. No disk on Workers.
let client: HackListClient | null = null;
const getClient = () => (client ??= new HackListClient({ cacheDir: null, log: (m) => console.log(`[hacklist-mcp] ${m}`) }));

const rpcError = (status: number, code: number, message: string) =>
  Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);

    if (pathname === "/" && req.method === "GET") {
      return new Response(`hacklist-mcp ${VERSION}\nMCP endpoint: POST /mcp\n`, { headers: { "content-type": "text/plain" } });
    }
    if (pathname === "/healthz") return Response.json({ ok: true, version: VERSION });
    if (pathname !== "/mcp") return new Response("Not found", { status: 404 });
    if (req.method !== "POST") return rpcError(405, -32000, "Method not allowed (stateless server)");

    if (env.HACKLIST_MCP_TOKEN && req.headers.get("authorization") !== `Bearer ${env.HACKLIST_MCP_TOKEN}`) {
      return rpcError(401, -32001, "Unauthorized");
    }

    // Stateless: a fresh server + transport per request, sharing one data client.
    const server = makeServer(getClient());
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      return await transport.handleRequest(req);
    } catch (e) {
      console.error(`[hacklist-mcp] request error: ${(e as Error).message}`);
      return rpcError(500, -32603, "Internal error");
    } finally {
      void transport.close();
      void server.close();
    }
  },
};
