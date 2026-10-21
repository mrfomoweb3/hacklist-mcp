import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HackListClient } from "./client.js";
import { registerTools } from "./tools.js";

export const VERSION = "0.2.0";
export const INSTRUCTIONS =
  "Live data from HackList (hacklist.io), a directory of AI and Web3 hackathons, grants, bounties and programs. " +
  "For 'what hackathons are there / what do you have / show me what's open' questions call search_opportunities with sort='deadline' (add kind or category if the user named one), list the results, then offer to rank them for the user's skills with best_opportunities. " +
  "For 'what should I enter' questions call best_opportunities with the user's skills and constraints. " +
  "For a specific event call get_opportunity. Prize USD values are estimates; quote the original prize text too. " +
  "posted_on_hacklist is the real creation date from HackList's feed; if only last_updated_on_hacklist is present, say that instead. Listings with no fixed deadline are rolling.";

export function makeServer(client: HackListClient) {
  const server = new McpServer({ name: "hacklist", version: VERSION }, { instructions: INSTRUCTIONS });
  registerTools(server, client);
  return server;
}
