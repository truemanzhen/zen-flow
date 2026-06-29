---
name: zcw-overlay
description: Manage project-level ZCW skill overlays in .zcw/overlays. Use when adding, listing, applying, or removing local non-invasive instructions for zcw or zcw-* skills.
---

# zcw-overlay

Use this skill when the project needs local instructions layered onto an installed ZCW skill without editing the packaged asset.

## Commands

```bash
zcw overlay add zcw-build --content "Prefer local acceptance checks before handoff."
zcw overlay list
zcw overlay apply zcw-build
zcw overlay remove zcw-build
```

Overlays are stored in `.zcw/overlays/<skill>.md` and applied to installed project skills by appending a managed marker block to `SKILL.md`.

Only `zcw` and `zcw-*` skill names are valid overlay targets.
