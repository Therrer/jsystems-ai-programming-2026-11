# OpenCode headless workers — runner guide

This is workflow documentation for the orchestrator (O) dispatching bounded tasks to OpenCode workers. It does not authorize running workers: that needs the human's execution approval for a reviewed plan revision.

Verified with OpenCode 1.19.0 `--help` and docs (Context7 `/anomalyco/opencode/v1.18.35`, `/websites/opencode_ai`) on 2026-11-26.

## Headless usage

1. **Provider and model:**
   - `opencode auth list` must list OpenRouter. If it doesn't, run `opencode auth login` or export `OPENROUTER_API_KEY`.
   - Check the model with `opencode models openrouter | grep gpt-6-luna`.
2. **One task, no TUI.** Use absolute paths and run from the repository root:

   `opencode run -m openrouter/openai/gpt-6-luna --dir <repo>/app --title "<task>" --format json -f <repo>/.agent-briefs/<task>.md "Execute the attached brief exactly. Edit only the files it lists. Do not commit. End with the report it asks for." > <repo>/.agent-runs/<task>/events.jsonl 2> <repo>/.agent-runs/<task>/stderr.log`

   Launch it from Claude Code with `run_in_background` and wait for the completion notice; don't poll.
3. **Correction round, same context:** `opencode run -s <sessionId> "<message>"`.
4. **Cost and audit:**
   - `opencode stats` shows token usage and cost.
   - `opencode export <sessionId>` gives the full transcript as JSON, kept next to the run log.
5. **Escalation model:** `-m openrouter/openai/gpt-6-luna-pro`. Check its price on its OpenRouter model page before the first use.
6. **Don't use:** `--auto`, `--continue` against an unrelated session, `--share`.

## Permissions

OpenCode 1.x **allows everything by default**. The effective policy is merged from the global config (`~/.config/opencode/opencode.jsonc` exists on this VM), the project `opencode.json` and agent settings. T01 writes the project config below and checks the **merged** result with `opencode debug config`. If a global rule overrides a deny, workers are unavailable until the human fixes it. O never edits the global config.

| Key | Rule (the last matching pattern wins, so the catch-all goes first) |
|---|---|
| `edit` | `"*": allow`, `"**/.env*": deny` |
| `bash` | `"*": deny`, then allow `npx vitest *`, `npm test*`, `npx tsc --noEmit*`, `git status*`, `git diff*`, `ls *`, `cat *` and the fixture-generator script. Everything else stays denied: E2E, `npm run dev/build/start`, installs, `rm`, commits, pushes. |
| `webfetch`, `websearch` | `deny` (briefs carry the documentation excerpts) |
| `external_directory` | `deny`, except the repository |

The written rules are not a sandbox guarantee. O still checks every diff against the brief's scope.

## Brief template

O fills this in just before dispatch, from the plan's matrix row, the cited source sections and the accepted predecessor code. Commands and symbols are written in only once they exist.

```text
You are an execution worker, not a planner or approver. AGENTS.md "Delegated workers" applies.
The orchestrator owns decisions and acceptance. Report contradictions or missing inputs; do not guess.

Task ID / issue / model, provider and runner:
Baseline commit and accepted predecessor receipts (SHA, evidence, acceptance note):
Goal and observable acceptance criteria (PRD/ADR IDs for traceability):
Non-goals, forbidden actions, allowed writable files:
Required excerpts (PRD, ADR, design, instructions):
Current contracts, symbols, payloads and capture-derived fixtures:
Ordered steps with all choices resolved:
Red (behavioural assertion and expected failure message) → Green → refactor:
Commands to run and expected results and test counts:
Evidence path (.agent-runs/<task>/ or artifacts/qa/<task>/<run>/):
Report: files changed, commands with results, contradictions, open questions.
```

## Acceptance (O only)

1. `git diff --name-only` must stay within the brief's file list. Otherwise reject the work and restore those files.
2. Read the diff and reproduce the brief's commands and the full suite. Confirm that no test was weakened.
3. Commit using named paths, then post the receipt on the task's issue: SHA, evidence path, acceptance note.
4. Dependent tasks are dispatched only after the receipt exists.
