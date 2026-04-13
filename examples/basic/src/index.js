/**
 * ReleaseAnchor Example - Evaluate flags and report execution feedback.
 *
 * Prerequisites:
 *   1. Get an API key from the dashboard
 *   2. Create a flag in the dashboard
 *
 * Run from repo root:
 *   cd examples/basic && pnpm install && API_KEY=your-key FLAG_KEY=your-flag pnpm start
 */

import { ReleaseAnchor } from "@release-anchor/js";
import { pathToFileURL } from "node:url";

const API_KEY = process.env.API_KEY;
const FLAG_KEY = process.env.FLAG_KEY || "dark-mode";
const BASE_URL = process.env.BASE_URL;
const USER_ID = process.env.USER_ID || "user-001";
const BULK_USER_IDS = ["user-001", "user-002", "user-003"];

function createConsole(log) {
  return {
    section(title) {
      log(`${title}\n`);
    },
    step(title) {
      log(title);
    },
    detail(label, value) {
      log(`   ${label}:`, value);
    },
    note(message) {
      log(`   ${message}`);
    },
    blank() {
      log("");
    },
  };
}

function describeFeedbackAvailability(evaluation) {
  return evaluation?.evaluationId
    ? `feedback enabled (evaluationId=${evaluation.evaluationId})`
    : "feedback skipped (evaluationId missing, call is a no-op)";
}

export async function runExampleFlows(client, options = {}) {
  const {
    flagKey = FLAG_KEY,
    userId = USER_ID,
    baseUrl = BASE_URL,
    userIds = BULK_USER_IDS,
    log = console.log,
  } = options;
  const output = createConsole(log);

  output.section("ReleaseAnchor Public API Example");
  output.detail("Config", { flagKey, baseUrl, userId, userIds });
  output.blank();

  output.step("1. evaluate(flagKey, userIdentifier) -> EvaluateResponse");
  const evaluation = await client.evaluate(flagKey, userId);
  output.detail("Result", JSON.stringify(evaluation, null, 2));
  output.note(describeFeedbackAvailability(evaluation));
  output.blank();

  output.step("2. evaluateBulk(flagKey, userIdentifiers, defaultValue?) -> Record<string, EvaluateResponse>");
  const bulkResult = await client.evaluateBulk(flagKey, userIds, false);
  output.detail("Result", JSON.stringify(bulkResult, null, 2));
  output.blank();

  output.step("3. reportSuccess(evaluation) / reportFailure(evaluation)");
  await client.reportSuccess(evaluation, { latencyMs: 42 });
  output.note(`reportSuccess: ${describeFeedbackAvailability(evaluation)}`);
  await client.reportFailure(evaluation, {
    errorType: "EXAMPLE_FAILURE",
    latencyMs: 84,
  });
  output.note(`reportFailure: ${describeFeedbackAvailability(evaluation)}`);
  output.blank();

  output.step("4. executeWithFeedback(flagKey, userId, handler) -> boolean");
  const singleExecutionResult = await client.executeWithFeedback(flagKey, userId, async (result) => {
    output.note(`single-user handler received value=${result.value}`);
    return result.value;
  });
  output.detail("Result", singleExecutionResult);
  output.blank();

  output.step("5. executeWithFeedback(flagKey, userIds[], handler) -> Record<string, boolean>");
  const bulkExecutionResult = await client.executeWithFeedback(
    flagKey,
    userIds,
    async (currentUserId, result) => {
      output.note(`bulk handler user=${currentUserId} value=${result.value}`);
      return result.value;
    }
  );
  output.detail("Result", JSON.stringify(bulkExecutionResult, null, 2));
  output.blank();
}

async function main() {
  if (!API_KEY) {
    console.error("Error: API_KEY environment variable is required.");
    console.error("Example: API_KEY=ra_xxx FLAG_KEY=dark-mode pnpm start");
    process.exit(1);
  }

  const client = new ReleaseAnchor({
    apiKey: API_KEY,
    defaultValue: false,
    ...(BASE_URL ? { baseUrl: BASE_URL } : {}),
  });

  try {
    await runExampleFlows(client, {
      flagKey: FLAG_KEY,
      userId: USER_ID,
      baseUrl: BASE_URL,
      userIds: BULK_USER_IDS,
    });
  } finally {
    client.destroy();
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl && import.meta.url === entryUrl) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
