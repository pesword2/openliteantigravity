# Open-Antigravity AI Tooling & MCP Guide

This document outlines how autonomous coding assistants (like Cline, Cursor, or Codex) securely interface with the **AEI (Autonomous Engineering Intelligence)** environment using the **Model Context Protocol (MCP)**.

## 1. Context: Why MCP?

The AEI Orchestrator acts as a remote Engine running in a locked-down Docker container on an IONOS VPS. It possesses full execution power over the task queue, PostgreSQL ledgers, and filesystem Workspaces.

Instead of writing raw scripts or crafting brute-force `curl` requests over SSH to manage tasks, local AI agent tooling can natively bind to AEI via an MCP Server. This immediately unlocks structured UI discovery of server capabilities directly inside your local developer assistant without writing a line of plugin code.

## 2. MCP Server Architecture

- **Host Environment:** `services/orchestrator/server.js` (NodeJS native HTTP handler)
- **Protocol:** `Server-Sent Events (SSE)` Transport Layer
- **Endpoint Structure:**
  - `GET /mcp/sse` -> Initiates the event stream handshake and assigns a `sessionId`.
  - `POST /mcp/messages` -> Payload transport layer for subsequent JSON-RPC interactions.
- **Transport Binding:** Hosted out of `http://localhost:4000/` via SSH proxy tunneled from the VPS.

## 3. Connecting Your Client

If you are using an MCP-compatible assistant (like Cline), configure it as follows:

```json
{
  "mcpServers": {
    "aei-neuralos-mcp": {
      "command": "node",
      "args": [
        "scripts/create_mcp_bridge.js"
      ],
      "env": {
        "MCP_TARGET_URL": "http://localhost:4000/mcp/sse"
      }
    }
  }
}
```

*(Note: SSE bridges generally require a small script proxy depending on your IDE configuration to convert CLI stdin/stdout directly into HTTP streams, but many tools are adding Native SSE endpoint support directly.)*

## 4. Exposed Native Toolbox

Currently, AEI natively surfaces the following Tools through the MCP spec:

### System & Ledger Navigation

#### `read_ledger`

Read the PostgreSQL Task Ledger to check the status or artifacts of previously run AEI workloads.

- **Fields:**
  - `limit` (number, optional, default: 5)
  - `taskId` (string, optional)

### Task Execution (Neural OS Handshake)

#### `dispatch_task`

Send an explicit intent block to AEI to be autonomously routed and executed on the VPS. This automatically formats the prompt with the `@auto: [Neural OS Handshake]` protocol string.

- **Fields:**
  - `department` (enum: 'logic', 'engineering') -> Routes to Azure GPT-4 or IONOS Llama respectively.
  - `action` (string) -> The summary of the atomic intent.
  - `constraints` (array of strings, optional)
  - `prompt` (string, optional) -> The detailed problem definition or prompt context.

### Workspace File I/O

The Orchestrator defines safe Sandbox boundaries (the `/workspaces` Docker volume mount). The MCP server guarantees that tooling cannot path-traverse outside these limits.

#### `read_file`

Safely read an absolute or relative file inside the AEI workspace root.

- **Fields:**
  - `filePath` (string) -> e.g. `/workspaces/project-1/package.json`

#### `write_file`

Safely construct or overwrite a file inside the AEI workspace root.

- **Fields:**
  - `filePath` (string) -> e.g. `/workspaces/project-1/index.js`
  - `content` (string) -> Full file text payload.

## 5. Security & Isolation Playbook

When routing AI systems into AEI, strictly enforce the following:

- **1. Network Restriction:** The MCP endpoints `/mcp/sse` and `/mcp/messages` should only be bound on internal VPS loops and strictly accessed over authenticated SSH port forwards mapping `4000:127.0.0.1:4000`. Never expose port `4000` to `0.0.0.0` over the public internet.
- **2. Workspace Chroot:** The `ALLOWED_WORKSPACE_ROOTS` variable specifically blocks access to the orchestrator's source files. The AI can *use* the orchestrator, it cannot *modify* the orchestrator through MCP commands.
- **3. Graceful Upgrades:** Always construct new tools inside the SDK `mcpServer.tool()` block synchronously in `server.js` before attempting to consume them from the client connection.
