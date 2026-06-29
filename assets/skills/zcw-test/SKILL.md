---
name: zcw-test
description: Run the project test script through the ZCW quality pipeline. Use when tests should be executed and recorded in .zcw/quality without using Maestro test skills.
---

# ZCW Test

Use `zcw test` to run the package test script and record the result.

## Commands

- Default: `zcw test`
- Alternate package script: `zcw test --script <script>`
- Structured output: `zcw test --json`

## Output

The command writes:

- `.zcw/quality/test-latest.json`
- `.zcw/quality/runs/<timestamp>-test.json`

If a ZCW session exists, the latest session `status.json` receives a quality summary.
