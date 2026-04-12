# Basic Example

Example usage of `@release-anchor/js` SDK covering the public API surface:

- `evaluate()`
- `evaluateBulk()`
- `reportSuccess()`
- `reportFailure()`
- `executeWithFeedback()` for single-user flows
- `executeWithFeedback()` for bulk-user flows

The script logs whether feedback calls are active for the returned evaluation or skipped because `evaluationId` is absent.

## Prerequisites

1. Release Anchor API running, for example `cd release-anchor-api && ./gradlew bootRun`
2. API key from the dashboard
3. A feature flag created in the dashboard

## Run

This example uses the local SDK via `file:../..`. Build the SDK before installing the example so the linked package includes fresh compiled output.

From repo root:

```bash
pnpm install
pnpm build

cd examples/basic
pnpm install
API_KEY=your-api-key FLAG_KEY=your-flag pnpm start
```

Or use the convenience script from repo root:

```bash
pnpm example:basic
cd examples/basic && API_KEY=your-api-key FLAG_KEY=your-flag pnpm start
```

With a local API:

```bash
API_KEY=ra_xxx FLAG_KEY=beta-signup BASE_URL=http://localhost:8080 pnpm start
```

Optional environment variables:

- `USER_ID` - single-user example identifier. Default: `user-001`
- `FLAG_KEY` - flag key to evaluate. Default: `dark-mode`
- `BASE_URL` - API base URL. Default: `http://localhost:8080`

## What the script does

When you run `pnpm start`, it executes these flows in order:

1. Evaluates a single user with `evaluate()`
2. Evaluates multiple users with `evaluateBulk()`
3. Sends manual feedback with `reportSuccess()` and `reportFailure()`
4. Runs a single-user execution flow with `executeWithFeedback()`
5. Runs a bulk-user execution flow with `executeWithFeedback()`

If you update the SDK source, run `pnpm build` from the repo root and `pnpm install` again in this directory to refresh the linked package.
