# 格式规范（唯一基准）

所有产出必须用这一套。**不要每次重新设计**——格式漂移比内容错误更难发现。

这份文件是自包含的：字体、CSS、HTML 骨架、生成、目录回填、校验命令都在下面。拿到 skill 目录就能用，不依赖某个人的绝对路径。

---

## 一、字体：先过门禁，再生成

CSS 只用三个变量：

```css
--serif: "Noto Serif CJK SC", "Songti SC", "SimSun", "Noto Serif", serif;
--kai:   "LXGW WenKai", "Kaiti SC", "KaiTi", "Noto Serif CJK SC", serif;
--sans:  "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif;
```

分工：

| 用途 | 字体 | 说明 |
|---|---|---|
| 正文 | Noto Serif CJK SC | 12pt；不要用无衬线写长文 |
| 封面大标题、章首问题、章末一句 | LXGW WenKai（**比例版**） | 不是 `LXGW WenKai Mono` |
| 章号、追问标签、表头、页码 | Noto Sans CJK SC | 小字号、大字距 |

**禁止**把 `LXGW WenKai Mono` 放进字体栈。等宽体会让封面和问句变成代码块。

### 需要装什么

| 字体 | 文件 | 来源 |
|---|---|---|
| LXGW WenKai | `LXGWWenKai-Regular.ttf`、`LXGWWenKai-Medium.ttf` | GitHub `lxgw/LxgwWenKai` v1.530 |
| Noto Serif CJK SC | Regular / Bold | 系统包或 `notofonts/noto-cjk` |
| Noto Sans CJK SC | Regular / Medium | 系统包或 `notofonts/noto-cjk` |

LXGW 的固定下载地址（v1.530，已验证 family 是 `LXGW WenKai`）：

```
https://github.com/lxgw/LxgwWenKai/releases/download/v1.530/LXGWWenKai-Regular.ttf
https://github.com/lxgw/LxgwWenKai/releases/download/v1.530/LXGWWenKai-Medium.ttf
```

### 安装与门禁

```bash
bash scripts/setup-fonts.sh      # 缺什么装什么，装到用户字体目录
bash scripts/check-env.sh        # 只探测，不安装
```

路径不写死：

- Linux：`$HOME/.local/share/fonts`
- macOS：`$HOME/Library/Fonts`
- 允许 `FONT_DIR` 覆盖

装完必须验证：

```bash
fc-match "LXGW WenKai"           # 不能出现 Mono
fc-match "Noto Serif CJK SC"
pdffonts book.pdf | grep -i mono # 应该没有输出
```

**字体门禁不过，不生成。** 解析成 Mono、或只有 Noto Sans 可以顶替，都是失败；不要用无衬线写正文，也不要用等宽写封面。

macOS 没有 `fc-match` 时，用 `system_profiler SPFontsDataType` 查 family；最终仍以 `pdffonts` 为准。

---

## 二、视觉基线

| 元素 | 规格 |
|---|---|
| 页面 | A4，页边距 18 / 16 / 16 / 16 mm |
| 正文 | 12pt，行高 1.85，两端对齐 |
| 墨色 | 正文 `#1d1b18`，标题 `#0f0d0a` |
| 金色 | `#c9a227`（分隔、问句左边线、章号） |
| 封面 / 封底 | 深墨 `#14120f`，字 `#efe7d8` |
| 章首问题 | LXGW WenKai 14pt，无框、无底色，上下 8mm |
| 追问 | 11pt，左侧 2px 金线，无底色 |
| 回答 | 12pt，正常正文 |
| 倪师原话 | 11pt，暗酒红 `#6f2d36`，斜体，左侧 2px 浅酒红 |
| 古籍引文 | 10.5pt，灰色 `#5d5446`，左侧 2px 米灰 |
| 章标题 | 24pt，上方 2px 墨线，编号 8.5pt 金色大字距 |
| 小节标题 | 15pt，左 3px 金线 |
| 章末一句 | 13pt 楷体，上方 1px 金线，无框 |
| 表格 | 10pt，长表 `thead` 跨页重复 |
| 页脚 | 页码 9pt，`#a89a83` |
| 序末与封底 | “命运是沉睡的奴隶”15pt 楷体，居中/左对齐按位置 |

---

## 三、结构元素

