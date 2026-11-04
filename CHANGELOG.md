# Changelog

## 4.1.0 — 2026-11-04

- Rename skill `ziwei-report` → `wake_the_slave`.
- Default routing: bare birth info goes to `wake_the_slave`; `ziwei-doushu` only for explicit single-point questions.
- Restore `ziwei-doushu` skill with routing guard.

## 4.0.0 — 2026-11-04

Complete rewrite of the `ziwei-report` skill.

- 序：0.0 本册由来 / 0.1 此盘由来（合盘：两张盘的由来）/ 0.2 三类表达 / 0.3 六亲限制 / 0.4 这一张盘（合盘：这两张盘）/ 序末「命运是沉睡的奴隶」。
- 结论加粗；判断里的推断标「（推论非定论）」；依据写在同一句。
- 个人盘固定章节：定盘 / 健康 / 感情 / 事业 / 资产 / 运势 / 补充 / 命运叩问 / 金线与黑线 / 封底 / 附录。
- 合盘固定章节：人物卷（定盘 / 健康 / 感情 / 事业与资产 / 运势）+ 双人卷（位置 / 四化 / 刑害 / 运限 / 形态 / 补充 / 命运叩问 / 金线与黑线）+ 封底 + 附录。
- 人物卷七三开；人物卷不写金线/黑线/叩问；合盘只保留一个总叩问、一组总金线/黑线。
- 命运叩问以「人能不能改命？」开章，列命/运/人，只给能改哪一块，不给方法。
- 金线与黑线：定义 → 线头 → 金线 → 黑线 → 「但，为金线所困，与为黑线所困，并无不同」；做法内嵌，不另开处方章。
- 版式：A4、正文 12pt、章首问题 14pt 无框、追问 11pt 金线、章末句 13pt、倪师原话酒红 + 斜体、每章强制新页、封底后接附录。
- 字体：封面/问句使用 LXGW WenKai 比例版；禁止 Mono；新增 setup-fonts.sh 与字体门禁。
- 新增 smoke-test.sh、tocfill.py、licenses.md；修复 check-env.sh 的 quiet 退出码、字体精确匹配和 pipefail 问题。
- 添加 CI、示例册、README、MIT LICENSE 与 NOTICE。
