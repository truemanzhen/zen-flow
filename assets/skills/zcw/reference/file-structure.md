# File Structure Reference

Canonical path: `zcw/reference/file-structure.md`

This file is the ZCW project file structure reference. Consult on demand; not loaded inline with skills.

```text
speckit/                              # Spec Kit — WHAT
├── config.yaml
├── changes/
│   ├── <name>/                        # Active change
│   │   ├── .specify
│   │   ├── .zcw.yaml
│   │   ├── spec.md                # Why + What
│   │   ├── plan.md                  # High-level architecture decisions
│   │   ├── specs/<capability>/spec.md # Delta capability spec
│   │   ├── .zcw/handoff/            # Script-generated phase handoff packages
│   │   └── tasks.md                   # Task checklist
│   └── archive/YYYY-MM-DD-<name>/     # Archived
└── specs/<capability>/spec.md         # Main specs (merged on archive via Spec Kit delta semantics)

docs/superpowers/                      # Superpowers — HOW
├── specs/YYYY-MM-DD-<topic>-plan.md # Design doc (technical RFC; annotated on archive)
└── plans/YYYY-MM-DD-<feature>.md      # Implementation plan (file header contains change metadata)

.zcw/
└── config.yaml                        # ZCW project config (context_compression defaults to off; set to beta to enable)
```
