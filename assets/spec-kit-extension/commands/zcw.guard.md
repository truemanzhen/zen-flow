---
description: "Guard Spec Kit and Superpowers ownership boundaries"
---

# ZCW Guard

Check whether a requested Spec Kit or Superpowers action is allowed by the current handoff state.

Use the CLI guard:

```bash
zcw bridge guard --action "<action>" --actor <codex|claude>
```

The guard denies:

- `speckit.implement` while Superpowers handoff is `executing`.
- `superpowers:brainstorming` and `superpowers:writing-plans` when Spec Kit already owns `spec.md` and `plan.md`.
- `speckit.constitution` while Superpowers handoff is `executing`.

All guard decisions are appended to `.specify/bridge-events.jsonl`.
