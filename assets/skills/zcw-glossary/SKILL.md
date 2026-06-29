---
name: zcw-glossary
description: Manage project glossary terms through ZCW wiki-backed storage. Use when adding, listing, or searching domain terminology, project vocabulary, aliases, or business terms without using Maestro domain skills.
---

# ZCW Glossary

Use `zcw glossary` for project terminology.

## Commands

- Add: `zcw glossary add "<term>" --definition "<definition>" --tag <area>`
- List: `zcw glossary list`
- Search: `zcw glossary search "<query>"`

Glossary terms are stored as wiki entries in `.zcw/knowledge/wiki` with `domain` and `glossary` tags, so `zcw load --intent "<task>"` can retrieve them automatically.
