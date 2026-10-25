import { resolve } from "node:path";
import "dotenv/config";
import express from "express";
import { loadConfig } from "./config.js";
import { FileTokenStore } from "./token-store.js";
import * as glean from "./glean-client.js";

// ── Configuration ───────────────────────────────────────────

const config = loadConfig();
const tokenStore = new FileTokenStore(resolve(import.meta.dirname, "../.glean-tokens.json"));

if (!config.mcpUrl) {
  console.error("GLEAN_MCP_URL is not set. Copy .env.example to .env and configure it.");
  process.exit(1);
}

// ── Validation ──────────────────────────────────────────────

const SFDC_ID_RE = /^[a-zA-Z0-9]{15,18}$/;
const ALLOWED_FIELDS = new Set([
  "arr", "err", "champions", "go-live dates", "deal stage",
  "close date", "key stakeholders", "use case", "timeline",
  "decision criteria", "next steps", "compelling event",
]);

function sanitizeFields(raw: string): string[] {
  return raw.split(",").map((f) => f.trim().toLowerCase()).filter((f) => ALLOWED_FIELDS.has(f));
}

// ── Express app ─────────────────────────────────────────────

const app = express();
app.use(express.json());

// Health / status
app.get("/health", async (_req, res) => {
  const material = await tokenStore.load();
  res.json({
    mcp_url_set: Boolean(config.mcpUrl),
    authenticated: Boolean(material.tokens),
  });
});

// Start Glean OAuth — open this in a browser
app.get("/oauth/login", async (_req, res) => {
  try {
    const conn = await glean.connect(tokenStore, config);
    if (conn.kind === "redirect") {
      res.redirect(conn.url.toString());
      return;
    }
    await glean.close(conn);
    res.json({ status: "already_connected" });
  } catch (error) {
    console.error("OAuth login failed:", (error as Error).message);
    res.status(500).json({ error: "OAuth login failed" });
  }
});

// OAuth callback — Glean redirects here after user authorizes
app.get("/oauth/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) {
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }
  try {
    const material = await tokenStore.load();
    const returnedState = typeof req.query.state === "string" ? req.query.state : "";
    if (!material.oauthState || material.oauthState !== returnedState) {
      res.status(400).json({ error: "OAuth state mismatch" });
      return;
    }
    await tokenStore.save({ ...material, oauthState: undefined });
    const conn = await glean.finishAuth(tokenStore, config, code);
    await glean.close(conn);
    res.json({ status: "connected" });
  } catch (error) {
    console.error("OAuth callback failed:", (error as Error).message);
    res.status(500).json({ error: "OAuth callback failed" });
  }
});

// Disconnect — clear stored tokens
app.post("/oauth/logout", async (_req, res) => {
  await tokenStore.clear();
  res.json({ status: "disconnected" });
});

// List available Glean MCP tools
app.get("/api/tools", async (_req, res) => {
  try {
    const conn = await glean.connect(tokenStore, config);
    if (conn.kind === "redirect") {
      res.status(401).json({ error: "Not authenticated", authorization_url: conn.url.toString() });
      return;
    }
    const tools = await glean.listTools(conn);
    await glean.close(conn);
    res.json({ tools });
  } catch (error) {
    console.error("Tool listing failed:", (error as Error).message);
    res.status(500).json({ error: "Failed to list tools" });
  }
});

// Query Glean — pass a message to the chat tool
app.post("/api/query", async (req, res) => {
  const message = String(req.body?.message ?? "").trim();
  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }
  let conn: glean.GleanConnection | undefined;
  try {
    conn = await glean.connect(tokenStore, config);
    if (conn.kind === "redirect") {
      res.status(401).json({ error: "Not authenticated", authorization_url: conn.url.toString() });
      return;
    }
    const result = await glean.chat(conn, message, config.mcpToolTimeoutMs);
    res.json({
      text: result.text,
      tool: result.tool,
      is_error: result.isError,
    });
  } catch (error) {
    console.error("Query failed:", (error as Error).message);
    res.status(500).json({ error: "Query failed" });
  } finally {
    if (conn) await glean.close(conn);
  }
});

// Convenience endpoint — query by Salesforce opportunity ID
app.get("/api/opportunity/:id", async (req, res) => {
  const opportunityId = req.params.id;
  if (!SFDC_ID_RE.test(opportunityId)) {
    res.status(400).json({ error: "Invalid Salesforce Opportunity ID format" });
    return;
  }
  const rawFields = String(req.query.fields ?? "ARR, ERR, champions, go-live dates, deal stage, close date, key stakeholders");
  const fields = sanitizeFields(rawFields);
  if (fields.length === 0) {
    res.status(400).json({ error: "No recognized fields requested", allowed: [...ALLOWED_FIELDS] });
    return;
  }
  const message = [
    `Find the following for Salesforce Opportunity ID ${opportunityId}:`,
    ...fields.map((f) => `- ${f}`),
    "",
    "Return source-backed evidence with references.",
  ].join("\n");

  let conn: glean.GleanConnection | undefined;
  try {
    conn = await glean.connect(tokenStore, config);
    if (conn.kind === "redirect") {
      res.status(401).json({ error: "Not authenticated", authorization_url: conn.url.toString() });
      return;
    }
    const result = await glean.chat(conn, message, config.mcpToolTimeoutMs);
    res.json({
      opportunity_id: opportunityId,
      text: result.text,
      is_error: result.isError,
    });
  } catch (error) {
    console.error("Opportunity query failed:", (error as Error).message);
    res.status(500).json({ error: "Opportunity query failed" });
  } finally {
    if (conn) await glean.close(conn);
  }
});

// ── Start ───────────────────────────────────────────────────

app.listen(config.port, "127.0.0.1", () => {
  console.log(`Glean example server running on http://localhost:${config.port}`);
  console.log(`  Health:     GET  http://localhost:${config.port}/health`);
  console.log(`  Login:      GET  http://localhost:${config.port}/oauth/login  (open in browser)`);
  console.log(`  Query:      POST http://localhost:${config.port}/api/query`);
  console.log(`  Opportunity: GET http://localhost:${config.port}/api/opportunity/:sfdc_id`);
});
