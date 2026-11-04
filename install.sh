#!/usr/bin/env bash
# slave / wake_the_slave 一键安装
#
# 用法：
#   bash install.sh
#   WORK_DIR=~/my-ziwei bash install.sh
#
# 做四件事：
#   1. 装字体（用户目录，不需要 sudo）
#   2. 拉上游排盘引擎到 WORK_DIR（默认 ~/ziwei-work）
#   3. 复制 CLI、删 server-only、npm install、selftest
#   4. 跑环境检查

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${WORK_DIR:-$HOME/ziwei-work}"
UPSTREAM="${UPSTREAM:-https://github.com/Renhuai123/ziwei-doushu.git}"

say()  { printf '%s\n' "$*"; }
ok()   { printf '✓ %s\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }
die()  { printf '✗ %s\n' "$*" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

say "技能目录：$SKILL_DIR"
say "引擎目录：$WORK_DIR"
say ""

# ── 0. 基本工具 ─────────────────────────────
for c in git node npm npx python3 curl; do
  have "$c" || die "缺 $c。先跑 bash scripts/check-env.sh 看完整依赖。"
done

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "${NODE_MAJOR:-0}" -ge 20 ] || die "Node.js 需要 ≥ 20，当前是 $(node -v 2>/dev/null || echo '未知')"

# ── 1. 字体 ─────────────────────────────────
say "== 字体 =="
bash "$SKILL_DIR/scripts/setup-fonts.sh"

# ── 2. 上游引擎 ─────────────────────────────
say ""
say "== 排盘引擎 =="
if [ -d "$WORK_DIR/lib/ziwei" ] && [ -f "$WORK_DIR/package.json" ]; then
  ok "已有引擎：$WORK_DIR"
else
  if [ -e "$WORK_DIR" ] && [ "$(ls -A "$WORK_DIR" 2>/dev/null)" ]; then
    die "$WORK_DIR 已存在但不是排盘引擎。换一个 WORK_DIR，或先清空它。"
  fi
  mkdir -p "$(dirname "$WORK_DIR")"
  say "↓ 克隆上游引擎到 $WORK_DIR"
  git clone --depth 1 "$UPSTREAM" "$WORK_DIR"
  ok "引擎已拉取"
fi

# ── 3. CLI 与依赖 ───────────────────────────
say ""
say "== CLI =="
if [ -f "$WORK_DIR/package.json" ] && [ ! -f "$WORK_DIR/package.upstream.json" ]; then
  cp "$WORK_DIR/package.json" "$WORK_DIR/package.upstream.json"
  ok "已备份上游 package.json → package.upstream.json"
fi
cp -f "$SKILL_DIR/assets/cli.ts" "$WORK_DIR/cli.ts"
cp -f "$SKILL_DIR/assets/package.json" "$WORK_DIR/package.json"
ok "CLI 与 package.json 已就位"

python3 - "$WORK_DIR" <<'PY'
import sys
from pathlib import Path
root = Path(sys.argv[1])
for rel in ("lib/ziwei/patterns.ts", "lib/ziwei/famous.ts"):
    p = root / rel
    if not p.exists():
        continue
    s = p.read_text(encoding="utf-8")
    s = s.replace("import 'server-only';\n", "").replace('import "server-only";\n', "")
    p.write_text(s, encoding="utf-8")
print("✓ server-only 导入已清理")
PY

say ""
say "== npm install =="
( cd "$WORK_DIR" && npm install --no-audit --no-fund )

say ""
say "== selftest =="
( cd "$WORK_DIR" && npx tsx cli.ts --selftest )

# ── 4. 环境检查 ─────────────────────────────
say ""
say "== 环境检查 =="
bash "$SKILL_DIR/scripts/check-env.sh"

# ── 5. 下一步 ───────────────────────────────
say ""
say "装好了。"
say ""
say "技能目录：$SKILL_DIR"
say "引擎目录：$WORK_DIR"
say ""
say "在 Pi 里说："
say "  用 wake_the_slave 给这个人做个人盘："
say "  公历 1990-01-01 12:00，北京，男。"
say "  PDF 放桌面。"
