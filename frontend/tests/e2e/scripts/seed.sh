#!/usr/bin/env bash
# tests/scripts/seed.sh — 重置测试数据（清空并重新写入）
# 用法: bash tests/scripts/seed.sh
# 说明: 幂等操作，可随时执行。会先同步 Schema 再 seed。

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
BUN="${HOME}/.bun/bin/bun"

GRN='\033[0;32m'; BLU='\033[0;34m'; NC='\033[0m'
log() { echo -e "${BLU}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()  { echo -e "  ${GRN}✓${NC} $*"; }

log "同步数据库 Schema..."
cd "$BASE_DIR/backend" && "$BUN" drizzle-kit push 2>&1 | tail -1
ok "Schema 就绪"

log "重置测试数据 (seed)..."
cd "$BASE_DIR/backend" && "$BUN" run db:seed 2>&1 | tail -3
ok "测试数据已重置"