- **封面**：右上竖排小字、金线、大标题（44pt 楷体）、副标题、出生信息、底部一句结构引语
- **目录**：单页，虚线分隔，右侧页码，可分卷分组（`li.grp`）
- **章节**：`h1.chap` + `span.num`（`第 1 章` / `附录 A`）；每章新开一页。序的 `h1` 只写「序」，不编号。
- **章首问题**：`.q-main` + `.lbl`“本章问题”
- **追问**：`.q-follow` + `.who`“追问一”
- **回答**：`.a` + `.who`“答”
- **章末一句**：`.chapter-last` + `.lbl`“这一章的一句”
- **倪师原话**：`blockquote.ni` + `.src`；行内用 `.ni-inline`
- **古籍引文**：`blockquote` + `.src`
- **表格**：`table`，长表加 `class="long"` 与 `<thead>`
- **序末句**：`.preface-phrase`，居中
- **封底**：`.backcover`，深墨，一句话 + “命运是沉睡的奴隶”
- **附录**：封底之后，正常页面，`h1.chap` 每章新开一页

---

## 四、CSS（完整复制，只改变量）

```css
:root {
  --serif: "Noto Serif CJK SC", "Songti SC", "SimSun", "Noto Serif", serif;
  --kai: "LXGW WenKai", "Kaiti SC", "KaiTi", "Noto Serif CJK SC", serif;
  --sans: "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif;
}

@page {
  size: A4;
  margin: 18mm 16mm 16mm 16mm;
  @bottom-center {
    content: counter(page);
    font-family: "Noto Sans CJK SC", sans-serif;
    font-size: 9pt; color: #a89a83; letter-spacing: 0.08em;
  }
}
@page :first { margin: 0; @bottom-center { content: none; } }
@page cover { margin: 0; background: #14120f; @bottom-center { content: none; } }

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--serif);
  font-size: 12pt; line-height: 1.85; color: #1d1b18; text-align: justify;
}

/* ── 封面 ───────────────────────────────── */
.cover {
  page: cover; height: 297mm; width: 210mm;
  background: #14120f; color: #efe7d8;
  padding: 40mm 26mm 26mm 26mm; position: relative;
  page-break-after: always;
}
.cover .rule { width: 46mm; height: 1px; background: #c9a227; margin-bottom: 14mm; }
.cover h1 {
  font-family: var(--kai);
  font-size: 44pt; font-weight: 500; letter-spacing: 0.14em;
  line-height: 1.35; margin: 0 0 8mm 0; color: #f2ead9;
}
.cover h2 {
  font-size: 12pt; font-weight: 400; color: #b9ac93;
  letter-spacing: 0.24em; margin: 0 0 26mm 0;
}
.cover .meta { font-size: 10.5pt; line-height: 2.2; color: #a2957d; }
.cover .meta b { color: #ded3bd; font-weight: 500; }
.cover .epigraph {
  position: absolute; left: 26mm; right: 26mm; bottom: 28mm;
  font-family: var(--kai); font-size: 11pt; line-height: 2;
  color: #8f8571; border-top: 1px solid #3a342b; padding-top: 7mm;
}
.cover .mark {
  position: absolute; right: 24mm; top: 32mm;
  font-size: 7.5pt; letter-spacing: 0.4em; color: #5c5345;
  writing-mode: vertical-rl;
}

/* ── 封底（最后一页，不是章） ───────────── */
.backcover {
  page: cover; page-break-before: always;
  width: 210mm; height: 297mm;
  background: #14120f; color: #b9ac93;
  padding: 106mm 30mm 0 30mm; position: relative;
}
.backcover .bc-rule { width: 34mm; height: 1px; background: #c9a227; margin: 0 0 10mm 0; }
.backcover .bc-sentence {
  font-family: var(--kai); font-size: 15pt; color: #efe7d8;
  letter-spacing: 0.06em; line-height: 2.2; margin: 0 0 14mm 0;
}
.backcover .bc-phrase {
  font-family: var(--kai); font-size: 15pt; color: #efe7d8;
  letter-spacing: 0.12em; line-height: 1.9; margin: 0;
}

/* ── 目录 ───────────────────────────────── */
.toc { padding-top: 8mm; }
.toc h2 { font-size: 17pt; letter-spacing: 0.24em; font-weight: 500; margin: 0 0 3mm 0; }
.toc .sub { font-size: 9pt; color: #8a7f6d; letter-spacing: 0.18em; margin-bottom: 12mm; }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc li {
  font-size: 11pt; padding: 1.25mm 0;
  border-bottom: 1px dotted #ddd5c6;
  display: flex; justify-content: space-between;
}
.toc li span.n { color: #b08a3e; font-size: 9pt; letter-spacing: 0.12em; margin-right: 5mm; }
.toc li span.t { flex: 1; }
.toc li span.p { color: #9a8f7d; font-size: 10pt; }
.toc li.grp {
  border-bottom: none; padding-top: 2.4mm;
  font-family: var(--sans); font-size: 7.8pt; letter-spacing: 0.3em; color: #b08a3e;
}

/* ── 章 / 节 ────────────────────────────── */
h1.chap {
  font-size: 24pt; font-weight: 500; letter-spacing: 0.12em;
  margin: 16mm 0 2mm 0; padding-top: 6mm;
  border-top: 2px solid #1d1b18; line-height: 1.4;
  page-break-after: avoid;
  page-break-before: always;
}
h1.chap .num {
  display: block; font-family: var(--sans);
  font-size: 8.5pt; letter-spacing: 0.3em; color: #b08a3e;
  margin-bottom: 3mm; font-weight: 400;
}
h2.sec {
  font-size: 15pt; font-weight: 500; letter-spacing: 0.08em;
  margin: 10mm 0 4mm 0; padding-left: 4mm;
  border-left: 3px solid #c9a227; line-height: 1.5;
  page-break-after: avoid;
}
h2.sec .n { color: #b08a3e; font-size: 10pt; letter-spacing: 0.1em; margin-right: 3mm; }

/* ── 问答 ───────────────────────────────── */
.q-main {
  font-family: var(--kai);
  font-size: 14pt; line-height: 1.75;
  margin: 8mm 0 6mm 0; color: #2e2820;
  page-break-inside: avoid; page-break-after: avoid;
}
.q-main .lbl {
  display: block; font-family: var(--sans);
  font-size: 7.5pt; letter-spacing: 0.3em; color: #b08a3e;
  margin-bottom: 2mm;
}
.q-follow {
  font-family: var(--serif);
  font-size: 11pt; line-height: 1.8;
  border-left: 2px solid #c9a227;
  padding: 0 0 0 4mm; margin: 5mm 0 2mm 0;
  color: #2e2820;
  page-break-after: avoid;
}
.q-follow .who {
  display: block; font-family: var(--sans);
  font-size: 7.5pt; letter-spacing: 0.25em; color: #b08a3e;
  margin-bottom: 1mm;
}
.a { margin: 0 0 4mm 0; }
.a .who {
  display: block; font-family: var(--sans);
  font-size: 7.5pt; letter-spacing: 0.3em; color: #9c9284;
  margin-bottom: 1mm;
}
.a p, .q-main p, .q-follow p { margin: 0 0 2.2mm 0; }
.a p { orphans: 2; widows: 2; }

/* ── 章末一句 ───────────────────────────── */
.chapter-last {
  margin: 9mm 0 0 0; padding-top: 4mm;
  border-top: 1px solid #c9a227;
  font-family: var(--kai); font-size: 13pt; line-height: 1.8;
  color: #2e2820;
  page-break-inside: avoid;
}
.chapter-last .lbl {
  display: block; font-family: var(--sans);
  font-size: 7.5pt; letter-spacing: 0.28em; color: #b08a3e;
  margin-bottom: 1.5mm;
}

/* ── 引文 ───────────────────────────────── */
blockquote {
  font-size: 10.5pt; line-height: 1.8; color: #5d5446;
  border-left: 2px solid #ddd3bf;
  padding: 1mm 0 1mm 5mm; margin: 4mm 0 4mm 2mm;
  page-break-inside: avoid;
}
blockquote .src {
  display: block; font-size: 8.5pt; color: #a2947c;
  margin-top: 1.5mm; letter-spacing: 0.04em;
}
blockquote.ni {
  color: #6f2d36; font-style: italic;
  border-left-color: #b98a8f;
}
blockquote.ni .src { font-style: normal; color: #8a5a5f; }
.ni-inline { color: #6f2d36; font-style: italic; }

/* ── 强调 ───────────────────────────────── */
strong { font-weight: 700; color: #0f0d0a; }
.inference { font-weight: 700; font-size: 0.86em; color: #6e6557; }
em { font-style: italic; }

/* ── 序末句 ─────────────────────────────── */
.preface-phrase {
  margin: 20mm 0 8mm 0;
  text-align: center;
  font-family: var(--kai);
  font-size: 15pt; letter-spacing: 0.12em; color: #2e2820;
  page-break-inside: avoid;
}

/* ── 表格 ───────────────────────────────── */
table {
  width: 100%; border-collapse: collapse;
  font-size: 10pt; margin: 4mm 0 5mm 0;
  page-break-inside: avoid;
  table-layout: fixed;
}
table.long { page-break-inside: auto; }
table.long tr { page-break-inside: avoid; }
table.long thead { display: table-header-group; }
th {
  background: #f3ecdd; font-size: 9.5pt; font-weight: 600;
  text-align: left; padding: 2mm 2.5mm;
  border-bottom: 1.2px solid #c9a227;
}
td {
  padding: 1.8mm 2.5mm;
  border-bottom: 1px solid #ece5d7;
  vertical-align: top;
  word-break: break-word;
}
td.k { color: #7a6f5d; width: 24%; }

/* ── 提示块（少用） ─────────────────────── */
.note {
  background: #f7f4ed; border: 1px solid #e6ddca;
  padding: 4mm 5mm; margin: 5mm 0;
  font-size: 11pt; line-height: 1.75;
  page-break-inside: auto;
}
.note .lbl {
  font-family: var(--sans); font-size: 7.5pt;
  letter-spacing: 0.3em; color: #b08a3e;
  display: block; margin-bottom: 1.5mm;
}

/* ── 辅助 ───────────────────────────────── */
.small { font-size: 9pt; color: #6e6557; line-height: 1.75; }
.keep { page-break-inside: avoid; }
.center { text-align: center; }
hr { border: 0; border-top: 1px solid #e2d9c8; margin: 8mm 0; }
```

