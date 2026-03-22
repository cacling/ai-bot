#!/usr/bin/env bash
# win-stop.sh — 停止电信客服 Agent 全栈服务（Windows Git Bash 版）

GRN='\033[0;32m'; RED='\033[0;31m'; BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLU}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "  ${GRN}✓${NC} $*"; }

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${BASE_DIR}/.win-pids"

# ── 按端口杀进程（netstat + taskkill，避免 PowerShell 冷启动） ─────────────
kill_port() {
  local port=$1
  local pids
  pids=$(netstat -ano 2>/dev/null | grep ":${port} " | grep 'LISTENING' | awk '{print $5}' | sort -u)
  local found=false
  for pid in $pids; do
    if [[ "$pid" =~ ^[0-9]+$ ]] && [[ "$pid" -ne 0 ]]; then
      taskkill //F //PID "$pid" >/dev/null 2>&1 && found=true
    fi
  done
  if [[ "$found" == true ]]; then
    ok "端口 $port 已释放"
  else
    echo "  - 端口 $port 无进程"
  fi
}

log "停止所有服务..."

# ── 停止 wrapper 循环（通过 PID 文件） ──────────────────────────────────────
if [[ -f "$PID_FILE" ]]; then
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
  done < "$PID_FILE"
  rm -f "$PID_FILE"
  ok "wrapper 进程已停止"
fi

# ── 按端口强杀实际进程 ───────────────────────────────────────────────────────
kill_port 18472  # backend
kill_port 18003  # 用户信息 MCP
kill_port 18004  # 业务办理 MCP
kill_port 18005  # 故障诊断 MCP
kill_port 18006  # 外呼服务 MCP
kill_port 18007  # 账户操作 MCP
kill_port 18008  # mock_apis
kill_port 5173   # frontend

# 杀掉可能漂移的 Vite 端口
for port in 5174 5175 5176 5177 5178; do
  kill_port "$port" 2>/dev/null
done

# ── 兜底：杀掉残留的 win-start.sh bash wrapper ──────────────────────────────
wrapper_pids=$(pgrep -f "bash.*win-start" 2>/dev/null) || true
if [[ -n "$wrapper_pids" ]]; then
  echo "$wrapper_pids" | xargs kill 2>/dev/null || true
  ok "win-start.sh wrapper 进程已停止"
fi

echo ""
echo -e "${GRN}✓ 所有服务已停止。${NC}"
