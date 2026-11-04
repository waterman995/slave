# Agent instructions

If you are an AI agent with shell access:

1. Read `SKILL.md` completely before doing anything.
2. Clone this repository to `~/.pi/agent/skills/ziwei-report` if it is not there:
   ```bash
   git clone https://github.com/waterman995/slave.git ~/.pi/agent/skills/ziwei-report
   ```
3. Run:
   ```bash
   bash ~/.pi/agent/skills/ziwei-report/install.sh
   ```
4. Run `bash ~/.pi/agent/skills/ziwei-report/scripts/check-env.sh`; do not generate a booklet until it passes.
5. Follow `SKILL.md` for the chart, chapter structure, citations, fonts, and self-checks.
6. Use `~/ziwei-work` as the engine project (`cli.ts` + `lib/ziwei`). Do not invent chart facts.

If you cannot run shell commands:

- Read `SKILL.md` and follow its content rules.
- Produce Markdown in the same structure; do not claim to have generated a PDF.
- Do not invent chart facts, citations, or timecodes.
