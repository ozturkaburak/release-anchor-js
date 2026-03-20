# Basic Example

Example usage of `@release-anchor/js` SDK for feature flag evaluation.

## Prerequisites

1. Release Anchor API running (e.g. `cd release-anchor-api && ./gradlew bootRun`)
2. API key from the dashboard
3. A feature flag created in the dashboard

## Run

This example uses the local SDK via `file:../..`. The SDK must be built **before** installing the example, otherwise the linked package won't include the compiled output.

**From repo root:**

```bash
# 1. Install root deps and build SDK
pnpm install
pnpm build

# 2. Install and run example
cd examples/basic
pnpm install
API_KEY=your-api-key FLAG_KEY=your-flag pnpm start
```

Or use the convenience script (run from **repo root**):

```bash
pnpm example:basic
cd examples/basic && API_KEY=your-api-key FLAG_KEY=your-flag pnpm start
```

With local API:

```bash
API_KEY=ra_xxx FLAG_KEY=beta-signup BASE_URL=http://localhost:8080 pnpm start
```

> **Note:** If you change the SDK source, run `pnpm build` from root, then `pnpm install` again in this directory to refresh the linked package.
