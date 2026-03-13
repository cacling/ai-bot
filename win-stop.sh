#!/usr/bin/env bash
# win-stop.sh — 停止电信客服 Agent 全栈服务（Windows 版）

GRN='\033[0;32m'; RED='\033[0;31m'; BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLU}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "  ${GRN}✓${NC} $*"; }

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${BASE_DIR}/.win-pids"

# ── 按端口杀进程（PowerShell） ───────────────────────────────────────────────
kill_port() {
  local port=$1
  local killed
  killed=$(powershell -NoProfile -Command "
    \$conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if (\$conn) {
      \$conn.OwningProcess | Select-Object -Unique |
        ForEach-Object { Stop-Process -Id \$_ -Force -ErrorAction SilentlyContinue }
      Write-Output 'killed'
    }
  " 2>/dev/null)
  if [[ "$killed" == "killed" ]]; then
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
kill_port 8003   # telecom-mcp
kill_port 5173   # frontend (vite 默认)

# 杀掉可能漂移的 Vite 端口
for port in 5174 5175 5176 5177 5178; do
  powershell -NoProfile -Command "
    \$conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if (\$conn) {
      \$conn.OwningProcess | Select-Object -Unique |
        ForEach-Object { Stop-Process -Id \$_ -Force -ErrorAction SilentlyContinue }
      Write-Output \"端口 $port 已释放\"
    }
  " 2>/dev/null | while IFS= read -r line; do ok "$line"; done

done

# ── 兜底：杀掉残留的 win-start.sh bash wrapper ──────────────────────────────
wrapper_pids=$(pgrep -f "bash.*win-start" 2>/dev/null) || true
if [[ -n "$wrapper_pids" ]]; then
  echo "$wrapper_pids" | xargs kill 2>/dev/null || true
  ok "win-start.sh wrapper 进程已停止"
fi

echo ""
echo -e "${GRN}✓ 所有服务已停止。${NC}"
