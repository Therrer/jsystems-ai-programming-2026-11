# Manual QA — Hardware Service Decision Copilot PoC (T25)

- **Date:** 2026-11-27 · **Branch:** `feat/service-copilot-next` · **Tested build:** production (`npm run build` + `npm run start`), run 1 on `64dcf7e`, re-test (run 2) on `6fe23ef`
- **Stack:** real OpenRouter models (`openai/gpt-6-luna` for vision, decision and chat; `openai/gpt-6-luna-decisions` for the Luna pre-check), `DECISIONS_ENABLED=true`, no mocks
- **Driver:** Playwright CLI (`playwright-cli`) on Chrome, operated step by step by the orchestrator (O). Each screenshot and model answer was read and compared with the PRD.
- **Viewports:** 1440×900 and 360×740 (AC-44 also covered by E2E at 360 and 1920)
- **Photos:** only the five real photos in `assets/example-images/`. The model was never told what a photo shows.
- **Evidence (local, gitignored):** `artifacts/qa/T25/run1/` (32 screenshots, server logs, `eval.jsonl`, axe reports) and `artifacts/qa/T25/run2/` (re-test after the fixes)

Manual results are recorded separately from automated ones (plan §4).

## 1. Automated baseline (re-run for this pass)

| Check | Run 1 (`64dcf7e`) | Run 2 (`6fe23ef`) |
|---|---|---|
| Typecheck / lint | pass / pass | pass / pass |
| Unit + integration (Vitest) | 497/497, 0 skipped | 502/502, 0 skipped |
| Build | pass | pass |
| E2E, real stack | 20/20, 5.4 min | 20/20, 6.0 min |
| No-mock guard test | green (part of the Vitest run) | green |

## 2. Manual test cases

Result key: ✅ pass · ⚠️ pass with a finding (see §4) · ❌ fail. Screenshot paths are relative to `artifacts/qa/T25/`.

