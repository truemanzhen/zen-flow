<p align="center">
  <a href="https://github.com/rpamis/zcw/blob/master/img/title-log.png">
    <picture>
      <source srcset="https://github.com/rpamis/zcw/blob/master/img/title-log.png">
      <img src="https://github.com/rpamis/zcw/blob/master/img/title-log.png" alt="ZCW logo">
    </picture>
  </a>
</p>

<p align="center">
  <a href="https://github.com/rpamis/zcw/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/rpamis/zcw/ci.yml?branch=master&style=flat-square&label=CI" /></a>
  <a href="https://deepwiki.com/rpamis/zcw"><img alt="DeepWiki" src="https://img.shields.io/badge/DeepWiki-rpamis%2Fzcw-blue?style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/@rpamis/zcw"><img alt="npm version" src="https://img.shields.io/npm/v/@rpamis/zcw?style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/@rpamis/zcw"><img alt="npm download count" src="https://img.shields.io/npm/dm/@rpamis/zcw?style=flat-square&label=Downloads/mo" /></a>
  <a href="https://www.npmjs.com/package/@rpamis/zcw"><img alt="npm weekly download count" src="https://img.shields.io/npm/dw/@rpamis/zcw?style=flat-square&label=Downloads/wk" /></a>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" /></a>
</p>

# @rpamis/zcw

```
 ██████╗ ██████╗ ███╗   ███╗███████╗████████╗
██╔════╝██╔═══██╗████╗ ████║██╔════╝╚══██╔══╝
██║     ██║   ██║██╔████╔██║█████╗     ██║
██║     ██║   ██║██║╚██╔╝██║██╔══╝     ██║
╚██████╗╚██████╔╝██║ ╚═╝ ██║███████╗   ██║
 ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝   ╚═╝
```

