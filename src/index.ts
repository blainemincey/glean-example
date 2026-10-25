// ── Public API ───────────────────────────────────────────────
// Import from this package to use the Glean client in another project:
//
//   import { connect, chat, close, loadConfig } from "glean-example";
//   import { FileTokenStore } from "glean-example/token-store";

export { loadConfig, type GleanConfig } from "./config.js";
export { connect, finishAuth, listTools, chat, close, type GleanConnection, type GleanToolResult, type GleanTool, type ContentPart } from "./glean-client.js";
export { GleanOAuthProvider } from "./oauth-provider.js";
export { FileTokenStore, type TokenStore, type StoredMaterial } from "./token-store.js";
