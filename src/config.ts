// ── Configuration ────────────────────────────────────────────
// Edit .env or export these variables before running.

export type GleanConfig = {
  mcpUrl: string;
  oauthRedirectUri: string;
  oauthScopes: string;
  httpTimeoutMs: number;
  mcpToolTimeoutMs: number;
  port: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GleanConfig {
  const httpTimeoutMs = readPositiveNumber(env.GLEAN_HTTP_TIMEOUT, 180_000);
  return {
    mcpUrl: env.GLEAN_MCP_URL?.trim() ?? "",
    oauthRedirectUri: env.OAUTH_REDIRECT_URI?.trim() ?? "http://localhost:3090/oauth/callback",
    oauthScopes: env.GLEAN_OAUTH_SCOPES?.trim() ?? "SEARCH CHAT MCP DOCUMENTS TOOLS ENTITIES AGENTS",
    httpTimeoutMs,
    mcpToolTimeoutMs: readPositiveNumber(env.GLEAN_MCP_TOOL_TIMEOUT, httpTimeoutMs),
    port: readPositiveNumber(env.PORT, 3090),
  };
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
