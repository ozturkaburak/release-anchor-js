import { describe, expect, it, vi } from "vitest";
// @ts-expect-error test imports the executable JS example directly for smoke coverage
import { runExampleFlows } from "../../examples/basic/src/index.js";

describe("basic example smoke coverage", () => {
  it("runs the documented public API flows in order", async () => {
    const log = vi.fn();
    const evaluation = {
      value: true,
      matchedRuleType: "STATIC" as const,
      error: null,
      evaluationId: "eval-123",
    };
    const bulkEvaluations = {
      "user-001": evaluation,
      "user-002": {
        value: false,
        matchedRuleType: null,
        error: null,
      },
      "user-003": {
        value: true,
        matchedRuleType: "PERCENTAGE" as const,
        error: null,
        evaluationId: "eval-789",
      },
    };

    const client = {
      evaluate: vi.fn().mockResolvedValue(evaluation),
      evaluateBulk: vi.fn().mockResolvedValue(bulkEvaluations),
      reportSuccess: vi.fn().mockResolvedValue(undefined),
      reportFailure: vi.fn().mockResolvedValue(undefined),
      executeWithFeedback: vi
        .fn()
        .mockImplementationOnce(async (_flagKey, _userId, handler) => handler(evaluation))
        .mockImplementationOnce(async (_flagKey, userIds, handler) => {
          const results: Record<string, boolean> = {};
          for (const userId of userIds) {
            results[userId] = await handler(userId, bulkEvaluations[userId as keyof typeof bulkEvaluations]);
          }
          return results;
        }),
    };

    await runExampleFlows(client, {
      flagKey: "dark-mode",
      baseUrl: "https://api.example.test",
      userId: "user-001",
      userIds: ["user-001", "user-002", "user-003"],
      log,
    });

    expect(client.evaluate).toHaveBeenCalledWith("dark-mode", "user-001");
    expect(client.evaluateBulk).toHaveBeenCalledWith(
      "dark-mode",
      ["user-001", "user-002", "user-003"],
      false
    );
    expect(client.reportSuccess).toHaveBeenCalledWith(evaluation, { latencyMs: 42 });
    expect(client.reportFailure).toHaveBeenCalledWith(evaluation, {
      errorType: "EXAMPLE_FAILURE",
      latencyMs: 84,
    });
    expect(client.executeWithFeedback).toHaveBeenNthCalledWith(
      1,
      "dark-mode",
      "user-001",
      expect.any(Function)
    );
    expect(client.executeWithFeedback).toHaveBeenNthCalledWith(
      2,
      "dark-mode",
      ["user-001", "user-002", "user-003"],
      expect.any(Function)
    );

    const renderedOutput = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(renderedOutput).toContain("1. evaluate(flagKey, userIdentifier) -> EvaluateResponse");
    expect(renderedOutput).toContain("3. reportSuccess(evaluation) / reportFailure(evaluation)");
    expect(renderedOutput).toContain("feedback enabled (evaluationId=eval-123)");
    expect(renderedOutput).toContain("single-user handler received value=true");
    expect(renderedOutput).toContain("bulk handler user=user-002 value=false");
  });

  it("surfaces the no-op feedback message when evaluationId is missing", async () => {
    const log = vi.fn();
    const evaluation = {
      value: false,
      matchedRuleType: null,
      error: null,
    };

    const client = {
      evaluate: vi.fn().mockResolvedValue(evaluation),
      evaluateBulk: vi.fn().mockResolvedValue({ "user-001": evaluation }),
      reportSuccess: vi.fn().mockResolvedValue(undefined),
      reportFailure: vi.fn().mockResolvedValue(undefined),
      executeWithFeedback: vi
        .fn()
        .mockImplementationOnce(async (_flagKey, _userId, handler) => handler(evaluation))
        .mockImplementationOnce(async (_flagKey, userIds, handler) => {
          const results: Record<string, boolean> = {};
          for (const userId of userIds) {
            results[userId] = await handler(userId, evaluation);
          }
          return results;
        }),
    };

    await runExampleFlows(client, {
      flagKey: "dark-mode",
      userId: "user-001",
      userIds: ["user-001"],
      log,
    });

    const renderedOutput = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(renderedOutput).toContain("feedback skipped (evaluationId missing, call is a no-op)");
  });
});
