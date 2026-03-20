# @release-anchor/js

ReleaseAnchor JavaScript SDK for feature flag evaluation. Works in Node.js and browser environments.

Standalone package — works in Node.js and browser, publishable to npm.

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
// result: { value, matchedRuleType?, error? }
```

`evaluate()` returns an `EvaluateResponse` object with `value`, optional `matchedRuleType`, and optional `error` (on technical failures). Domain outcomes (flag not found, archived, disabled, no match) are returned as normal responses; `defaultValue` is used only for technical errors (network, timeout, 5xx, etc.).

Each flag can have its own default value via the optional 3rd parameter:

```js
// dark-mode: fallback to true on error
const r1 = await client.evaluate("dark-mode", "user-123", true);

// beta-signup: fallback to false on error
const r2 = await client.evaluate("beta-signup", "user-123", false);
```

### evaluateBulk

```js
const results = await client.evaluateBulk("dark-mode", ["user-1", "user-2"]);
// results: Record<string, EvaluateResponse>

// With per-flag default value:
const results = await client.evaluateBulk("dark-mode", ["user-1", "user-2"], true);
```

### Optional logger

```js
const client = new ReleaseAnchor({
  apiKey: "...",
  logger: (level, message, meta) => console.log(level, message, meta),
});
```

## Example

A runnable example is in [`examples/basic`](./examples/basic):

```bash
cd examples/basic
pnpm install
API_KEY=your-api-key FLAG_KEY=your-flag pnpm start
```

With local API: `BASE_URL=http://localhost:8080 API_KEY=... pnpm start`

## Build

```bash
cd release-anchor-js
pnpm install
pnpm build
```

## Documentation

Full documentation: http://localhost:3001/sdks/javascript
