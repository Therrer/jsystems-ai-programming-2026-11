---
name: verified-research-report
description: Run a fact-checked web research project with cheap subagents (Haiku) and deliver a bilingual (PL/EN) report as Markdown plus an HTML artifact with charts. Use when the user asks to research a claim, an article or a topic, "find the source", "only verified sources", "delegate to subagents", or wants a research report with charts. The coordinator only manages the process and checks quality; it does not research itself.
---

# Verified research report

The coordinator plans, delegates, verifies and writes. Subagents search and check.
Every number in the final report must be backed by a verbatim quote or table row
that a **separate** verification pass confirmed.

## Phase 0. Settle the setup before any search (one message, one question round)

Ask the user in one `AskUserQuestion` call, only for what is missing from the request:

1. **Output folder.** The project default is `docs/research/<topic-slug>/`, with
   `raport-pl.md`, `report-en.md`, `index.html` (artifact source) and
   `standalone.html` (the downloaded published page). If the prompt names no
   folder, do not assume one: ask, offering the default as the first
   "(Recommended)" option. Never write to `course-materials/`. Write every file
   straight into the agreed folder, so nothing gets duplicated.
2. **Languages.** Which report languages (default: PL + EN), and which search
   languages besides English (for Slavic topics: PL, CS, UK, RU, plus South Slavic).
3. **Git.** Whether to commit and on which base branch (default: a new branch from `main`).

Also check up front whether `curl` or `pdftotext` is allowed. If it is not, plan
verification through `web-fetch` agents from the start, instead of finding out mid-task.

## Phase 1. First wave of research (parallel, background)

Launch all threads in ONE message, `model: "haiku"`, `run_in_background: true`.
Typical threads:

- **Source.** Find the primary source behind the article or claim, and compare the article with it.
- **Topic threads.** Two to four threads, split by sub-question (for example long context/RAG, reasoning, local benchmarks, mechanisms such as tokenization).
- **Language-diverse search.** A dedicated thread with at least 6 search
  iterations written in the non-English languages. Include it in the FIRST wave,
  not as a later fix.

Every research prompt must include the rules from
[references/agent-prompts.md](references/agent-prompts.md) § Research rules:

- verified sources only;
- a verbatim quote under 20 words for every number;
- label each item VERIFIED, SNIPPET or UNVERIFIED;
- read long pages to the end with `offset`, because WebFetch summaries invent "table missing";
- list which search iterations returned nothing.

While agents run, load `artifact-design` and `dataviz` (read `references/palette.md`). Do not
read their output files.

## Phase 2. Quality control (the coordinator's real job)

When the reports arrive:

1. **Triage.** Build a claim list: every number or quote you may chart or cite.
   Drop items labelled SNIPPET or UNVERIFIED, or send them to verification.
2. **Verify in a separate pass.** Use `web-fetch` agents (Haiku), each with a numbered list of
   claims and the template in [references/agent-prompts.md](references/agent-prompts.md)
   § Fact-check template. Each claim gets a verdict: CONFIRMED, WRONG or NOT FOUND, with a verbatim row or quote.
   Batch about 6–10 claims per agent and run batches in parallel.
3. **Watch for the typical errors.** These all happened in practice:
   - An average across models reported as one model's result (for example "−23.9% for Llama" was the mean of six models).
   - A paraphrase presented as a quote.
   - A tool summary claiming a table or section is missing when it is in the verbatim text.
   - The venue or affiliation taken from the press instead of the paper.
   - A text summary contradicting its own table. Trust the table.
4. **Fill gaps.** If a sub-question has no verified answer, run another
   iteration in other languages or sources (at least 5 attempts) before writing "not found".

## Phase 3. Write the deliverables

Write into the agreed folder only:

- `raport-pl.md` and `report-en.md`: the same structure, as parallel translations.
  Use this order: TL;DR → source vs article table → topic sections → practical recommendations → gaps → method → sources.
- `index.html`: the artifact. Show one language at a time, with a PL/EN toggle (`html[data-lang]` plus `lang` attributes).
  Charts are inline SVG drawn by a small script, with hover tooltips. Never use a dual axis.
  Good chart forms for "language A vs B":
  - a diverging bar chart of Δ (local − English) per model and study, with a caveat that metrics differ;
  - dumbbell charts for paired values;
  - grouped bars for tokens per word.

Before publishing, check:

- **Counts.** Numbers in the method section (agents, threads, sources) match what actually ran.
- **Quote length.** Verbatim quotes from sources stay under 15 words; otherwise paraphrase and label it as a paraphrase.
- **Number format.** Small deltas don't round to "−0,0": use 2 decimals when |Δ| < 0.1. Use a decimal comma in PL and a dot in EN.
- **Chart containers.** `.chart { overflow-x: auto; overflow-y: hidden }`, so the tooltip doesn't create a scrollbar.
- **One look.** Take one screenshot of the hero chart, make one round of fixes, then publish.

Publish with `Artifact` (icon `chart`). Tell the user the artifact is private until they share it.

## Phase 4. Hand-off

- **Downloaded copy.** If the user wants a downloaded standalone HTML, use `Artifact` `action: "read"`
  with `path: "index.html"` and `out_dir` set to the final folder directly. The saved file
  includes the publish skeleton, so it opens on its own. Then `git mv` it to
  `standalone.html` in the same folder. Plain `mv` and `rmdir` may be denied,
  so never plan a step that depends on them.
- **New or changed skills.** If the session ends with a new skill and the prompt
  names no location, ask. The project convention (`.gitignore` and `AGENTS.md`) is:
  - put the skill in `.agents/skills/<name>/` (committed, tool-neutral);
  - add a symlink in `.claude/skills/<name>`, which is git-ignored and serves only for Claude Code discovery;
  - add a one-line pointer in the `AGENTS.md` "Project skills" section, so Codex and Copilot find it too.
  Read `.gitignore` before choosing a path.
- **Git.** Stage named paths only. Never commit duplicates or files you did not
  create, and don't push unless asked.
- **Summary.** Write it in the user's language: key findings, what QA corrected, gaps, and one or two tips
  for working with Claude Code.

## Lessons from the first run (24.11.2026)

| What happened | Fix built into this skill |
|---|---|
| `curl` was denied mid-QA | Check permissions in Phase 0 and plan `web-fetch` verification |
| Slavic-language searches were missing from the first wave | A language-diverse thread is mandatory in Phase 1 |
| Report written to `course-materials/`, then copied to a new folder and duplicated | Ask for the output folder in Phase 0 |
| Agents returned snippet-only numbers as facts | Mandatory labels plus a separate fact-check pass |
| WebFetch summaries falsely said "table not present" | Read verbatim text with `offset`; trust only verbatim text |
| "6 agents in 7 threads" typo, "−0,0" label, chart scrollbar | Pre-publish checklist in Phase 3 |
| Downloaded artifact landed in a subfolder and `mv` was denied | Set `out_dir` to the final folder |
| Branch created from a feature branch | Ask for the base branch in Phase 0 |
| Skill first written to the git-ignored `.claude/skills/` | Skills go to `.agents/skills/` with a `.claude/skills/` symlink; check `.gitignore` first |
