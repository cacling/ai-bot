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

# ── 颜色 ────────────────────────────────────────────────────────────────────
GRN='\033[0;32m'; RED='\033[0;31m'; YEL='\033[1;33m'; BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLU}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "  ${GRN}✓${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; }
warn() { echo -e "  ${YEL}!${NC} $*"; }

mkdir -p "$LOG_DIR"

# ── 加载环境变量（根目录 .env）──────────────────────────────────────────────
if [[ -f "$BASE_DIR/.env" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    # SQLITE_PATH 和 SKILLS_DIR 是相对路径，各服务 cwd 不同不能全局 export
    [[ "$line" =~ ^SQLITE_PATH= || "$line" =~ ^SKILLS_DIR= ]] && continue
    export "$line"
  done < "$BASE_DIR/.env"
  log "已加载 .env"
else
  warn ".env 文件不存在，请从 .env.example 创建"
fi

# ── 端口定义（从 .env 读取，有默认值兜底）────────────────────────────────────
BACKEND_PORT="${BACKEND_PORT:-18472}"
KM_SERVICE_PORT="${KM_SERVICE_PORT:-18010}"
MOCK_APIS_PORT="${MOCK_APIS_PORT:-18008}"
WORK_ORDER_PORT="${WORK_ORDER_PORT:-18009}"
CDP_SERVICE_PORT="${CDP_SERVICE_PORT:-18020}"
OUTBOUND_SERVICE_PORT="${OUTBOUND_SERVICE_PORT:-18021}"
MCP_INTERNAL_PORT="${MCP_INTERNAL_PORT:-18003}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
MCP_PORTS=("$MCP_INTERNAL_PORT")
MCP_SERVICES=("internal_service")
MCP_LABELS=("内部服务")
ALL_PORTS=("$BACKEND_PORT" "${MCP_PORTS[@]}" "$MOCK_APIS_PORT" "$WORK_ORDER_PORT" "$KM_SERVICE_PORT" "$CDP_SERVICE_PORT" "$OUTBOUND_SERVICE_PORT" "$FRONTEND_PORT")

# ── PID 记录 ────────────────────────────────────────────────────────────────
WRAPPER_PIDS=()

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null) || true
  if [[ -n "$pids" ]]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    # 等待端口释放（最多 5 秒）
    for _ in $(seq 1 50); do
      lsof -ti :"$port" >/dev/null 2>&1 || break
      sleep 0.1
    done
  fi
}

# ── 退出清理 ────────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  log "${YEL}正在停止所有服务...${NC}"
  # 先杀 wrapper 循环（防止它们重启子进程）
  for pid in "${WRAPPER_PIDS[@]}"; do
    kill -9 "$pid" 2>/dev/null || true
  done
  # 再杀端口上的进程
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

log "mcp_servers: bun install"
cd "$BASE_DIR/mcp_servers" && "$BUN" install 2>&1 | tail -3
ok "mcp_servers 依赖就绪"

log "work_order_service: bun install"
cd "$BASE_DIR/work_order_service" && "$BUN" install 2>&1 | tail -3
ok "work_order_service 依赖就绪"

log "km_service: bun install"
cd "$BASE_DIR/km_service" && "$BUN" install 2>&1 | tail -3
ok "km_service 依赖就绪"

log "cdp_service: bun install"
cd "$BASE_DIR/cdp_service" && "$BUN" install 2>&1 | tail -3
ok "cdp_service 依赖就绪"

log "outbound_service: bun install"
cd "$BASE_DIR/outbound_service" && "$BUN" install 2>&1 | tail -3
ok "outbound_service 依赖就绪"

log "frontend: bun install"
cd "$BASE_DIR/frontend" && "$BUN" install 2>&1 | tail -3
ok "frontend 依赖就绪"

# ════════════════════════════════════════════════════════════════════════════
# 2. 数据库准备
# ════════════════════════════════════════════════════════════════════════════
echo -e "\n${BLU}══════ 数据库准备 ══════${NC}"

