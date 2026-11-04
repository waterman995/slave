#!/usr/bin/env bash
# ziwei-report 煅烧自检
#
# 用法：
#   bash smoke-test.sh                         # 只查 skill 文件
#   bash smoke-test.sh --html book.html        # 加查生成物结构
#   bash smoke-test.sh --pdf book.pdf          # 加查字体、页数、句子次数
#   bash smoke-test.sh --project /path/to/ziwei # 加跑 CLI selftest
#
# 退出码 0 = 通过；1 = 有问题。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HTML=""
PDF=""
PROJECT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --html) HTML="${2:-}"; shift 2 ;;
    --pdf)  PDF="${2:-}";  shift 2 ;;
    --project) PROJECT="${2:-}"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

FAIL=0
pass() { printf '✓ %s\n' "$*"; }
bad()  { printf '✗ %s\n' "$*" >&2; FAIL=1; }
note() { printf '· %s\n' "$*"; }

# ── 1. skill 静态检查 ─────────────────────────────
echo "== skill 静态检查 =="

if grep -n -- '--kai:' "$ROOT/references/format.md" | grep -qi 'mono'; then
  bad "format.md 的 --kai 字体栈里有 Mono"
else
  pass "字体栈没有 Mono"
fi

if sed -n '/^body {/,/^}/p' "$ROOT/references/format.md" | grep -q 'font-size: 12pt'; then
  pass "正文 12pt"
else
  bad "正文不是 12pt"
fi

if sed -n '/^h1.chap {/,/^}/p' "$ROOT/references/format.md" | grep -q 'page-break-before: always'; then
  pass "h1.chap 每章新页"
else
  bad "h1.chap 缺少 page-break-before: always"
fi

for s in "0.0 本册由来" "0.1 此盘由来" "0.3 一个限制：六亲" "0.4 这一张盘" "命运叩问" "金线与黑线" "但，为金线所困"; do
  if grep -q "$s" "$ROOT/SKILL.md"; then
    pass "SKILL.md 含：$s"
  else
    bad "SKILL.md 缺：$s"
  fi
done

for old in "三种陈述" "怎么读" "同一个入口" "差半格" "错半格" "CHAPTER"; do
  if grep -q "$old" "$ROOT/SKILL.md"; then
    bad "SKILL.md 还有旧术语：$old"
  else
    pass "无旧术语：$old"
  fi
done

# ── 2. 生成物 HTML ───────────────────────────────
if [ -n "$HTML" ]; then
  echo ""
  echo "== HTML 结构 =="
  [ -f "$HTML" ] || { bad "找不到 $HTML"; exit 1; }

  n="$(grep -o '命运是沉睡的奴隶' "$HTML" 2>/dev/null | wc -l | tr -d ' ' || true)"
  if [ "$n" = "2" ]; then
    pass "「命运是沉睡的奴隶」出现 2 次"
  else
    bad "「命运是沉睡的奴隶」出现 $n 次（应为 2）"
  fi

  for c in 'class="q-main"' 'class="q-follow"' 'class="chapter-last"' 'class="backcover"' 'class="preface-phrase"'; do
    if grep -q "$c" "$HTML"; then
      pass "含 $c"
    else
      bad "缺 $c"
    fi
  done

  if grep -q '（推论非定论）' "$HTML"; then
    pass "含「（推论非定论）」"
  else
    note "没找到「（推论非定论）」；如果这本没有推断，可忽略"
  fi

  python3 - "$HTML" <<'PY'
import sys, re
h = open(sys.argv[1], encoding='utf-8').read()
b = h.find('class="backcover"')
a = h.find('<span class="num">附录 A</span>')
if b == -1 or a == -1:
    print('✗ 找不到封底或附录 A', file=sys.stderr); sys.exit(1)
if a < b:
    print('✗ 附录在封底之前', file=sys.stderr); sys.exit(1)
