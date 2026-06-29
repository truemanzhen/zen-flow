# 文件结构参考

规范路径：`zcw/reference/file-structure.md`

本文件是 ZCW 项目文件结构参考。按需查阅，不随 skill 一次性加载。

```text
speckit/                              # Spec Kit — WHAT
├── config.yaml
├── changes/
│   ├── <name>/                        # 活跃 change
│   │   ├── .specify
│   │   ├── .zcw.yaml
│   │   ├── spec.md                # Why + What
│   │   ├── plan.md                  # 高层架构决策
│   │   ├── specs/<capability>/spec.md # Delta 能力规格
│   │   ├── .zcw/handoff/            # 脚本生成的阶段交接包
│   │   └── tasks.md                   # 任务清单
│   └── archive/YYYY-MM-DD-<name>/     # 已归档
└── specs/<capability>/spec.md         # 主 specs（归档时按 Spec Kit delta 语义合并）

docs/superpowers/                      # Superpowers — HOW
├── specs/YYYY-MM-DD-<topic>-plan.md # 设计文档（技术 RFC，归档时标注状态）
└── plans/YYYY-MM-DD-<feature>.md      # 实施计划（文件头含 change 关联元数据）

.zcw/
└── config.yaml                        # ZCW 项目配置（context_compression 默认 off，可设 beta）
```
