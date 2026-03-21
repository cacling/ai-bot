#!/usr/bin/env bash
# tests/scripts/start.sh — 启动测试所需的全栈服务（后台运行）
# 用法: bash tests/scripts/start.sh
# 服务: telecom-mcp(:8003) + backend(:18472) + frontend(:5173)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUN="${HOME}/.bun/bin/bun"
NODE="/opt/homebrew/opt/node@22/bin/node"
NPM="/opt/homebrew/opt/node@22/bin/npm"
LOG_DIR="${BASE_DIR}/logs"
PID_FILE="${SCRIPT_DIR}/.service-pids"

GRN='\033[0;32m'; RED='\033[0;31m'; YEL='\033[1;33m'; BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLU}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "  ${GRN}✓${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; }

# ── 检查是否已经在运行 ────────────────────────────────────────────────────────
if [[ -f "$PID_FILE" ]]; then
  RUNNING=0
  while IFS= read -r pid; do
    kill -0 "$pid" 2>/dev/null && RUNNING=1
  done < "$PID_FILE"
  if [[ "$RUNNING" == "1" ]]; then
    echo -e "${YEL}服务已在运行中。如需重启请先执行 stop.sh${NC}"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

# ── 清理代理 ──────────────────────────────────────────────────────────────────
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy
export NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1"

# ── 清理端口残留 ──────────────────────────────────────────────────────────────
kill_port() {
  local pids
  pids=$(lsof -ti :"$1" 2>/dev/null) || true
  [[ -n "$pids" ]] && echo "$pids" | xargs kill -9 2>/dev/null || true
}

log "清理端口残留 (18472/8003/5173)..."
for port in 18472 8003 5173; do kill_port "$port"; done

# ── 同步 Schema ──────────────────────────────────────────────────────────────
mkdir -p "$BASE_DIR/backend/data" "$LOG_DIR"
log "同步数据库 Schema..."
cd "$BASE_DIR/backend" && "$BUN" drizzle-kit push 2>&1 | tail -1
ok "Schema 就绪"

# ── 初始化测试数据 ────────────────────────────────────────────────────────────
log "写入测试数据 (seed)..."
cd "$BASE_DIR/backend" && "$BUN" run db:seed 2>&1 | tail -2
ok "测试数据就绪"

# ── 启动服务（后台） ──────────────────────────────────────────────────────────
> "$PID_FILE"

log "启动 telecom-mcp..."
cd "$BASE_DIR/mcp_servers" && nohup "$NODE" --import tsx/esm src/all.ts >> "$LOG_DIR/telecom-mcp.log" 2>&1 &
echo $! >> "$PID_FILE"
ok "telecom-mcp (pid=$!)"

log "启动 backend..."
cd "$BASE_DIR/backend" && nohup "$BUN" src/index.ts >> "$LOG_DIR/backend.log" 2>&1 &
echo $! >> "$PID_FILE"
ok "backend (pid=$!)"

log "启动 frontend..."
cd "$BASE_DIR/frontend" && nohup "$NPM" run dev >> "$LOG_DIR/frontend.log" 2>&1 &
echo $! >> "$PID_FILE"
ok "frontend (pid=$!)"

# ── 健康检查 ──────────────────────────────────────────────────────────────────
log "等待 backend 就绪..."
READY=false
for _ in $(seq 1 30); do
  if curl -sf --noproxy '*' http://localhost:18472/health >/dev/null 2>&1; then
    READY=true; break
  fi
  sleep 1
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "$READY" == true ]]; then
  ok "Backend      → http://localhost:18472"
  ok "Frontend     → http://localhost:5173"
  ok "Telecom MCP  → http://localhost:8003/mcp"
  echo -e "\n${GRN}✓ 测试服务启动成功！${NC}"
  echo -e "  PID 文件: ${PID_FILE}"
  echo -e "  停止服务: bash tests/scripts/stop.sh"
else
  fail "Backend 健康检查超时"
  echo -e "${RED}✗ 启动可能失败，查看 logs/ 目录${NC}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
