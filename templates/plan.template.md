# [Feature Name]

> **Status:** Draft  
> **Created:** YYYY-MM-DD  
> **Author:** [Architect]

---

## Overview

[1-2 sentences: What this feature accomplishes and why it matters]

---

## Context

### Problem
[What problem does this feature solve?]

### Solution
[High-level approach to solving the problem]

### Non-Goals
- [What this feature explicitly does NOT do]

---

## Architecture

### Components

| Component | Purpose | Path |
|-----------|---------|------|
| [Name] | [What it does] | `src/path/to/file.ts` |
| [Name] | [What it does] | `src/path/to/file.ts` |

### Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| [Package] | [x.y.z] | [Why needed] |

### Data Flow

```
[Input] → [Component A] → [Component B] → [Output]
```

---

## Tasks

| ID | Name | Description | Depends On |
|----|------|-------------|------------|
| 001 | [Task Name] | [What to implement] | - |
| 002 | [Task Name] | [What to implement] | 001 |
| 003 | [Task Name] | [What to implement] | 001, 002 |

---

## Constraints

- [ ] TypeScript strict mode
- [ ] No new dependencies without approval
- [ ] All public APIs must have JSDoc
- [ ] [Add project-specific constraints]

---

## Acceptance Criteria

- [ ] All tasks completed and approved
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] Documentation updated
- [ ] [Add feature-specific criteria]

---

## Notes

[Any additional context, decisions made, or things to keep in mind]