mkdir -p "$BASE_DIR/data"
export SQLITE_PATH="$BASE_DIR/data/km.db"
export PLATFORM_DB_PATH="$BASE_DIR/data/platform.db"
export BUSINESS_DB_PATH="$BASE_DIR/data/business.db"
export WORKORDER_DB_PATH="$BASE_DIR/data/workorder.db"
export CDP_DB_PATH="$BASE_DIR/data/cdp.db"
export OUTBOUND_DB_PATH="$BASE_DIR/data/outbound.db"

# Schema 同步（6 DB：telecom/platform/business/workorder/cdp/outbound）
log "同步数据库 Schema..."

# 1) backend schema → km.db (platform + km 表)
cd "$BASE_DIR/backend"
PUSH_OUTPUT=$("$BUN" drizzle-kit push 2>&1 || true)
if echo "$PUSH_OUTPUT" | grep -q "rename column\|created or renamed"; then
  warn "检测到 backend Schema 破坏性变更，重建表..."
  "$BUN" -e "
    import Database from 'bun:sqlite';
    const db = new Database(process.env.SQLITE_PATH || '../data/km.db');
    const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'\").all();
    for (const t of tables) { db.exec('DROP TABLE IF EXISTS ' + t.name); }
    console.log('Dropped', tables.length, 'tables');
  " 2>/dev/null
  "$BUN" drizzle-kit push 2>&1 | tail -3
fi

# 1b) platform.db (backend 独占运行时表)
PLATFORM_DB_PATH="$PLATFORM_DB_PATH" "$BUN" drizzle-kit push --config drizzle-platform.config.ts 2>&1 | tail -1

# 2) km_service schema → km.db (km 表，与 backend 共享同一 DB)
cd "$BASE_DIR/km_service"
"$BUN" drizzle-kit push 2>&1 | tail -1

# 3) mock_apis schema → business.db
cd "$BASE_DIR/backend"
BUSINESS_DB_PATH="$BUSINESS_DB_PATH" "$BUN" drizzle-kit push --config drizzle-business.config.ts 2>&1 | tail -1

# 4) work_order_service schema → workorder.db
cd "$BASE_DIR/backend"
WORKORDER_DB_PATH="$WORKORDER_DB_PATH" "$BUN" drizzle-kit push --config drizzle-workorder.config.ts 2>&1 | tail -1

# 5) cdp_service schema → cdp.db
cd "$BASE_DIR/cdp_service"
CDP_DB_PATH="$CDP_DB_PATH" "$BUN" drizzle-kit push 2>&1 | tail -1

# 6) outbound_service schema → outbound.db
cd "$BASE_DIR/outbound_service"
OUTBOUND_DB_PATH="$OUTBOUND_DB_PATH" "$BUN" drizzle-kit push 2>&1 | tail -1

ok "数据库 Schema 就绪（km.db + business.db + workorder.db + cdp.db + outbound.db）"

