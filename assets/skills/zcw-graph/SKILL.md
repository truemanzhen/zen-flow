---
name: zcw-graph
description: Use ZCW CodeGraph commands for semantic code intelligence. Use when checking, initializing, searching, or loading code context from the project .codegraph index without using Maestro CodeGraph commands.
---

# ZCW Graph

Use `zcw graph` as the project-owned CodeGraph interface.

## Commands

- Status: `zcw graph status`
- Initialize: `zcw graph init`
- Install missing CLI and initialize: `zcw graph init --install`
- Refresh an existing index: `zcw graph init --force`
- Search: `zcw graph search "<query>"`
- Callers: `zcw graph callers "<symbol>"`
- Context: `zcw graph context "<symbol>"`
- Load with knowledge: `zcw load --query "<query>" --code`

Use `--json` when structured output is needed.

## Rules

- Prefer `zcw graph status` before assuming CodeGraph is available.
- If the CLI is missing, run `npm install` first; use `zcw graph init --install` only when the current project should add the dependency itself.
- Do not call Maestro `kg` commands from ZCW workflows.
