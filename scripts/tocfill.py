#!/usr/bin/env python3
"""目录页码回填。

用法：
  python3 tocfill.py --html book.html --pdf book.pdf
  python3 tocfill.py --html book.html --pdf book.pdf --no-generate

做三件事：
1. 把目录里的 <span class="p"> 清空；
2. 生成 PDF，逐页找每个目录标题首次出现的页；
3. 写回页码，再生成一次，并复核。

依赖：pdfinfo、pdftotext（poppler）、Chromium 内核。
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path


def norm(text: str) -> str:
    return re.sub(r"[\s·：:，,。、（）()\-—]", "", text)


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def generate(html: str, pdf: str, browser: str) -> None:
    cmd = [
        browser,
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf}",
        html,
    ]
    r = run(cmd)
    if r.returncode != 0:
        sys.exit(f"生成失败：{' '.join(cmd)}\n{r.stderr[-800:]}")


def pages_text(pdf: str) -> list[str]:
    r = run(["pdfinfo", pdf])
    if r.returncode != 0:
        sys.exit(f"pdfinfo 失败：{r.stderr}")
    pages = None
    for line in r.stdout.splitlines():
        if line.startswith("Pages:"):
            pages = int(line.split()[1])
            break
    if not pages:
        sys.exit("pdfinfo 没有 Pages 字段")
    out = []
    for i in range(1, pages + 1):
        t = run(["pdftotext", "-f", str(i), "-l", str(i), pdf, "-"]).stdout
        out.append(norm(t))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", default="book.html")
    ap.add_argument("--pdf", default="book.pdf")
    ap.add_argument("--browser", default="chromium")
    ap.add_argument("--no-generate", action="store_true", help="只算页码，不重新生成 PDF")
    args = ap.parse_args()

    html = Path(args.html)
    pdf = Path(args.pdf)
    if not html.exists():
        sys.exit(f"找不到 {html}")

    src = html.read_text(encoding="utf-8")

    # 1. 清空目录页码
    src = re.sub(
        r'(<span class="n">[^<]*</span><span class="t">[^<]+</span>)<span class="p">[^<]*</span>',
        r'\1<span class="p"></span>',
        src,
    )
    html.write_text(src, encoding="utf-8")

    # 2. 生成 + 找页
    if not args.no_generate:
        generate(str(html), str(pdf), args.browser)
    if not pdf.exists():
        sys.exit(f"找不到 {pdf}")
    pages = pages_text(str(pdf))
    toc_pages = {i for i, p in enumerate(pages, 1) if "CONTENTS" in p}

    # 从 HTML 里取目录标题（.t），按顺序
    titles = re.findall(r'<span class="t">([^<]+)</span>', src)
    if not titles:
        sys.exit("目录里没有 .t 标题")

    mapping: dict[str, int] = {}
    start = 1
    for title in titles:
        needle = norm(title)
        found = None
        for i in range(start, len(pages) + 1):
            if i in toc_pages:
                continue
            if needle and needle in pages[i - 1]:
                found = i
                break
        if not found:
            sys.exit(f"找不到目录标题：{title!r}（从第 {start} 页起）")
        mapping[title] = found
        start = found

    # 3. 写回
    def repl(m: re.Match) -> str:
        n, t = m.group(1), m.group(2)
        if t not in mapping:
            sys.exit(f"目录标题没有页码：{t!r}")
        return f'<li><span class="n">{n}</span><span class="t">{t}</span><span class="p">{mapping[t]}</span></li>'

    src = html.read_text(encoding="utf-8")
    src, n = re.subn(
        r'<li><span class="n">([^<]*)</span><span class="t">([^<]+)</span><span class="p"></span></li>',
        repl,
        src,
    )
    if n != len(titles):
        sys.exit(f"回填数量不对：目录 {len(titles)} 条，写入 {n} 条")
    html.write_text(src, encoding="utf-8")

    # 4. 再生成 + 复核
    if not args.no_generate:
        generate(str(html), str(pdf), args.browser)
        pages2 = pages_text(str(pdf))
        bad = []
        for title, page in mapping.items():
            if norm(title) not in pages2[page - 1]:
                bad.append((title, page))
        if bad:
            sys.exit(f"复核失败：{bad}")

    print(f"回填 {len(mapping)} 条，页数 {len(pages)}")
    for title, page in mapping.items():
        print(f"  {page:>3}  {title}")


if __name__ == "__main__":
    main()
