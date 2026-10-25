import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { GleanConfig } from "./config.js";
import { GleanOAuthProvider } from "./oauth-provider.js";
import type { TokenStore } from "./token-store.js";

// ── Glean MCP client ────────────────────────────────────────
// Self-contained module for connecting to a Glean MCP server,
// listing tools, and running queries. Designed to be imported
// into any project — no framework dependencies.

export type GleanConnection =
  | { kind: "connected"; client: Client; transport: StreamableHTTPClientTransport; provider: GleanOAuthProvider }
  | { kind: "redirect"; url: URL };

export type GleanToolResult = {
  tool: string;
  argumentKey: string;
  text: string;
  content: ContentPart[];
  raw: unknown;
  isError: boolean;
};

export type ContentPart = { type: string; text?: string };

export type GleanTool = {
  name: string;
  description: string;
  inputSchema: unknown;
};

export async function connect(store: TokenStore, config: GleanConfig): Promise<GleanConnection> {
  if (!config.mcpUrl) throw new Error("GLEAN_MCP_URL is required");
  const provider = new GleanOAuthProvider(store, config);
  const transport = new StreamableHTTPClientTransport(new URL(config.mcpUrl), {
    authProvider: provider,
    fetch: timeoutFetch(config.httpTimeoutMs),
  });
  const client = new Client({ name: "glean-example", version: "0.1.0" });
  try {
    await client.connect(transport);
    return { kind: "connected", client, transport, provider };
  } catch (error) {
    await transport.close().catch(() => undefined);
    if (error instanceof UnauthorizedError && provider.authorizationUrl) {
      return { kind: "redirect", url: provider.authorizationUrl };
    }
    throw error;
  }
}

export async function finishAuth(store: TokenStore, config: GleanConfig, code: string): Promise<GleanConnection> {
  const provider = new GleanOAuthProvider(store, config);
  const transport = new StreamableHTTPClientTransport(new URL(config.mcpUrl), {
    authProvider: provider,
    fetch: timeoutFetch(config.httpTimeoutMs),
  });
  await transport.finishAuth(code);
  await transport.close().catch(() => undefined);
  return connect(store, config);
}

export async function listTools(conn: Extract<GleanConnection, { kind: "connected" }>, timeoutMs?: number): Promise<GleanTool[]> {
  const result = await conn.client.listTools(undefined, requestOptions(timeoutMs ?? 30_000));
  return result.tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: t.inputSchema,
  }));
}

export async function chat(conn: Extract<GleanConnection, { kind: "connected" }>, message: string, timeoutMs?: number): Promise<GleanToolResult> {
  const tools = await listTools(conn, timeoutMs);
  const chatTool = tools.find((t) => t.name === "chat");
  if (!chatTool) throw new Error("Glean MCP 'chat' tool is not available");
  const argKey = selectArgumentKey(chatTool.inputSchema);
  const raw = await conn.client.callTool(
    { name: "chat", arguments: { [argKey]: message } },
    undefined,
    requestOptions(timeoutMs ?? 180_000),
  );
  const content = normalizeContent((raw as { content?: unknown }).content);
  const text = content.map((p) => p.text).filter(Boolean).join("\n\n");
  return {
    tool: "chat",
    argumentKey: argKey,
    text,
    content,
    raw,
    isError: Boolean((raw as { isError?: unknown }).isError),
  };
}

export async function close(conn: GleanConnection): Promise<void> {
  if (conn.kind === "connected") await conn.transport.close().catch(() => undefined);
}

// ── Internals ───────────────────────────────────────────────

function selectArgumentKey(schema: unknown): string {
  const props = typeof schema === "object" && schema
    ? (schema as { properties?: Record<string, unknown> }).properties ?? {}
    : {};
  for (const key of ["message", "query", "prompt", "input"]) {
    if (isStringProp(props[key])) return key;
  }
  const first = Object.entries(props).find(([, v]) => isStringProp(v));
  return first?.[0] ?? "message";
}

function normalizeContent(value: unknown): ContentPart[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (item && typeof item === "object") {
      const part = item as { type?: unknown; text?: unknown };
      return {
        type: typeof part.type === "string" ? part.type : "unknown",
        text: typeof part.text === "string" ? part.text : undefined,
      };
    }
    return { type: "text", text: String(item) };
  });
}

function isStringProp(value: unknown) {
  return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "string";
}

function requestOptions(timeoutMs: number) {
  return { timeout: timeoutMs, resetTimeoutOnProgress: true };
}

function timeoutFetch(timeoutMs: number): FetchLike {
  return async (url, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}
