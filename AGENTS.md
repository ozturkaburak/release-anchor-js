# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build CJS + ESM + type declarations via tsup
pnpm dev              # Build in watch mode
pnpm test             # Run tests once (vitest run)
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage report
```

Run a single test file:
```bash
pnpm vitest run src/__tests__/index.test.ts
```

Run a single test by name pattern:
```bash
pnpm vitest run --reporter=verbose -t "cache"
```

## Architecture

The entire SDK lives in a single file: `src/index.ts`. It exports the `ReleaseAnchor` class plus `EvaluateResponse`, `ReleaseAnchorConfig`, `StrictHttpError`, `TimeoutError`, and `ApiVersion`.

**Design principle:** Transport/fallback layer only. The SDK passes backend responses through unchanged. It never interprets domain outcomes (flag not found, disabled, no match) — only technical errors (network, timeout, 401, 429, 5xx, parse failure) trigger fallback.

**Key behaviors:**

- `evaluate(flagKey, userIdentifier, defaultValue?)` — single-flag evaluation with in-flight deduplication per `flagKey:userIdentifier:fallbackValue`.
- `evaluateBulk(flagKey, userIdentifiers[], defaultValue?)` — batch evaluation, also deduplicated.
- `destroy()` clears in-flight deduplication state. Must be called in tests (and app shutdown).
- `strict4xx=true` makes 4xx responses (except 401/429) throw `StrictHttpError` instead of returning fallback — useful for surfacing integration bugs.
- `executeWithFeedback(flagKey, userId, handler)` — single-user: evaluates, runs handler, auto-reports success/failure via `POST /v1/feedback/report`. Handler return `true` = success, `false` = failure (EXECUTION_FAILED), throw = failure (UNKNOWN) + rethrow.
- `executeWithFeedback(flagKey, userIds[], handler)` — bulk: evaluates all users, runs handler per-user (non-fail-fast), batches all feedback in one `POST /v1/feedback/bulk`. Empty array returns `{}` immediately.
- `reportSuccess(evaluation, options?)` / `reportFailure(evaluation, options?)` — manual feedback reporting. No-op if `evaluation` has no `evaluationId` or is null/undefined. All network errors swallowed silently.
- Feedback endpoints: `POST /{apiVersion}/feedback/report` (single), `POST /{apiVersion}/feedback/bulk` (batch). Both use same auth as evaluate.

**Build output:** `dist/index.js` (CJS), `dist/index.mjs` (ESM), `dist/index.d.ts` — dual-format via tsup.

**Tests:** `src/__tests__/index.test.ts` uses vitest with `vi.stubGlobal("fetch", fetchMock)`. Always call `client.destroy()` in `afterEach` to clear in-flight request deduplication state. Tests use `TEST_BASE_URL = "https://test-api.example.com"` and helper functions `createJsonResponse` / `createTextResponse`.

**Releases:** Managed by `semantic-release` (config in `.releaserc.json`). Conventional commits on `main` trigger automated changelog and GitHub release. `npmPublish` is currently set to `true`.

## Active Technologies
- TypeScript 5.x + None (zero runtime deps — Principle II) (20260409-cache-invalidation-strategy)
- In-memory `Map` cache (existing) (20260409-cache-invalidation-strategy)
- Feedback reporting: `executeWithFeedback`, `reportSuccess`, `reportFailure` (002-feedback-api)
- Backend contracts: `POST /v1/feedback/report`, `POST /v1/feedback/bulk` (002-feedback-api)

## Recent Changes
- 20260409-cache-invalidation-strategy: Added TypeScript 5.x + None (zero runtime deps — Principle II)
- 002-feedback-api: Planned feedback/Smart Insights API — evaluationId in evaluate responses, single + bulk feedback endpoints
