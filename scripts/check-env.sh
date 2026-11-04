#!/usr/bin/env bash
# wake_the_slave 环境探测（只读，不安装）
# 用法：bash check-env.sh [--quiet]
#
# 它只告诉你缺什么；装什么、怎么装，看 setup-fonts.sh 或下面的提示。

set -u

QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

if [ -t 1 ] && [ "$QUIET" = "0" ]; then
  G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; B=$'\033[36m'; N=$'\033[0m'
else
  G=""; R=""; Y=""; B=""; N=""
fi

MISSING=()
OPTIONAL=()

say() { if [ "$QUIET" = "0" ]; then printf "%s\n" "$1"; fi; return 0; }
head2() { say ""; say "${B}== $1 ==${N}"; }

have() { command -v "$1" >/dev/null 2>&1; }
ok() { say "  ${G}✓${N} $1"; }
no() { say "  ${R}✗${N} $1"; MISSING+=("$1"); }
opt_missing() { say "  ${Y}○${N} $1（可选）"; OPTIONAL+=("$1"); }

# ---------- OS ----------
head2 "系统"
OS="$(uname -s)"
ARCH="$(uname -m)"
say "  $OS / $ARCH"

PKG=""
if [ "$OS" = "Darwin" ]; then
  have brew && PKG="brew"
elif [ "$OS" = "Linux" ]; then
  for m in apt-get dnf pacman zypper apk; do
    if have "$m"; then PKG="$m"; break; fi
  done
  have nix && PKG="nix"
fi
[ -n "$PKG" ] && say "  包管理器：$PKG" || say "  ${Y}未识别包管理器${N}"

# ---------- 运行时 ----------
head2 "运行时"

if have node; then
  NV="$(node -v 2>/dev/null | sed 's/v//')"
  MAJOR="${NV%%.*}"
  if [ "${MAJOR:-0}" -ge 20 ] 2>/dev/null; then
    ok "node $NV"
  else
    no "node $NV（需要 ≥ 20）"
  fi
else
  no "node（需要 ≥ 20）"
fi

have npm && ok "npm $(npm -v 2>/dev/null)" || no "npm"
have npx && ok "npx" || no "npx"
have git && ok "git $(git --version 2>/dev/null | awk '{print $3}')" || no "git"

# ---------- PDF 工具链 ----------
head2 "PDF 工具链"

CHROME=""
for c in chromium chromium-browser google-chrome google-chrome-stable chrome microsoft-edge brave-browser brave; do
  have "$c" && { CHROME="$c"; break; }
done
if [ -n "$CHROME" ]; then
  ok "$CHROME（Chromium 内核）"
elif [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ok "Google Chrome.app（Chromium 内核）"
else
  no "Chromium 内核（Chrome / Chromium / Edge / Brave，或 Puppeteer 自带）"
fi

have pdftotext && ok "pdftotext" || no "pdftotext（poppler）"
have pdfinfo   && ok "pdfinfo"   || no "pdfinfo（poppler）"
have pdftoppm  && ok "pdftoppm"  || no "pdftoppm（poppler）"
have pdffonts  && ok "pdffonts"  || opt_missing "pdffonts（字体嵌入检查）"

have python3 && ok "python3 $(python3 -V 2>&1 | awk '{print $2}')" || no "python3（页码回填用）"
have curl    && ok "curl" || no "curl（下载字体用）"

# ---------- 字体 ----------
head2 "中文字体"

FC=0
if have fc-list && have fc-match; then FC=1; fi

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

check_font() {
  local family="$1" role="$2"
  if ! family_has "$family"; then
    no "$role：缺 $family"
    return
  fi
  if [ "$FC" = "1" ]; then
    local r
    r="$(resolved_family "$family")"
    case "$r" in
      *Mono*)
        no "$role：$family 解析成「$r」（等宽体，不能用）"
        ;;
      *)
        ok "$role：$family → $r"
        ;;
    esac
  else
    ok "$role：$family（用 pdffonts 复核）"
  fi
}

check_font "Noto Serif CJK SC" "正文"
check_font "Noto Sans CJK SC"  "标签"
check_font "LXGW WenKai"       "封面/问句"

if [ "$FC" = "1" ]; then
  say "  提示：字体装完后刷新缓存：fc-cache -f"
else
  say "  ${Y}本机没有 fc-list/fc-match；用系统字体列表或生成后的 pdffonts 复核${N}"
fi

# ---------- 结论 ----------
head2 "结论"

if [ ${#MISSING[@]} -eq 0 ]; then
  say "  ${G}必需依赖就绪。${N}"
else
  say "  ${R}缺 ${#MISSING[@]} 项：${N} ${MISSING[*]}"
  say ""
  say "  运行时 / 工具（示例，按系统删减）："
  case "$PKG" in
    apt-get) say "    sudo apt-get update && sudo apt-get install -y nodejs npm git chromium poppler-utils python3 curl fontconfig fonts-noto-cjk" ;;
    dnf)     say "    sudo dnf install -y nodejs npm git chromium poppler-utils python3 curl fontconfig google-noto-serif-cjk-fonts google-noto-sans-cjk-fonts" ;;
    pacman)  say "    sudo pacman -S --needed nodejs npm git chromium poppler python curl fontconfig noto-fonts-cjk" ;;
    zypper)  say "    sudo zypper install -y nodejs npm git chromium poppler-tools python3 curl fontconfig noto-serif-cjk-fonts noto-sans-cjk-fonts" ;;
    apk)     say "    sudo apk add nodejs npm git chromium poppler-utils python3 curl fontconfig font-noto-cjk" ;;
    brew)    say "    brew install node git poppler python3 curl ; brew install --cask chromium" ;;
    nix)     say "    nix profile install nixpkgs#nodejs nixpkgs#git nixpkgs#chromium nixpkgs#poppler_utils nixpkgs#python3 nixpkgs#curl nixpkgs#fontconfig nixpkgs#noto-fonts-cjk-sans nixpkgs#noto-fonts-cjk-serif" ;;
    *)       say "    未识别包管理器：手动装 node≥20 / git / Chromium 内核 / poppler / python3 / curl / fontconfig / 中文字体" ;;
  esac
  say ""
  say "  ${B}字体${N}：先跑 ${B}bash setup-fonts.sh${N}（会装 LXGW WenKai 比例版和缺的 Noto）"
  say "  无 sudo 时：字体装到用户目录；运行时用 nix / conda / Puppeteer 自带 Chromium"
fi

[ ${#OPTIONAL[@]} -gt 0 ] && say "  可选缺失：${OPTIONAL[*]}"

say ""
say "  只探测，不安装。字体不合格不要生成。"

if [ ${#MISSING[@]} -eq 0 ]; then
  exit 0
else
  exit 1
fi
