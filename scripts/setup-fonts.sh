#!/usr/bin/env bash
# wake_the_slave 字体安装
# 用法：
#   bash setup-fonts.sh             # 缺什么装什么（用户字体目录，不需要 sudo）
#   bash setup-fonts.sh --check     # 只检查，不下载
#
# 装到：
#   Linux  $HOME/.local/share/fonts
#   macOS  $HOME/Library/Fonts
# 可用 FONT_DIR 覆盖。

set -euo pipefail

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

say()  { printf '%s\n' "$*"; }
ok()   { printf '✓ %s\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }
die()  { printf '✗ %s\n' "$*" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

OS="$(uname -s)"
if [ "$OS" = "Darwin" ]; then
  DEFAULT_FONT_DIR="$HOME/Library/Fonts"
else
  DEFAULT_FONT_DIR="$HOME/.local/share/fonts"
fi
FONT_DIR="${FONT_DIR:-$DEFAULT_FONT_DIR}"

FC=0
if have fc-list && have fc-match; then FC=1; fi

# 精确 family 检查：把逗号分隔的 family 列表拆开，逐项精确匹配
family_has() {
  local name="$1"
  if [ "$FC" = "1" ]; then
    fc-list : family 2>/dev/null \
      | tr ',' '\n' \
      | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
      | grep -Fx "$name" >/dev/null
    return $?
  fi
  if [ "$OS" = "Darwin" ] && have system_profiler; then
    system_profiler SPFontsDataType 2>/dev/null | grep -Fq "$name"
    return $?
  fi
  return 1
}

resolved_family() {
  local name="$1"
  if [ "$FC" = "1" ]; then
    fc-match -f '%{family}\n' "$name" 2>/dev/null | head -n 1
  else
    printf '%s\n' "$name"
  fi
}

download() {
  local url="$1" dest="$2"
  if [ -s "$dest" ]; then
    ok "$(basename "$dest") 已存在"
    return 0
  fi
  have curl || die "缺 curl；装 curl，或手动下载：$url"
  say "↓ $(basename "$dest")"
  curl -L --fail --retry 3 --connect-timeout 20 --silent --show-error \
    -o "$dest.part" "$url"
  mv "$dest.part" "$dest"
  ok "$(basename "$dest")"
}

install_lxgw() {
  local base="https://github.com/lxgw/LxgwWenKai/releases/download/v1.530"
  download "$base/LXGWWenKai-Regular.ttf" "$FONT_DIR/LXGWWenKai-Regular.ttf"
  download "$base/LXGWWenKai-Medium.ttf"  "$FONT_DIR/LXGWWenKai-Medium.ttf"
}

install_noto_serif() {
  local base="https://github.com/notofonts/noto-cjk/raw/main/Serif/OTF/SimplifiedChinese"
  download "$base/NotoSerifCJKsc-Regular.otf" "$FONT_DIR/NotoSerifCJKsc-Regular.otf"
  download "$base/NotoSerifCJKsc-Bold.otf"    "$FONT_DIR/NotoSerifCJKsc-Bold.otf"
}

install_noto_sans() {
  local base="https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese"
  download "$base/NotoSansCJKsc-Regular.otf" "$FONT_DIR/NotoSansCJKsc-Regular.otf"
  download "$base/NotoSansCJKsc-Medium.otf"  "$FONT_DIR/NotoSansCJKsc-Medium.otf"
}

refresh_cache() {
  if have fc-cache; then
    fc-cache -f "$FONT_DIR" >/dev/null 2>&1 || true
    ok "fc-cache 已刷新"
  else
    warn "没有 fc-cache；macOS 复制到 ~/Library/Fonts 后，重启应用即可"
  fi
}

say "字体目录：$FONT_DIR"
mkdir -p "$FONT_DIR"

NEED_LXGW=0
NEED_SERIF=0
NEED_SANS=0

if family_has "LXGW WenKai"; then
  ok "LXGW WenKai（比例版）"
else
  warn "缺 LXGW WenKai（比例版）"
  NEED_LXGW=1
fi

if family_has "Noto Serif CJK SC"; then
  ok "Noto Serif CJK SC"
else
  warn "缺 Noto Serif CJK SC"
  NEED_SERIF=1
fi

if family_has "Noto Sans CJK SC"; then
  ok "Noto Sans CJK SC"
else
  warn "缺 Noto Sans CJK SC"
  NEED_SANS=1
fi

if [ "$CHECK_ONLY" = "1" ]; then
  say ""
  say "只检查，不下载。缺字体就再跑一次：bash setup-fonts.sh"
  exit 0
fi

[ "$NEED_LXGW" = "1" ]  && install_lxgw
[ "$NEED_SERIF" = "1" ] && install_noto_serif
[ "$NEED_SANS" = "1" ]  && install_noto_sans

refresh_cache

say ""
say "验证："

if [ "$FC" = "1" ]; then
  for f in "LXGW WenKai" "Noto Serif CJK SC" "Noto Sans CJK SC"; do
    r="$(resolved_family "$f")"
    case "$r" in
      *Mono*)
        die "$f 解析成「$r」——等宽体不能用于封面/问句。"
        ;;
      "")
        die "$f 没有解析结果。"
        ;;
      *)
        ok "$f → $r"
        ;;
    esac
  done
else
  warn "本机没有 fc-match；用生成后的 pdffonts 验证：pdffonts book.pdf | grep -i mono"
fi

say ""
say "完成。现在跑：bash check-env.sh"
