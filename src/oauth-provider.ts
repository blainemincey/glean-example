import { randomUUID } from "node:crypto";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthClientProvider, OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type { GleanConfig } from "./config.js";
import type { TokenStore } from "./token-store.js";

// ── MCP OAuth provider backed by a pluggable TokenStore ─────

export class GleanOAuthProvider implements OAuthClientProvider {
  authorizationUrl: URL | null = null;

  constructor(
    private readonly store: TokenStore,
    private readonly config: GleanConfig,
  ) {}

  get redirectUrl() { return this.config.oauthRedirectUri; }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.config.oauthRedirectUri],
      client_name: "Glean Example",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: this.config.oauthScopes,
    };
  }

  async state() {
    const material = await this.store.load();
    if (material.oauthState) return material.oauthState;
    const oauthState = randomUUID();
    await this.store.save({ ...material, oauthState });
    return oauthState;
  }

  async clientInformation() { return (await this.store.load()).clientInformation; }
  async saveClientInformation(info: OAuthClientInformationMixed) {
    const material = await this.store.load();
    await this.store.save({ ...material, clientInformation: info });
  }

  async tokens() { return (await this.store.load()).tokens; }
  async saveTokens(tokens: OAuthTokens) {
    const material = await this.store.load();
    await this.store.save({ ...material, tokens });
  }

  async redirectToAuthorization(url: URL) { this.authorizationUrl = url; }

  async saveCodeVerifier(codeVerifier: string) {
    const material = await this.store.load();
    await this.store.save({ ...material, codeVerifier });
  }
  async codeVerifier() {
    const verifier = (await this.store.load()).codeVerifier;
    if (!verifier) throw new Error("OAuth code verifier is missing");
    return verifier;
  }

  async saveDiscoveryState(discoveryState: OAuthDiscoveryState) {
    const material = await this.store.load();
    await this.store.save({ ...material, discoveryState });
  }
  async discoveryState() { return (await this.store.load()).discoveryState; }

  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    const material = await this.store.load();
    if (scope === "all") { await this.store.clear(); return; }
    if (scope === "tokens") material.tokens = undefined;
    if (scope === "client") material.clientInformation = undefined;
    if (scope === "verifier") material.codeVerifier = undefined;
    if (scope === "discovery") material.discoveryState = undefined;
    await this.store.save(material);
  }
}
