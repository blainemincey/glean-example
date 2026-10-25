#!/usr/bin/env tsx
import { resolve } from "node:path";
import "dotenv/config";
import { loadConfig } from "./config.js";
import { FileTokenStore } from "./token-store.js";
import * as glean from "./glean-client.js";

// ── CLI ─────────────────────────────────────────────────────
// Quick way to test a Glean query after OAuth is complete.
//
//   npm run query -- "006XXXXXXXXXXXX"
//   npm run query -- "006XXXXXXXXXXXX" "ARR, champions, go-live date"

const config = loadConfig();
const tokenStore = new FileTokenStore(resolve(import.meta.dirname, "../.glean-tokens.json"));

const opportunityId = process.argv[2];
if (!opportunityId) {
  console.error("Usage: npm run query -- <opportunity-id> [fields]");
  process.exit(1);
}

const fields = process.argv[3] ?? "ARR, ERR, champions, go-live dates, deal stage, close date, key stakeholders";
const message = [
  `Find the following for Salesforce Opportunity ID ${opportunityId}:`,
  ...fields.split(",").map((f) => `- ${f.trim()}`),
  "",
  "Return source-backed evidence with references.",
].join("\n");

const conn = await glean.connect(tokenStore, config);
if (conn.kind === "redirect") {
  console.error("Not authenticated. Start the server and visit /oauth/login first.");
  console.error(`  Authorization URL: ${conn.url.toString()}`);
  process.exit(1);
}

try {
  console.log(`Querying Glean for opportunity ${opportunityId}...\n`);
  const result = await glean.chat(conn, message, config.mcpToolTimeoutMs);
  if (result.isError) {
    console.error("Glean returned an error:");
  }
  console.log(result.text);
} finally {
  await glean.close(conn);
}
