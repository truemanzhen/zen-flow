---
name: zcw-kn
description: Manage local ZCW knowhow entries in .zcw/knowledge/kn. Use when capturing, listing, or searching reusable project lessons, pitfalls, decisions, commands, or implementation notes without using Maestro knowledge skills.
---

# ZCW Knowhow

Use the local `zcw kn` CLI. Store durable project lessons only; do not capture transient logs, credentials, or one-off chat details.

## Commands

- Add: `zcw kn add "<title>" --content "<note>" --tag <tag>`
- List: `zcw kn list`
- Search: `zcw kn search "<query>"`

Use `--json` when another command or agent needs structured output.

## Capture Rules

- Prefer short, reusable entries with concrete evidence.
- Tag entries by subsystem, risk, or workflow phase.
- Use `--source` for source artifacts such as `specs/<name>/tasks.md`.
- Keep wiki-style concepts in `zcw-wiki`, not in knowhow.