| ID | PRD scope | Steps | Expected | Actual | Result | Screenshots |
|---|---|---|---|---|---|---|
| MT-01 | `GET /api/health` | Open `/api/health` | 200; policies loaded; models listed; no secrets | `status: ok`, 21 return + 21 complaint rules, `decisionsEnabled: true`, model ids only | ✅ | — |
| MT-02 | Form AC-01–AC-15, AC-42 | Empty submit; then a complaint with a whitespace-only model, a future date, a 1999 date, a 19-character description and a PDF; then fix every field | No request sent; one message per field; focus on the first invalid field; texts as in the PRD; errors clear when corrected; preview + Zmień/Usuń; counter | 0 `/api` requests, 0 console errors; focus moves to "Reklamacja"; every PRD message is shown verbatim, incl. "Dozwolone formaty: JPG, PNG, WEBP"; counter `19 / 2000` → `73 / 2000`; preview with file name; complaint hints shown | ⚠️ F-06 | run1/mt02-form-empty-1440, mt02-empty-submit-1440, mt02-empty-submit-360, mt02-invalid-values-1440, mt04-complaint-filled-1440 |
| MT-03 | §4.1 return, 360 px | Zwrot, Laptop, 5 days, no description, `laptop-1.png` (JPEG data) | Chat within 90 s; AC-29 sections; summary collapsible at 360; no horizontal scroll | 20 s; the model sees a cracked screen → **Wymaga weryfikacji**, cites R-2.1, R-3.4, R-6.3; "Szczegóły sprawy" expands; photo zoom works; `scrollWidth` 360 | ⚠️ F-04, F-05 (F-04 fixed) | run1/mt03-return-filled-360, mt03-return-chat-360, mt03-summary-expanded-360, mt03-photo-zoom-360 |
| MT-03b | §4.1 return accepted, AC-21 | Zwrot, Laptop, 5 days, `laptop-2.webp` | Accept with full refund or a reduced refund whose amount the service sets | **Wstępnie zaakceptowano**, "Zwrot pomniejszony o utratę wartości (kwotę ustali serwis)", R-2.1, R-3.3, R-6.3 | ✅ | run1/mt03b-return-clean |
| MT-04 | §4.2 complaint, AC-15, AC-27–AC-29, AC-41 | Reklamacja, Laptop, "Dell Latitude 5440", 400 days, defect description (spontaneous shutdowns), `laptop-2.webp` | Form locked with two progress steps; chat ≤ 90 s; sections in order; never Reject on an unclear cause | Every control disabled, "Analizuję zdjęcie…" → "Przygotowuję decyzję…"; chat after ~18 s; the model identified a **Lenovo ThinkPad** and flagged the mismatch with the typed Dell model → **Wymaga weryfikacji** (C-2.1, C-2.2, C-3.4, C-5.1) with "Pytania do Ciebie"; notice verbatim | ✅ | run1/mt04-processing-1440, mt04-chat-first-message-1440 |
| MT-05 | Chat AC-30–AC-34, AC-36, AC-43 | Whitespace-only message; Shift+Enter newline then Enter; "Jaki model zgłosiłem?"; drop an image on the input; an English question | Empty message not sendable; Shift+Enter = newline; answer uses form data; no attachment accepted; answer in Polish | 0 chat requests and Wyślij disabled for whitespace; multi-line message sent with Enter; "Zgłosiłeś laptop Dell Latitude 5440."; a dropped image adds nothing; "Mogę pomóc tylko po polsku: …"; markdown rendered, no raw `**` or `#` | ⚠️ F-01 (fixed) | run1/mt05-chat-typing-1440, mt05-english-1440, mt05-drop-attachment-1440 |
| MT-06 | §4.5, AC-33, `updateDecision`, AC-41 | In the MT-04 chat: "Tak, na zdjęciu jest mój laptop. Pomyliłem się w formularzu: to Lenovo ThinkPad…" | "Asystent pisze…" while the input is disabled; updated-decision block when the outcome changes | MutationObserver saw "Asystent pisze…" and a disabled input; tool call accepted (`decision_updated` version 2, ACCEPT); block "Zaktualizowana wstępna decyzja", **Wstępnie zaakceptowano**, remedy Naprawa, C-2.1/C-2.2/C-3.1/C-4.3; notice verbatim | ✅ | run1/mt06-clarification-1440 |
| MT-07a | §4.4 buffer, AC-24 | Zwrot, Smartfon, 18 days, `phone-2.jpeg` | Needs manual review citing R-2.3 | **Wymaga weryfikacji**, R-2.2, R-2.3 | ✅ | run1/mt07a-return-18d |
| MT-07b | §4.4 outside, AC-24 | Zwrot, Smartfon, 30 days, `phone-3.jpeg` (1440 and 360 px) | Reject citing R-2.4, suggests a complaint | **Wstępnie odrzucono**, R-2.4, "możesz złożyć reklamację" | ✅ | run1/mt07b-return-30d, mt07b-return-30d-360 |
| MT-07c | §4.4 buffer, AC-25 | Reklamacja, Laptop, 2 years + 3 days, `laptop-2.webp` | Needs manual review citing C-2.4 | **Wymaga weryfikacji**, C-2.4 (+ C-2.2, C-3.5, C-5.x) | ✅ | run1/mt07c-complaint-2y3d |
| MT-07d | §4.4 outside, AC-22, AC-25 | Reklamacja, Smartfon, 2 years + 30 days, `phone-1.jpg` | Reject citing C-2.5; warranty or paid repair suggested | **Wstępnie odrzucono**, remedy "Płatna naprawa po wycenie", C-2.5; next steps: manufacturer warranty, paid repair, a formal complaint is still possible | ✅ | run1/mt07d-complaint-2y30d |
| MT-08 | §4.3 wrong category, AC-26 | Zwrot, **Laptop**, 5 days, `phone-1.jpg` | Needs manual review naming the mismatch | `categoryMatch: mismatch`; **Wymaga weryfikacji**; "Na zdjęciu widać smartfon, nie laptop Lenovo ThinkPad E14" | ✅ | run1/mt08-wrong-category |
| MT-09 | Unusable-photo gate, every real photo | Record the model's actual assessment of each photo (MT-03 to MT-08) | Record only (generated or blurred images are forbidden) | `imageUsable: true` for all five photos in all 10 cases. No real photo is unusable, so this gate stays covered by integration tests only (plan §4). | ✅ (record) | — |
| MT-10 | §4.7, AC-37–AC-39 | Nowa sprawa → Anuluj; reload → dismiss; Nowa sprawa → confirm; reload an open case → accept | Dialog text; cancel keeps the chat; browser leave warning; confirm → `DELETE` 204 and an empty form; reload → empty form | Every step as expected; `DELETE /api/cases/{id}` → **204**; all fields empty and no type selected | ✅ | run1/mt10-new-case-dialog-1440, mt10-new-case-dialog-360, mt10-after-new-case-1440, mt10-after-reload-360 |
| MT-11a | AC-35 failed chat reply | Browser offline → send → online → Ponów | "Nie wysłano" + Ponów; Ponów resends once | As expected; the answer cites R-5.1; no duplicate message | ✅ | run1/mt11a-chat-failed-1440, mt11a-chat-retried-1440 |
| MT-11b | Expired case (TAC-003-06) | Restart the server (in-memory store cleared), then send in the open chat | Session-expired notice with Nowa sprawa | `/api/chat` → **404**; "Sesja wygasła. Rozpocznij nową sprawę." + Nowa sprawa; input disabled | ⚠️ F-07 | run1/mt11b-chat-expired-360 |
| MT-11c | §4.6, AC-40 | Restart with an invalid `OPENROUTER_API_KEY` (process env only, `.env.local` untouched); submit a complaint; restart with the real key; click Spróbuj ponownie | Real 502; PRD error text; form and photo kept; retry resubmits without re-entry | `POST /api/cases` → **502** (`luna_unavailable` 401, `vision_failed` AI_UNAVAILABLE in the log); banner "Nie udało się przygotować decyzji. Spróbuj ponownie za chwilę."; every value and the photo kept; Spróbuj ponownie → 201 + 200 → **Wstępnie zaakceptowano**, Naprawa | ✅ | run1/mt11c-ai-failure-form-360, mt11d-retry-success-360 |
| MT-12 | Accessibility (TAC-003-04), AC-44, AC-45 | axe-core 4.14.1 (installed in the project) on both screens at both widths; visual comparison with `assets/homepage.png` and the design guidelines | Lighthouse a11y ≥ 90; no horizontal scroll; brand tokens, Roboto, leaf corners, green strip, no Eurocash name or logo | Run 1: F-01–F-03 plus brand-token contrast (F-08). Run 2: only brand-token contrast remains (F-08). Lighthouse could not be run (§5). Visuals match the brand reference; the header is the PRD §9.1 text wordmark. | ⚠️ F-08, gap §5 | run1/axe-*.json, run2/axe-*.json, run2/retest-chat-bubble-1440, retest-chat-bubble-360 |

