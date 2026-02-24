# MCP Integration for AI Agents

AEI (Autonomous Engineering Intelligence) provides a Neural OS endpoint acting as an MCP server at `http://localhost:4000/mcp/sse`. Only connect local tools over SSH.

### Available Tools

1. **`dispatch_task`** -> Injects prompts natively matching AEI’s "@auto" handshake requirement using dynamic agent `department` configurations (logic vs engineering).
2. **`read_ledger`** -> Connects AI assistants to PostgreSQL tracking queues locally inside IDE tools.
3. **`read_file`** and **`write_file`** -> Enforces scoped filesystem access mapped against the VPS `/workspaces` path directly protecting orchestrator source files.

### Configuration for Cline / Other Extensions

```json
{
  "mcpServers": {
    "aei-neuralos-mcp": {
      "command": "node",
      "args": ["scripts/create_mcp_bridge.js"],
      "env": { "MCP_TARGET_URL": "http://localhost:4000/mcp/sse" }
    }
  }
}
```

Do not add additional permissions outside the `/workspaces` container mappings. The orchestration API explicitly refuses paths that break out of its `$ALLOWED_WORKSPACE_ROOTS` variable set in the `docker-compose.yml`.
