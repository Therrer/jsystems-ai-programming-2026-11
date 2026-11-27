# Independent review — Hardware Service Decision Copilot PoC (T27)

- **Date:** 2026-11-27 · **Reviewer (R):** a fresh Claude Code subagent with no context from the implementation, briefed with the review criteria only
- **Scope:** `git diff 7b3e347..HEAD -- app/` (merge base with `design-system`), reviewed at `ffc5161`, focusing on `app/src/`
- **Checks run by R:** typecheck (0 errors), lint (0 warnings), Vitest 502/502 with 0 skipped, build (no warnings). The repository has no `.skip`, `.only`, `.todo`, `xit` or `fixme`. E2E was not repeated by R (the orchestrator ran it: 20/20).
- **Mock audit:** production code (`app/src/`) is clean. There are no `ai/test`, mock or fake models, fixtures, `simulateReadableStream` or test libraries, and `process.env` is read only through `parseEnv` with a fixed key list.

This table is meant to be pasted into the T28 pull request.

## Findings

| ID | Severity | Area | Location | Finding | Failing scenario | Status |
|---|---|---|---|---|---|---|
| F1 | major | Chat error path (AC-35) | `src/components/case-chat/case-chat.tsx` | A provider failure after `/api/chat` answered 200 arrives as `start` → `error`. `useChat` had already added an empty assistant message, so neither "Nie wysłano" nor Ponów appeared. | Provider 401/402/429/5xx or a timeout mid-stream → only a generic error, with no retry | **Fixed** `aa98c69`. Reproduced and verified on the real stack (`CHAT_MODEL` set to a non-existent id); new real capture `app-chat-200-stream-provider-error.json`; Red→Green; E2E 20/20 |
| F2 | minor | Input validation (ADR-002 §5.3 step 4) | `src/server/http/chat.ts:197-202`, `src/lib/shared/schemas/api.ts:33-37` | `validateUIMessages` is never called; text parts are loose objects and stored as sent. | Parts `[{type:"text",text:"a"},{type:"text",text:{}}]` pass the length check, get stored and are replayed on every later turn → that case's chat can stay broken. Only the sender's own case is affected. | Open: harden the schema (strict text part with `z.string()`) |
| F3 | minor | `updateDecision` versions | `src/server/ai/chat.ts:58-69`, `src/server/ai/update-decision-tool.ts:142-175` | `nextVersion` and `currentDecision` are fixed once per turn. | Two parallel `updateDecision` calls in one step → two decisions with the same version; a delivery-date fact from the first call is lost | Open: plausible only, depends on the model making parallel tool calls (not observed in T24/T25) |
| F4 | minor | Request size | `src/server/http/cases.ts:47-50` | The 10 MiB limit is checked against the `Content-Length` header only (as ADR-002 §3.3 specifies); `formData()` then buffers the whole body. | A chunked upload with no `Content-Length` and a very large body is buffered in memory before rejection | Open: plausible, depends on Next 16 body limits; PoC runs locally only |
| F5 | minor | Privacy, image retention | `src/lib/client/case-flow.ts:51-73,125`, `src/components/case-app.tsx:103-117` | After a failed decision step, editing and resubmitting drops the old `caseId` without a `DELETE`. | Decision step fails → user edits → submits → the old case keeps the processed photo in server memory until the TTL (120 min) | Open: send `DELETE` for the abandoned case |
| G1 | minor | No-mock guard coverage | `tests/unit/no-mock-guard.test.ts` | The guard misses dynamic `import("ai/test")` and `require`, subpath imports (`msw/node`, `@vitest/*`), `simulateReadableStream`, indirect env reads and `.mts`/`.cts` files. None of these is used today. | A future mock import of one of these forms would pass the guard | Open: widen the patterns |

## No defects found in

- Timing gates (AC-24/25, incl. 2024-02-29 → 2026-02-28 and the 7-day buffer) and Warsaw-time "today"
- Guardrail priority (AC-26) and never Reject on an unclear cause alone (AC-27)
- Notice after every decision (AC-41) and first-message order (AC-29)
- 90 s timeout (AC-28), expired-session handling and error mapping (ADR-002 §5.6)
- Secrets: the key stays in the server provider, health has no secrets, and the log redacts `sk-or-` and `data:image`
- The `server-only` boundary, TD-10 (`data_collection: "deny"`, `zdr: true` on every model and on the Decisions POST), image bytes cleared after the decision and nothing written to disk

## Not verified by R

F4 against the real Next 16 limits, F3 model behaviour, and model decisions and language in general (covered by the T25 manual pass).

## Decision needed (H)

Fix F2, F5 and G1 now, through worker briefs, or accept them for the PoC and list them in the pull request as known limitations. F3 and F4 are plausible-only and low impact for a local PoC.
