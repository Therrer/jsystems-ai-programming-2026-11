# App

This folder will contain the application built during the course.

## How to start

The app is scaffolded live during the course through a structured process:

1. **Research** — use agents to research and validate the project idea
2. **PRD** — generate a Product Requirements Document (`../docs/PRD.md`)
3. **ADR** — generate Architecture Decision Records (`../docs/ADR/`) to choose the tech stack
4. **Scaffold** — use the chosen boilerplate (`create-next-app`, AI SDK starter, Mastra, etc.)
5. **Implement** — build features with agents using TDD

## Checklist

Use this checklist during scaffolding. Some items are provided by the boilerplate (e.g. `create-next-app` ships `tsconfig.json`, ESLint config). Others you add explicitly.

### Project setup
- [x] Choose framework (Next.js, Express+Vite, Mastra, other) — record in ADR
- [x] Initialize project (e.g. `npx create-next-app@latest` or equivalent)
- [x] TypeScript config (`tsconfig.json`)
- [x] Package manager chosen (npm / pnpm / bun)

### Code quality
- [x] ESLint config (`eslint.config.js`)
- [ ] Prettier config (`.prettierrc`, `.prettierignore`)
- [ ] `.editorconfig` (optional but recommended)

### Testing
- [x] Unit/integration test runner (Vitest / Jest)
- [x] E2E test runner (Playwright)
- [x] Test setup file (e.g. `test-setup.ts` with Testing Library matchers)

### Environment
- [x] `.env.example` with required env vars (API keys, ports)
- [x] `.env` created locally (gitignored)
- [x] `.gitignore` (node_modules, .env, build output, etc.)

### AI integration
- [x] Vercel AI SDK (`ai` package) or equivalent
- [x] API route / endpoint for chat
- [x] Model configuration (provider, model name, API key from env)

### Design
- [x] Design tokens (`../assets/design-tokens.json`)
- [x] Tailwind CSS or equivalent
- [x] Logo and favicon (`../assets/`)
- [x] Design system doc (`../docs/design-guidelines.md`)

### Documentation
- [x] PRD (`../docs/PRD.md`)
- [x] ADRs (`../docs/ADR/`)
- [x] AGENTS.md in `app/` with stack-specific rules

## Notes

- Don't create config files manually if the boilerplate provides them — it leads to conflicts.
- Let the agent research and recommend the right boilerplate based on the ADR decisions.
- Keep this folder organized: separate routes, components, domain logic, and tests.

## Hardware Service Decision Copilot — running the app

Next.js 16 (App Router, TypeScript strict) scaffolded with `create-next-app` per [ADR-000 §11](../docs/ADR/000-main-architecture.md#11-project-initialization-from-the-empty-app-folder). Requirements: [PRD](../docs/PRD.md); architecture: [ADRs](../docs/ADR/); implementation plan: [docs/plans](../docs/plans/hardware-service-copilot-poc-implementation-plan.md); manual QA report: [docs/qa](../docs/qa/poc-manual-qa.md). Run all commands in `app/` (Node.js 22 or newer, npm).

### Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server on <http://localhost:3000> |
| `npm run build` / `npm start` | Production build / start it |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm test` / `npm run test:watch` | Unit, integration and component tests (Vitest; external network blocked) |
| `npm run test:e2e` | E2E on the production build with the real stack (Playwright builds and starts the app itself, so port 3000 must be free). Real OpenRouter calls, about $0.015 per run. |
| `npm run eval:report [path] [--json]` | Luna-vs-vision agreement report from the evaluation log (default path: `EVAL_LOG_PATH`, then `.data/eval.jsonl`) |
| `node scripts/capture-openrouter.mjs`, `node scripts/capture-app.mjs [label]` | Record real responses into `tests/fixtures/recorded/` (capture policy in the root `AGENTS.md`). Real API calls; run only when a mock needs refreshing. |

### Environment

Copy `.env.example` to `.env.local` (gitignored, never commit it) and set the key. Variables per [ADR-000 §7](../docs/ADR/000-main-architecture.md):

| Variable | Default | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | — (required) | OpenRouter key; a missing key is named in the startup error |
| `LLM_MODEL` | `openai/gpt-6-luna` | Model for every LLM stage |
| `VISION_MODEL`, `DECISION_MODEL`, `CHAT_MODEL` | `LLM_MODEL` | Per-stage overrides |
| `DECISIONS_MODEL` / `DECISIONS_ENABLED` / `DECISIONS_CONFIDENCE_THRESHOLD` | `openai/gpt-6-luna-decisions` / `true` / `0.80` | Luna Decisions pre-check (alpha API); set `DECISIONS_ENABLED=false` if it fails |
| `POLICIES_DIR` | `../docs/policies` | Return and complaint terms injected into the prompts |
| `CASE_TTL_MINUTES` | `120` | In-memory case lifetime; a restart also clears every case |
| `EVAL_LOG_PATH` | `.data/eval.jsonl` | One JSON line per decided case (no images, no free text) |

`GET /api/health` reports the loaded policy counts and model ids, never secrets.

### Code layout

| Path | Contents |
|---|---|
| `src/app/` | Page, layout, `icon.svg` and API routes: `api/cases`, `api/cases/[caseId]`, `api/cases/[caseId]/decision`, `api/chat`, `api/health` ([ADR-002](../docs/ADR/002-backend-api.md)) |
| `src/server/` | Server-only code: `ai/` (Luna, vision, decision, chat, prompts, `updateDecision` tool), `cases/` (store and service), `guardrails/`, `image/`, `policies/`, env, errors, log, eval log ([ADR-001](../docs/ADR/001-ai-pipeline.md)) |
| `src/components/` | `case-form/`, `case-chat/`, the header, shadcn `ui/` and vendored AI Elements `ai-elements/` ([ADR-003](../docs/ADR/003-frontend.md)) |
| `src/lib/shared/` | Zod schemas, date helpers and every Polish UI string (`strings/`), shared by client and server |
| `src/lib/client/` | Client flow reducer, API client and chat transport |

`src/server/**` imports `server-only`, and `src/components/**` never imports from `src/server`.

### Tests

| Folder | Kind | Mocks |
|---|---|---|
| `tests/unit/` | Unit (incl. the network guard and the no-mock guard for `src/`) | All dependencies |
| `tests/integration/` | AI stages, service and routes | Only the external LLM API, always from `tests/fixtures/recorded/` captures |
| `tests/component/` | React components in jsdom | Fetch answered from recorded API captures |
| `tests/e2e/` | Playwright, real stack | None |

Upload tests use only the real photos in [`assets/example-images/`](../assets/example-images/README.md).

### Manual QA

Start the production build (`npm run build && npm start`) and walk the flows with the Playwright CLI at 360 px and 1440 px, as the root `AGENTS.md` requires. Keep screenshots in `artifacts/qa/<task>/<run>/` at the repository root (gitignored). The last full pass and its open findings are in [docs/qa/poc-manual-qa.md](../docs/qa/poc-manual-qa.md).
