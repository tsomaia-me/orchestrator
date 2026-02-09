# Relay

**Government-Grade AI Agent Orchestration.**

Relay is a "Zero Trust" agentic workflow engine designed for high-stakes software development. It enforces a strict separation of concerns between **Architect** (Planning & Oversight) and **Engineer** (Execution & Implementation), ensuring that no code is written without a directive, and no directive is finalized without verification.

> **"Trust, but verify. Then verify again."**

---

## 🚀 Philosophy

Relay is built on three core pillars:

1.  **Zero Trust Architecture**: The system assumes the AI Engineer will make mistakes,hallucinate, or drift from the plan. The Architect's sole job is to catch these errors *before* they are committed.
2.  **One-Shot Execution**: Agents do not run in infinite loops. They execute one atomic "Act" (planning or coding), save their state, and exit. This forces human-in-the-loop review at critical checkpoints.
3.  **State Resilience**: The entire workflow state is persisted to disk (`state.json`). If the process crashes, the power fails, or the network drops, Relay resumes exactly where it left off.

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
Turn any directory into a Relay-managed project. This creates the `.relay` directory, installs the strict `CODING_GUIDELINES.md`, and sets up the project structure.

```bash
cd my-project
relay init
```

### 2. Add a Feature
Relay organizes work into **Features**. A feature is a distinct unit of functionality with its own **Plan**, **Tasks**, and **State**.

```bash
relay add my-feature
```

You will be prompted to define:
*   **Goal**: What does this feature achieve?
*   **Tasks**: Initial breakdown of work.

### 3. The Human Protocol (The Loop)

Relay creates a **collaborative loop** between you (the Human) and the Agents. You are the trigger. You are the verify-er.

**The Golden Rule**: Never run Relay in a background loop. Run it once, read the output, perform the required action, and run it again.

#### **Phase 1: Initialization**
When you run `relay init`, Relay creates a `.relay` directory. This is the **Control Center**.
*   **`bootstrap.mjs`**: Defines the "Pipeline" (what steps the agents take).
*   **`prompts/`**: (Optional) Folder where you can override the default System Prompts for `architect.md` and `engineer.md`.

#### **Phase 2: The Action Loop**

1.  **Trigger Architect**: `relay architect <feature>`
    *   **Agent Action**: Reads your `plan.md` and current code.
    *   **Agent Output**: Writes a **Directive** file (e.g., `exchange/001-001-architect.md`).
    *   **Human Action**: Read the Directive. Does it make sense? Is it safe?
        *   *If yes*: Do nothing. Proceed to Engineer.
        *   *If no*: Edit the Directive file directly to correct the Architect, or run `relay architect` again to regenerate.

2.  **Trigger Engineer**: `relay engineer <feature>`
    *   **Agent Action**: Reads the **Directive**. Implements the code. Runs tests.
    *   **Agent Output**: Writes a **Report** file (e.g., `exchange/001-001-engineer.md`) and updates `state.json`.
    *   **Human Action**: **VERIFY**. Run the tests yourself. Open the app.
        *   *If broken*: Do not proceed. The Engineer failed.
        *   *If working*: Proceed to Architect for approval.

3.  **Trigger Architect (Review)**: `relay architect <feature>`
    *   **Agent Action**: Reads the Engineer's **Report**. Checks constraints.
    *   **Agent Output**: Writes a **Verdict** (APPROVE or REJECT).
    *   **System Action**: If `APPROVE`, the feature status is updated to `approved`. The loop ends.

---

## 🧠 System Prompts & Customization

Relay comes with "Government-Grade" default personas (Zero Trust Architect, Precision Engineer). You can customize them.

1.  **Create Custom Prompts**:
    Create `.relay/prompts/architect.md` or `.relay/prompts/engineer.md`.
    Relay will automatically prefer these over the built-in defaults.

2.  **Edit the Pipeline (`bootstrap.mjs`)**:
    The `.relay/bootstrap.mjs` file defines the exact steps the agents take. You can add your own steps!

    ```javascript
    // .relay/bootstrap.mjs
    export const engineer = createRelay({
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

Relay is designed to survive hostile environments.

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
| `relay init` | Initialize Relay in the current directory. |
| `relay add <name>` | Create a new feature workspace. |
| `relay architect <feature>` | Run the Architect agent to plan or review work. |
| `relay engineer <feature>` | Run the Engineer agent to execute the directive. |
| `relay features` | List all features and their current status. |
| `relay help` | Show help message. |

---

**Relay** © 2026 @tsomaia.tech. Built for the paranoid.
