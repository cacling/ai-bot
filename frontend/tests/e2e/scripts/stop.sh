#!/usr/bin/env bash
# tests/scripts/stop.sh — 停止测试服务
# 用法: bash tests/scripts/stop.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${SCRIPT_DIR}/.service-pids"

GRN='\033[0;32m'; YEL='\033[1;33m'; BLU='\033[0;34m'; NC='\033[0m'
log() { echo -e "${BLU}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()  { echo -e "  ${GRN}✓${NC} $*"; }

kill_port() {
  local pids
  pids=$(lsof -ti :"$1" 2>/dev/null) || true
  [[ -n "$pids" ]] && echo "$pids" | xargs kill -9 2>/dev/null || true
}

log "停止测试服务..."

# 先按 PID 文件杀
if [[ -f "$PID_FILE" ]]; then
  while IFS= read -r pid; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null && ok "已停止进程 $pid" || true
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

# 兜底：按端口清理
for port in 18472 8003 5173; do
  kill_port "$port"
done

echo -e "${GRN}✓ 所有测试服务已停止${NC}"
