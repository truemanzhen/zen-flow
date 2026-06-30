---
name: zcw-analyze
description: Create structured ZCW analysis artifacts before planning. Use when turning a user intent into scope, impact, knowledge context, and Superpowers skill bindings.
---

# ZCW Analyze

Use `zcw analyze "<intent>"` before `zcw plan` when the task needs a durable analysis artifact.

The command writes:

- `.zcw/pipeline/analyses/ANL-*.json`
- `.zcw/pipeline/analyses/ANL-*.md`

The artifact records task type, scope verdict, knowledge matches, likely artifacts, and the Superpowers skills that later phases must load.

## Flow

```bash
zcw analyze "build payment retry support"
zcw plan --from ANL-YYYYMMDDHHMMSS-xxxx
zcw execute --from PLN-YYYYMMDDHHMMSS-xxxx
```

Use `--code` only when CodeGraph context is needed.
