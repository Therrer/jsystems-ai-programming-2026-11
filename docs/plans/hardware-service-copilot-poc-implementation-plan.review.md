# Review — Hardware Service Decision Copilot PoC implementation plan

**Verdict: revision `75ebca5d…` awaiting re-approval for worker tasks.**
- `2dee8f9f` (approved) still covers T04 and T05: O-only tasks whose rows didn't change.
- The new fallback models and workers and the research rules change the runner/model boundary, so the first worker dispatch (T06) needs re-approval.

## 1. Reviewed revisions (2026-11-26)

The repository is at `design-system` @ `7b3e347` (a merge of `main`, adding course materials only). All documents below are uncommitted, so their SHA-256 hashes identify them (first 16 hex characters shown):

| File | SHA-256 |
|---|---|
| `docs/plans/hardware-service-copilot-poc-implementation-plan.md` | `75ebca5d840153e554607d7ff39f0f74078fade213d6c77d75f6fbfa7e2479de` (full; current file, awaiting re-approval for worker tasks). Previous file `563d0302…` was It is an administrative revision of the approved `2dee8f9f…`. Compared with `2dee8f9f`, every matrix cell except Status is identical (checked by script); only the tracker wording, §6 steps 4 and 8 and the revision log changed. It supersedes the approved `821498c8…` and `a2d1852f…` (see §5) and the earlier `1a1d4b06…`. |
| `docs/PRD.md` | `a5417b3106758210…` |
| `docs/ADR/000-main-architecture.md` | `11ef7f72e5b41dca…` |
| `docs/ADR/001-ai-pipeline.md` | `b26594c1643c7cab…` |
| `docs/ADR/002-backend-api.md` | `4fb7e4c08c043ea4…` |
| `docs/ADR/003-frontend.md` | `642833d259a0fef6…` |
| `docs/policies/return-terms.md` / `complaint-terms.md` | `27cc733ada354735…` / `1e7c1c2c315ae3da…` |
| `docs/agents/opencode-headless.md` | `2ef7588c037aee1b…` |
| `AGENTS.md` (modified) / `CLAUDE.md` (modified) | `ce335eee9608d6d0…` / `2d54271599e18c77…` |
| `docs/design-guidelines.md` (committed) | `e96e1d2f71d5c9d1…` |

## 2. Checks

**Script checks:** these are evidence, not judgment.
- **Coverage:** all 45 PRD acceptance criteria are mapped; PRD flows §4.1–4.7 and UI sections §9.1–9.5 are mapped; 26/26 ADR TACs and 23/23 ADR TDs are referenced. There are no gaps. Exclusions are PRD §7 only.
- **Graph:** 29 tasks with unique IDs; every prerequisite exists; no forward or self dependencies; T28 is the only leaf; the critical path is valid.
- **Links:** all local links resolve.
- **Size:** 2,514 words (table pipes excluded).

**Judgment checks:** made by the plan's author, Claude Opus 5.5. This is **not** an independent review.
- **Plan/brief separation:**
  - The plan keeps sequencing, ownership and gates.
  - Runner usage, permissions and the brief template live in `docs/agents/opencode-headless.md`.
  - Exact paths and commands are deferred to briefs.
- **Red quality:** the bootstrap tasks (T02/T03) prove test discovery with a controlled assertion. Feature Red is behavioural; a missing module does not count (T05).
- **Concurrency:** the default is sequential workers (D6). Each task is validated on `HEAD` plus its own change. Dependents need an accepted receipt.
- **QA evidence:** gitignored `artifacts/qa/<task>/<run>/`. T01 sets it up and verifies it with `git check-ignore -v`. Screenshots are never committed or cleaned without the human's consent.
- **Instructions:** AGENTS.md *Delegated workers*, the unreachable-code Manual QA rule, and Context7 via CLI or MCP are consistent with the plan.
- **Automation:** the only hook is `PreToolUse` for `pom.xml`, which doesn't apply here. There are no cron jobs or loops. No automation can resume this task.

## 3. Findings and fixes in this revision

