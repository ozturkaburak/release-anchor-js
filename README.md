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
// result: { value: boolean, matchedRuleType: string | null, error: object | null }
```

`evaluate()` returns an `EvaluateResponse` object with:
- `value` — the boolean result
- `matchedRuleType` — `"STATIC" | "SEGMENT" | "PERCENTAGE" | null`
- `error` — populated on technical failures (network, timeout, etc.), `null` on success

## Configuration

```js
const client = new ReleaseAnchor({
  apiKey: "ra_xxx",          // Required — get from the API Keys page
  apiVersion: "v1",          // "v1" | "v2". Default: "v1"
  baseUrl: "https://...",    // Override API base URL. Default: https://api.releaseanchor.com
  timeout: 5000,             // Request timeout in ms. Default: 5000
  cacheTtlMs: 30_000,        // In-memory cache TTL in ms. Set to 0 to disable. Default: 30000
  defaultValue: false,       // Fallback value on technical errors. Default: false
  strict4xx: false,          // Throw StrictHttpError on unexpected 4xx. Default: false
  logger: console.warn,      // Called on technical errors. Default: console.warn
});
```

## `evaluate(flagKey, userIdentifier, defaultValue?)`

Evaluates a single flag for a user. Results are cached per `flagKey + userIdentifier` for `cacheTtlMs` milliseconds. Concurrent calls for the same key are deduplicated — only one HTTP request is made.

```js
const result = await client.evaluate("dark-mode", "user-123");

// Per-call defaultValue overrides the instance-level default
const result = await client.evaluate("dark-mode", "user-123", true);
```

## `evaluateBulk(flagKey, userIdentifiers[], defaultValue?)`

Evaluates a single flag for multiple users in one request.

```js
const results = await client.evaluateBulk("dark-mode", ["user-1", "user-2"]);
// results: Record<string, EvaluateResponse>

for (const [userId, result] of Object.entries(results)) {
  if (result.value) console.log(`${userId}: feature on`);
}
```

Missing keys in the server response are filled with a fallback entry. Extra keys are ignored.

## Cache management

```js
client.clearCache();                        // Clear entire cache
client.clearCache("dark-mode");             // Clear all entries for a flag
client.clearCache("dark-mode", "user-123"); // Clear a specific entry
```

## Cleanup

Call `destroy()` during app shutdown or test teardown to stop the background cache cleanup timer:

```js
client.destroy();
// afterAll(() => client.destroy()); // in test suites
```

## Error handling

Technical errors (network, timeout, 401, 429, 5xx, parse failure) are caught internally, logged via `logger`, and returned as a fallback response — the SDK never throws by default.

```js
const result = await client.evaluate("dark-mode", "user-123");
if (result.error) {
  // result.error.type: "NETWORK_ERROR" | "TIMEOUT" | "UNAUTHORIZED" |
  //                    "RATE_LIMITED" | "HTTP_ERROR" | "PARSE_ERROR"
  // result.error.message: string
}
// result.value is always safe to use — it will be defaultValue on error
```

### strict4xx (development helper)

Set `strict4xx: true` to throw `StrictHttpError` on unexpected 4xx responses instead of silently falling back. Useful for catching misconfiguration early:

```js
import { ReleaseAnchor, StrictHttpError } from "@release-anchor/js";

const client = new ReleaseAnchor({ apiKey: "...", strict4xx: true });

try {
  const result = await client.evaluate("dark-mode", "user-123");
} catch (err) {
  if (err instanceof StrictHttpError) {
    console.error("Unexpected HTTP error:", err.status);
  }
}
```

> Timeouts are never thrown — detect them via `result.error.type === "TIMEOUT"`.

## TypeScript

The SDK ships with full TypeScript types — no `@types` package needed.

```ts
import { ReleaseAnchor, type EvaluateResponse, StrictHttpError } from "@release-anchor/js";

const client = new ReleaseAnchor({ apiKey: process.env.RELEASE_ANCHOR_KEY! });
const result: EvaluateResponse = await client.evaluate("my-flag", userId);
```

## License

MIT — see [LICENSE](./LICENSE)
