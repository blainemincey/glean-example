import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";

// ── Token persistence ───────────────────────────────────────
// File-backed store suitable for single-user dev/example usage.
// Replace with a database-backed implementation for production
// or multi-user scenarios.

export type StoredMaterial = {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  oauthState?: string;
  discoveryState?: OAuthDiscoveryState;
};

export interface TokenStore {
  load(): Promise<StoredMaterial>;
  save(material: StoredMaterial): Promise<void>;
  clear(): Promise<void>;
}

export class FileTokenStore implements TokenStore {
  constructor(private readonly path: string) {}

  async load(): Promise<StoredMaterial> {
    try {
      const raw = await readFile(this.path, "utf-8");
      return JSON.parse(raw) as StoredMaterial;
    } catch {
      return {};
    }
  }

  async save(material: StoredMaterial): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(material, null, 2), "utf-8");
  }

  async clear(): Promise<void> {
    await this.save({});
  }
}
