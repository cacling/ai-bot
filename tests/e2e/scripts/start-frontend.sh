#!/usr/bin/env bash
# 启动前端 dev server（测试专用端口 5179，使用 mock API 不依赖后端）
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../../frontend"

cd "$FRONTEND_DIR"
exec npm run dev -- --port 5179
