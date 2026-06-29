---
name: zcw-overlay
description: 管理 .zcw/overlays 中的项目级 ZCW skill overlay。用于新增、列出、应用或移除 zcw / zcw-* skill 的本地非侵入式说明。
---

# zcw-overlay

当项目需要给已安装的 ZCW skill 叠加本地说明、但不想直接修改随包分发的资产时，使用这个 skill。

## 命令

```bash
zcw overlay add zcw-build --content "交付前优先运行本地验收检查。"
zcw overlay list
zcw overlay apply zcw-build
zcw overlay remove zcw-build
```

Overlay 存放在 `.zcw/overlays/<skill>.md`，应用时会向项目内已安装 skill 的 `SKILL.md` 追加带 marker 的托管区块。

只允许 `zcw` 和 `zcw-*` skill 名称作为 overlay 目标。
