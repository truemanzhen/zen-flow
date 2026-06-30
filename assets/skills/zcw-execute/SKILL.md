---
name: zcw-execute
description: Create ZCW execution tracking from a Superpowers-aware plan. Use when a PLN artifact is ready and implementation should proceed through the recorded ZCW phase and Superpowers skill contract.
---

# ZCW Execute

Use `zcw execute --from <plan-id>` to create an execution tracking artifact from a ZCW plan.

The command writes:

- `.zcw/pipeline/executions/EXE-*.json`
- `.zcw/pipeline/executions/EXE-*.md`

The execution artifact is a checklist for the agent. It does not bypass Superpowers. When a step lists a Superpowers skill, load that skill at the indicated ZCW phase before implementing.

## Flow

```bash
zcw execute --from PLN-YYYYMMDDHHMMSS-xxxx
```

Then follow the first recorded command, usually `/zcw-open`, `/zcw-hotfix`, or `zcw bridge handoff --status ready`.
