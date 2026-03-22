#!/usr/bin/env bash
# start.sh — 启动电信客服 Agent 全栈服务
# 用法: ./start.sh           正常启动（保留用户数据）
#       ./start.sh --reset   重置模式（清空 DB + 清理旧版本快照 + 重新 seed）
# 包含: 依赖安装 → 数据库初始化 → 启动所有服务 → 健康检查

set -uo pipefail

# ── 路径配置 ────────────────────────────────────────────────────────────────
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUN="${HOME}/.bun/bin/bun"
NODE="/opt/homebrew/opt/node@22/bin/node"
NPM="/opt/homebrew/opt/node@22/bin/npm"
LOG_DIR="${BASE_DIR}/logs"

RESTART_DELAY=3
HEALTH_TIMEOUT=30
RESET_MODE=false
[[ "${1:-}" == "--reset" ]] && RESET_MODE=true

# ── 端口定义 ────────────────────────────────────────────────────────────────
BACKEND_PORT=18472
MCP_PORTS=(18003 18004 18005 18006 18007)
MCP_SERVICES=("user_info_service" "business_service" "diagnosis_service" "outbound_service" "account_service")
MCP_LABELS=("用户信息" "业务办理" "故障诊断" "外呼服务" "账户操作")
MOCK_APIS_PORT=18008
FRONTEND_PORT=5173
ALL_PORTS=("$BACKEND_PORT" "${MCP_PORTS[@]}" "$MOCK_APIS_PORT" "$FRONTEND_PORT")

# ── 颜色 ────────────────────────────────────────────────────────────────────
GRN='\033[0;32m'; RED='\033[0;31m'; YEL='\033[1;33m'; BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLU}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "  ${GRN}✓${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; }
warn() { echo -e "  ${YEL}!${NC} $*"; }

# ── PID 记录 ────────────────────────────────────────────────────────────────
WRAPPER_PIDS=()

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
  for pid in "${WRAPPER_PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  for port in "${ALL_PORTS[@]}"; do
    kill_port "$port"
  done
  # 杀掉漂移的 Vite 端口
  for port in 5174 5175 5176 5177 5178; do
    lsof -ti :"$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo -e "${YEL}所有服务已停止。${NC}"
}
trap cleanup SIGINT SIGTERM

mkdir -p "$LOG_DIR"

# ── 清除代理 ────────────────────────────────────────────────────────────────
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy
NO_PROXY="localhost,127.0.0.1"
no_proxy="localhost,127.0.0.1"
export NO_PROXY no_proxy
log "已清除代理环境变量"

