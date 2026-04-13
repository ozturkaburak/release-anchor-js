<div align="center">
  <img src="https://raw.githubusercontent.com/ozturkaburak/release-anchor-js/main/assets/logo.svg" alt="ReleaseAnchor" width="160" />
  <br /><br />

  [![npm](https://img.shields.io/npm/v/@release-anchor/js?color=6C63FF&label=npm)](https://www.npmjs.com/package/@release-anchor/js)
  [![license](https://img.shields.io/npm/l/@release-anchor/js)](https://github.com/ozturkaburak/release-anchor-js/blob/main/LICENSE)
  [![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178C6)](https://www.typescriptlang.org/)
  [![bundle size](https://img.shields.io/bundlephobia/minzip/@release-anchor/js?label=minzipped)](https://bundlephobia.com/package/@release-anchor/js)

  **JavaScript / Node.js SDK for [ReleaseAnchor](https://releaseanchor.com) feature flags.**<br/>
  Works in Node.js and browser environments. Zero dependencies.

  [Documentation](https://docs.releaseanchor.com/sdks/javascript) · [npm](https://www.npmjs.com/package/@release-anchor/js) · [releaseanchor.com](https://releaseanchor.com)
</div>

---

## Installation

```bash
npm install @release-anchor/js
# or
pnpm add @release-anchor/js
# or
yarn add @release-anchor/js
```

## First integration

For a first SDK integration, set up the product side first:

- Sign in to the [Release Anchor dashboard](https://app.releaseanchor.com/login)
- Create a new project and its environments
- Create an environment API key
- Create a flag you want to evaluate

> Note: If you want to use Smart Insights, enable it for the flag in the dashboard before integrating the Smart Insights methods below. See [Smart Insights docs](https://docs.releaseanchor.com/features/smart-insights).

## Quick start

```js
import { ReleaseAnchor } from "@release-anchor/js";

const client = new ReleaseAnchor({
  apiKey: process.env.RELEASE_ANCHOR_KEY,
});

const result = await client.evaluate("dark-mode", "user-123");
if (result.value) {
  // feature is on for this user
}
```

`evaluate()` returns an `EvaluateResponse` object with:
- `value` - the boolean result
- `matchedRuleType` - `"STATIC" | "SEGMENT" | "PERCENTAGE" | null` in canonical uppercase
- `error` - populated on technical failures, `null` on successful API responses
- `evaluationId` - present when Smart Insights feedback is enabled for the evaluated flag

## Primary API surface

Most integrations only need these two methods:

- `evaluate(flagKey, userIdentifier, defaultValue?)`
- `evaluateBulk(flagKey, userIdentifiers[], defaultValue?)`

## Configuration

```js
const client = new ReleaseAnchor({
  apiKey: "ra_xxx",          // Required - get from the API Keys page
  apiVersion: "v1",          // "v1" | "v2"
  baseUrl: "https://...",    // Override API base URL
  timeout: 5000,             // Request timeout in ms
  defaultValue: false,       // Fallback value on technical errors
  strict4xx: false,          // Throw StrictHttpError on unexpected 4xx
  logger: console.warn,      // Called on technical errors
});
```

## `evaluate(flagKey, userIdentifier, defaultValue?)`

Evaluates a single flag for a user. Concurrent calls for the same `flagKey + userIdentifier + defaultValue` are deduplicated while the request is in flight.

```js
const result = await client.evaluate("dark-mode", "user-123");

// Per-call defaultValue overrides the instance-level default
const fallbackResult = await client.evaluate("dark-mode", "user-123", true);
```

## `evaluateBulk(flagKey, userIdentifiers[], defaultValue?)`

Evaluates a single flag for multiple users in one request.

```js
const results = await client.evaluateBulk("dark-mode", ["user-1", "user-2"]);

for (const [userId, result] of Object.entries(results)) {
  if (result.value) console.log(`${userId}: feature on`);
}
```

Missing keys in the server response are filled with a fallback entry. Extra keys are ignored.

## Smart Insights

Use the Smart Insights helpers when you want the SDK to evaluate a flag and also report execution outcomes.
Smart Insights lets Release Anchor connect evaluation events with real execution outcomes such as success, failure, and latency. Use it when you want feedback data in the dashboard instead of evaluation-only visibility.
This is useful when you want to understand not just who matched a flag, but whether the experience actually worked after the flag was served.

### `executeWithFeedback(flagKey, userId, handler)`

- Calls `evaluate(...)` first
- Runs your handler with the evaluation result
- Calls `reportSuccess(...)` or `reportFailure(...)` automatically when `evaluationId` is present

Single-user helper that evaluates the flag, runs your handler, and automatically reports success or failure when `evaluationId` is present.

```js
const result = await client.executeWithFeedback(
  "checkout-redesign",
  "user-123",
  async (evaluation) => {
    if (!evaluation.value) return false;
    return runCheckoutExperience();
  }
);
```

Handler semantics:
- return `true` -> reports success
- return `false` -> reports failure with `EXECUTION_FAILED`
- throw -> reports failure with `UNKNOWN` and rethrows the original error

### `executeWithFeedback(flagKey, userIds[], handler)`

- Calls `evaluateBulk(...)` first
- Runs the handler independently for each user
- Sends a single bulk feedback request after processing users with `evaluationId`

Bulk helper that evaluates all users, runs the handler for each user independently, and sends a single batched feedback request at the end.

```js
const results = await client.executeWithFeedback(
  "checkout-redesign",
  ["user-1", "user-2", "user-3"],
  async (userId, evaluation) => {
    if (!evaluation.value) return false;
    return runExperienceForUser(userId);
  }
);
```

In bulk mode, handler errors do not stop the rest of the users from being processed. The returned value is `Record<string, boolean>`.

### Manual reporting

Use these only when you want to report execution results manually instead of relying on `executeWithFeedback(...)`.

### `reportSuccess(evaluation, options?)`

Reports a successful execution outcome for a previous evaluation. If `evaluation.evaluationId` is missing, the call becomes a no-op.

```js
const evaluation = await client.evaluate("checkout-redesign", "user-123");

await client.reportSuccess(evaluation, {
  latencyMs: 125,
});
```

### `reportFailure(evaluation, options?)`

Reports a failed execution outcome for a previous evaluation. If `evaluation.evaluationId` is missing, the call becomes a no-op.

```js
const evaluation = await client.evaluate("checkout-redesign", "user-123");

await client.reportFailure(evaluation, {
  errorType: "EXECUTION_FAILED",
  latencyMs: 125,
});
```

## Cleanup

Call `destroy()` during test teardown or application shutdown if you want to clear in-flight request deduplication state explicitly:

```js
client.destroy();
// afterEach(() => client.destroy()); // in test suites
```

## Error handling

Technical errors like network failures, timeouts, `401`, `429`, `5xx`, or response parse failures are caught internally, logged via `logger`, and returned as fallback responses.

```js
const result = await client.evaluate("dark-mode", "user-123");
if (result.error) {
  // result.error.type: "NETWORK_ERROR" | "TIMEOUT" | "UNAUTHORIZED" |
  //                    "RATE_LIMITED" | "HTTP_ERROR" | "PARSE_ERROR"
  // result.error.message: string
}
```

`reportSuccess()`, `reportFailure()`, and the feedback side of `executeWithFeedback()` are best-effort. They swallow network and HTTP failures so feedback delivery never breaks your application flow.

### strict4xx

Set `strict4xx: true` to throw `StrictHttpError` on unexpected `4xx` responses instead of silently falling back. This is useful for catching integration issues during development.

```js
import { ReleaseAnchor, StrictHttpError } from "@release-anchor/js";

const client = new ReleaseAnchor({ apiKey: "...", strict4xx: true });

try {
  await client.evaluate("dark-mode", "user-123");
} catch (err) {
  if (err instanceof StrictHttpError) {
    console.error("Unexpected HTTP error:", err.status);
  }
}
```

Timeouts are still returned as fallback responses, not thrown.

## TypeScript

The SDK ships with full TypeScript types - no `@types` package needed.

```ts
import {
  ReleaseAnchor,
  type EvaluateResponse,
  StrictHttpError,
} from "@release-anchor/js";

const client = new ReleaseAnchor({ apiKey: process.env.RELEASE_ANCHOR_KEY! });
const result: EvaluateResponse = await client.evaluate("my-flag", userId);
```

## License

MIT - see [LICENSE](./LICENSE) 
