# CODING GUIDELINES

These guidelines must be followed regardless of the language or framework used.

## 1. General Principles
- **KISS (Keep It Simple, Stupid)**: Avoid over-engineering. Explicit is better than implicit.
- **YAGNI (You Aren't Gonna Need It)**: Do not build features for the future. Build for now.
- **DRY (Don't Repeat Yourself)**: Extract common logic, but do not couple unrelated components just because they look similar.
- **Single Responsibility**: Each function, class, or module should do one thing and do it well.

## 2. Reliability & Safety
- **Fail Fast**: Check inputs and strictly validate state. Crash early rather than corrupting data.
- **Zero Trust**: Do not trust user input, network responses, or file system predictability. Handle errors gracefully.
- **Atomic Operations**: When modifying state or files, ensure the operation is either fully completed or not done at all (no partial updates).

## 3. Readability & Maintenance
- **Descriptive Naming**: Variable and function names should explain *what* they do, not *how* they do it.
  - Bad: `data`, `process()`, `temp`
  - Good: `userProfile`, `processPayment()`, `retryCount`
- **Comments as Why**: Comments should explain *why* code exists, not *what* it does. The code itself should show what it does.
- **Small Functions**: Functions should fit on a single screen. If they are too long, break them down.

## 4. version Control & Workflow
- **Atomic Commits**: Each change should be verification-ready.
- **No Mystery Code**: Do not commit commented-out code or debug prints (`console.log`, `print`).
