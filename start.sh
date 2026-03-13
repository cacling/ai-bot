#!/usr/bin/env bash
# start.sh — 启动电信客服 Agent 全栈服务
# 用法: ./start.sh
# 包含: 依赖安装 → 启动所有服务（自动重启）→ 健康检查

set -uo pipefail

# ── 路径配置 ────────────────────────────────────────────────────────────────
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUN="${HOME}/.bun/bin/bun"
NODE="/opt/homebrew/opt/node@22/bin/node"
NPM="/opt/homebrew/opt/node@22/bin/npm"
LOG_DIR="${BASE_DIR}/logs"

RESTART_DELAY=3       # 进程退出后等待几秒重启
HEALTH_TIMEOUT=30     # 健康检查最多等待秒数

# ── 颜色 ────────────────────────────────────────────────────────────────────
GRN='\033[0;32m'; RED='\033[0;31m'; YEL='\033[1;33m'; BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLU}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "  ${GRN}✓${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; }
warn() { echo -e "  ${YEL}!${NC} $*"; }

# ── PID 记录 ────────────────────────────────────────────────────────────────
WRAPPER_PIDS=()

# ── 按端口杀进程 ─────────────────────────────────────────────────────────────
kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null) || true
  [[ -n "$pids" ]] && echo "$pids" | xargs kill -9 2>/dev/null || true
}

# ── 退出清理 ────────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  log "${YEL}正在停止所有服务...${NC}"
  # 先杀 wrapper 循环（防止重启）
  for pid in "${WRAPPER_PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  # 再按端口强杀实际进程
  for port in 18472 8003 5173; do
    kill_port "$port"
  done
  wait 2>/dev/null || true
  echo -e "${YEL}所有服务已停止。${NC}"
}
trap cleanup SIGINT SIGTERM

mkdir -p "$LOG_DIR"

# ── 清除代理（必须在 bun install / npm install 之前，否则安装会卡住）────────────
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy
NO_PROXY="localhost,127.0.0.1"
no_proxy="localhost,127.0.0.1"
export NO_PROXY no_proxy
log "已清除代理环境变量"

