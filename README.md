# Glean MCP Example

A minimal Node.js/TypeScript project that connects to [Glean](https://www.glean.com/) through its remote [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server. It demonstrates OAuth authentication, MCP tool discovery, and querying Glean for Salesforce opportunity data — ARR, ERR, champions, go-live dates, and more.

The core modules are framework-agnostic and designed to be copied into or linked from other projects.

## Prerequisites

- Node.js 22+
- A Glean deployment with MCP enabled
- Salesforce connected as a Glean data source (for opportunity queries)
- Network access to your company's Glean endpoint

## Quick Start

### 1. Install

```bash
git clone https://github.com/blainemincey/glean-example.git
cd glean-example
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and set your company's Glean MCP URL:

```
GLEAN_MCP_URL="https://<company>-be.glean.com/mcp/default"
```

### 3. Start the server

```bash
npm run dev
```

### 4. Authenticate with Glean

Open [http://localhost:3090/oauth/login](http://localhost:3090/oauth/login) in your browser. This starts the Glean OAuth flow — authorize the app when prompted. You'll be redirected back with a confirmation once connected.

Check your status at any time:

```bash
curl http://localhost:3090/health
```

### 5. Query an opportunity

**By Salesforce Opportunity ID:**

```bash
curl http://localhost:3090/api/opportunity/006XXXXXXXXXXXX
```

This searches Glean for ARR, ERR, champions, go-live dates, deal stage, close date, and key stakeholders associated with that opportunity.

**With custom fields:**

```bash
curl "http://localhost:3090/api/opportunity/006XXXXXXXXXXXX?fields=ARR,champions,go-live+date"
```

**Free-form query:**

```bash
curl -X POST http://localhost:3090/api/query \
  -H 'Content-Type: application/json' \
  -d '{"message": "What is the current deal stage for opportunity 006XXXXXXXXXXXX?"}'
```

**Via CLI** (after OAuth is complete):

```bash
npm run query -- 006XXXXXXXXXXXX
npm run query -- 006XXXXXXXXXXXX "ARR, champions, go-live date"
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | MCP configuration and authentication status |
| `GET` | `/oauth/login` | Start Glean OAuth flow (open in browser) |
| `GET` | `/oauth/callback` | OAuth redirect handler |
| `POST` | `/oauth/logout` | Clear stored Glean tokens |
| `GET` | `/api/tools` | List available Glean MCP tools |
| `POST` | `/api/query` | Send a free-form message to Glean's chat tool |
| `GET` | `/api/opportunity/:id` | Query Glean for a Salesforce opportunity by ID |

## Project Structure

```
src/
  config.ts          — Environment-based configuration
  token-store.ts     — Pluggable token persistence (file-backed default)
  oauth-provider.ts  — MCP SDK OAuth provider backed by any TokenStore
  glean-client.ts    — Core integration: connect, listTools, chat, close
  server.ts          — Express server with OAuth flow and query endpoints
  cli.ts             — CLI for quick queries after authenticating
  index.ts           — Barrel export for use as a library
```

## Using in Another Project

The core modules (`glean-client.ts`, `oauth-provider.ts`, `token-store.ts`, `config.ts`) have no Express dependency and are designed to be portable.

### Option A: Copy the modules

Copy the four core files into your project's source tree. The only external dependency is `@modelcontextprotocol/sdk`.

### Option B: Link as a local package

```bash
# In glean-example/
npm run build
npm link

# In your other project/
npm link glean-example
```

Then import directly:

```typescript
import { connect, chat, close, loadConfig } from "glean-example";
import { FileTokenStore } from "glean-example/token-store";

const config = loadConfig();
const store = new FileTokenStore("./.glean-tokens.json");

const conn = await connect(store, config);
if (conn.kind === "redirect") {
  // User needs to authenticate — redirect them to conn.url
}

const result = await chat(conn, "Find ARR for opportunity 006XXXXXXXXXXXX");
console.log(result.text);

await close(conn);
```

### Custom token storage

Implement the `TokenStore` interface to swap file-based storage for a database, Redis, or any other backend:

```typescript
import type { TokenStore, StoredMaterial } from "glean-example";

class MyDatabaseTokenStore implements TokenStore {
  async load(): Promise<StoredMaterial> { /* ... */ }
  async save(material: StoredMaterial): Promise<void> { /* ... */ }
  async clear(): Promise<void> { /* ... */ }
}
```

## How It Works

This project does **not** call Glean REST APIs directly. It uses Glean's remote MCP server over Streamable HTTP:

1. The MCP SDK handles OAuth (authorization code + PKCE) with Glean
2. After authentication, it connects an MCP client to the Glean endpoint
3. Queries are sent to Glean's `chat` tool as natural-language messages
4. Glean searches across connected sources (Salesforce, Google Drive, Gmail, meeting transcripts, etc.) and returns evidence
5. The Salesforce Opportunity ID is passed as part of the message — Glean's AI resolves it against connected Salesforce data

## Configuration Reference

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `GLEAN_MCP_URL` | Yes | — | Company Glean MCP endpoint |
| `OAUTH_REDIRECT_URI` | No | `http://localhost:3090/oauth/callback` | OAuth callback URL |
| `GLEAN_OAUTH_SCOPES` | No | `SEARCH CHAT MCP DOCUMENTS TOOLS ENTITIES AGENTS` | Glean OAuth scopes |
| `PORT` | No | `3090` | Server port |
| `GLEAN_HTTP_TIMEOUT` | No | `180000` | HTTP timeout in milliseconds |
| `GLEAN_MCP_TOOL_TIMEOUT` | No | Same as HTTP timeout | MCP tool call timeout in milliseconds |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
| `npm run query -- <id> [fields]` | CLI query by opportunity ID |
