# 示例

这里放的是**版式样例**，不是真实解读。

- 出生信息是虚构的：公历 1990-01-01 12:00，北京，男。
- 内容只展示封面、序、章首问题、追问、回答、章末句、封底和附录的排版。
- `sample.pdf` 是 7 页 A4；正式册子个人盘 55–70 页，合盘 85–90 页。

重新生成：

```bash
cd examples
python3 ../scripts/tocfill.py --html sample.html --pdf sample.pdf
pdftoppm -png -r 100 -f 1 -l 1 sample.pdf cover
pdftoppm -png -r 100 -f 5 -l 5 sample.pdf chapter
pdftoppm -png -r 100 -f 6 -l 6 sample.pdf backcover
```

正式格式以 `../references/format.md` 为准；`sample.css` 只是快照。