> 中文版：[README-zh.md](README-zh.md)
> [Bilibili video](https://www.bilibili.com/video/BV1y4Gi6CEo1/?spm_id_from=333.1387.homepage.video_card.click&vd_source=d22726fe6b108647dbebf1c5d8817377)
> [DouYin](https://www.douyin.com/search/zcw?aid=cd8fcc82-498b-4d59-8860-617deb719412&modal_id=7646429015808936293&type=general)

**OpenSpec + Superpowers dual-star development workflow** — one command from idea to archive.

OpenSpec handles **WHAT** (outlines, proposals, spec lifecycle, archiving).

Superpowers handles **HOW** (technical design, planning, execution, wrap-up).

ZCW chains both into a five-phase automated pipeline.

> [!IMPORTANT]
> **0.3.9** — Review mode (`off|standard|thorough`) controls Build/Verify code review with project defaults; init/update now use optional dependency prompts, broader CLI i18n, stronger phase guards, and macOS executable bits.
>
> **0.3.8** — Adds Kimi Code support, safe multi-platform `zcw uninstall`, extended subagent dispatch, shared progressive-loading references, update checks, and pre-commit formatting.
>
> **0.3.7** — Adds CodeGraph semantic indexing, Beta context compression, active context compression, token optimizations, `auto_transition`, phase guards, optional TDD, and safer archive/verification flow.
>
> See [NEWS.md](NEWS.md) for details.

## Why ZCW

OpenSpec excels at managing requirements, creating proposals, managing Spec lifecycles, and archiving, but its proposals
and tasks lack the detail of Superpowers brainstorming.

Superpowers generates Spec documents after brainstorming, but these documents typically lack stateful design — after
completing requirements, Specs only have tasks checked off in the document, and Agents even forget to check them off.
This causes the Agent to re-examine documents and project code to verify on resumption, wasting many tokens.

**ZCW combines the strengths of both**, integrating the core workflow into 5 phases

The main entry `/zcw` supports current Spec state detection, suitable for long tasks — after closing your AI coding
session midway, just `/zcw` and ZCW will automatically read the active Spec (lists multiple for selection),
dynamically identify which phase is currently executing, and continue.

At the same time, ZCW provides full Spec lifecycle management. During execution, it links OpenSpec change/spec
artifacts with Superpowers design and planning documents, then automates handoff, state updates, validation, and archive
sync so users do not have to repeatedly remind the Agent to keep documents synchronized and connected.

## What You'll Learn

Many excellent Skill projects exist in the current Skill market, but they generally have preference issues — users may
only like some features. For example, when using both OpenSpec and Superpowers, one might only use OpenSpec's Spec
management capabilities, but prefer Superpowers' TDD-driven approach for coding.

Long-term Skill users know these capabilities can be freely combined, but exactly how to do so still requires real
practice. The ZCW project can serve as a reference:

- **How to reliably trigger nested Skills** — Not letting the Agent rely on document descriptions to perform "look-alike
  Skill trigger" operations (like writing files based on Skill descriptions), but truly triggering Skills (key feature:
  Skill trigger prints on CC). ZCW triggers many capabilities from OpenSpec and Superpowers. How is this Prompt
  written?

- **How to make combined Skills flow automatically across phases** — Not relying on manual intervention. ZCW's 5-phase
  flow can automatically trigger Skills for the core process except for necessary user choices, while the state machine
  also protects state transition reliability.

- **How to turn the Spec lifecycle into a resumable workflow** — ZCW links OpenSpec change/spec artifacts with
  Superpowers design and planning documents, then records phase, execution mode, verification results, and archive
  status in `.zcw.yaml`, so the Agent can resume after interruption instead of rereading documents and guessing
  progress.

- **How to turn document synchronization from "user reminders" into automation** — ZCW puts handoff, state updates,
  validation, and archive sync into scripted flows, reducing repeated prompts like "remember to update the design
  doc", "remember to sync the spec", and "remember to archive the change".

- **How to design guard conditions that Agents can execute** — ZCW does not simply trust the Agent saying "done" at
  phase exits. Scripts such as `zcw-guard.sh`, `zcw-yaml-validate.sh`, and `zcw-state.sh` check tasks, state
  fields, verification evidence, and archive conditions before allowing the workflow to advance.

- **How to distribute and install Skills across platforms** — ZCW supports multiple AI coding platforms,
  project/global installation, Chinese/English Skill choices, and platform-specific directory differences such as
  Antigravity using different project-level and global paths. It can be a reference for CLI installers and Skill package
  structure.

- **How to turn shell scripts into Agent workflow infrastructure** — ZCW's scripts need to work across macOS, Linux,
  and Windows Git Bash while handling hashes, YAML fields, state machines, and archive flows. It shows how to move
  fragile workflow control out of scattered Prompt text and into testable, reusable tools.

## Install

Requirements:

- Node.js 20+
- npm/npx
- Git
- Bash-compatible shell for workflow scripts (Windows users should use Git Bash or an equivalent bash environment)

```bash
npm install -g @rpamis/zcw
```

## Quick Start

```bash
cd your-project
zcw init
```

`zcw init` will:

1. Prompt you to select AI platforms (auto-detects existing configs)
2. Choose install scope: project-level (current directory) or global (home directory)
3. Select language for ZCW skills: English or 中文
4. Select npm dependencies to install/upgrade — [OpenSpec](https://github.com/Fission-AI/OpenSpec) CLI, [Superpowers](https://github.com/obra/superpowers) (via `npx skills add`), and [CodeGraph](https://github.com/colbymchenry/codegraph) CLI. Items not yet detected default to checked; already-installed items default to unchecked so you can opt in to upgrades.
5. Install the selected dependencies and deploy their skills
6. Deploy ZCW skills (in your chosen language) to selected platforms
7. Create `docs/superpowers/specs/` and `docs/superpowers/plans/` working directories for project-scope installs

> [!TIP]
> Superpowers v6.0.0+ is recommended — about 2× faster and ~50% fewer tokens than older versions.
> To upgrade ZCW itself later: `zcw update` or `npm install -g @rpamis/zcw@latest`.

## Support for OpenClaw and Hermes, and other AI platforms

For platforms that use the generic `skills` CLI directly, you can install the ZCW skill package with:

```bash
npx skills add rpamis/zcw
```

## Screenshots

<p align="center">
  <img src="https://github.com/rpamis/zcw/blob/master/img/runner.png" alt="runner">
</p>

<p align="center">Auto-install OpenSpec & Superpowers, one-click dev environment setup</p>
<p align="center">Multi-phase Skill entry, auto-detects current Spec stage, auto-triggers core flow, manual review at key nodes</p>

## Commands

<details>
<summary><code>zcw init [path]</code> — Initialize ZCW workflow</summary>

Initializes OpenSpec, Superpowers, and ZCW skills for selected AI coding platforms.

| Option              | Description                                                                    |
|---------------------|--------------------------------------------------------------------------------|
| `--yes`             | Non-interactive mode, auto-select detected platforms (or all if none detected) |
| `--scope <scope>`   | Install scope: `project` or `global`                                           |
| `--language <lang>` | Skill language: `en` or `zh` (skips interactive language prompt)              |
| `--skip-existing`   | Skip already installed components                                              |
| `--overwrite`       | Overwrite already installed components                                         |
| `--json`            | Output structured JSON                                                         |

When multiple existing components are found on the same platform, interactive init offers one bulk choice: overwrite
all, skip all, or choose per component.

</details>

<details>
<summary><code>zcw status [path]</code> — Show active changes and next workflow command</summary>

Displays active changes, task progress, and the recommended next ZCW workflow command.

| Option   | Description                              |
|----------|------------------------------------------|
| `--json` | Output active changes with `nextCommand` |

</details>

<details>
<summary><code>zcw dashboard [path]</code> — Launch local read-only dashboard server</summary>

Starts a local HTTP server that displays a visual dashboard with active changes, phase status, task progress, and archive history. Auto-opens in your browser by default.

<p align="center">
  <img src="https://github.com/rpamis/zcw/blob/master/img/dashboard.png" alt="ZCW Dashboard" width="800">
</p>
<p align="center">Active change overview with phase indicators, task progress, and archive history</p>

| Option     | Description                                                                 |
|------------|-----------------------------------------------------------------------------|
| `--port`   | Server port (default: auto-selects available port)                          |
| `--no-open`| Don't auto-open the dashboard in browser                                    |
| `--json`   | Collect single snapshot and print JSON to stdout (for scripting/inspection) |

</details>

<details>
<summary><code>zcw doctor [path]</code> — Diagnose ZCW installation health</summary>

Checks project/global installation health, working directories, installed skills, scripts, and ZCW state files.

| Option            | Description                                                     |
|-------------------|-----------------------------------------------------------------|
| `--json`          | Output structured diagnostic results                            |
| `--scope <scope>` | Diagnose `auto`, `project`, or `global` scope (default: `auto`) |

</details>

<details>
<summary><code>zcw update [path]</code> — Update ZCW package and skills</summary>

Updates the npm package and refreshes installed ZCW skills in detected project/global targets.

| Option              | Description                                   |
|---------------------|-----------------------------------------------|
| `--json`            | Output npm and skill update results as JSON   |
| `--language <lang>` | Override detected skill language (`en`, `zh`) |
| `--scope <scope>`   | Update only `global` or `project` scope       |

</details>

<details>
<summary><code>zcw uninstall [path]</code> — Remove ZCW skills, rules, and hooks</summary>

Safely removes ZCW-distributed skills, rules, and hooks from all detected platforms. Preserves user-defined hooks and non-ZCW configuration.

| Option            | Description                                    |
|-------------------|------------------------------------------------|
| `--force`         | Skip confirmation prompt                       |
| `--scope <scope>` | Uninstall only `global` or `project` scope     |
| `--json`          | Output removal results as JSON                 |

```bash
zcw uninstall              # Interactive — shows targets, asks for confirmation
zcw uninstall --force      # Non-interactive — removes everything immediately
zcw uninstall --scope project  # Only remove project-level installations
```

</details>

| Command           | Description  |
|-------------------|--------------|
| `zcw --help`    | Show help    |
| `zcw --version` | Show version |

## Supported Platforms

`zcw init` supports 29 AI coding platforms:

<details>
<summary>View full platform list</summary>

| Platform           | Skills Dir   | Platform   | Skills Dir    |
|--------------------|--------------|------------|---------------|
| Claude Code        | `.claude/`   | Cursor     | `.cursor/`    |
| Codex              | `.codex/`    | OpenCode   | `.opencode/`  |
| Windsurf           | `.windsurf/` | Cline      | `.cline/`     |
| RooCode            | `.roo/`      | Continue   | `.continue/`  |
| GitHub Copilot     | `.github/`   | Gemini CLI | `.gemini/`    |
| Amazon Q Developer | `.amazonq/`  | Qwen Code  | `.qwen/`      |
| Kilo Code          | `.kilocode/` | Auggie     | `.augment/`   |
| Kimi Code          | `.kimi-code/`| Kiro       | `.kiro/`      |
| Lingma             | `.lingma/`   | Junie      | `.junie/`     |
| CodeBuddy          | `.codebuddy/`| CoStrict   | `.cospec/`    |
| Crush              | `.crush/`    | Factory Droid | `.factory/` |
| iFlow              | `.iflow/`    | Pi         | `.pi/`        |
| Qoder              | `.qoder/`    | Antigravity | `.agents/`   |
| Bob Shell          | `.bob/`      | ForgeCode  | `.forge/`     |
| Trae               | `.trae/`     |            |               |

</details>

Some platforms use different project and global directories. For example, OpenCode global installs use
`.config/opencode`, Lingma global installs use `.lingma`, and Antigravity global installs use `.gemini/antigravity`.

## Skills

After `zcw init`, three groups of skills are installed to the selected platform's `skills/` directory:

### ZCW Skills

<details>
<summary>View ZCW skills</summary>

| Skill            | Description                                                    |
|------------------|----------------------------------------------------------------|
| `/zcw`         | Main entry — auto-detects phase and dispatches to sub-commands |
| `/zcw-open`    | Phase 1: Open a change (proposal, design, task breakdown)      |
| `/zcw-design`  | Phase 2: Deep design (brainstorming, Design Doc)               |
| `/zcw-build`   | Phase 3: Plan and build (implementation plan, code commits)    |
| `/zcw-verify`  | Phase 4: Verify and finish (testing, verification report)      |
| `/zcw-archive` | Phase 5: Archive (delta spec sync, status annotation)          |
| `/zcw-hotfix`  | Preset: Quick bug fix (skips brainstorming)                    |
| `/zcw-tweak`   | Preset: Small change (skips brainstorming and full plan)       |

</details>

### Guard & Automation Scripts

<details>
<summary>View script list</summary>

| Script                   | Purpose                                                                                                                           |
|--------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| `zcw-env.sh`           | Script discovery helper — exports bundled script paths such as `ZCW_GUARD`, `ZCW_STATE`, `ZCW_HANDOFF`, and `ZCW_ARCHIVE` |
| `zcw-guard.sh`         | Phase transition guard — validates exit conditions, `--apply` auto-updates `.zcw.yaml`                                          |
| `zcw-handoff.sh`       | Design handoff — generates deterministic context packages from OpenSpec artifacts with SHA256 tracing                             |
| `zcw-archive.sh`       | One-command archive — validates state, syncs specs, moves to archive, updates status                                              |
| `zcw-yaml-validate.sh` | Schema validator — validates `.zcw.yaml` structure and field values                                                             |
| `zcw-hook-guard.sh`    | Phase write guard — PreToolUse hook, blocks file writes during open/design/archive phases                                         |
| `zcw-state.sh`         | Unified state management — init/set/get/check/scale, agents' exclusive YAML interface                                             |

</details>

### OpenSpec Skills

Spec lifecycle management: propose, explore, sync, verify, archive, and more.

### Superpowers Skills

Development methodology: brainstorming, TDD, subagent-driven development, code review, plan writing, and more.

## Workflow

```
/zcw
  ↓ auto-detect
/zcw-open  -->  /zcw-design  -->  /zcw-build  -->  /zcw-verify  -->  /zcw-archive
(OpenSpec)         (Superpowers)       (Superpowers)       (Both)           (OpenSpec)

/zcw-hotfix (preset path, skips brainstorming)
  open  -->  build  -->  verify  -->  archive

/zcw-tweak (preset path, skips brainstorming and full plan)
  open  -->  lightweight build  -->  light verify  -->  archive
```

### Five Phases

| Phase              | Command          | Owner       | Artifacts                            |
|--------------------|------------------|-------------|--------------------------------------|
| 1. Open            | `/zcw-open`    | OpenSpec    | proposal.md, design.md, tasks.md     |
| 2. Deep Design     | `/zcw-design`  | Superpowers | Design Doc, delta spec               |
| 3. Plan & Build    | `/zcw-build`   | Superpowers | Implementation plan, code commits    |
| 4. Verify & Finish | `/zcw-verify`  | Both        | Verification report, branch handling |
| 5. Archive         | `/zcw-archive` | OpenSpec    | delta→main spec sync, archive        |

### Core Principles

- **Brainstorming is non-skippable** — every change must go through deep design (except hotfix/tweak)
- **Delta specs are living documents** — freely editable during Phase 3, synced at archive
- **Keep tasks.md in sync** — check off each task as completed
- **Commit frequently** — one commit per task, message reflects design intent
- **Verify before archive** — `/zcw-verify` must pass before `/zcw-archive`

### State Management

ZCW uses a decoupled state architecture with separate YAML files:

| File             | Owner    | Purpose                                             |
|------------------|----------|-----------------------------------------------------|
| `.openspec.yaml` | OpenSpec | Spec lifecycle, change metadata                     |
| `.zcw.yaml`    | ZCW    | Workflow phase, execution mode, verification status |

All states and execution phases are updated via scripts, and each phase verifies that tasks are truly complete before
advancing. Compared to storing complex state rules only in Skill text, this script-backed state machine gives ZCW more
reliable phase transitions, correct YAML, and easier breakpoint recovery; agents can read the current Spec situation
through ZCW's built-in commands.

<details>
<summary>View key .zcw.yaml fields</summary>

**Key Fields in `.zcw.yaml`:**

```yaml
workflow: full
auto_transition: true
phase: build
build_mode: subagent-driven-development
build_pause: null
isolation: branch
verify_mode: null
tdd_mode: null
subagent_dispatch: null
design_doc: docs/superpowers/specs/YYYY-MM-DD-topic-design.md
plan: docs/superpowers/plans/YYYY-MM-DD-feature.md
verify_result: pending
verification_report: null
branch_status: pending
verified_at: null
archived: false
direct_override: false
build_command: null
verify_command: null
handoff_context: openspec/changes/<name>/.zcw/handoff/design-context.json
handoff_hash: <sha256>
```

In full workflow, `build_mode`, `build_pause`, `isolation`, `verify_mode`, `tdd_mode`, and `subagent_dispatch` may
temporarily be `null`; `build_mode` and `isolation` must be resolved before `build → verify`. `auto_transition` controls automatic vs manual skill invocation after phase completion — see [AUTO-TRANSITION.md](docs/AUTO-TRANSITION.md). `build_pause` records an internal build-phase pause point:
`null` means no pause, while `plan-ready` means the plan has been generated and the user paused before choosing
isolation and execution mode. It is not an execution mode and must not be written into `build_mode`.
`verification_report` stays `null` until verification writes a report, and `verify-pass` requires that report to exist
plus `branch_status: handled`. Fields after `archived` in the example are optional or script-derived: `direct_override`
is only needed for full-workflow direct builds, project commands may be absent unless configured, and
`handoff_context` / `handoff_hash` are recorded by `zcw-handoff.sh` before leaving design. Projects can configure
`build_command` / `verify_command` in the change or repo root, and guard will run those commands first and print failure
output.

</details>

### Reliability Features

ZCW ensures agent execution reliability through automated state transitions:

<details>
<summary>View reliability features</summary>

1. **Entry Verification** — Each phase validates preconditions before execution
    - Checks file existence, state consistency, and phase transitions
    - Outputs `[HARD STOP]` with actionable suggestions if validation fails

2. **Automated State Transitions** — `zcw-guard.sh --apply` updates `.zcw.yaml` automatically
    - All phase transitions (open → design/build → verify → archive) use `guard --apply`
    - No manual state editing required — eliminates write-verification errors
    - `zcw-state.sh` is the agents' exclusive interface for state operations
    - Guard and archive scripts use `zcw-state.sh` internally for state management

3. **Schema Validation** — `zcw-yaml-validate.sh` ensures data integrity
    - Validates required and optional fields
    - Validates enum values, including `direct_override`
    - Validates `design_doc`, `plan`, and `handoff_context` paths exist, plus `handoff_hash` format
    - Detects unknown/typos fields

4. **Build Decision Enforcement** — Guard and state transitions both block skipped build choices
    - `isolation` must be `branch` or `worktree`
    - `build_mode` must be selected before leaving build
    - `build_pause: plan-ready` is a recoverable pause after plan generation, not a `build_mode`
    - Full workflow `build_mode: direct` requires `direct_override: true`

5. **Verification Evidence** — Guard enforces proof before phase advance
    - `verify-pass` transition requires `verification_report` pointing to an existing report file
    - `branch_status` must be `handled` before verify can pass
    - Guard checks `verification_report exists` and `branch_status=handled` as hard prerequisites
    - Prevents false phase advances when verification or branch handling was skipped

6. **Archive Automation** — `zcw-archive.sh` handles the full archive flow in one command
    - Validates entry state, merges delta specs into main specs through OpenSpec
    - Annotates design doc and plan frontmatter
    - Moves change to archive directory and updates `archived: true`
    - Supports `--dry-run` for preview

</details>

## Project Structure

```
your-project/
├── .zcw/
│   └── config.yaml              # Project-level global config (context_compression, auto_transition, etc.)
├── .claude/skills/              # Platform skills dir (ZCW + OpenSpec + Superpowers)
│   ├── zcw/SKILL.md
│   │   └── scripts/
│   │       ├── zcw-guard.sh       # Phase transition guard (--apply auto-updates state)
│   │       ├── zcw-env.sh         # Script discovery helper
│   │       ├── zcw-handoff.sh     # Design handoff (OpenSpec → Superpowers context tracing)
│   │       ├── zcw-archive.sh     # One-command archive automation
│   │       ├── zcw-yaml-validate.sh # Schema validator
│   │       ├── zcw-hook-guard.sh   # Phase write guard (PreToolUse hook)
│   │       └── zcw-state.sh       # Unified state management (init/set/get/check/scale)
│   ├── zcw-*/SKILL.md
│   ├── openspec-*/SKILL.md
│   └── brainstorming/SKILL.md
├── openspec/                    # OpenSpec — WHAT
│   ├── config.yaml
│   └── changes/
│       └── <name>/
│           ├── .openspec.yaml       # OpenSpec state
│           ├── .zcw.yaml          # ZCW workflow state (decoupled)
│           ├── proposal.md
│           ├── design.md
│           ├── specs/<capability>/spec.md
│           └── tasks.md
└── docs/superpowers/            # Superpowers — HOW
    ├── specs/                   # Design documents
    └── plans/                   # Implementation plans
```

<details>
<summary>Context Compression (Beta)</summary>

ZCW supports context compression at the Design → Build handoff. When enabled, `zcw-handoff.sh` generates a compact
context package that reduces Build-phase input tokens by **25–30%** without affecting implementation correctness.

| Mode   | Behavior                                 | Token Savings |
|--------|------------------------------------------|---------------|
| `off`  | Full Spec excerpts in handoff context    | Baseline      |
| `beta` | Design Doc + SHA256 hash references only | ~25–30%       |

Key findings from benchmark testing:

- **Test pass rate**: 100% across all tiers (compression does not affect correctness)
- **Spec coverage**: 100% (off) vs 95% (beta) — minor edge-case detail loss
- **Scaling**: Larger tasks yield higher absolute savings (up to 15,000 tokens for large-tier tasks)

Enable in `.zcw/config.yaml`: `context_compression: beta`

See [CONTEXT-COMPRESSION.md](docs/CONTEXT-COMPRESSION.md) for the full benchmark report, compression principles, and
reproduction steps.

</details>

<details>
<summary>Auto Transition</summary>

`auto_transition` controls whether ZCW automatically invokes the next skill after a phase completes, or pauses for
manual handoff. Phase advancement itself always happens — this setting only affects skill invocation.

| Value  | Behavior |
|--------|----------|
| `true` | Auto-invoke the next skill after each phase (default) |
| `false` | Pause after each phase; user manually triggers the next skill |

Three-layer configuration with precedence: `ZCW_AUTO_TRANSITION` env var > `.zcw/config.yaml` (project) > `.zcw.yaml` (change).

See [AUTO-TRANSITION.md](docs/AUTO-TRANSITION.md) for configuration details, workflow mapping, and FAQ.

</details>

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) | [中文版](CONTRIBUTING-zh.md) for development setup, commit
conventions, PR process, branch workflow, and guidance for adding platforms,
skills, scripts, or changelog entries.

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

## Roadmap

Track our development progress and upcoming features on the [ZCW Roadmap](https://github.com/orgs/rpamis/projects/1).

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=rpamis/zcw&type=Date)](https://star-history.com/#rpamis/zcw&Date)

## Contributors

<a href="https://github.com/rpamis/zcw/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=rpamis/zcw&columns=12&anon=1" />
</a>

## License

[MIT](LICENSE)

## Community

<table align="center">
  <tr>
    <td align="center" width="180">
      <img src="https://github.com/rpamis/zcw/blob/master/img/douyin.png" width="120" height="120"><br>
      <b>DouYin (Recommended)</b>
    </td>
    <td align="center" width="180">
      <img src="https://github.com/rpamis/zcw/blob/master/img/wechat.jpg" width="120" height="120"><br>
      <b>WeChat</b>
    </td>
    <td align="center" width="180">
      <img src="https://github.com/rpamis/zcw/blob/master/img/qq.jpg" width="120" height="120"><br>
      <b>QQ</b>
    </td>
  </tr>
</table>

## Reference

[LINUX DO - 新的理想型社区](https://linux.do/)
