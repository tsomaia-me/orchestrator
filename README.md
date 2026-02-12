# Relay: Local-First Agent Coordination Server

**Relay** is a Model Context Protocol (MCP) server that enables **autonomous coordination** between AI agents (Architect & Engineer) directly within your local codebase. It provides a structured, state-machine-driven environment for planning, executing, and verifying complex coding tasks without the bureaucracy of external project management tools.

## 🚀 Key Features

-   **Bureaucracy down to minimum**: State is managed purely via local files in `.relay/`.
-   **Structured Protocol**: Enforces a strict **Architect (Plan) -> Engineer (Execute) -> Architect (Review)** loop.
-   **Atomic Locking**: Prevents race conditions when multiple agents try to write state simultaneously.
-   **Local-First**: All data lives in your repo. Git-friendly JSON/Markdown storage.
-   **Observability**: Structured logs in `.relay/tasks.jsonl` for full audit trails.

---

## 📦 Installation

Relay is designed to be run as a local MCP server.

### Prerequisites
-   Node.js >= 18
-   npm or pnpm

### Setup
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/tsomaia/relay.git
    cd relay
    ```

2.  **Install & Build**:
    ```bash
    npm install
    npm run build
    ```

3.  **Verify**:
    ```bash
    npm run start
    # Should output: Relay MCP Server running...
    ```

---

## 🛠️ Configuration

To use Relay with your AI IDE (Cursor, Windsurf) or Claude Desktop, add it to your `mcpServers` configuration.

### Cursor / Windsurf / Claude Desktop

Add this to your MCP settings file (typically `~/.cursor/mcp.json` or similar):

```json
{
  "mcpServers": {
    "relay": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/relay/dist/shell/mcp.js"
      ]
    }
  }
}
```

*Replace `/ABSOLUTE/PATH/TO/relay` with the actual path where you cloned the repo.*

---

## 🤖 Usage

Once connected, your AI agents will have access to the **Relay Toolset**.

### Roles

Relay defines two distinct roles embedded in the protocol:

1.  **Architect** (`relay://prompts/architect`)
    -   **Goal**: Plan tasks, review code, and provide directives.
    -   **Tools**: `plan_task`, `submit_directive`.
    -   **Context**: Sees the big picture and the Engineer's reports.

2.  **Engineer** (`relay://prompts/engineer`)
    -   **Goal**: Execute directives, write code, and verify fixes.
    -   **Tools**: `submit_report`.
    -   **Context**: Sees the specific Directive to implement.

### The Protocol Loop

1.  **Start**: Architect calls `plan_task("Feature X", "Description...")`.
    -   *State*: `planning`
2.  **Direct**: Architect calls `submit_directive(taskId, "## EXECUTE...", decision="REJECT")`.
    -   *State*: `waiting_for_engineer`
3.  **Execute**: Engineer reads directive, writes code, tests it.
4.  **Report**: Engineer calls `submit_report(taskId, "## CHANGES...", status="COMPLETED")`.
    -   *State*: `waiting_for_architect`
5.  **Review**: Architect reads report.
    -   If good: `submit_directive(..., decision="APPROVE")`. -> **Task Complete**.
    -   If bad: `submit_directive(..., decision="REJECT")`. -> **Loop back to Step 2**.

---

## 🔍 Observability

Relay keeps a transparent record of all activities in your project root:

-   **.relay/state.json**: The current "Head" of the state machine (Active Task, Status).
-   **.relay/tasks.jsonl**: A structured log of all tasks started and their metadata.
-   **.relay/exchanges/**: Markdown files containing the actual content of every Directive and Report, versioned by iteration (e.g., `001-002-engineer-feat-x.md`).

---

## ⚠️ Troubleshooting

-   **"Task stuck in loop"**: Ensure the Architect uses `decision: "APPROVE"` to close the task.
-   **"Lock file exists"**: If Relay crashes, a `relay.lock` file might remain in `.relay/`. It automatically expires after 1 hour, or you can manually delete it.

---

## License

MIT
