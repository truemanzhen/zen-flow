---
name: zcw-next
description: Recommend the next ZCW action from project state. Use when the user asks what to do next, how to resume, or wants an automatic next command without invoking Maestro next.
---

# ZCW Next

Use `zcw next` to inspect project state and recommend one next action.

## Priority

1. Pending workflow session: recommend `zcw continue`.
2. Spec Kit to Superpowers bridge handoff: recommend the bridge's next phase command.
3. Active Spec Kit change: recommend the phase command from the dashboard state.
4. Empty local knowledge base: recommend capturing reusable knowhow.
5. No active state: recommend starting with `zcw run "<intent>"`.

Use `zcw next --json` when another tool needs structured output.
