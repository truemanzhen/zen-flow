---
description: "Execute Spec Kit tasks through ZCW and Superpowers"
---

# ZCW Execute

Use this command after Spec Kit has produced `spec.md`, `plan.md`, and `tasks.md`.

1. Read `.specify/superpowers-handoff.json`.
2. Run `zcw bridge handoff --status executing --actor <codex|claude>` for the current project.
3. Run `zcw bridge guard --action "superpowers:executing-plans" --actor <codex|claude>`.
4. Execute `tasks.md` through the ZCW workflow and Superpowers implementation discipline.
5. Do not run `speckit.implement`, `superpowers:brainstorming`, or `superpowers:writing-plans` for this handed-off feature.
6. When implementation, verification, review, and branch finishing are complete, run `zcw bridge handoff --status complete --actor <codex|claude>`.

If the Spec Kit contract is missing or wrong, stop and run:

```bash
zcw bridge handoff --status blocked --reason "Describe the Spec Kit artifact gap" --actor <codex|claude>
```
