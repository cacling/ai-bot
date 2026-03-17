#!/usr/bin/env bash
# win-start.sh — 启动电信客服 Agent 全栈服务（Windows 版）
# 用法: ./win-start.sh
# 依赖: bun / node / npm 已在 PATH 中

set -uo pipefail

# ── 路径配置 ────────────────────────────────────────────────────────────────
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUN="$(which bun)"
NODE="$(which node)"
NPM="$(which npm)"
LOG_DIR="${BASE_DIR}/logs"
PID_FILE="${BASE_DIR}/.win-pids"

RESTART_DELAY=3
HEALTH_TIMEOUT=30

# ── 代理配置（外网走 Privoxy，本地直连）────────────────────────────────────
PROXY_HTTP="http://127.0.0.1:18118"
PROXY_NO_PROXY="localhost,127.0.0.1,::1,api.siliconflow.cn,dashscope.aliyuncs.com,open.bigmodel.cn"

# ── 颜色 ────────────────────────────────────────────────────────────────────
GRN='\033[0;32m'; RED='\033[0;31m'; YEL='\033[1;33m'; BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLU}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "  ${GRN}✓${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; }
warn() { echo -e "  ${YEL}!${NC} $*"; }

# ── 按端口杀进程（PowerShell） ───────────────────────────────────────────────
kill_port() {
  local port=$1
  powershell -NoProfile -Command "
    \$conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if (\$conn) {
      \$conn.OwningProcess | Select-Object -Unique |
        ForEach-Object { Stop-Process -Id \$_ -Force -ErrorAction SilentlyContinue }
    }
  " 2>/dev/null || true
}

# ── PID 记录 ────────────────────────────────────────────────────────────────
WRAPPER_PIDS=()

# ── 退出清理 ────────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  log "${YEL}正在停止所有服务...${NC}"
  for pid in "${WRAPPER_PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  for port in 18472 8003 5173 5174 5175; do
    kill_port "$port"
  done
  rm -f "$PID_FILE"
  wait 2>/dev/null || true
  echo -e "${YEL}所有服务已停止。${NC}"
}
trap cleanup SIGINT SIGTERM

mkdir -p "$LOG_DIR"

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

# ── 检查运行时 ───────────────────────────────────────────────────────────────
for bin in "$BUN" "$NODE" "$NPM"; do
  if [[ ! -x "$bin" ]]; then
    fail "找不到可执行文件: $bin"
    exit 1
  fi
done

# ── 设置代理环境变量（全脚本生效）──────────────────────────────────────────
export HTTP_PROXY="$PROXY_HTTP"
export HTTPS_PROXY="$PROXY_HTTP"
export http_proxy="$PROXY_HTTP"
export https_proxy="$PROXY_HTTP"
export NO_PROXY="$PROXY_NO_PROXY"
export no_proxy="$PROXY_NO_PROXY"

log "代理已启用: HTTP_PROXY=$HTTP_PROXY"
log "本地直连: NO_PROXY=$NO_PROXY"

# ────────────────────────────────────────────────────────────────────────────
# 1. 安装依赖
# ────────────────────────────────────────────────────────────────────────────
echo -e "\n${BLU}══════ 安装依赖 ══════${NC}"

log "backend: npm install"
cd "$BASE_DIR/backend" && "$NPM" install --prefer-offline 2>&1 | tail -3
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

mkdir -p "$BASE_DIR/backend/data"

log "同步数据库 Schema (drizzle-kit push)..."
cd "$BASE_DIR/backend" && "$BUN" drizzle-kit push 2>&1 | tail -3
ok "数据库 Schema 就绪"

PLAN_COUNT=$(cd "$BASE_DIR/backend" && "$BUN" -e \
  "import {db} from './src/db/index.ts'; \
   import {plans} from './src/db/schema.ts'; \
   console.log(db.select().from(plans).all().length)" 2>/dev/null || echo "0")

MOCK_USER_COUNT=$(cd "$BASE_DIR/backend" && "$BUN" -e \
  "import {db} from './src/db/index.ts'; \
   import {mockUsers} from './src/db/schema.ts'; \
   console.log(db.select().from(mockUsers).all().length)" 2>/dev/null || echo "0")

if [[ "$PLAN_COUNT" == "0" || "$MOCK_USER_COUNT" == "0" ]]; then
  log "数据库不完整（套餐数: ${PLAN_COUNT}, 用户数: ${MOCK_USER_COUNT}），写入初始数据..."
  cd "$BASE_DIR/backend" && "$BUN" run db:seed 2>&1 | tail -5
  ok "初始数据写入完成"
else
  ok "数据库已有数据（套餐数: ${PLAN_COUNT}, 用户数: ${MOCK_USER_COUNT}），跳过 seed"
fi

# ────────────────────────────────────────────────────────────────────────────
# 3. 启动服务（带自动重启的后台 wrapper）
# ────────────────────────────────────────────────────────────────────────────

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

start_service "telecom-mcp" "$BASE_DIR/backend/mcp_servers/ts" \
  "node --import tsx/esm telecom_service.ts"

start_service "backend"     "$BASE_DIR/backend" \
  "bun src/index.ts"

start_service "frontend"    "$BASE_DIR/frontend" \
  "npm run dev"

# 保存 wrapper PIDs 供 win-stop.sh 使用
printf '%s\n' "${WRAPPER_PIDS[@]}" > "$PID_FILE"

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

wait
