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
- `matchedRuleType` - `"STATIC" | "SEGMENT" | "PERCENTAGE" | null`
- `error` - populated on technical failures, `null` on successful API responses
- `evaluationId` - present when Smart Insights feedback is enabled for the evaluated flag

## Configuration

```js
const client = new ReleaseAnchor({
  apiKey: "ra_xxx",          // Required - get from the API Keys page
  apiVersion: "v1",          // "v1" | "v2". Default: "v1"
  baseUrl: "https://...",    // Override API base URL. Default: https://api.releaseanchor.com
  timeout: 5000,             // Request timeout in ms. Default: 5000
  defaultValue: false,       // Fallback value on technical errors. Default: false
  strict4xx: false,          // Throw StrictHttpError on unexpected 4xx. Default: false
  logger: console.warn,      // Called on technical errors. Default: console.warn
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

## `reportSuccess(evaluation, options?)`

Reports a successful execution outcome for a previous evaluation. If `evaluation.evaluationId` is missing, the call becomes a no-op.

```js
const evaluation = await client.evaluate("checkout-redesign", "user-123");

await client.reportSuccess(evaluation, {
  latencyMs: 125,
});
```

## `reportFailure(evaluation, options?)`

Reports a failed execution outcome for a previous evaluation. If `evaluation.evaluationId` is missing, the call becomes a no-op.

```js
const evaluation = await client.evaluate("checkout-redesign", "user-123");

await client.reportFailure(evaluation, {
  errorType: "EXECUTION_FAILED",
  latencyMs: 125,
});
```

## `executeWithFeedback(flagKey, userId, handler)`

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

## `executeWithFeedback(flagKey, userIds[], handler)`

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

## Cleanup

Call `destroy()` during app shutdown or test teardown to clear in-flight request deduplication state:

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
