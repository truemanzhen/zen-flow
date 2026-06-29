---
name: zcw-archive
description: "ZCW Phase 5: Archive. Invoke with /zcw-archive. Merge delta specs into main specs with Spec Kit semantics, archive change."
---

# ZCW Phase 5: Archive (Archive)

## Prerequisites

- Verification passed (Phase 4 complete)
- Branch handled
- `verify_result: pass` in `specs/<name>/.zcw.yaml`

## Steps

### 0. Output Language Constraint

Archive summaries and lifecycle closure notes must use the language of the user request that triggered this workflow.

### 0. Entry State Verification (Entry Check)

Execute entry verification:

```bash
ZCW_ENV="${ZCW_ENV:-$(find . "$HOME"/.*/skills "$HOME/.config" "$HOME/.gemini" -path '*/zcw/scripts/zcw-env.sh' -type f -print -quit 2>/dev/null)}"
if [ -z "$ZCW_ENV" ]; then
  echo "ERROR: zcw-env.sh not found. Ensure the zcw skill is installed." >&2
  return 1
fi
. "$ZCW_ENV"
"$ZCW_BASH" "$ZCW_STATE" check <name> archive
```

Proceed to Step 1 after verification passes. The script outputs specific failure reasons when verification fails.

### 1. Final Archive Confirmation (Blocking Point)

After entry verification passes, **must follow the `zcw/reference/decision-point.md` protocol to pause and wait for the user to confirm whether to archive immediately**. Must not run `"$ZCW_BASH" "$ZCW_ARCHIVE" "<change-name>"` before user confirmation.

Before confirmation, show the user a brief summary:
- Change name
- Verification report path and result
- Branch handling status
- Irreversible actions this archive will perform: merge main specs with Spec Kit delta semantics, annotate design doc / plan, and move the change to the archive directory

The user confirmation question must be presented as a single-select question with these options:
- "Confirm archive" — immediately run the archive script to complete spec merge and change movement
- "Needs adjustment or re-verification" — do not archive; run `"$ZCW_BASH" "$ZCW_STATE" transition <change-name> archive-reopen` to return to `phase: verify`, then invoke `/zcw-verify`. If verification confirms fixes are needed, follow `/zcw-verify`'s verification-failure decision flow back to `/zcw-build`
- "Do not archive yet" — do not archive; keep the current `phase: archive` state and wait for the user to invoke `/zcw-archive` again later

Only after the user selects "Confirm archive" may Step 2 continue. After the user selects "Needs adjustment or re-verification", must first run the `archive-reopen` state transition; do not edit `.zcw.yaml` manually.

### 2. Execute Archive

Run the archive script to automatically complete all steps:

```bash
"$ZCW_BASH" "$ZCW_ARCHIVE" "<change-name>"
```

The script automatically executes:
1. Entry state validation (phase=archive, verify_result=pass, archived=false)
2. Design doc frontmatter annotation (archived-with, status)
3. Plan frontmatter annotation (archived-with)
4. Spec Kit archive for delta-merge semantics and moving the change to the archive directory
5. Main spec guard against leaked delta-only section headings
6. Update `archived: true` through `zcw-state transition <archive-name> archived`

If script returns non-zero exit code, report error and stop.
If script returns zero exit code, archive is complete.
The summary `X/Y steps succeeded` counts real executed steps and does not double-count delta spec sync or document annotation.

The script calls Spec Kit archive to merge `ADDED/MODIFIED/REMOVED/RENAMED` delta semantics into main specs, then verifies main specs do not contain delta-only section headings.

Use `--dry-run` flag to preview without executing.

### 3. Lifecycle Closed Loop

Spec lifecycle completes here:
```
brainstorming → delta spec → implementation → verification → main spec merge → design doc annotation → archive
```

## Exit Conditions

- Archive script executed successfully (exit code 0)
- Archive directory `specs/archive/YYYY-MM-DD-<change-name>/` exists
- Archived `.zcw.yaml` contains `archived: true`

The archive script moves `specs/<name>/` to `specs/archive/YYYY-MM-DD-<name>/`.

> **WARNING**: After successful archive, **do not run** `"$ZCW_BASH" "$ZCW_GUARD" <change-name> archive` against the old active change name; the active directory no longer exists. Doing so will cause the guard to error with "change directory not found". Archive completeness is determined by script exit code and archived directory state.

## Complete

ZCW workflow complete. To start new work, invoke `/zcw` or `/zcw-open`.

## Context Compression Recovery

Follow `zcw/reference/context-recovery.md` with phase set to `archive`. If `archived: true` and archive directory exists, archival is complete — do not re-execute archive operations.