# 数据初始化
if [[ "$RESET_MODE" == true ]]; then
  warn "重置模式：清空数据库 + 清理版本快照..."
  cd "$BASE_DIR/backend"

  # 删除所有 DB + WAL/SHM
  for dbfile in km platform business workorder cdp; do
    rm -f "$BASE_DIR/data/${dbfile}.db" "$BASE_DIR/data/${dbfile}.db-wal" "$BASE_DIR/data/${dbfile}.db-shm"
  done
  rm -f "$BASE_DIR/backend/data/km.db" "$BASE_DIR/backend/data/km.db-wal" "$BASE_DIR/backend/data/km.db-shm"
  ok "数据库已删除"

  # 清理非默认技能（biz-skills 和 .versions 中只保留默认 7 个）
  DEFAULT_SKILLS=("bill-inquiry" "fault-diagnosis" "outbound-collection" "outbound-marketing" "plan-inquiry" "service-cancel" "telecom-app")

  BIZ_DIR="$BASE_DIR/km_service/skills/biz-skills"
  for dir in "$BIZ_DIR"/*/; do
    [[ ! -d "$dir" ]] && continue
    name=$(basename "$dir")
    if [[ ! " ${DEFAULT_SKILLS[*]} " =~ " $name " ]]; then
      rm -rf "$dir"
      ok "删除非默认技能 biz-skills/$name"
    fi
  done

  VERSIONS_DIR="$BASE_DIR/km_service/skills/.versions"
  for dir in "$VERSIONS_DIR"/*/; do
    [[ ! -d "$dir" ]] && continue
    name=$(basename "$dir")
    if [[ ! " ${DEFAULT_SKILLS[*]} " =~ " $name " ]]; then
      rm -rf "$dir"
      ok "删除非默认版本 .versions/$name"
    fi
  done
  ok "非默认技能清理完成"

  # 清理 .versions/：reset 模式下只保留 v1（seed 只创建 v1）
  if [[ -d "$VERSIONS_DIR" ]]; then
    for skill_dir in "$VERSIONS_DIR"/*/; do
      [[ ! -d "$skill_dir" ]] && continue
      skill_name=$(basename "$skill_dir")
      for vdir in "${skill_dir}"v*/; do
        [[ ! -d "$vdir" ]] && continue
        vname=$(basename "$vdir")
        if [[ "$vname" != "v1" ]]; then
          rm -rf "$vdir"
          ok "删除 ${skill_name}/${vname}"
        fi
      done
    done
    ok "版本快照清理完成（每个 skill 仅保留 v1）"
  fi

  # 删除所有 .draft 文件
  find "$BASE_DIR/km_service/skills" -name "*.draft" -delete 2>/dev/null
  ok "草稿文件已清理"

  # 重新 push schema + seed（多 DB）
  cd "$BASE_DIR/backend" && "$BUN" drizzle-kit push 2>&1 | tail -3
  cd "$BASE_DIR/backend" && PLATFORM_DB_PATH="$PLATFORM_DB_PATH" "$BUN" drizzle-kit push --config drizzle-platform.config.ts 2>&1 | tail -1
  cd "$BASE_DIR/km_service" && "$BUN" drizzle-kit push 2>&1 | tail -1
  cd "$BASE_DIR/backend" && BUSINESS_DB_PATH="$BUSINESS_DB_PATH" "$BUN" drizzle-kit push --config drizzle-business.config.ts 2>&1 | tail -1
  cd "$BASE_DIR/backend" && WORKORDER_DB_PATH="$WORKORDER_DB_PATH" "$BUN" drizzle-kit push --config drizzle-workorder.config.ts 2>&1 | tail -1
  cd "$BASE_DIR/cdp_service" && CDP_DB_PATH="$CDP_DB_PATH" "$BUN" drizzle-kit push 2>&1 | tail -1
  cd "$BASE_DIR/outbound_service" && OUTBOUND_DB_PATH="$OUTBOUND_DB_PATH" "$BUN" drizzle-kit push 2>&1 | tail -1
  cd "$BASE_DIR/backend" && BUSINESS_DB_PATH="$BUSINESS_DB_PATH" PLATFORM_DB_PATH="$PLATFORM_DB_PATH" "$BUN" run db:seed 2>&1 | tail -5
  cd "$BASE_DIR/work_order_service" && WORKORDER_DB_PATH="$WORKORDER_DB_PATH" "$BUN" --import tsx/esm src/seed.ts 2>&1 | tail -3
  cd "$BASE_DIR/cdp_service" && CDP_DB_PATH="$CDP_DB_PATH" BUSINESS_DB_PATH="$BUSINESS_DB_PATH" "$BUN" src/seed.ts 2>&1 | tail -3
  # outbound seed 依赖 CDP（phone → party_id 解析），需要先启动 CDP 服务
  # 这里先跳过，在 CDP 服务启动后再 seed（见下方 start_service 后的 seed 步骤）
  ok "数据已重置为初始状态"
else
  # 正常模式：upsert，保留用户数据
  log "写入/更新初始数据..."
  cd "$BASE_DIR/backend" && BUSINESS_DB_PATH="$BUSINESS_DB_PATH" PLATFORM_DB_PATH="$PLATFORM_DB_PATH" "$BUN" run db:seed 2>&1 | tail -5
  cd "$BASE_DIR/work_order_service" && WORKORDER_DB_PATH="$WORKORDER_DB_PATH" "$BUN" --import tsx/esm src/seed.ts 2>&1 | tail -3
  cd "$BASE_DIR/cdp_service" && CDP_DB_PATH="$CDP_DB_PATH" BUSINESS_DB_PATH="$BUSINESS_DB_PATH" "$BUN" src/seed.ts 2>&1 | tail -3
  ok "初始数据就绪"
