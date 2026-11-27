<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project rules (Hardware Service Decision Copilot)

- Requirements and architecture: [PRD](../docs/PRD.md), [ADRs](../docs/ADR/), [design guidelines](../docs/design-guidelines.md); the root [`AGENTS.md`](../AGENTS.md) workflow applies (TDD, Manual QA, commits, *Delegated workers*).
- Run every npm command in `app/`. Verified commands: `npm run dev`, `npm run build`, `npm start`, `npm run lint`, `npm run typecheck`, `npm test` (Vitest: node + jsdom projects, network and no-mock guards), `npm run test:watch`, `npm run test:e2e` (Playwright on the production build, real stack; it starts the app itself, so port 3000 must be free), `npm run eval:report`.
- `src/server/**` is server-only (each module imports `server-only`); `src/components/**` never imports from `src/server`. Shared code lives in `src/lib/shared` (ADR-000 §4).
- Never commit `.env.local`; never use Eurocash logos, favicon or name (PRD AC-45).
- Manual QA runs on the production build with the Playwright CLI at 360 px and 1440 px; screenshots go to `artifacts/qa/<task>/<run>/` at the repository root (gitignored). See [the last QA report](../docs/qa/poc-manual-qa.md) and the run instructions in [README.md](README.md).
