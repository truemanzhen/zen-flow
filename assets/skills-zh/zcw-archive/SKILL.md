---
name: zcw-archive
description: "ZCW 阶段 5：归档。用 /zcw-archive 调用。按 Spec Kit delta 语义合并主 spec，归档 change。"
---

# ZCW 阶段 5：归档（Archive）

## 前置条件

- 验证已通过（阶段 4 完成）
- 分支已处理
- `specs/<name>/.zcw.yaml` 中 `verify_result: pass`

## 步骤

### 0. 输出语言约束

归档摘要和生命周期闭环说明必须使用触发本次工作流的用户请求语言。

### 0b. 入口状态验证（Entry Check）

执行入口验证：

```bash
ZCW_ENV="${ZCW_ENV:-$(find . "$HOME"/.*/skills "$HOME/.config" "$HOME/.gemini" -path '*/zcw/scripts/zcw-env.sh' -type f -print -quit 2>/dev/null)}"
if [ -z "$ZCW_ENV" ]; then
  echo "ERROR: zcw-env.sh not found. Ensure the zcw skill is installed." >&2
  return 1
fi
. "$ZCW_ENV"
"$ZCW_BASH" "$ZCW_STATE" check <name> archive
```

验证通过后继续 Step 1。验证失败时脚本会输出具体失败原因。

### 1. 归档前最终确认（阻塞点）

入口验证通过后，**必须按 `zcw/reference/decision-point.md` 的协议暂停并等待用户确认是否立即归档**。不得在用户确认前运行 `"$ZCW_BASH" "$ZCW_ARCHIVE" "<change-name>"`。

确认前必须向用户展示简短摘要：
- change 名称
- 验证报告路径和结论
- 分支处理状态
- 本次归档将执行的不可逆动作：按 Spec Kit delta 语义合并主 spec、标注 design doc / plan、移动 change 到 archive 目录

用户确认问题必须以单选题形式呈现，包含以下选项：
- 「确认归档」— 立即执行归档脚本，完成 spec 合并和 change 移动
- 「需要调整或重新验证」— 不执行归档；运行 `"$ZCW_BASH" "$ZCW_STATE" transition <change-name> archive-reopen` 回到 `phase: verify`，再调用 `/zcw-verify`。若验证阶段确认需要修复，再按 `/zcw-verify` 的验证失败决策回到 `/zcw-build`
- 「暂不归档」— 不执行归档，保留当前 `phase: archive` 状态，等待用户稍后再次调用 `/zcw-archive`

只有用户选择「确认归档」后，才允许继续 Step 2。用户选择「需要调整或重新验证」后，必须先执行 `archive-reopen` 状态回退，不得手动编辑 `.zcw.yaml`。

### 2. 执行归档

运行归档脚本，自动完成以下全部步骤：

```bash
"$ZCW_BASH" "$ZCW_ARCHIVE" "<change-name>"
```

脚本自动执行：
1. 入口状态验证（phase=archive, verify_result=pass, archived=false）
2. Design doc 前置元数据标注（archived-with, status）
3. Plan 前置元数据标注（archived-with）
4. 调用 Spec Kit archive 按 delta 语义合并主 spec 并移动 change 到归档目录
5. 校验主 spec 未残留 delta-only section 标题
6. 通过 `zcw-state transition <archive-name> archived` 更新 `archived: true`

如脚本返回非零退出码，报告错误并停止。
如脚本返回零退出码，归档完成。
脚本摘要中的 `X/Y steps succeeded` 以真实执行步骤计数，不会因 delta spec 同步或文档标注重复累计。

脚本会调用 Spec Kit 归档能力按 `ADDED/MODIFIED/REMOVED/RENAMED` 语义合并主 spec，并在归档后校验主 spec 中没有残留 delta-only section 标题。

如需预览而不实际执行，使用 `--dry-run` 参数。

### 3. 生命周期闭环

Spec 生命周期在此完成：
```
brainstorming → delta spec → 实施 → 验证 → 主 spec 合并 → design doc 标注 → 归档
```

## 退出条件

- 归档脚本执行成功（退出码 0）
- 归档目录 `specs/archive/YYYY-MM-DD-<change-name>/` 存在
- 归档后的 `.zcw.yaml` 中 `archived: true`

归档脚本会把 `specs/<name>/` 移动到 `specs/archive/YYYY-MM-DD-<name>/`。

> **WARNING**: 归档成功后**不要再对原 change 名运行** `"$ZCW_BASH" "$ZCW_GUARD" <change-name> archive`，因为原活跃目录已经不存在。误调会导致 guard 报错"change directory not found"。归档完整性以脚本退出码和归档目录状态为准。

## 完成

ZCW 流程全部完成。如需开始新工作，调用 `/zcw` 或 `/zcw-open`。

## 上下文压缩恢复

按 `zcw/reference/context-recovery.md` 执行，phase 参数为 `archive`。若 `archived: true` 且归档目录存在，归档已完成，无需再次执行归档操作。
