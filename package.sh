#!/usr/bin/env bash
# 将项目源代码打包为 ../ai-bot.zip，严格遵循 .gitignore 规则
# 打包内容 = 已跟踪且未被忽略的文件 + 未跟踪且未被忽略的文件
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ_NAME="$(basename "$SCRIPT_DIR")"
OUTPUT="$SCRIPT_DIR/../${PROJ_NAME}.zip"

rm -f "$OUTPUT"

# comm -23：从已跟踪文件中减去"已跟踪但匹配 .gitignore 的文件"
# git ls-files -ci：列出已跟踪且被 .gitignore 命中的文件（如 node_modules）
# git ls-files -o：列出未跟踪且未被忽略的文件（新增但尚未 git add 的源文件）
{
  comm -23 \
    <(git -C "$SCRIPT_DIR" ls-files -c | sort) \
    <(git -C "$SCRIPT_DIR" ls-files -ci --exclude-standard | sort)
  git -C "$SCRIPT_DIR" ls-files -o --exclude-standard
} | sort -u \
  | sed "s|^|${PROJ_NAME}/|" \
  | (cd "$SCRIPT_DIR/.." && zip "$OUTPUT" -@)

echo "✅ 打包完成：$OUTPUT ($(du -sh "$OUTPUT" | cut -f1))"