---

## 五、HTML 骨架

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>示例</title>
<style>/* 上面整套 CSS */</style>
</head>
<body>

<!-- 封面：底部引言不要用“命运是沉睡的奴隶”，那句话只在序末和封底 -->
<section class="cover">
  <div class="mark">紫微斗数</div>
  <div class="rule"></div>
  <h1>示例</h1>
  <h2>庚午年 · 男命</h2>
  <div class="meta">
    公历 1990-01-01 12:00<br>
    北京 · 午时
  </div>
  <div class="epigraph">版式样例，非真实解读。</div>
</section>

<!-- 目录 -->
<section class="toc">
  <h2>目录</h2>
  <div class="sub">CONTENTS</div>
  <ol>
    <li><span class="n">序</span><span class="t">本册由来</span><span class="p">1</span></li>
    <li class="grp">卷 一　看 盘</li>
    <li><span class="n">1</span><span class="t">定盘：……</span><span class="p">3</span></li>
    <!-- … -->
  </ol>
</section>

<!-- 序：h1 不编号，0.0–0.4 用 h2 -->
<h1 class="chap">序</h1>
<h2 class="sec"><span class="n">0.0</span>本册由来</h2>
<!-- 0.0–0.4 … -->
<p class="preface-phrase">命运是沉睡的奴隶。</p>

