#!/usr/bin/env bash
# stop.sh — 停止电信客服 Agent 全栈服务

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GRN='\033[0;32m'; RED='\033[0;31m'; BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLU}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "  ${GRN}✓${NC} $*"; }

# ── 加载 .env 端口配置 ─────────────────────────────────────────────────────
if [[ -f "$BASE_DIR/.env" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^(BACKEND_PORT|KM_SERVICE_PORT|MOCK_APIS_PORT|WORK_ORDER_PORT|MCP_INTERNAL_PORT|FRONTEND_PORT)= ]] && export "$line"
  done < "$BASE_DIR/.env"
fi

BACKEND_PORT="${BACKEND_PORT:-18472}"
KM_SERVICE_PORT="${KM_SERVICE_PORT:-18010}"
MOCK_APIS_PORT="${MOCK_APIS_PORT:-18008}"
WORK_ORDER_PORT="${WORK_ORDER_PORT:-18009}"
MCP_INTERNAL_PORT="${MCP_INTERNAL_PORT:-18003}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null) || true
  if [[ -n "$pids" ]]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    ok "端口 $port 已释放"
  else
    echo "  - 端口 $port 无进程"
  fi
}

log "停止所有服务..."
kill_port "$BACKEND_PORT"       # backend
kill_port "$MCP_INTERNAL_PORT"  # 内部服务 MCP (统一)
kill_port "$MOCK_APIS_PORT"     # mock_apis
kill_port "$WORK_ORDER_PORT"    # work_order_service
kill_port "$KM_SERVICE_PORT"    # km_service
kill_port "$FRONTEND_PORT"      # frontend

# 杀掉可能漂移的 Vite 端口
for port in 5174 5175 5176 5177 5178; do
  pids=$(lsof -ti :"$port" 2>/dev/null) || true
  [[ -n "$pids" ]] && echo "$pids" | xargs kill -9 2>/dev/null && ok "端口 $port 已释放" || true
done

# 杀掉 start.sh 的 wrapper 循环
wrapper_pids=$(pgrep -f "bash.*start.sh" 2>/dev/null) || true
if [[ -n "$wrapper_pids" ]]; then
  echo "$wrapper_pids" | xargs kill 2>/dev/null || true
  ok "start.sh wrapper 进程已停止"
fi

echo ""
echo -e "${GRN}✓ 所有服务已停止。${NC}"
