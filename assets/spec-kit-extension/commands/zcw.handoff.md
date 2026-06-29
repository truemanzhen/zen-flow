---
description: "Create or update the ZCW Superpowers handoff state"
---

# ZCW Handoff

Create or update `.specify/superpowers-handoff.json` after Spec Kit generates `tasks.md`.

Run:

```bash
zcw bridge handoff --status ready --actor <codex|claude>
```

If the feature directory cannot be inferred, pass it explicitly:

```bash
zcw bridge handoff --status ready --feature specs/<feature-name> --actor <codex|claude>
```

Valid statuses are `ready`, `executing`, `blocked`, and `complete`.
