---
name: zcw-harvest
description: Harvest completed Spec Kit artifacts into local ZCW knowhow. Use when a specs/<change> directory should be summarized into .zcw/knowledge/kn for later retrieval by zcw-load.
---

# ZCW Harvest

Use `zcw harvest <spec-dir>` after a Spec Kit change has useful reusable context.

## Workflow

1. Confirm the source is a project-local `specs/<change>` directory.
2. Run `zcw harvest specs/<change>`.
3. Use `zcw kn search "<topic>"` to confirm the harvested entry is searchable.

The command reads `spec.md`, `plan.md`, `tasks.md`, and `.zcw.yaml` when present. It writes a knowhow entry tagged with `harvest` and `spec-kit`.