<!-- 章 -->
<h1 class="chap"><span class="num">第 1 章</span>定盘：……</h1>

<p class="q-main"><span class="lbl">本章问题</span>这张盘最先要解释的矛盾是什么？</p>
<p class="q-follow"><span class="who">追问一</span>这里写追问一。</p>
<p class="a"><span class="who">答</span>这里写盘面事实、依据与回答。</p>

<p class="chapter-last"><span class="lbl">这一章的一句</span>这一章的一句，留到写的时候再定。</p>

<!-- 封底 -->
<section class="backcover">
  <div class="bc-rule"></div>
  <p class="bc-sentence">命给了他一副牌；运决定什么时候发；人能做的，是决定怎么打。</p>
  <p class="bc-phrase">命运是沉睡的奴隶。</p>
</section>

<!-- 附录：封底之后 -->
<h1 class="chap"><span class="num">附录 A</span>十二宫全表</h1>

</body>
</html>
```

---

## 六、生成

任何 Chromium 内核都行；不绑定品牌。

```bash
chromium --headless --disable-gpu --no-sandbox --no-pdf-header-footer \
  --print-to-pdf=book.pdf book.html
```

- **必须带 `--no-pdf-header-footer`**，否则会加日期和 URL，中文还可能变方块
- 没有 chromium 就用 Chrome / Edge / Brave 的 headless，或 Puppeteer 自带的 Chromium
- WeasyPrint / wkhtmltopdf / Safari 不保证 `@page` 页码、分页、表头行为；要用，必须自己目检
- 生成后先 `pdfinfo book.pdf | grep Pages` 确认页数

---

## 七、目录页码回填

Chromium 不支持 `target-counter`，目录页码只能算。**每次换 CSS、改字号、改内容，页码都会变，必须重算。**

方法：提取所有 `h1.chap` 的标题，逐页 `pdftotext`，找每个标题首次出现的页，按顺序写回目录的 `<span class="p">`。

两个坑：

1. 目录页本身包含所有标题，搜索会全部命中第 2 页。必须跳过含 `CONTENTS` 的页。
2. 目录标题和正文 h1 不一致时，按正文 h1 的短标题搜，或者统一两边。

参考实现已经放在 `scripts/tocfill.py`：

```bash
python3 scripts/tocfill.py --html book.html --pdf book.pdf
```

它做三件事：清空目录页码 → 生成 PDF、逐页找标题首次出现的页 → 写回页码、再生成一次并复核。

只想算页码、不重新生成：

```bash
python3 scripts/tocfill.py --html book.html --pdf book.pdf --no-generate
```

换浏览器：

```bash
python3 scripts/tocfill.py --html book.html --pdf book.pdf --browser google-chrome
```

附录在封底之后，页码照常继续；目录里照常列附录，搜索顺序不会乱。

---

## 八、生成后必须扫一遍

```bash
# 空白页 / 极短页（正文页应 > 300 字符，封底与目录除外）
python3 - <<'EOF'
import subprocess
N = int([l for l in subprocess.run(['pdfinfo','book.pdf'],capture_output=True,text=True)
         .stdout.split('\n') if l.startswith('Pages')][0].split()[1])
