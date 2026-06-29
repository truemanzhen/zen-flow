---
name: zcw-audit
description: Run the local ZCW quality audit pipeline. Use when checking session evidence, active Spec Kit artifacts, phase readiness, verification state, and git cleanliness without invoking Maestro quality skills.
---

# ZCW Audit

Use `zcw audit` for read-only quality gate checks.

## Output

The command writes:

- `.zcw/quality/audit-latest.json`
- `.zcw/quality/runs/<timestamp>-audit.json`

If a ZCW session exists, the latest session `status.json` receives a quality summary.

Use `zcw audit --json` for structured output.
