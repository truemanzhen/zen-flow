---
name: zcw-issue
description: Manage local ZCW issue loops. Use when creating, discovering, triaging, updating, or closing workflow issues from manual findings or ZCW quality artifacts.
---

# ZCW Issue

Use `zcw issue` to keep implementation gaps visible until they are resolved.

## Commands

```bash
zcw issue create --title "Missing verify evidence" --severity high
zcw issue list
zcw issue status ISS-20260629-001
zcw issue update ISS-20260629-001 --status in_progress --note "Investigating"
zcw issue close ISS-20260629-001 --resolution "Fixed and verified"
zcw issue discover
```

## Storage

- Active issues: `.zcw/issues/issues.jsonl`
- Closed issues: `.zcw/issues/issue-history.jsonl`

`zcw issue discover` reads `.zcw/quality/audit-latest.json`, `test-latest.json`, and `review-latest.json`, then creates one issue for each non-passing check. Existing open or in-progress issues for the same quality check are reused instead of duplicated.

## Loop

1. Search/load relevant project knowledge before changing code.
2. Create or discover issues.
3. Move selected issues to `in_progress`.
4. Implement the fix through the appropriate ZCW workflow.
5. Verify with `zcw audit`, `zcw test`, or `zcw review`.
6. Close the issue with the concrete resolution.
