# Relay: Agent-to-Agent Coordination MCP Server

**Relay** is a Model Context Protocol (MCP) server that coordinates three AI roles—**Planner**, **Engineer**, and **Reviewer**—through a SQLite ledger. It provides a structured workflow for planning features, implementing tasks, and verifying code quality with an append-only exchange chain and in-process event bus.

## Key Features

- **SQLite ledger**: State stored at `~/.relay/ledger.db` with blockchain-style hash chaining.
- **Three roles**: Planner decomposes features; Engineer implements; Reviewer approves or rejects.
- **Event-driven await**: Engineer and Reviewer block on MCP tools until the other agent submits; no polling.
- **SSE transport**: Runs as an HTTP server (port 3456) with Server-Sent Events for IDE connections.
- **Templates**: Moxite-based briefings; overridable via `{projectRoot}/.relay/templates/`.

---

## Installation

### Prerequisites

- Node.js >= 18
- npm or pnpm

### Setup

1. **Install & build**:
    ```bash
    npm install
    npm run build
    ```

2. **Verify**:
    ```bash
    npm run start
    # Should output: Relay Daemon listening on port 3456
    ```

---

## Configuration

Add Relay to your MCP settings (e.g. `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "relay": {
      "command": "npx",
      "args": ["-y", "orchestrator-relay"]
    }
  }
}
```

The `relay` CLI starts the daemon if needed and connects via SSE to `http://localhost:3456`.

---

## Tools

### Planner

- `load_planner_protocol` — Initialize and load the Planner protocol.
- `create_project` — Register a project with root path and business goals.
- `propose_feature` — Define a feature with technical specs and acceptance criteria.
- `create_task` — Create a task and genesis exchange in the ledger.
- `get_project`, `get_feature` — Fetch context.

### Engineer

- `load_engineer_protocol` — Initialize and load the Engineer protocol.
- `await_reviewer_update` — Wait for Reviewer’s approval/rejection; returns briefing.
- `post_implementation_report` — Submit implementation report.
- `post_comments_resolution` — Submit fixes after rejection.
- `get_project`, `get_feature` — Fetch context.

### Reviewer

- `load_reviewer_protocol` — Initialize and load the Reviewer protocol.
- `await_engineer_update` — Wait for Engineer’s report/resolution; returns briefing.
- `post_approval` — Approve Engineer’s work.
- `post_rejection` — Reject with required fixes.

---

## Workflow

1. **Planner**: `load_planner_protocol` → Scope → Decompose → Validate (user approval) → `create_task` × N → Launch Engineer & Reviewer subagents in parallel.
2. **Engineer**: `await_reviewer_update({ taskId })` → Implement → `post_implementation_report` → `await_reviewer_update` → Loop (or handle rejection).
3. **Reviewer**: `await_engineer_update({ taskId })` → Review → `post_approval` or `post_rejection` → `await_engineer_update` → Loop.

Engineer and Reviewer coordinate via the SQLite ledger. The `await_*` tools block (with 5‑minute timeout) until the other agent submits; the event bus unblocks them when state advances.

---

## Data Storage

- **Ledger**: `~/.relay/ledger.db` — Projects, features, tasks, and exchanges (append-only chain).
- **Templates**: `{projectRoot}/.relay/templates/` — User overrides for briefing and protocol templates.

---

## Troubleshooting

- **Wrong project root**: Cursor may spawn MCP with `cwd = ~/`. Pass `projectRoot` explicitly in `load_*_protocol` calls (derived from workspace root).
- **Duplicate task crash**: `create_task` with an existing `taskId` returns a friendly message; no SqliteError.
- **Wait timeout**: If `await_*` times out, re-call the tool or check that the other agent has submitted. Set `RELAY_AWAIT_TIMEOUT_MS` (milliseconds) to change the timeout; default: 300000 (5 minutes).
- **Concurrent write conflict**: If both agents submit at once, one gets `STATE_CHANGED_WHILE_AWAITING_LOCK`; call `await_*` again to get the updated state.
- **Planner session ends unexpectedly**: If the Planner chat is closed or Cursor restarts while Engineer and Reviewer are running, the subagents may keep running until they hit their next await timeout. **Recovery:** Start a new Planner session, use `get_feature` / `get_project` to inspect existing state, and relaunch Engineer and Reviewer with the active `taskId`. They will receive the current briefing from the ledger; no state is lost.

---

## License

MIT