| Finding (source: agent-toolbox PR #28 comparison) | Fix |
|---|---|
| The plan was 5,974 words and contained the runner guide and permission config | Compacted, and the guide moved to `docs/agents/opencode-headless.md` |
| The matrix fixed file names and commands before they exist | Scope is now module-level; exact paths and commands go into briefs |
| T05 Red was "module missing" | Behavioural Red examples instead |
| No accepted receipt; workers validated against other workers' uncommitted files | Receipt (SHA, evidence, note) required; sequential default (D6) |
| Screenshots were committed in T25 | Gitignored QA directory; the report links locally |
| No review file and no revision-bound approval | This file + a directive naming the SHA-256 |
| Human request: delegation must use agents that actually exist; OpenCode free models; every agent uses Context7 and `--help` before the web and delegates research | Checked 2026-11-26:
- OpenCode lists 11 free models, but `mimo-v2.6-flash-free` and `deepseek-v4.1-flash-free` return 401 because of a stored OpenCode credential (H must fix it).
- `opencode run` worked at 09:39 and 09:55, then hangs at `init` from 09:56. This also happens with the committed config and a minimal prompt, so it was not caused by these changes. Not diagnosed yet.
- Claude subagents work. pnpm is missing; npm is used everywhere.

Changes:
- AGENTS.md: research order for delegated workers, plus delegation of broad research.
- `opencode.json`: workers may run `npx --yes ctx7@latest`, `npm view` and the `--help` of vitest, playwright, tsc and next. Without `--yes`, npx waits for an install prompt.
- Runner guide: availability table and research section.
- Plan: fallback workers, research step 0, hang fallback.

The research smoke test under the worker policy could not run because of the hang, so it is **not verified**. |
| Human request: status must live in the plan's Status column; GitHub Issues are optional with the same IDs | Added the §5 Status column as the authoritative tracker. T00–T03 are `done <SHA>`; T04 is `blocked` on the missing API key. GitHub Issues are now an optional mirror after approval, titled `Txx: …`, with the Task cell showing `Txx (#n)`. Receipts are written in the Status cell and the commit. Status-only edits are administrative. No task, dependency, owner or gate changed, so the approval of `2dee8f9f` is kept; the human may re-approve if they disagree. |
| Human request: check whether the documents state the problem, users, scale, company specifics and regulated sector, and have UML diagrams | Problem and users were already covered (PRD §2–3). Added: PRD §1 context and scale (fictional medium-sized retailer; PoC with 1–5 testers and ≤ ~50 cases per day; not a regulated sector) and PRD §8 GDPR and AI Act constraints. New ADR-000 TD-10: `data_collection: deny` + `zdr: true` on every OpenRouter call (human chose option a), with TAC-001-08, applied in T04, T09, T15–T18 and T21. New diagrams in ADR-000: §9.4 data model (class diagram) and §9.5 deployment. All 19 Mermaid diagrams were rendered with mermaid-cli 11 without errors. |
| Human request: E2E and manual tests must use the real app (every endpoint, LLM call and decision method), and unit/integration mocks must come from real captures | The plan's §4 now has a real-stack coverage matrix: all 5 endpoints, all 4 LLM stages, proof that Luna was called, timing and image gates through real inputs, the tool call and AI failure covered manually. A capture policy was added: no documentation-derived shapes, derived fixtures are allowed only as edits of real captures, real 401/400/timeout/connection-refused and tool-call captures in T04, and a re-capture with final prompts plus our API errors in T21. T23 depends on T21. ADR-000 §10 and TAC-001-06 are aligned. |
| Human request: manual tests in addition to automated tests, and no mocks | T25 runs one manual test case per PRD flow and AC group on the real stack, with manual checks in T02, T14 and T22. A no-mock guard test is created in T03; T24/T25 require real-call evidence; T27 audits production paths for mocks. On 2026-11-26 `app/` has no code, so there are no mocks yet. |

Earlier findings in the same session (B1–B5, I1–I9, M1–M9) were fixed in the PRD, ADRs, AGENTS.md and CLAUDE.md. They are summarized in the plan's revision line.

## 4. Limits and open items

- **Size:** 2,514 words is about 25 % over the ~2,000-word target. The main cause is keeping a criterion ID on each of the 29 rows, plus the manual-test and no-mock tables the human asked for; compressing further would drop traceability or those checks.
- **Missing prerequisites under the capture policy:**
  - 429, 502 and 503 from OpenRouter can't be captured safely. They are tested only through the numeric status-code mapping.
  - A Luna refusal is tested only if T04 manages to capture one for real.
  - Corrective retry and template fallback can't be triggered end-to-end on demand. They are tested in integration with derived fixtures, and real occurrences are logged.
- **Unverified facts** (a T04 gate): `gpt-6-luna` image and structured-output support, and the `gpt-6-luna-decisions` metadata. The OpenCode 1.19 permission format is checked in T01.
- **Open decisions:** D1 (a second, different PRD in branch `worktree-prd-service-copilot`), D2, D4, D5, D6.
- **Consents:** creating GitHub issues and labels, the `Bash(opencode run:*)` allow rule, running workers.
- **Shared instruction files:** the AGENTS.md and CLAUDE.md edits affect the whole course repository. The human should review them before T00.
- **Recommended:** an independent review by a fresh strong-model session before approval.

## 5. Approval record

| Field | Value |
|---|---|
| Approved by | The human (repository owner, GitHub `Therrer`), in the Claude Code session |
| When | 2026-11-26 |
| Approved revision | Plan SHA-256 `a2d1852ff936509260658e104556a54592cbc885526d61b70da54acdb573f09d`, checked on disk before execution |
| Decisions | D1–D6 accepted with their defaults: this checkout's documents; branch `feat/service-copilot-poc` from `design-system` with the PR targeting `design-system`; ≤ $0.50 per worker attempt and ≤ $8 in total; ADR-000 §1 assumptions accepted; one worker at a time |
| Execution instruction | "wykonuj T00" (execute T00) |
| Not yet consented | Creating GitHub issues and labels, the `Bash(opencode run:*)` allow rule, running OpenCode workers. These are needed from T01 on. |

The plan file keeps `approval: draft` in its header on purpose: editing it would change the approved hash. This record is the approval.

**2026-11-26:** this approval covered revision `a2d1852f`. On the human's request it was superseded by `821498c8…` (real-stack coverage and capture policy). Re-approval is pending; T02–T03 remain covered.

**2026-11-26 re-approval (`821498c8`, later superseded by `2dee8f9f`, which is pending):** the human approved revision `821498c830368460777dc2d725171c059b232e78f0186572a28ede155846e560` ("zatwierdzam 821498c8", checked on disk) and instructed "wykonuj T02 i T03" (execute T02 and T03). It covers T02–T28; the open consents (Issues are disabled again) are unchanged.

**2026-11-26 re-approval:** the human approved revision `2dee8f9fcc49eb3f6c59bbe223e69fddb7faef574f3dc94f2e453ba9f51671c2` ("zatwierdzam 2dee8f9f", checked on disk) and instructed "wykonuj T04" (execute T04). It covers T04–T28.
