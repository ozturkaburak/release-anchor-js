# @release-anchor/js

ReleaseAnchor JavaScript SDK for feature flag evaluation. Works in Node.js and browser environments.

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
  // feature on
}
// result: { value, matchedRuleType, error }
```

`evaluate()` returns an `EvaluateResponse` object with:
- `value` — the boolean result
- `matchedRuleType` — `"STATIC" | "SEGMENT" | "PERCENTAGE" | null`
- `error` — populated only on technical failures (network, timeout, 5xx, etc.), `null` otherwise

Domain outcomes (flag not found, archived, disabled, no match) are returned as normal responses. `defaultValue` applies only to technical errors.

## Configuration

```js
const client = new ReleaseAnchor({
  apiKey: "ra_xxx",          // Required
  apiVersion: "v1",          // "v1" | "v2". Default: "v1"
  baseUrl: "https://...",    // Override API base URL
  timeout: 5000,             // Request timeout in ms. Default: 5000
  cacheTtlMs: 30_000,        // Cache TTL in ms. Set to 0 to disable. Default: 30000
  defaultValue: false,       // Fallback value on technical errors. Default: false
  strict4xx: false,          // Throw StrictHttpError on 4xx (except 401/429). Default: false
  logger: (message, context) => console.warn(message, context), // Default: console.warn
});
```

## evaluate

Evaluates a single flag for a user. Results are cached per `flagKey + userIdentifier` for `cacheTtlMs` milliseconds. Concurrent calls for the same key are deduplicated.

```js
const result = await client.evaluate("dark-mode", "user-123");

// Per-call defaultValue overrides the instance-level default
const result = await client.evaluate("dark-mode", "user-123", true);
```

## evaluateBulk

Evaluates a single flag for multiple users in one request.

```js
const results = await client.evaluateBulk("dark-mode", ["user-1", "user-2"]);
// results: Record<string, EvaluateResponse>

// With per-call defaultValue:
const results = await client.evaluateBulk("dark-mode", ["user-1", "user-2"], true);
```

Missing keys in the server response are filled with a fallback entry. Extra keys from the server are ignored.

## Cache management

```js
client.clearCache();                        // Clear entire cache
client.clearCache("dark-mode");             // Clear all entries for a flag
client.clearCache("dark-mode", "user-123"); // Clear a specific entry
```

## Cleanup

Call `destroy()` during app shutdown or test teardown to clear the cache cleanup interval and avoid timer leaks:

```js
client.destroy();
```

## Error handling

Technical errors (network, timeout, 401, 429, 5xx, parse failure) are caught internally, logged via `logger`, and returned as a fallback response. The `error` field of the response will be populated:

```js
const result = await client.evaluate("dark-mode", "user-123");
if (result.error) {
  // result.error.type: "NETWORK_ERROR" | "TIMEOUT" | "UNAUTHORIZED" |
  //                    "RATE_LIMITED" | "HTTP_ERROR" | "PARSE_ERROR"
  // result.error.message: string
}
```

### strict4xx mode

When `strict4xx: true`, any 4xx response (except 401 and 429) throws a `StrictHttpError` instead of returning a fallback. Useful for surfacing integration bugs in development:

```js
import { ReleaseAnchor, StrictHttpError, TimeoutError } from "@release-anchor/js";

try {
  const result = await client.evaluate("dark-mode", "user-123");
} catch (err) {
  if (err instanceof StrictHttpError) {
    console.error("HTTP error:", err.status);
  }
  if (err instanceof TimeoutError) {
    console.error("Request timed out");
  }
}
```

## Example

A runnable example is in [`examples/basic`](./examples/basic). The SDK must be built before installing the example:

```bash
pnpm install && pnpm build
cd examples/basic && pnpm install
API_KEY=your-api-key FLAG_KEY=your-flag pnpm start
```

