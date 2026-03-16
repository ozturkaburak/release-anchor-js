/**
 * ReleaseAnchor Example - Evaluate feature flags using @release-anchor/js SDK
 *
 * Prerequisites:
 *   1. Start the API: cd release-anchor-api && ./gradlew bootRun
 *   2. Create a flag in the dashboard and get your API key
 *
 * Run from repo root:
 *   cd examples/basic && pnpm install && API_KEY=your-key FLAG_KEY=your-flag pnpm start
 *
 * Or with local API:
 *   API_KEY=... BASE_URL=http://localhost:8080 pnpm start
 */

import { ReleaseAnchor } from "@release-anchor/js";

const API_KEY = process.env.API_KEY;
const FLAG_KEY = process.env.FLAG_KEY || "dark-mode";
const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const USER_ID = process.env.USER_ID || "user-001";

if (!API_KEY) {
  console.error("Error: API_KEY environment variable is required.");
  console.error("Example: API_KEY=ra_xxx FLAG_KEY=dark-mode pnpm start");
  process.exit(1);
}

const client = new ReleaseAnchor({
  apiKey: API_KEY,
  baseUrl: BASE_URL,
  defaultValue: false,
});

async function main() {
  console.log("ReleaseAnchor Evaluate Example\n");
  console.log("Config:", { FLAG_KEY, BASE_URL, USER_ID });
  console.log("");

  // Single evaluation (returns full EvaluateResponse)
  console.log("1. evaluate(flagKey, userIdentifier) -> EvaluateResponse");
  const response = await client.evaluate(FLAG_KEY, USER_ID);
  console.log("   Result:", JSON.stringify(response, null, 2));
  if (response.error) {
    console.log("   Error:", response.error.type, "-", response.error.message);
  } else {
    console.log("   value:", response.value);
  }
  console.log("");

  // Bulk evaluation
  console.log("2. evaluateBulk(flagKey, userIdentifiers) -> Record<string, EvaluateResponse>");
  const bulkResult = await client.evaluateBulk(FLAG_KEY, [
    "user-001",
    "user-002",
    "user-003",
  ]);
  console.log("   Result:", JSON.stringify(bulkResult, null, 2));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
