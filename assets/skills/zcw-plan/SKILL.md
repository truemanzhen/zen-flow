---
name: zcw-plan
description: Create Superpowers-aware ZCW plan artifacts from an analysis or direct intent. Use before implementation to bind Spec Kit WHAT to Superpowers HOW.
---

# ZCW Plan

Use `zcw plan` to convert analysis into a durable execution contract.

The command writes:

- `.zcw/pipeline/plans/PLN-*.json`
- `.zcw/pipeline/plans/PLN-*.md`

The plan does not replace `/zcw-design` or `/zcw-build`; it records which ZCW phase and Superpowers skill must be used.

## Flow

```bash
zcw plan --from ANL-YYYYMMDDHHMMSS-xxxx
zcw plan --intent "fix payment retry bug" --execution-mode executing-plans
```

Execution mode options:

- `executing-plans`
- `subagent-driven-development`

TDD mode options: `tdd`, `direct`.
Review mode options: `off`, `standard`, `thorough`.
