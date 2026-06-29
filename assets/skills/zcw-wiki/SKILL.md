---
name: zcw-wiki
description: Manage the local ZCW wiki graph in .zcw/knowledge/wiki. Use when recording project concepts, modules, domain terms, relationships, and links between wiki entries without using Maestro wiki skills.
---

# ZCW Wiki

Use the local `zcw wiki` CLI for durable project concepts and relationships.

## Commands

- Add: `zcw wiki add "<title>" --content "<definition>" --tag <tag>`
- List: `zcw wiki list`
- Search: `zcw wiki search "<query>"`
- Link: `zcw wiki link "<from>" "<to>" --relation "<relation>"`

Use `--json` when structured output is needed.

## Wiki Rules

- Keep entries concept-level: modules, domain terms, architecture concepts, workflow roles.
- Link related entries instead of duplicating content.
- Store reusable lessons in `zcw-kn`.