for i in range(1, N+1):
    t = subprocess.run(['pdftotext','-f',str(i),'-l',str(i),'-layout','book.pdf','-'],
                       capture_output=True, text=True).stdout
    if 0 < len(t.strip()) < 300: print('short', i, len(t.strip()))
EOF

pdffonts book.pdf | head -20     # 不能出现 Mono；emb=yes、uni=yes
```

单页渲染成图看一眼，比读文本更容易发现排版问题：

```bash
pdftoppm -png -r 60 -f 1 -l 3 book.pdf pv
```

或者直接跑自动检查：

```bash
bash scripts/smoke-test.sh --html book.html --pdf book.pdf --project <项目目录>
```

重点看：

- 封面大标题不是等宽
- 章首问题比正文大，且没有框
- 追问有金线、没有底色
- 倪师原话是酒红 + 斜体
- 每章都从新页开始
- 封底是最后一页，附录在它后面

---

## 九、分发

```bash
cp book.pdf "$HOME/Desktop/册名.pdf"
scp book.pdf <目标主机>:"/目标/桌面/册名.pdf"
md5sum book.pdf
```

两端 md5 必须一致。对方机器没有 ssh 时，只生成到本机，让用户自己拷。

---

## 十、常见问题

**① 整页空白 / 半页空白**
`page-break-inside: avoid` 让大块整体跳页。`.a` 和 `.note` 放开 `page-break-inside`，只保留 `.a p { orphans: 2; widows: 2 }`。`.q-main` 和 `.q-follow` 保留 `avoid`。

**② 表头只在第一页出现**
表加 `class="long"`，首行包 `<thead>`，CSS 里 `table.long thead { display: table-header-group }`。

**③ 章末页只有一两行**
优先级：补一小节 → 把收尾移走 → 接受（章末留白是常态，但一页只有一行不行）。

**④ 目录页码全错**
正常，先随便填，生成后按第七节回填。

**⑤ 中文变方块**
字体没装或名字写错。`font-family` 必须是字体全名（`Noto Serif CJK SC`，不是 `Noto Serif`）。

**⑥ 封面/问句变成等宽**
字体栈里混进了 `LXGW WenKai Mono`，或本机只装了 Mono。跑 `setup-fonts.sh`，再跑 `check-env.sh`；`fc-match` 出现 Mono 就不生成。

**⑦ 每章没有新开页**
`h1.chap` 少了 `page-break-before: always`；不能只给第一章加。

**⑧ 封底后面还有附录，页码乱了**
附录在封底后是 PDF 顺序；页码继续编，目录照常列。只做 PDF，不考虑打印装订。

**⑨ 引号显示成方框**
用了字体里没有的符号。换中文标点。

**⑩ 封底右边有白边**
多半是缩略图错觉。用 PIL 检查左右像素值，相同就是正常的。