# ── 清空日志 ────────────────────────────────────────────────────────────────
log "清空日志文件..."
for f in "$LOG_DIR"/*.log; do [[ -f "$f" ]] && > "$f"; done
ok "日志已清空"

# ── 清除端口残留 ────────────────────────────────────────────────────────────
log "清理端口残留进程..."
for port in "${ALL_PORTS[@]}"; do kill_port "$port"; done
ok "端口已清理"

# ── 检查二进制 ──────────────────────────────────────────────────────────────
for bin in "$BUN" "$NODE" "$NPM"; do
  if [[ ! -x "$bin" ]]; then fail "找不到可执行文件: $bin"; exit 1; fi
done

# ════════════════════════════════════════════════════════════════════════════
# 1. 安装依赖
# ════════════════════════════════════════════════════════════════════════════
echo -e "\n${BLU}══════ 安装依赖 ══════${NC}"

log "backend: bun install"
cd "$BASE_DIR/backend" && "$BUN" install --frozen-lockfile 2>&1 | tail -3
ok "backend 依赖就绪"

log "mcp_servers: npm install"
cd "$BASE_DIR/mcp_servers" && "$NPM" install --prefer-offline 2>&1 | tail -3
ok "mcp_servers 依赖就绪"

log "frontend: npm install"
cd "$BASE_DIR/frontend" && "$NPM" install --prefer-offline 2>&1 | tail -3
ok "frontend 依赖就绪"

# ════════════════════════════════════════════════════════════════════════════
# 2. 数据库准备
# ════════════════════════════════════════════════════════════════════════════
echo -e "\n${BLU}══════ 数据库准备 ══════${NC}"

mkdir -p "$BASE_DIR/data"
export SQLITE_PATH="$BASE_DIR/data/telecom.db"

# Schema 同步（非交互模式：如果有破坏性变更，先删表再 push）
log "同步数据库 Schema..."
cd "$BASE_DIR/backend"
PUSH_OUTPUT=$("$BUN" drizzle-kit push 2>&1 || true)
if echo "$PUSH_OUTPUT" | grep -q "rename column\|created or renamed"; then
  warn "检测到 Schema 破坏性变更，重建数据库表..."
  "$BUN" -e "
    import Database from 'bun:sqlite';
    const db = new Database(process.env.SQLITE_PATH || '../data/telecom.db');
    const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'\").all();
    for (const t of tables) { db.exec('DROP TABLE IF EXISTS ' + t.name); }
    console.log('Dropped', tables.length, 'tables');
  " 2>/dev/null
  "$BUN" drizzle-kit push 2>&1 | tail -3
fi
ok "数据库 Schema 就绪"

# 数据初始化
if [[ "$RESET_MODE" == true ]]; then
  warn "重置模式：清空数据库 + 清理版本快照..."
  cd "$BASE_DIR/backend"

  # 删除 DB + WAL/SHM（主数据库在项目根目录 data/，backend/data/ 可能有残留副本）
  rm -f "$BASE_DIR/data/telecom.db" "$BASE_DIR/data/telecom.db-wal" "$BASE_DIR/data/telecom.db-shm"
  rm -f "$BASE_DIR/backend/data/telecom.db" "$BASE_DIR/backend/data/telecom.db-wal" "$BASE_DIR/backend/data/telecom.db-shm"
  ok "数据库已删除"

  # 清理非默认技能（biz-skills 和 .versions 中只保留默认 7 个）
  DEFAULT_SKILLS=("bill-inquiry" "fault-diagnosis" "outbound-collection" "outbound-marketing" "plan-inquiry" "service-cancel" "telecom-app")

  BIZ_DIR="$BASE_DIR/backend/skills/biz-skills"
  for dir in "$BIZ_DIR"/*/; do
    [[ ! -d "$dir" ]] && continue
    name=$(basename "$dir")
    if [[ ! " ${DEFAULT_SKILLS[*]} " =~ " $name " ]]; then
      rm -rf "$dir"
      ok "删除非默认技能 biz-skills/$name"
    fi
  done

  VERSIONS_DIR="$BASE_DIR/backend/skills/.versions"
  for dir in "$VERSIONS_DIR"/*/; do
    [[ ! -d "$dir" ]] && continue
    name=$(basename "$dir")
    if [[ ! " ${DEFAULT_SKILLS[*]} " =~ " $name " ]]; then
      rm -rf "$dir"
      ok "删除非默认版本 .versions/$name"
    fi
  done
  ok "非默认技能清理完成"

  # 清理 .versions/：每个 skill 只保留最新 2 个版本
  if [[ -d "$VERSIONS_DIR" ]]; then
    for skill_dir in "$VERSIONS_DIR"/*/; do
      [[ ! -d "$skill_dir" ]] && continue
      skill_name=$(basename "$skill_dir")
      # 列出版本目录，按版本号排序（v1, v2, v3...），删除最旧的（只保留最新2个）
      versions=($(ls -d "${skill_dir}"v* 2>/dev/null | sort -t'v' -k2 -n))
      count=${#versions[@]}
      if [[ $count -gt 2 ]]; then
        to_delete=$((count - 2))
        for ((i=0; i<to_delete; i++)); do
          rm -rf "${versions[$i]}"
          ok "删除 ${skill_name}/$(basename ${versions[$i]})"
        done
      fi
    done
    ok "版本快照清理完成（每个 skill 保留最新 2 个版本）"
  fi

  # 删除所有 .draft 文件
  find "$BASE_DIR/backend/skills" -name "*.draft" -delete 2>/dev/null
  ok "草稿文件已清理"

  # 重新 push schema + seed
  "$BUN" drizzle-kit push 2>&1 | tail -3
  "$BUN" run db:seed 2>&1 | tail -5
  ok "数据已重置为初始状态"
else
  # 正常模式：upsert，保留用户数据
  log "写入/更新初始数据..."
  cd "$BASE_DIR/backend" && "$BUN" run db:seed 2>&1 | tail -5
  ok "初始数据就绪"
fi

# ════════════════════════════════════════════════════════════════════════════
# 3. 启动服务
# ════════════════════════════════════════════════════════════════════════════

start_service() {
  local name="$1" dir="$2" cmd="$3"
  local logfile="${LOG_DIR}/${name}.log"
  (
    set +e
    while true; do
      echo "[$(date '+%H:%M:%S')] ▶ Starting ${name}..." >> "$logfile"
      cd "$dir" && eval "$cmd" >> "$logfile" 2>&1
      EXIT_CODE=$?
      echo "[$(date '+%H:%M:%S')] ⚠ ${name} exited (code=${EXIT_CODE}), restarting in ${RESTART_DELAY}s..." >> "$logfile"
      sleep "$RESTART_DELAY"
    done
  ) &
  WRAPPER_PIDS+=("$!")
  log "  [${name}] 已启动 (log=logs/${name}.log)"
}

echo -e "\n${BLU}══════ 启动服务 ══════${NC}"

# MCP 服务（顺序启动，避免 DB WAL 锁竞争）
for i in "${!MCP_SERVICES[@]}"; do
  start_service "${MCP_LABELS[$i]}-mcp" "$BASE_DIR/mcp_servers" \
    "$NODE --import tsx/esm src/services/${MCP_SERVICES[$i]}.ts"
  sleep 0.5
done

# Mock APIs
start_service "mock-apis" "$BASE_DIR/mock_apis" \
  "$NODE --import tsx/esm src/server.ts"

# Backend
start_service "backend" "$BASE_DIR/backend" "$BUN src/index.ts"

# Frontend
start_service "frontend" "$BASE_DIR/frontend" "$NPM run dev"

# ════════════════════════════════════════════════════════════════════════════
# 4. 健康检查
# ════════════════════════════════════════════════════════════════════════════
echo -e "\n${BLU}══════ 健康检查 ══════${NC}"
log "等待服务就绪（最多 ${HEALTH_TIMEOUT}s）..."

# 等待 backend
READY=false
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
  if curl -sf --noproxy '*' http://127.0.0.1:${BACKEND_PORT}/health >/dev/null 2>&1; then
    READY=true; break
  fi
  printf "."; sleep 1
done
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "$READY" == true ]]; then
  ok "Backend      → http://127.0.0.1:${BACKEND_PORT}"
  ok "Frontend     → http://localhost:${FRONTEND_PORT}"

  # 检查每个 MCP 服务
  for i in "${!MCP_PORTS[@]}"; do
    PORT=${MCP_PORTS[$i]}
    if lsof -ti :"$PORT" >/dev/null 2>&1; then
      ok "${MCP_LABELS[$i]} MCP  → http://127.0.0.1:${PORT}/mcp"
    else
      fail "${MCP_LABELS[$i]} MCP  → 端口 ${PORT} 未启动"
    fi
  done

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