# ── 清空日志文件 ──────────────────────────────────────────────────────────────
log "清空日志文件..."
for f in "$LOG_DIR"/*.log; do
  [[ -f "$f" ]] && > "$f"
done
ok "日志已清空"

# ── 清除端口残留进程 ─────────────────────────────────────────────────────────
log "清理端口残留进程 (18472/8003/5173)..."
for port in 18472 8003 5173; do
  kill_port "$port"
done
ok "端口已清理"

# ── 检查二进制 ───────────────────────────────────────────────────────────────
for bin in "$BUN" "$NODE" "$NPM"; do
  if [[ ! -x "$bin" ]]; then
    fail "找不到可执行文件: $bin"
    exit 1
  fi
done

# ────────────────────────────────────────────────────────────────────────────
# 1. 安装依赖
# ────────────────────────────────────────────────────────────────────────────
echo -e "\n${BLU}══════ 安装依赖 ══════${NC}"

log "backend: bun install"
cd "$BASE_DIR/backend" && "$BUN" install --frozen-lockfile 2>&1 | tail -3
ok "backend 依赖就绪"

log "backend/mcp_servers/ts: npm install"
cd "$BASE_DIR/backend/mcp_servers/ts" && "$NPM" install --prefer-offline 2>&1 | tail -3
ok "mcp_servers 依赖就绪"

log "frontend: npm install"
cd "$BASE_DIR/frontend" && "$NPM" install --prefer-offline 2>&1 | tail -3
ok "frontend 依赖就绪"

# ────────────────────────────────────────────────────────────────────────────
# 2. 初始化 SQLite 数据库
# ────────────────────────────────────────────────────────────────────────────
echo -e "\n${BLU}══════ 数据库准备 ══════${NC}"

# 确保数据目录存在
mkdir -p "$BASE_DIR/backend/data"

log "同步数据库 Schema (drizzle-kit push)..."
cd "$BASE_DIR/backend" && "$BUN" drizzle-kit push 2>&1 | tail -3
ok "数据库 Schema 就绪"

# 首次启动或新表为空时写入初始数据
PLAN_COUNT=$(cd "$BASE_DIR/backend" && "$BUN" -e \
  "import {db} from './src/db/index.ts'; \
   import {plans} from './src/db/schema.ts'; \
   console.log(db.select().from(plans).all().length)" 2>/dev/null || echo "0")

USER_COUNT=$(cd "$BASE_DIR/backend" && "$BUN" -e \
  "import {db} from './src/db/index.ts'; \
   import {mockUsers} from './src/db/schema.ts'; \
   console.log(db.select().from(mockUsers).all().length)" 2>/dev/null || echo "0")

if [[ "$PLAN_COUNT" == "0" || "$USER_COUNT" == "0" ]]; then
  log "数据库缺少数据（套餐数: ${PLAN_COUNT}, 用户数: ${USER_COUNT}），写入初始数据..."
  cd "$BASE_DIR/backend" && "$BUN" run db:seed 2>&1 | tail -5
  ok "初始数据写入完成"
else
  ok "数据库已有数据（套餐数: ${PLAN_COUNT}, 用户数: ${USER_COUNT}），跳过 seed"
fi

# ────────────────────────────────────────────────────────────────────────────
# 3. 启动服务（带自动重启的后台 wrapper）
# ────────────────────────────────────────────────────────────────────────────

# start_service <name> <workdir> <command>
start_service() {
  local name="$1"
  local dir="$2"
  local cmd="$3"
  local logfile="${LOG_DIR}/${name}.log"

  (
    set +e
    while true; do
      echo "[$(date '+%H:%M:%S')] ▶ Starting ${name}..." >> "$logfile"
      cd "$dir"
      eval "$cmd" >> "$logfile" 2>&1
      EXIT_CODE=$?
      echo "[$(date '+%H:%M:%S')] ⚠ ${name} exited (code=${EXIT_CODE}), restarting in ${RESTART_DELAY}s..." >> "$logfile"
      sleep "$RESTART_DELAY"
    done
  ) &

  local wpid=$!
  WRAPPER_PIDS+=("$wpid")
  log "  [${name}] 已启动 (wrapper_pid=${wpid}, log=logs/${name}.log)"
}

echo -e "\n${BLU}══════ 启动服务 ══════${NC}"

# 代理已在脚本顶部清除，此处无需重复。

start_service "telecom-mcp" "$BASE_DIR/backend/mcp_servers/ts" \
  "$NODE --import tsx/esm telecom_service.ts"

start_service "backend"     "$BASE_DIR/backend" \
  "$BUN src/index.ts"

start_service "frontend"    "$BASE_DIR/frontend" \
  "$NPM run dev"

# ────────────────────────────────────────────────────────────────────────────
# 4. 健康检查
# ────────────────────────────────────────────────────────────────────────────
echo -e "\n${BLU}══════ 健康检查 ══════${NC}"
log "等待 backend 就绪（最多 ${HEALTH_TIMEOUT}s）..."

READY=false
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
  if curl -sf --noproxy '*' http://localhost:18472/health >/dev/null 2>&1; then
    READY=true
    break
  fi
  printf "."
  sleep 1
done
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "$READY" == true ]]; then
  RESP=$(curl -s --noproxy '*' http://localhost:18472/health)
  ok "Backend      → http://localhost:18472  ${RESP}"
  ok "Frontend     → http://localhost:5173"
  ok "Telecom MCP  → http://localhost:8003/mcp"
  echo ""
  echo -e "${GRN}✓ 所有服务启动成功！${NC}"
else
  fail "Backend 健康检查超时（${HEALTH_TIMEOUT}s）"
  warn "查看日志：tail -f logs/backend.log"
  echo ""
  echo -e "${RED}✗ 启动可能失败，请检查 logs/ 目录${NC}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
log "按 Ctrl+C 停止所有服务"
log "日志目录: ${LOG_DIR}/"
echo ""

# 等待所有后台进程
wait
