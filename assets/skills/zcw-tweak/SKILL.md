---
name: zcw-tweak
description: "ZCW preset path: Non-bug small changes (tweak). Skip brainstorming and full plan, directly open → lightweight build → light verify → archive. Applicable for copy, configuration, documentation or prompt local optimization."
---

# ZCW Preset Path: Tweak

Tweak is a preset workflow of ZCW's five-phase capabilities, not an independent parallel process. It reuses open, build, verify, archive capabilities, only skipping brainstorming and full plan.

Applicable for non-bug small scope changes, such as copy adjustment, configuration adjustment, documentation or prompt local optimization.

**Applicable conditions** (all must be met):
1. No new capability
2. No architecture changes
3. No interface changes
4. Typically no more than 3 tasks (file count constraint see upgrade conditions below)

**Not applicable**: If change process discovers need for capability, architecture or interface adjustments, should upgrade to full `/zcw` workflow.

---

## Process (preset workflow, 4 phases)

### 0. Output Language Constraint

Streamlined Spec Kit artifacts must use the language of the user request that triggered this workflow.

Execution chain: open → lightweight build → light verify → archive. Tweak provides default decisions for each phase: streamlined open, lightweight build, lightweight verification, and final archive confirmation after verification passes.

Locate ZCW scripts before starting:

```bash
ZCW_ENV="${ZCW_ENV:-$(find . "$HOME"/.*/skills "$HOME/.config" "$HOME/.gemini" -path '*/zcw/scripts/zcw-env.sh' -type f -print -quit 2>/dev/null)}"
if [ -z "$ZCW_ENV" ]; then
  echo "ERROR: zcw-env.sh not found. Ensure the zcw skill is installed." >&2
  return 1
fi
. "$ZCW_ENV"
```

### 1. Quick Open (preset open)

Reuse ZCW open capability to create change, but use tweak defaults: do not execute `speckit-explore` long exploration, directly enter streamlined change creation.

**Immediately execute:** Use the Skill tool to load the `speckit-new-change` skill. Skipping this step is prohibited.

After the skill loads, follow its guidance to create streamlined artifacts:
  - `spec.md` — change motivation + goals + scope
  - `plan.md` — brief implementation description (no solution comparison needed)
  - `tasks.md` — no more than 3 tasks
- **No delta spec needed** (unless change modifies existing spec acceptance scenarios; once delta spec is needed, upgrade to full `/zcw`)

Initialize ZCW state file:

```bash
"$ZCW_BASH" "$ZCW_STATE" init <name> tweak
```

Verify initialized state:

```bash
"$ZCW_BASH" "$ZCW_STATE" check <name> open
```

Run phase guard to transition open → build:

```bash
"$ZCW_BASH" "$ZCW_GUARD" <change-name> open --apply
```

### 2. Lightweight Build (preset build)

Use tweak defaults: `build_mode: direct`. Skip Superpowers `brainstorming` and `writing-plans`.

Before continuing or starting changes, handle uncommitted changes through `zcw/reference/dirty-worktree.md`. If attribution shows scope exceeds tweak, handle it through this file's "Upgrade Conditions".

**Immediately execute:** Execute tasks one by one according to tasks.md:

1. Read `specs/<name>/tasks.md`, get incomplete task list
2. For each incomplete task:
   - Modify target files according to task description
   - Run project formatter (e.g., `mvn spotless:apply`, `npm run format`)
   - Run related tests to confirm pass
   - Check corresponding `- [ ]` to `- [x]` in tasks.md
   - Commit code, commit message format: `tweak: <brief change description>`
3. After all tasks complete, explicitly run relevant project tests and build commands
4. Run phase guard to transition build → verify:

```bash
"$ZCW_BASH" "$ZCW_GUARD" <change-name> build --apply
```

State automatically updates to `phase: verify`, `verify_result: pending`, then enter verification.

During tweak execution, whenever running programs, tests, builds, or manual verification results in crashes, abnormal behavior, test failures, or build failures, you must use the Skill tool to load the Superpowers `systematic-debugging` skill. Do not propose or implement source code fixes before completing root cause investigation.

For specific investigation, minimal failing test, fix verification, and keeping the current change verification loop, follow `zcw/reference/debug-gate.md`.

### 3. Lightweight Verification (preset verify)

