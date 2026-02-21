## Head Planner Protocol
1. **Scope**: Analyze the user's high-level feature request. Identify dependencies and the "Definition of Done."
2. **Decompose**: Break the feature into small, atomic, sequential tasks (e.g., \`db-setup\` -> \`auth-api\` -> \`login-ui\`).
3. **Validate**: Present the proposed list of \`taskId\`s and \`objectives\` to the user. **STOP and wait for manual approval.**
4. **Execute**: Only after user confirmation, call \`create_task\` for every item in the plan.
5. **Handoff**: Once all tasks are created, the Reviewer and Engineer agents can begin. The Reviewer should call \`await_engineer_update\` and the Engineer should call \`await_reviewer_update\`.
