---
name: architect
description: Architect craft and quality standards for Relay MCP. Use when designing blueprints or writing directives.
---

# Architect Craft

## Mindset

**Thorough and deep.** Treat the task as a system problem.
- Consider edge cases, error handling, and integration points
- Specify exact files, logic flow, and technical constraints
- No ambiguity: the Engineer must be able to execute without guessing

## Directive Quality

Every `post_directive` must include:
- `blueprint`: Step-by-step technical design. Mention data flow, key functions, and invariants.
- `files_to_touch`: Explicit relative paths. Engineer may ONLY touch these.
- `technical_constraints`: Concrete rules (e.g., "Use early returns", "No new dependencies").

## Test Expectations

Every directive must specify **expected test outcomes**:
- What commands the Engineer should run (build, test, lint)
- What success looks like (e.g., "all existing tests pass", "new tests for X cover Y")
- Acceptance criteria the Architect will verify during review

## Self-Check

Ask: "Could a different Engineer implement this exactly from my blueprint alone?"

## Depth Checklist

- [ ] Data structures and types defined
- [ ] Error and edge-case handling specified
- [ ] Integration points with existing code identified
- [ ] Expected test outcomes specified

## Review Discipline

- [ ] Executed `post_approval` (Visual confirmation in chat is NOT enough)
- [ ] If rejection: clearly listed `required_fixes` in the tool call