Reuse `/zcw-verify`. Tweak must maintain lightweight verification conditions: ≤ 3 tasks, ≤ 4 files, no delta spec, no new capability.

**Immediately execute:** Use the Skill tool to load the `zcw-verify` skill. Skipping this step is prohibited.

If scale assessment enters full verification path, stop tweak, handle per upgrade conditions blocking confirmation.

After verification passes, record `.zcw.yaml` `verify_result` as `pass` according to `/zcw-verify` rules, must not skip this status before archiving. After verification passes, still enter `/zcw-archive`'s final archive confirmation; do not automatically run the archive script.

### 4. Archive (preset archive)

Reuse `/zcw-archive`. Must satisfy `verify_result: pass` in `.zcw.yaml` before archiving, and wait for `/zcw-archive`'s final archive confirmation.

**Immediately execute:** Use the Skill tool to load the `zcw-archive` skill to archive. Skipping this step is prohibited.

---

## Continuous Execution Mode

<IMPORTANT>
Tweak workflow is **one-time continuous execution**. After invoking `/zcw-tweak`, agent must automatically advance through tweak steps, without pausing to wait for user input mid-way.

Exception: when `.zcw.yaml` has `auto_transition: false`, after each phase guard advances `phase`, do not auto-invoke the next skill. In this case, use `"$ZCW_BASH" "$ZCW_STATE" next <name>` output and pause for manual continuation as instructed.

The following situations must pause and wait for user confirmation:

1. Encountering upgrade conditions (see "Upgrade Conditions" section). **Must use the current platform's available user input/confirmation mechanism to pause and wait for the user to explicitly confirm** upgrading to full workflow
2. verify phase (zcw-verify) verification-failure and branch-handling decisions
3. Final archive confirmation (before zcw-archive runs the archive script)

Execution order: quick open → lightweight build → lightweight verification → archive → complete

After each phase completes, immediately enter next phase. Within each phase, must still call corresponding ZCW/Spec Kit/Superpowers skill according to above requirements; if the called skill has its own user decision points, follow that skill's rules.
</IMPORTANT>

---

## Upgrade Conditions

Upgrade to full `/zcw` when **any** of the following conditions are met:

| Condition | Explanation |
|-----------|-------------|
| Change involves **5+ files** | Exceeds small change scope |
| Cross-module coordination required | Requires cross-component coordination |
| **5+** new test cases needed | Change complexity rising |
| Config item additions or deletions | Config changes beyond value modifications |
| New capability needed | Exceeds local optimization |
| Delta spec needed | Affects existing specs |

When upgrade conditions are met, **must follow the `zcw/reference/decision-point.md` protocol to pause and wait for the user to explicitly confirm** upgrading to the full `/zcw` workflow. Do not directly enter `/zcw-design`, and do not automatically supplement Design Doc.

After user confirms upgrade, **must first update the workflow and phase fields** before entering full flow:

```bash
"$ZCW_BASH" "$ZCW_STATE" set <name> workflow full
"$ZCW_BASH" "$ZCW_STATE" set <name> phase design
```

Then on current change basis, supplement Design Doc: **Immediately use the Skill tool to load the `zcw-design` skill**, proceed normally with full workflow. If user does not confirm upgrade, stop tweak and report that current change has exceeded tweak scope.

---

## Exit Conditions

- Small change completed, tests pass
- Change archived
- No new capability, architecture adjustments or interface changes
- **Phase guard**: Before build → verify run `"$ZCW_BASH" "$ZCW_GUARD" <change-name> build --apply`; before verify → archive follow `/zcw-verify` and run `"$ZCW_BASH" "$ZCW_GUARD" <change-name> verify --apply`

## Automatic Handoff to Next Phase

Follow `zcw/reference/auto-transition.md`. Key command:

```bash
"$ZCW_BASH" "$ZCW_STATE" next <name>
```

- `NEXT: auto` → invoke the skill pointed to by `SKILL` to continue tweak workflow (`phase: build` returns `zcw-tweak`, `verify` returns `zcw-verify`, `archive` returns `zcw-archive`)
- `NEXT: manual` → do not invoke the next skill; prompt user to manually run `/<SKILL>` per `HINT`
- `NEXT: done` → workflow is complete, no further action needed
