#!/usr/bin/env bash
# 启动全栈服务供 Playwright E2E 测试使用
# 包含：PostgreSQL、telecom-mcp(:8003)、backend(:8000)、frontend(:5173)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/../../../start.sh"
