# Basic Example

Example usage of `@release-anchor/js` SDK for feature flag evaluation.

## Prerequisites

1. Release Anchor API running (e.g. `cd release-anchor-api && ./gradlew bootRun`)
2. API key from the dashboard
3. A feature flag created in the dashboard

## Run

```bash
pnpm install
API_KEY=your-api-key FLAG_KEY=your-flag pnpm start
```

With local API:

```bash
API_KEY=ra_xxx FLAG_KEY=beta-signup BASE_URL=http://localhost:8080 pnpm start
```
