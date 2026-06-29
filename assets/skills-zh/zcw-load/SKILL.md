---
name: zcw-load
description: Load relevant local ZCW knowledge for the current task intent. Use before implementing when prior knowhow or wiki context in .zcw/knowledge may affect the task.
---

# ZCW Load

Use `zcw load --intent "<task intent>"` to retrieve matching local knowhow and wiki entries.

## Usage

- Intent search: `zcw load --intent "<task intent>"`
- Direct query: `zcw load --query "<keywords>"`
- Structured output: append `--json`
- `zcw run "<task intent>"` automatically records this local knowledge load in the session.
- Use `zcw run "<task intent>" --code` to include CodeGraph code context.
- Use `zcw run "<task intent>" --no-knowledge` only when the session must explicitly skip knowledge loading.

Read only the returned entries that are relevant to the current task. If no entries match, continue with code inspection.