print('✓ 附录在封底之后')
PY

  for old in "三种陈述" "怎么读" "同一个入口" "处方" "CHAPTER"; do
    if grep -q "$old" "$HTML"; then
      bad "HTML 还有旧术语：$old"
    else
      pass "HTML 无旧术语：$old"
    fi
  done

  cover_title="$(python3 - "$HTML" <<'PY'
import re, sys
h = open(sys.argv[1], encoding='utf-8').read()
m = re.search(r'<section class="cover">.*?<h1[^>]*>(.*?)</h1>', h, re.S)
print(re.sub(r'<[^>]+>', '', m.group(1)).strip() if m else '')
PY
)"
  if [ -z "$cover_title" ]; then
    bad "找不到封面 h1"
  else
    case "$cover_title" in
      *差*|*错*|*缺*|*克*|*散*|*离*|*冷*|*输*|*悔*|*劫*)
        bad "封面册名有判决词：$cover_title" ;;
      *)
        pass "封面册名无判决词（$cover_title）" ;;
    esac
  fi
fi

# ── 3. 生成物 PDF ────────────────────────────────
if [ -n "$PDF" ]; then
  echo ""
  echo "== PDF =="
  [ -f "$PDF" ] || { bad "找不到 $PDF"; exit 1; }

  if pdffonts "$PDF" | grep -qi 'mono'; then
    bad "PDF 里有 Mono 字体"
  else
    pass "PDF 没有 Mono 字体"
  fi

  pages="$(pdfinfo "$PDF" | awk '/^Pages:/{print $2}')"
  if [ "${pages:-0}" -lt 3 ] 2>/dev/null; then
    bad "页数太少（$pages），可能生成不完整"
  else
    pass "页数：$pages"
    [ "${pages:-0}" -lt 15 ] && note "少于 15 页：如果这是样本可忽略；成书按 55–70 / 85–90 人工核对"
  fi

  n="$(pdftotext "$PDF" - 2>/dev/null | tr -d ' \n' | grep -o '命运是沉睡的奴隶' | wc -l | tr -d ' ' || true)"
  if [ "$n" = "2" ]; then
    pass "PDF 里「命运是沉睡的奴隶」出现 2 次"
  else
    bad "PDF 里「命运是沉睡的奴隶」出现 $n 次（应为 2）"
  fi

  short="$(python3 - "$PDF" <<'PY'
import subprocess, sys
pdf = sys.argv[1]
n = int([l for l in subprocess.run(['pdfinfo', pdf], capture_output=True, text=True)
         .stdout.split('\n') if l.startswith('Pages')][0].split()[1])
out = []
for i in range(1, n+1):
    t = subprocess.run(['pdftotext','-f',str(i),'-l',str(i),'-layout',pdf,'-'],
                       capture_output=True, text=True).stdout.strip()
    if 0 < len(t) < 300:
        out.append(str(i))
print(','.join(out))
PY
)"
  if [ -n "$short" ]; then
    note "偏短页：$short（封底/目录/附录首页属正常，人工看一眼）"
  else
    pass "没有明显空白页"
  fi
fi

# ── 4. 字体门禁 ──────────────────────────────────
echo ""
echo "== 字体门禁 =="
if bash "$ROOT/scripts/check-env.sh" >/tmp/ziwei-env.log 2>&1; then
  pass "check-env.sh 通过"
else
  bad "check-env.sh 未通过；看 /tmp/ziwei-env.log"
fi

# ── 5. CLI selftest ──────────────────────────────
if [ -n "$PROJECT" ]; then
  echo ""
  echo "== CLI selftest =="
  if ( cd "$PROJECT" && npx tsx cli.ts --selftest >/tmp/ziwei-selftest.log 2>&1 ); then
    pass "selftest 通过"
  else
    bad "selftest 未通过；看 /tmp/ziwei-selftest.log"
  fi
fi

echo ""
if [ "$FAIL" = "0" ]; then
  echo "煅烧通过。"
  exit 0
else
  echo "还有问题，先修再生成。" >&2
  exit 1
fi
