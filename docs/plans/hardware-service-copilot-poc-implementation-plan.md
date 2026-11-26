# Implementation Plan — Hardware Service Decision Copilot PoC

> **Do not execute: draft awaiting human review. Execution requires an explicit human instruction naming this reviewed revision** (the SHA-256 recorded in the [review](hardware-service-copilot-poc-implementation-plan.review.md)).

`approval: draft` · 2026-11-26 · scope: the whole PoC in [PRD](../PRD.md) · out of scope: [PRD §7](../PRD.md#7-out-of-scope)

## 1. Sources and responsibilities

- **Requirements:** [PRD](../PRD.md) owns behaviour. [ADR-000](../ADR/000-main-architecture.md), [001](../ADR/001-ai-pipeline.md), [002](../ADR/002-backend-api.md) and [003](../ADR/003-frontend.md) own architecture. [Design guidelines](../design-guidelines.md) own the visuals. [Policies](../policies/) are runtime inputs.
- **Workflow:** [AGENTS.md](../../AGENTS.md) owns the workflow (TDD, Manual QA, verification, commits, *Delegated workers*). This plan owns only sequencing, ownership and gates.
- **Roles:**
  - **O** = orchestrator, Claude Code Opus 5.5: decisions, briefs, acceptance, commits.
  - **W** = worker, OpenCode headless `openrouter/openai/gpt-6-luna`. It escalates to `gpt-6-luna-pro`, then to a Claude subagent.
  - **R** = a fresh Claude Code review session.
  - **H** = the human.
- **Runner guide:** [OpenCode headless workers](../agents/opencode-headless.md). T01 makes it operational.
- **Tracker:** GitHub Issues on `Therrer/jsystems-ai-programming-2026-11`, one issue per task, with labels `phase:P*` and `status:*`.

## 2. Decisions

| ID | Topic | State |
|---|---|---|
| D1 | Authoritative documents | **Open.** Default: this checkout's PRD, ADRs and policies. Branch `worktree-prd-service-copilot` holds a different PRD. |
| D2 | Branch and PR | **Open.** Default: `feat/service-copilot-poc` from `design-system`, PR targeting `design-system`. Nothing is pushed or merged to `main`. |
| D4 | Budget | **Open.** Default: ≤ $0.50 per worker attempt and ≤ $8 for all workers. H sets an OpenRouter key limit for E2E. |
| D5 | ADR-000 §1 assumptions | **Open.** Default: accept them. |
| D6 | Worker concurrency | **Open.** Default: **one worker at a time**. Every task is validated on accepted, committed predecessors. Alternative: parallel workers in temporary worktrees (needs H's approval under AGENTS.md). |
| I2 | Branding | **Decided (a):** Eurocash-derived style, no Eurocash assets ([AC-45](../PRD.md#6-acceptance-criteria)) |
| I4 | Mock sources | **Decided (a):** every model mock comes from a T04 capture |
| — | Consents | **Pending:** creating issues and labels, adding the `Bash(opencode run:*)` allow rule, running workers |

## 3. Baseline (2026-11-26)

- **App:** `app/` contains only `README.md`. There are no app commands, no tests and no baseline failure. The commands appear in T02–T03 and are written into briefs only after they exist.
- **Toolchain:** Node v24.22.3, npm 11.19.1, OpenCode 1.19.0. `opencode models openrouter` lists `gpt-6-luna` and `gpt-6-luna-pro`, and OpenRouter credentials are configured.
- **GitHub:** Issues are enabled; Projects are not accessible.
- **Blocked check:** `curl` to openrouter.ai was denied, so model facts move to T04.
- **Working tree:** unrelated changes (`.mcp.json`, `.agents/`, `.claude/worktrees/`, `course-materials/research/`, `skills-lock.json`) stay untouched.
- **Automation:** the only hook is `PreToolUse` for `pom.xml`, which doesn't apply here. There are no cron jobs or loops.

## 4. Phases and gates

| Phase | Tasks | Exit gate |
|---|---|---|
| P0 Prep | T00–T01 | Requirements committed. The worker smoke run shows a blocked `git push`. The QA directory ignore rule is verified. |
| P1 Foundation | T02–T04 | Test discovery is proven (a controlled failing assertion fails, and passes once restored). Build and startup are recorded separately. Captures are saved. |
| P2 Contracts | T05–T06 | Contracts are accepted. E2E specs fail on missing UI. |
| P3 Leaf modules | T07–T14 | Each module's behaviour tests pass and the full suite stays green |
| P4 AI stages | T15–T18 | Capture-derived integration tests pass |
| P5 Server | T19–T21 | Real API answers; capture recorded |
| P6 Client | T22–T23 | UI flow works in the browser |
| P7 Acceptance | T24–T28 | E2E is green, QA evidence exists, R findings are resolved, H approves |

**Manual QA:** follows the AGENTS.md rule for unreachable code. Modules from T07–T20 are verified by tests until they are wired in. Runtime QA happens in T02, T14, T22 and T25.

**Manual tests (in addition to automated tests):**

| Task | Manual test |
|---|---|
| T02 | Start the app by hand |
| T14 | Visual comparison with the brand reference |
| T22 | Walk the return and complaint happy paths by hand |
| T25 | Full manual test pass: one manual test case `MT-xx` per PRD flow §4.1–4.7 and per AC group in PRD §6, each with steps, expected result, actual result and a screenshot. Run at 360 px and 1440 px on the production build with the real OpenRouter and Luna models. |

Manual results are recorded separately from automated results and never replaced by them.

**No mocks outside unit and integration tests** (AGENTS.md test strategy):

| Check | What it proves | Task |
|---|---|---|
| No-mock guard test | Production code (`app/src`) imports nothing from `ai/test`, mock or fake models, test fixtures or recorded captures, and has no mock/fake environment switch | Created in T03, run with every suite |
| Real-call evidence | Server log lines show the real model id and OpenRouter cost for each call, and the OpenRouter activity count matches the run | Required in T24 and T25 |
| Review audit | R checks the production paths for mocks | T27 |

## 5. Task matrix (authoritative)

Scope names modules. O writes the exact paths, commands, test inputs and expected results into each brief at dispatch.

| Task | Observable outcome | PRD/ADR links | Prerequisites | Owner/model | Editable files (scope) | Verification and handoff |
|---|---|---|---|---|---|---|
| T00 | Feature branch with the requirements commit | ADR-000 §1 | D1, D2 | O | `docs/` PRD, ADR, policies, plans, agents | Only these paths staged. `Docs:` commit. |
| T01 | Worker harness, QA directory, runner guide in operation | [Runner guide](../agents/opencode-headless.md) | T00; H consents | O | `/opencode.json`, `/.gitignore`, `/.agent-briefs/`, `/.claude/settings.json` (one rule) | Merged permissions checked with `opencode debug config`. Smoke run log shows the push denial. `git check-ignore -v` on `artifacts/qa/` and `.agent-runs/`. `Agents:` commit. |
| T02 | Next.js scaffold starts | ADR-000 §11 steps 1–6, 9, TD-02, TD-08 | T00 | O | `app/` (generated), app README, `app/CLAUDE.md` | Typecheck, lint and build pass. Dev server screenshot saved to the QA directory. `App:` commit. |
| T03 | Tooling, UI kit, AI dependencies, test runners | ADR-000 §2, §7, §10 TAC-01, TAC-02, §11 steps 7–11, TD-01; ADR-003 §2, TD-03 | T02 | O | manifests and lockfile, test configs, UI kit, env example, favicon, Streamdown CSS line | Controlled failing assertion fails then passes. The network blocker makes an OpenRouter call fail. The no-mock guard test fails on a deliberate `ai/test` import in `app/src` and passes once the import is removed. E2E smoke opens `/`. `App:` commit. |
| T04 | Model facts + 4 raw captures (Decisions, structured with image, Decision-shaped, streamed chat) | ADR-000 §11 step 13, §12; ADR-001 §2, §4; AGENTS.md capture rule | T03; key (H) | O + H | capture fixtures, capture script, ADR-000 §12 facts | Captures keep status, headers (no auth) and body. A missing vision capability goes to a proposed ADR change before T16. `App:` commit. |
| T05 | Shared schemas, date helpers, common strings | PRD AC-01–AC-11, AC-20–AC-22, AC-41, AC-42; ADR-001 §4; ADR-002 §4.1–4.2; ADR-003 §4 | T03 | O | `lib/shared` (except per-screen string files) | Red = behaviour assertions, e.g. a 19-code-point complaint description is rejected and tomorrow's date is invalid. Missing-module failures don't count. `App:` commit. |
| T06 | E2E specs for flows 4.1–4.4, 4.7, validation, responsive and Polish UI, failing on missing UI | PRD §4, AC-01–AC-15, AC-28–AC-45; ADR-003 §8; ADR-000 TAC-06 | T01, T05 | W | E2E specs and helpers | O runs E2E: the failures are "locator not found". `Tests:` commit. |
| T07 | Timing windows, gates, decision guardrails | PRD AC-23–AC-27; ADR-001 §3.4–3.5, TD-07; TAC-001-01–04 | T01, T05 | W | `server/guardrails` | Table-driven Red→Green (windows, leap day, priority, money regex). `Backend:` commit. |
| T08 | Image validation and compression | PRD AC-09–AC-11, AC-16; ADR-002 §3.3, TD-201; ADR-000 TD-09; TAC-001-05 | T01, T05 | W | `server/image`, image fixtures + generator | Rotation and EXIF assertions. HEIC fixture per the brief's exception. `Backend:` commit. |
| T09 | Env, policy store, provider | PRD §8; ADR-000 §7, TD-01; ADR-002 §3.4; ADR-001 §2 | T01, T05 | W | `server/env`, `server/policies`, `server/ai/provider` | Real policies load. A missing key names the variable. `Backend:` commit. |
| T10 | Case store, errors, logger | PRD AC-37; ADR-002 §3.2, §5.6, TD-205; ADR-000 TD-04 | T01, T05 | W | `server/cases/store`, errors, log | Fake-timer TTL, eviction and lock tests. `Backend:` commit. |
| T11 | Client flow reducer, leave warning | PRD §4.6 (client), AC-14, AC-15, AC-28, AC-37–AC-40; ADR-003 §3.2; TAC-003-01 | T01, T05 | W | `lib/client` reducer and hook | Every state-diagram transition tested. `Frontend:` commit. |
| T12 | Form components | PRD AC-01–AC-15, AC-42, §9.2; ADR-003 §3.3, TD-301, TD-302; TAC-003-02, TAC-003-03 | T01, T05 | W | `components/case-form`, form strings | Focus on the first invalid field, HEIC rejection, conditional description. `Frontend:` commit. |
| T13 | Chat presentation components | PRD AC-29–AC-31, AC-35, AC-39, AC-41, §9.3–9.4; ADR-003 §3.4; ADR-001 TD-103; TAC-003-02, TAC-003-03 | T01, T05 | W | `components/case-chat` (except its container), chat strings | Part order and notice asserted. Props come from T05 schemas and are rechecked in T22. `Frontend:` commit. |
| T14 | Tokens, layout, wordmark header | PRD AC-43–AC-45, §9.1; ADR-003 §3.5; design guidelines | T01, T03, T05 | W | `globals.css` token block, layout, header | O compares a screenshot with `assets/homepage.png`. `Frontend:` commit. |
| T15 | Luna client (never throws) | ADR-001 §3.2, TD-05, TD-105; TAC-001-06 | T04, T09 | W | `server/ai/luna` + Luna prompt | Mocks from the T04 Decisions capture. Refusal and timeout cases. `Backend:` commit. |
| T16 | Vision stage | PRD AC-17–AC-19; ADR-001 §3.3, TD-101, TD-102 | T04, T08, T09 | W | `server/ai/vision` + prompt | One `image/webp` file part asserted. Mock from the T04 capture. `Backend:` commit. |
| T17 | Decision agent + first-message renderer | PRD AC-20–AC-29, AC-41; ADR-001 §3.5–3.7, TD-103 | T04, T07, T09 | W | `server/ai/decision`, renderer, prompt | Mock from the Decision-shaped capture. Forced outcome and fallback (AC-24). `Backend:` commit. |
| T18 | Chat agent + `updateDecision` tool | PRD §4.5, AC-34, AC-36, AC-43, §11; ADR-001 §3.8, TD-104 | T04, T07, T09, T10 | W | `server/ai/chat` + prompt | Stream mock from the T04 stream capture. Context capture test (AC-34). `Backend:` commit. |
| T19 | Case service + eval log | PRD AC-28, §4.6 (server); ADR-002 §3.5, §5.1–5.2, TD-202; ADR-000 TD-06; ADR-001 §3.9; TAC-001-07, TAC-002-03 | T08, T10, T15–T17 | W | `server/cases/service`, eval log | Vision-failure cleanup, idempotent decide, image cleared. `Backend:` commit. |
| T20 | API routes | PRD AC-32, AC-35–AC-37; ADR-002 §5, TD-201–TD-203; ADR-000 TD-06; TAC-002-01–06 | T18, T19 | W | `app/api` routes | Every error row in ADR-002 §5.6 tested. `Backend:` commit. |
| T21 | Real endpoint capture | AGENTS.md capture rule; ADR-000 §10; ADR-002 TD-204 | T20; key (H) | O + H | recorded fixtures, fixture corrections | Health 200 on the production build. Mocks reconciled with the capture. `Tests:` commit. |
| T22 | Wired UI flow | PRD §4.1–4.7, §9.5, AC-14–AC-15, AC-28–AC-40; ADR-003 §3.2, §3.4, §5, TD-303, TD-304; TAC-003-01, TAC-003-05 | T11–T14, T21 | W (escalate after 2 failures) | app shell, page, client API, chat transport, chat container | Fetch mocks from the T21 capture. O walks the return flow by hand. `Frontend:` commit. |
| T23 | Eval report script | ADR-001 §3.9, TD-05 | T19 | W | report script + test (O adds the npm script) | Fixture JSONL gives the expected table. `Tools:` commit. |
| T24 | E2E green | ADR-000 TAC-06; ADR-003 §8; PRD §4 | T06, T22 | O (fixes via W briefs) | production code via briefs; E2E selectors only, never assertions | Pass/fail/skip counts and OpenRouter cost recorded. Real-call evidence: per-call log lines with model id and cost, and the OpenRouter activity count for the run. The no-mock guard is green. `Tests:` commit. |
| T25 | Manual test pass `MT-xx` for every PRD flow §4.1–4.7 (4.6 via a restart with an invalid key) and every AC group, on the real stack without mocks | AGENTS.md Manual QA; ADR-003 TAC-003-02, TAC-003-04, TAC-003-06; PRD AC-43–AC-45 | T24 | O + H | `docs/qa/poc-manual-qa.md` (screenshots stay in the QA directory) | Report with steps, expected and actual results, and local screenshot links. Real-call evidence attached, no-mock guard green, Lighthouse a11y ≥ 90. Failures go to new W briefs. `Docs:` commit. |
| T26 | App docs; ADR facts | ADR-000 §11 steps 4–5, §12 | T24 | W (app docs), O (ADR facts, separate commit) | app README, AGENTS, CLAUDE | Link and consistency check. `Docs:` commits. |
| T27 | Independent review | AGENTS.md Code Review Rules; ADR-000 TAC-01–07; ADR-003 TAC-003-01, TAC-003-03, TAC-003-05 | T23, T25, T26 | R + H | fixes via W briefs | Full re-verification, including an audit for mocks in production paths. Findings table goes into the PR. |
| T28 | PR (not merged) | AGENTS.md Commit Rules | T27; H says "push" | O + H | — | PR targeting the D2 base. Merging is H's decision. |

**Critical path:** T00 → T02 → T03 → T05 → T09 → T17 → T19 → T20 → T21 → T22 → T24 → T25 → T27 → T28.

**Joins:**
- T01 before T06; T04 before T15.
- T07/T08/T10 at T16–T19; T11–T14 at T22.
- T06 at T24; T23 at T27.

**Shared hotspots (only the named owner edits them):**

| File or area | Owner |
|---|---|
| Manifests and lockfile, test and TypeScript configs | O. Workers can't install packages. |
| `lib/shared` | O (T05), except the form and chat string files (T12, T13) |
| `globals.css` | T03 (Streamdown line), then T14 (tokens) |
| Page, app shell, chat container | T22 |
| ADRs and plans | O |
| `.env*` | H |
| Port 3000 and `.next/` | Whoever runs the app or E2E (O, or W in T22). One at a time. |

## 6. Execution protocol

1. **Brief:** O compiles `.agent-briefs/<task>.md` just before dispatch, from the matrix row, the cited sections and the accepted predecessor code. It uses the template in the [runner guide](../agents/opencode-headless.md#brief-template). The worker reads the brief, not this plan.
2. **Dispatch:** one worker at a time (D6). Logs go to `.agent-runs/<task>/` (gitignored).
3. **Accept:** O checks that `git diff --name-only` is within scope, reads the diff, and reproduces the task checks and the full suite on `HEAD` + the change. O also confirms no test was weakened, then commits with named paths.
4. **Receipt:** O posts an issue comment with the commit SHA, the evidence path (`.agent-runs/<task>/` or `artifacts/qa/<task>/<run>/`) and an acceptance note, then closes the issue. **No dependent task is dispatched before its predecessors have receipts.**
5. **Escalate:** after two rejected attempts, a contradiction or a weakened test. Order: Luna Pro, then a Claude subagent or O. The reason is recorded on the issue.
6. **Budget:** `opencode stats` after each task. Stop and report to H when D4 is exceeded.
7. **QA evidence:** screenshots go to `artifacts/qa/<task>/<run>/<screen>-<state>.png` at the repository root, gitignored by T01. They are never committed, never cleaned without H's consent, and linked from reports.
8. **Approval:** when H approves, O records who, when and the plan SHA-256 in the review file. A material change (a task, scope, dependency, owner, gate or model/budget boundary) returns the plan to draft for re-approval.

## 7. Failure handling and fallback

- **Rejected work:** restore only the files in the task's scope; re-brief once, then escalate.
- **Bad commit:** `git revert <task commit>`, then refresh the downstream briefs.
- **No OpenCode or OpenRouter access for workers:** use Claude subagents (Haiku, escalating to Sonnet) or O alone. The briefs stay the same.
- **`gpt-6-luna` can't read images:** proposed ADR change to `VISION_MODEL` (T04 gate).
- **Decisions API fails:** set `DECISIONS_ENABLED=false` (ADR-000 TD-05).
- **OpenRouter 402 or 429 during E2E:** stop and report to H.
- **Fallback scopes**, each recorded in the PRD before use:
  - **F1:** no Luna, no eval report, chat without the update tool.
  - **F2:** F1 without the follow-up chat.
  - **F3:** O executes sequentially without workers.

## 8. Review gate and first task

Draft → H reviews this plan and the [review](hardware-service-copilot-poc-implementation-plan.review.md) → H resolves D1, D2, D4, D5 and D6 and gives the consents → H gives an explicit execution instruction naming the plan SHA-256. The first task is **T00**: create the branch and commit only the documents.

**Revisions:**
- 2026-11-26: whole-PoC draft; Issues tracker; coverage and consistency fixes.
- 2026-11-26: compacted to the plan/brief contract of [agent-toolbox PR #28](https://github.com/EdukeyTeam/agent-toolbox/pull/28):
  - runner guide moved out;
  - module-level scope;
  - behavioural Red;
  - receipts and sequential validation (D6);
  - ignored QA directory;
  - review file and revision-bound approval.
- 2026-11-26: added an explicit manual test pass (MT cases in T25, manual checks in T02/T14/T22) and no-mock checks (guard test in T03, real-call evidence in T24/T25, audit in T27).
