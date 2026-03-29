#!/usr/bin/env bash
# stop.sh — 停止电信客服 Agent 全栈服务

GRN='\033[0;32m'; RED='\033[0;31m'; BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLU}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "  ${GRN}✓${NC} $*"; }

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
kill_port 18472  # backend
kill_port 18003  # 内部服务 MCP (统一)
kill_port 18008  # mock_apis
kill_port 18009  # work_order_service
kill_port 18010  # km_service
kill_port 5173   # frontend

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
