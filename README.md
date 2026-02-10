# Orchestrator Relay

**Government-Grade AI Agent Orchestration.**

Orchestrator Relay is a "Zero Trust" agentic workflow engine designed for high-stakes software development. It enforces a strict separation of concerns between **Architect** (Planning & Oversight) and **Engineer** (Execution & Implementation), ensuring that no code is written without a directive, and no directive is finalized without verification.

> **"Trust, but verify. Then verify again."**

---

## 🚀 Philosophy

Orchestrator Relay is built on three core pillars:

1.  **Zero Trust Architecture**: The system assumes the AI Engineer will make mistakes,hallucinate, or drift from the plan. The Architect's sole job is to catch these errors *before* they are committed.
2.  **One-Shot Execution**: Agents do not run in infinite loops. They execute one atomic "Act" (planning or coding), save their state, and exit. This forces human-in-the-loop review at critical checkpoints.
3.  **State Resilience**: The entire workflow state is persisted to disk (`state.json`). If the process crashes, the power fails, or the network drops, Orchestrator Relay resumes exactly where it left off.

---

## 📦 Installation

### Global Install (Recommended for CLI usage)
```bash
npm install -g orchestrator-relay
```

### Local Project Install
```bash
npm install -D orchestrator-relay
```

---

## 🛠️ Usage

### 1. Initialize a Project
Turn any directory into a Orchestrator Relay-managed project. This creates the `.relay` directory, installs the strict `CODING_GUIDELINES.md`, and sets up the project structure.

```bash
cd my-project
relay init
```

### 2. Add a Feature
Orchestrator Relay organizes work into **Features**. A feature is a distinct unit of functionality with its own **Plan**, **Tasks**, and **State**.

```bash
relay add my-feature
```

You will be prompted to define:
*   **Goal**: What does this feature achieve?
*   **Tasks**: Initial breakdown of work.

### 3. The Workflow (The Loop)

Orchestrator Relay operates in a semi-autonomous loop using the **Pulse Protocol**. You are the **Orchestrator**.

#### **Act 1: Activation**
First, you "activate" the agent. This loads the Persona (System Prompt) into the context window.

```bash
relay architect my-feature
```

The system will output the System Prompt. You (or your Agent IDE) should read this, then strictly follow the instruction to begin the loop.

#### **Act 2: The Pulse (Execution)**
Once activated, the agent enters the execution loop. This command is stateless and can be run repeatedly.

```bash
relay architect my-feature pulse
```

*   **Auto-Pilot**: The system automatically selects the next pending task.
*   **Context**: The agent receives the exact file path and content of the active task.
*   **Result**: The agent writes a **Directive** for the Engineer.

#### **Act 3: The Engineer**
Similar to the Architect, the Engineer has an activation and pulse phase.

```bash
# Activation
relay engineer my-feature

# Pulse (Execution)
relay engineer my-feature pulse
```

*   **Action**: The Engineer reads the Architect's directive, writes code, runs tests, and writes a **Report**.
*   **Review**: The Architect (running `pulse` again) will review the report and either **Approve** (ending the task) or **Reject** (looping back to Engineer).

---

## 🧠 System Prompts & Customization

Orchestrator Relay comes with "Government-Grade" default personas (Zero Trust Architect, Precision Engineer). You can customize them.

1.  **Create Custom Prompts**:
    Create `.relay/prompts/architect.md` or `.relay/prompts/engineer.md`.
    Orchestrator Relay will automatically prefer these over the built-in defaults.

2.  **Edit the Pipeline (`bootstrap.mjs`)**:
    The `.relay/bootstrap.mjs` file defines the exact steps the agents take. You can add your own steps!

    ```javascript
    // .relay/bootstrap.mjs
    export const engineer = createOrchestrator Relay({
        steps: [
            systemPrompt('engineer'),
            loop([
                lookupTask(),
                awaitFile('directiveFile'),
                readDirective(),
                // Add your custom step here!
                myCustomSecurityScan(), 
                promptWrite('reportFile')
            ])
        ]
    });
    ```

---

## 🛡️ Hardening Features

Orchestrator Relay is designed to survive hostile environments.

*   **Concurrency Locking**: Uses `LockManager` to prevent race conditions. You cannot run `architect` and `engineer` simultaneously on the same feature.
*   **Crash Recovery**: All state is saved *after* every agent execution.
*   **Protocol Enforcement**:
    *   Agents cannot modify `CODING_GUIDELINES.md`.
    *   The "Engineer" cannot change the "Plan".
    *   The "Architect" cannot write code.
*   **Strict Typing**: The core is written in strict TypeScript with zero `as any` casts in critical paths.

---

## 📂 Project Structure

```text
my-project/
├── .relay/
│   ├── CODING_GUIDELINES.md  # Immutable laws of the project
│   ├── bootstrap.mjs         # Pipeline definition (customizable)
│   └── features/
│       └── my-feature/
│           ├── plan.md       # High-level architecture
│           ├── state.json    # The brain (persisted state)
│           ├── tasks/        # Task definitions
│           └── exchange/     # The conversation history (Directives & Reports)
├── src/                      # Your actual code
└── README.md
```

---

## 🔧 Commands Reference

| Command | Description |
| :--- | :--- |
| `relay init` | Initialize Orchestrator Relay in the current directory. |
| `relay add <name>` | Create a new feature workspace. |
| `relay architect <feature>` | Run the Architect agent to plan or review work. |
| `relay engineer <feature>` | Run the Engineer agent to execute the directive. |
| `relay features` | List all features and their current status. |
| `relay help` | Show help message. |

---

© 2026 @tsomaia.tech. Built for the paranoid.