fi

# ════════════════════════════════════════════════════════════════════════════
# 3. 启动服务
# ════════════════════════════════════════════════════════════════════════════

MAX_RESTARTS=5
RESTART_WINDOW=60  # 秒，在此窗口内的连续失败才计入重启次数

start_service() {
  local name="$1" dir="$2" cmd="$3"
  local logfile="${LOG_DIR}/${name}.log"
  (
    set +e
    local fail_count=0
    local window_start
    window_start=$(date +%s)
    while true; do
      echo "[$(date '+%H:%M:%S')] ▶ Starting ${name}..." >> "$logfile"
      cd "$dir" && eval "$cmd" >> "$logfile" 2>&1
      EXIT_CODE=$?
      local now
      now=$(date +%s)
      # 如果运行时间超过窗口，说明之前是正常运行后才退出，重置计数
      if (( now - window_start > RESTART_WINDOW )); then
        fail_count=0
        window_start=$now
      fi
      fail_count=$((fail_count + 1))
      if (( fail_count >= MAX_RESTARTS )); then
        echo "[$(date '+%H:%M:%S')] ✗ ${name} 在 ${RESTART_WINDOW}s 内连续失败 ${fail_count} 次，停止重启" >> "$logfile"
        break
      fi
      echo "[$(date '+%H:%M:%S')] ⚠ ${name} exited (code=${EXIT_CODE}), restarting in ${RESTART_DELAY}s... (${fail_count}/${MAX_RESTARTS})" >> "$logfile"
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

# Work Order Service
start_service "work-order" "$BASE_DIR/work_order_service" \
  "$NODE --import tsx/esm src/server.ts"

# KM Service (知识管理微服务，使用 bun:sqlite 需 bun 运行时)
start_service "km-service" "$BASE_DIR/km_service" \
  "$BUN src/server.ts"

# CDP Service (客户数据平台，使用 bun:sqlite 需 bun 运行时)
start_service "cdp-service" "$BASE_DIR/cdp_service" \
  "CDP_SERVICE_PORT=$CDP_SERVICE_PORT CDP_DB_PATH=$CDP_DB_PATH $BUN src/server.ts"

# Outbound Service (外呼任务与营销活动管理)
start_service "outbound-service" "$BASE_DIR/outbound_service" \
  "OUTBOUND_SERVICE_PORT=$OUTBOUND_SERVICE_PORT OUTBOUND_DB_PATH=$OUTBOUND_DB_PATH CDP_SERVICE_PORT=$CDP_SERVICE_PORT $BUN src/server.ts"

# Outbound seed（依赖 CDP 服务已启动，等待 CDP 就绪后执行）
if [[ "$RESET_MODE" == true ]]; then
  log "等待 CDP 就绪后执行 outbound seed..."
  for i in $(seq 1 15); do
    if curl -sf --noproxy '*' http://127.0.0.1:${CDP_SERVICE_PORT}/health >/dev/null 2>&1; then break; fi
    sleep 1
  done
  cd "$BASE_DIR/outbound_service" && OUTBOUND_DB_PATH="$OUTBOUND_DB_PATH" BUSINESS_DB_PATH="$BUSINESS_DB_PATH" PLATFORM_DB_PATH="$PLATFORM_DB_PATH" CDP_SERVICE_PORT="$CDP_SERVICE_PORT" "$BUN" src/seed.ts 2>&1 | tail -5
  ok "outbound 数据已初始化"
fi

# Backend
start_service "backend" "$BASE_DIR/backend" "PORT=$BACKEND_PORT $BUN src/index.ts"

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
  ok "KM Service   → http://127.0.0.1:${KM_SERVICE_PORT}"
  ok "CDP Service  → http://127.0.0.1:${CDP_SERVICE_PORT}"
  ok "Outbound Svc → http://127.0.0.1:${OUTBOUND_SERVICE_PORT}"
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
