---
name: zcw-review
description: Run read-only ZCW review checks. Use when inspecting dirty files, TODO/FIXME markers, sensitive file paths, and lockfile changes without using Maestro review skills.
---

# ZCW Review

Use `zcw review` for lightweight read-only review checks.

## Output

The command writes:

- `.zcw/quality/review-latest.json`
- `.zcw/quality/runs/<timestamp>-review.json`

If a ZCW session exists, the latest session `status.json` receives a quality summary.

Use `zcw review --json` for structured output.