## 3. Real-call evidence

| Run | AI calls (server log `ai_call`) | Upstream cost | Luna status |
|---|---|---|---|
| Run 1 (manual pass) | 35: luna 10, vision 10, decision 10, chat 5 | $0.01456 | `ok` in 10/10 cases |
| Run 2 (re-test) | 12: luna 3, vision 3, decision 3, chat 3 | $0.00459 | `ok` in 3/3 cases |

- Model ids in every line: `openai/gpt-6-luna-decisions` (luna) and `openai/gpt-6-luna` (vision, decision, chat).
- `appliedGuardrails` was empty in every case: no corrective retry or template fallback was triggered.
- The `eval:report` script runs on `run1/eval.jsonl`: 10 cases, `category` agreement 10/10.
- **Open (H):** the OpenRouter activity count for these runs must be read from the OpenRouter dashboard. O has no access to it.

## 4. Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| F-01 | serious (WCAG 1.4.3) | User chat bubble: `#3D4455` text on `#358F42`, contrast 2.39:1 | **Fixed** in `6fe23ef` (light brand-green tint, body text) |
| F-02 | serious | Conversation scroll area not reachable by keyboard (axe `scrollable-region-focusable`) | **Fixed** in `6fe23ef` |
| F-03 | moderate | Chat screen has no level-one heading; the fix then exposed `heading-order` | **Fixed** in `6fe23ef` (sr-only h1 and h2) |
| F-04 | minor | Summary shows the "Opis" label with no value for a return without description; the photo appears to sit under "Opis" | **Fixed** in `6fe23ef` |
| F-05 | minor | Photo zoom dialog: the close "×" is hard to see on top of the photo | Open, cosmetic |
| F-06 | question | With no case type selected, Description already shows "(opcjonalnie)" and the return hint. AC-07 defines this only for "Zwrot". | Open, needs an H/PRD decision |
| F-07 | minor | Expired session: the failed message still offers "Ponów", which can never succeed; at 360 px the expired notice is below the fold and the view does not scroll to it | Open |
| F-08 | brand | White on `#358F42` (Nowa sprawa button, case-type badge) is 4.07:1 and white on the `#E67741` CTA is 2.96:1. These are design-guideline tokens; ADR-003 records the orange one as a known trade-off, but not the green one. | Open, brand decision for H/design owner |

## 5. Gaps and limits

- **Lighthouse score (TAC-003-04) not measured.** Downloading Lighthouse through `npx` was blocked by the session's permission policy. axe-core (the engine behind Lighthouse's accessibility audits) was used instead. To close the gate, H runs `npx lighthouse http://localhost:3000/ --only-categories=accessibility` on the form and the chat screen (in Chrome DevTools for the chat, since it needs a live case).
- **OpenRouter activity count:** needs H (dashboard access).
- **Updated-decision screenshot at 360 px:** captured only at 1440 px (MT-06). The tool call is model-driven and was not repeated.
- **Real HEIC, a file larger than 10 MB and animated WebP:** no such real files exist (plan T08 missing prerequisite). AC-10/AC-11 are covered by unit tests plus the PDF rejection in MT-02.
- **AC-13 (camera on a phone):** the input accepts images and the label says "Wybierz plik / zrób zdjęcie"; the camera picker needs a real mobile device.
- **AC-28 timeout (> 90 s):** not triggerable without a test switch in production code (forbidden by the no-mock guard). The fastest real case took 13 s and the slowest 21 s.

## 6. Verdict

Every PRD flow §4.1–4.7 and every AC group passed manual testing on the real stack, apart from the open items in §4 and §5. The serious accessibility defects found in this pass are fixed and re-verified. **T25 waits for H** to run Lighthouse, check the OpenRouter activity count, and decide F-06 and F-08.
