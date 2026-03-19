---
name: sync-docs
description: 从 spec-kit 文档重新生成 CLAUDE.md。当你修改了 .specify/ 下的文档后，用 /sync-docs 手动同步。
disable-model-invocation: true
allowed-tools: Bash
---

执行以下命令重新生成 CLAUDE.md：

```bash
bash .specify/scripts/bash/build-claude-md.sh
```

执行完成后，告知用户生成结果（行数、来源文件）。
