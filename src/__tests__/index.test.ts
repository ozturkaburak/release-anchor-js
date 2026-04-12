import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReleaseAnchor, StrictHttpError, TimeoutError } from "../index";
import pkg from "../../package.json";

const TEST_BASE_URL = "https://test-api.example.com";

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createTextResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain" },
  });
}

describe("ReleaseAnchor", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("constructor", () => {
    it("throws when apiKey is missing", () => {
      expect(() => new ReleaseAnchor({ apiKey: "" })).toThrow(
        "ReleaseAnchor: apiKey is required"
      );
    });

    it("throws when apiKey is undefined", () => {
      expect(
        () => new ReleaseAnchor({ apiKey: undefined as unknown as string })
      ).toThrow("ReleaseAnchor: apiKey is required");
    });

    it("throws when apiKey is only whitespace", () => {
      expect(() => new ReleaseAnchor({ apiKey: "   " })).toThrow(
        "ReleaseAnchor: apiKey is required"
      );
    });

    it("creates client with valid config", () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: true, matchedRuleType: "STATIC", error: null })
      );
      const client = new ReleaseAnchor({
        apiKey: "test-key",
        baseUrl: TEST_BASE_URL,
      });
      expect(client).toBeInstanceOf(ReleaseAnchor);
    });

    it("trims apiKey", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: true, matchedRuleType: null, error: null })
      );
      const client = new ReleaseAnchor({
        apiKey: "  test-key  ",
        baseUrl: TEST_BASE_URL,
      });
      await client.evaluate("flag", "user");
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "ApiKey test-key",
          }),
        })
      );
    });

    it("strips trailing slash from baseUrl", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: false, matchedRuleType: null, error: null })
      );
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: `${TEST_BASE_URL}/`,
      });
      await client.evaluate("flag", "user");
      expect(fetchMock).toHaveBeenCalledWith(
        `${TEST_BASE_URL}/v1/evaluate`,
        expect.any(Object)
      );
    });

    it("uses apiVersion in request path (default v1)", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: true, matchedRuleType: null, error: null })
      );
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });
      await client.evaluate("flag", "user");
      expect(fetchMock).toHaveBeenCalledWith(
        `${TEST_BASE_URL}/v1/evaluate`,
        expect.any(Object)
      );
    });

    it("uses apiVersion v2 when provided", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: true, matchedRuleType: null, error: null })
      );
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        apiVersion: "v2",
      });
      await client.evaluate("flag", "user");
      expect(fetchMock).toHaveBeenCalledWith(
        `${TEST_BASE_URL}/v2/evaluate`,
        expect.any(Object)
      );
    });

    it("uses DEFAULT_BASE_URL when baseUrl not provided", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: true, matchedRuleType: null, error: null })
      );
      const client = new ReleaseAnchor({ apiKey: "key" });
      await client.evaluate("flag", "user");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.releaseanchor.com/v1/evaluate",
        expect.any(Object)
      );
    });

    it("uses default logger when logger not provided", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 401));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });
      await client.evaluate("flag", "user");

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("uses custom timeout when provided", async () => {
      fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          if (signal) {
            signal.addEventListener("abort", () => {
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            });
          } else {
            reject(new Error("no signal"));
          }
        });
      });
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        timeout: 1,
        defaultValue: false,
      });
      const result = await client.evaluate("flag", "user");

      expect(result.error?.type).toBe("TIMEOUT");
      expect(result.value).toBe(false);
    });

    it("throws when timeout is 0", () => {
      expect(
        () => new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL, timeout: 0 })
      ).toThrow("timeout must be a positive number");
    });

    it("throws when timeout is negative", () => {
      expect(
        () => new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL, timeout: -1 })
      ).toThrow("timeout must be a positive number");
    });

    it("clears timeout on successful fetch (covers finally block)", async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: true, matchedRuleType: null, error: null })
      );

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });
      const result = await client.evaluate("flag", "user");

      expect(result.value).toBe(true);
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe("evaluate", () => {
    it("returns backend response on 200", async () => {
      const response = {
        value: true,
        matchedRuleType: "PERCENTAGE" as const,
        error: null,
      };
      fetchMock.mockResolvedValueOnce(createJsonResponse(response));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });
      const result = await client.evaluate("dark-mode", "user-123");

      expect(result).toEqual(response);
      expect(fetchMock).toHaveBeenCalledWith(
        `${TEST_BASE_URL}/v1/evaluate`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            flagKey: "dark-mode",
            userIdentifier: "user-123",
          }),
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "ApiKey key",
            "x-releaseanchor-sdk": `release-anchor-js:${pkg.version}`,
          }),
        })
      );
    });

    it("returns backend response with domain error on 200", async () => {
      const response = {
        value: false,
        matchedRuleType: "SEGMENT" as const,
        error: { type: "SEGMENT_MISMATCH", message: "No matching segment" },
      };
      fetchMock.mockResolvedValueOnce(createJsonResponse(response));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });
      const result = await client.evaluate("flag", "user");

      expect(result).toEqual(response);
      expect(result.error).toEqual(response.error);
      expect(result.error).not.toBe(response.error);
    });

    it("returns fallback with defaultValue on 401", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 401));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluate("flag", "user");

      expect(result).toEqual({
        value: false,
        matchedRuleType: null,
        error: { type: "UNAUTHORIZED", message: "Invalid or revoked API key" },
      });
    });

    it("returns fallback with per-call defaultValue on 401", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 401));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluate("flag", "user", true);

      expect(result.value).toBe(true);
      expect(result.error?.type).toBe("UNAUTHORIZED");
    });

    it("returns fallback on 429", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 429));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: true,
      });
      const result = await client.evaluate("flag", "user");

      expect(result).toEqual({
        value: true,
        matchedRuleType: null,
        error: { type: "RATE_LIMITED", message: "Rate limit exceeded" },
      });
    });

    it("returns fallback on 5xx", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 500));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluate("flag", "user");

      expect(result).toEqual({
        value: false,
        matchedRuleType: null,
        error: { type: "HTTP_ERROR", message: "HTTP 500" },
      });
    });

    it("returns fallback on other 4xx (e.g. 404)", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 404));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: true,
      });
      const result = await client.evaluate("flag", "user");

      expect(result).toEqual({
        value: true,
        matchedRuleType: null,
        error: { type: "HTTP_ERROR", message: "HTTP 404" },
      });
    });

    it("returns fallback on parse error (invalid JSON)", async () => {
      fetchMock.mockResolvedValueOnce(
        createTextResponse("not json", 200)
      );

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: true,
      });
      const result = await client.evaluate("flag", "user");

      expect(result).toEqual({
        value: true,
        matchedRuleType: null,
        error: {
          type: "PARSE_ERROR",
          message: "Failed to parse response body",
        },
      });
    });

    it("returns fallback on network error", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Network failure"));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluate("flag", "user");

      expect(result).toEqual({
        value: false,
        matchedRuleType: null,
        error: { type: "NETWORK_ERROR", message: "Network failure" },
      });
    });

    it("returns fallback when fetch rejects with non-Error (e.g. string)", async () => {
      fetchMock.mockRejectedValueOnce("something went wrong");

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluate("flag", "user");

      expect(result).toEqual({
        value: false,
        matchedRuleType: null,
        error: { type: "NETWORK_ERROR", message: "Network error" },
      });
    });

    it("returns fallback on timeout (simulated via Request timeout)", async () => {
      fetchMock.mockRejectedValueOnce(new TimeoutError());

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: true,
      });
      const result = await client.evaluate("flag", "user");

      expect(result.error?.type).toBe("TIMEOUT");
      expect(result.value).toBe(true);
    });

    it("returns fallback on timeout (AbortController abort)", async () => {
      const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
      fetchMock.mockRejectedValueOnce(abortError);

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluate("flag", "user");

      expect(result.error?.type).toBe("TIMEOUT");
      expect(result.error?.message).toBe("Request timeout");
      expect(result.value).toBe(false);
    });

    it("calls logger on technical error", async () => {
      const logger = vi.fn();
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 401));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        logger,
      });
      await client.evaluate("flag", "user");

      expect(logger).toHaveBeenCalledWith(
        "[ReleaseAnchor] evaluate: 401 Unauthorized",
        expect.objectContaining({ flagKey: "flag", userIdentifier: "user" })
      );
    });
  });

  describe("evaluateBulk", () => {
    it("returns backend response on 200", async () => {
      const response = {
        "user-1": {
          value: true,
          matchedRuleType: "STATIC" as const,
          error: null,
        },
        "user-2": {
          value: false,
          matchedRuleType: null,
          error: null,
        },
      };
      fetchMock.mockResolvedValueOnce(createJsonResponse(response));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });
      const result = await client.evaluateBulk("flag", ["user-1", "user-2"]);

      expect(result).toEqual(response);
      expect(fetchMock).toHaveBeenCalledWith(
        `${TEST_BASE_URL}/v1/evaluate/bulk`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            flagKey: "flag",
            userIdentifiers: ["user-1", "user-2"],
          }),
        })
      );
    });

    it("returns fallback for each user on 401", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 401));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluateBulk("flag", ["u1", "u2", "u3"]);

      const expected = {
        value: false,
        matchedRuleType: null,
        error: { type: "UNAUTHORIZED", message: "Invalid or revoked API key" },
      };
      expect(result).toEqual({
        "u1": expected,
        "u2": expected,
        "u3": expected,
      });
    });

    it("returns independent objects in bulk fallback (no shared reference)", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 401));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluateBulk("flag", ["u1", "u2"]);

      result.u1.value = true;
      expect(result.u2.value).toBe(false);
    });

    it("deduplicates concurrent evaluateBulk calls for same flag and users", async () => {
      let resolveFetch: (value: Response) => void;
      const fetchPromise = new Promise<Response>((r) => {
        resolveFetch = r;
      });
      fetchMock.mockReturnValueOnce(fetchPromise);

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });

      const response = {
        "u1": { value: true, matchedRuleType: null, error: null },
        "u2": { value: false, matchedRuleType: null, error: null },
      };

      const [p1, p2] = [
        client.evaluateBulk("flag", ["u1", "u2"]),
        client.evaluateBulk("flag", ["u1", "u2"]),
      ];

      resolveFetch!(createJsonResponse(response));

      const [r1, r2] = await Promise.all([p1, p2]);

      expect(r1).toEqual(response);
      expect(r2).toEqual(response);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("sanitizes bulk: trims, filters empty, dedupes", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({
          u1: { value: true, matchedRuleType: null, error: null },
          u2: { value: false, matchedRuleType: null, error: null },
        })
      );

      const client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      const result = await client.evaluateBulk("flag", ["  u1  ", "", "u2", "u1", "  "]);

      expect(result).toEqual({
        u1: { value: true, matchedRuleType: null, error: null },
        u2: { value: false, matchedRuleType: null, error: null },
      });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ flagKey: "flag", userIdentifiers: ["u1", "u2"] }),
        })
      );
    });

    it("uses JSON.stringify for bulkKey to avoid comma collision in user IDs", async () => {
      const response1 = { "a,b": { value: true, matchedRuleType: null, error: null }, c: { value: false, matchedRuleType: null, error: null } };
      const response2 = { a: { value: true, matchedRuleType: null, error: null }, "b,c": { value: false, matchedRuleType: null, error: null } };

      fetchMock
        .mockResolvedValueOnce(createJsonResponse(response1))
        .mockResolvedValueOnce(createJsonResponse(response2));

      const client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });

      const r1 = await client.evaluateBulk("flag", ["a,b", "c"]);
      const r2 = await client.evaluateBulk("flag", ["a", "b,c"]);

      expect(r1).toEqual(response1);
      expect(r2).toEqual(response2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("returns empty object for empty userIdentifiers", async () => {
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });
      const result = await client.evaluateBulk("flag", []);

      expect(result).toEqual({});
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns fallback with per-call defaultValue on 429", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 429));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluateBulk("flag", ["u1"], true);

      expect(result.u1.value).toBe(true);
      expect(result.u1.error?.type).toBe("RATE_LIMITED");
    });

    it("returns fallback for each user on parse error", async () => {
      fetchMock.mockResolvedValueOnce(createTextResponse("invalid", 200));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: true,
      });
      const result = await client.evaluateBulk("flag", ["a", "b"]);

      const expected = {
        value: true,
        matchedRuleType: null,
        error: {
          type: "PARSE_ERROR",
          message: "Failed to parse response body",
        },
      };
      expect(result).toEqual({ a: expected, b: expected });
    });

    it("returns fallback for each user on network error", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Connection refused"));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluateBulk("flag", ["x", "y"]);

      expect(result.x.value).toBe(false);
      expect(result.x.error?.type).toBe("NETWORK_ERROR");
      expect(result.y).toEqual(result.x);
    });

    it("uses default error type and message when fallback.error is undefined", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Connection refused"));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });

      vi.spyOn(
        client as unknown as { handleNetworkError: (...args: unknown[]) => unknown },
        "handleNetworkError"
      ).mockImplementationOnce(
        () => ({ value: false, matchedRuleType: null, error: undefined })
      );

      const result = await client.evaluateBulk("flag", ["u1", "u2"]);

      expect(result.u1.error?.type).toBe("NETWORK_ERROR");
      expect(result.u1.error?.message).toBe("Network error");
      expect(result.u2.error?.type).toBe("NETWORK_ERROR");
      expect(result.u2.error?.message).toBe("Network error");
    });

    it("returns fallback when fetch rejects with non-Error (evaluateBulk)", async () => {
      fetchMock.mockRejectedValueOnce(123);

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: true,
      });
      const result = await client.evaluateBulk("flag", ["u1"]);

      expect(result.u1.value).toBe(true);
      expect(result.u1.error?.type).toBe("NETWORK_ERROR");
      expect(result.u1.error?.message).toBe("Network error");
    });

    it("calls logger on technical error", async () => {
      const logger = vi.fn();
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 500));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        logger,
      });
      await client.evaluateBulk("flag", ["u1", "u2"]);

      expect(logger).toHaveBeenCalledWith(
        "[ReleaseAnchor] evaluateBulk: 500",
        expect.objectContaining({
          flagKey: "flag",
          userCount: 2,
        })
      );
    });
  });

  describe("in-flight deduplication", () => {
    it("runs in-flight cleanup when doEvaluate rejects (e.g. logger throws)", async () => {
      fetchMock
        .mockRejectedValueOnce(new Error("Network failure"))
        .mockRejectedValueOnce(new Error("Network failure"));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        logger: () => {
          throw new Error("Logger error");
        },
      });

      await expect(client.evaluate("flag", "user")).rejects.toThrow("Logger error");
      await expect(client.evaluate("flag", "user")).rejects.toThrow("Logger error");

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("deduplicates concurrent evaluate calls for same flag and user", async () => {
      let resolveFetch: (value: Response) => void;
      const fetchPromise = new Promise<Response>((r) => {
        resolveFetch = r;
      });
      fetchMock.mockReturnValueOnce(fetchPromise);

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });

      const [p1, p2, p3] = [
        client.evaluate("flag", "user"),
        client.evaluate("flag", "user"),
        client.evaluate("flag", "user"),
      ];

      resolveFetch!(createJsonResponse({ value: true, matchedRuleType: null, error: null }));

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      expect(r1.value).toBe(true);
      expect(r2.value).toBe(true);
      expect(r3.value).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

  });

  describe("validation", () => {
    it("throws when flagKey is empty", async () => {
      const client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      await expect(client.evaluate("", "user")).rejects.toThrow(
        "ReleaseAnchor: flagKey is required"
      );
    });

    it("throws when userIdentifier is empty", async () => {
      const client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      await expect(client.evaluate("flag", "")).rejects.toThrow(
        "ReleaseAnchor: userIdentifier is required"
      );
    });

    it("throws when flagKey is only whitespace in evaluateBulk", async () => {
      const client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      await expect(client.evaluateBulk("  ", ["user"])).rejects.toThrow(
        "ReleaseAnchor: flagKey is required"
      );
    });
  });

  describe("strict4xx", () => {
    it("throws on 404 when strict4xx is true", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 404));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        strict4xx: true,
      });

      const p = client.evaluate("flag", "user");
      await expect(p).rejects.toThrow(StrictHttpError);
      const err = await p.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StrictHttpError);
      expect((err as StrictHttpError).status).toBe(404);
    });

    it("returns fallback on 404 when strict4xx is false (default)", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 404));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: true,
      });

      const result = await client.evaluate("flag", "user");
      expect(result.value).toBe(true);
      expect(result.error?.type).toBe("HTTP_ERROR");
    });
  });

  describe("input trim", () => {
    it("trims flagKey and userIdentifier in evaluate", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: true, matchedRuleType: null, error: null })
      );

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });
      await client.evaluate("  flag  ", "  user  ");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ flagKey: "flag", userIdentifier: "user" }),
        })
      );
    });

    it("trims flagKey and userIdentifiers in evaluateBulk", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({
          u1: { value: true, matchedRuleType: null, error: null },
          u2: { value: false, matchedRuleType: null, error: null },
        })
      );

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });
      await client.evaluateBulk("  flag  ", ["  u1  ", " u2 "]);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ flagKey: "flag", userIdentifiers: ["u1", "u2"] }),
        })
      );
    });
  });

  describe("destroy", () => {
    it("clears in-flight maps on destroy", async () => {
      fetchMock
        .mockResolvedValueOnce(createJsonResponse({ value: true, matchedRuleType: null, error: null }))
        .mockResolvedValueOnce(createJsonResponse({ value: false, matchedRuleType: null, error: null }));

      const client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });

      await client.evaluate("flag", "user");
      client.destroy();
      const result = await client.evaluate("flag", "user");

      expect(result.value).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("edge cases - evaluate response validation", () => {
    it("returns PARSE_ERROR when value is not boolean", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: "true", matchedRuleType: null, error: null })
      );
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: true,
      });
      const result = await client.evaluate("flag", "user");
      expect(result.error?.type).toBe("PARSE_ERROR");
      expect(result.value).toBe(true);
    });

    it("returns PARSE_ERROR when matchedRuleType is invalid", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: true, matchedRuleType: "INVALID", error: null })
      );
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluate("flag", "user");

      expect(result.value).toBe(false);
      expect(result.matchedRuleType).toBeNull();
      expect(result.error?.type).toBe("PARSE_ERROR");
    });

    it("returns PARSE_ERROR when error is an array", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: true, matchedRuleType: null, error: [] })
      );
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: true,
      });
      const result = await client.evaluate("flag", "user");

      expect(result.value).toBe(true);
      expect(result.matchedRuleType).toBeNull();
      expect(result.error?.type).toBe("PARSE_ERROR");
    });

    it("returns PARSE_ERROR when error object has wrong field types", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: true, matchedRuleType: null, error: { type: 123, message: "x" } })
      );
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluate("flag", "user");

      expect(result.value).toBe(false);
      expect(result.matchedRuleType).toBeNull();
      expect(result.error?.type).toBe("PARSE_ERROR");
    });

    it("returns PARSE_ERROR when error.message is not string", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: true, matchedRuleType: null, error: { type: "X", message: 123 } })
      );
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: true,
      });
      const result = await client.evaluate("flag", "user");

      expect(result.value).toBe(true);
      expect(result.error?.type).toBe("PARSE_ERROR");
    });

    it("returns PARSE_ERROR when response is array", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse([{ value: true }]));
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: true,
      });
      const result = await client.evaluate("flag", "user");
      expect(result.error?.type).toBe("PARSE_ERROR");
      expect(result.value).toBe(true);
    });

    it("returns PARSE_ERROR when response is null", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse(null));
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluate("flag", "user");
      expect(result.error?.type).toBe("PARSE_ERROR");
      expect(result.value).toBe(false);
    });

    it("accepts valid matchedRuleType STATIC, SEGMENT, PERCENTAGE", async () => {
      for (const ruleType of ["STATIC", "SEGMENT", "PERCENTAGE"] as const) {
        fetchMock.mockResolvedValueOnce(
          createJsonResponse({ value: true, matchedRuleType: ruleType, error: null })
        );
        const client = new ReleaseAnchor({
          apiKey: "key",
          baseUrl: TEST_BASE_URL,
        });
        const result = await client.evaluate("flag", `user-${ruleType}`);
        expect(result.matchedRuleType).toBe(ruleType);
        expect(result.value).toBe(true);
      }
    });

    it("normalizes lowercase matchedRuleType static to STATIC", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: true, matchedRuleType: "static", error: null })
      );

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });
      const result = await client.evaluate("flag", "user-static");

      expect(result.matchedRuleType).toBe("STATIC");
      expect(result.error).toBeNull();
      expect(result.value).toBe(true);
    });

    it("normalizes lowercase matchedRuleType segment to SEGMENT", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: true, matchedRuleType: "segment", error: null })
      );

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });
      const result = await client.evaluate("flag", "user-segment");

      expect(result.matchedRuleType).toBe("SEGMENT");
      expect(result.error).toBeNull();
      expect(result.value).toBe(true);
    });

    it("normalizes lowercase matchedRuleType percentage to PERCENTAGE", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: true, matchedRuleType: "percentage", error: null })
      );

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });
      const result = await client.evaluate("flag", "user-percentage");

      expect(result.matchedRuleType).toBe("PERCENTAGE");
      expect(result.error).toBeNull();
      expect(result.value).toBe(true);
    });
  });

  describe("edge cases - evaluateBulk", () => {
    it("normalizes lowercase matchedRuleType values in bulk entries", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({
          u1: { value: true, matchedRuleType: "static", error: null },
          u2: { value: true, matchedRuleType: "segment", error: null },
          u3: { value: true, matchedRuleType: "percentage", error: null },
        })
      );

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });
      const result = await client.evaluateBulk("flag", ["u1", "u2", "u3"]);

      expect(result.u1.matchedRuleType).toBe("STATIC");
      expect(result.u2.matchedRuleType).toBe("SEGMENT");
      expect(result.u3.matchedRuleType).toBe("PERCENTAGE");
      expect(result.u1.error).toBeNull();
      expect(result.u2.error).toBeNull();
      expect(result.u3.error).toBeNull();
    });

    it("fills missing bulk response keys with fallback entries", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({
          u1: { value: true, matchedRuleType: null, error: null },
        })
      );
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluateBulk("flag", ["u1", "u2", "u3"]);

      expect(result.u1.value).toBe(true);
      expect(result.u1.error).toBeNull();

      expect(Object.keys(result).sort()).toEqual(["u1", "u2", "u3"]);

      expect(result.u2.value).toBe(false);
      expect(result.u2.matchedRuleType).toBeNull();
      expect(result.u2.error?.type).toBe("PARSE_ERROR");

      expect(result.u3.value).toBe(false);
      expect(result.u3.matchedRuleType).toBeNull();
      expect(result.u3.error?.type).toBe("PARSE_ERROR");
    });

    it("returns fallback only for invalid bulk entries", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({
          u1: { value: true, matchedRuleType: null, error: null },
          u2: { value: "invalid", matchedRuleType: null, error: null },
          u3: { value: false, matchedRuleType: null, error: null },
        })
      );
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: true,
      });
      const result = await client.evaluateBulk("flag", ["u1", "u2", "u3"]);

      expect(result.u1.value).toBe(true);
      expect(result.u1.error).toBeNull();

      expect(result.u2.value).toBe(true);
      expect(result.u2.matchedRuleType).toBeNull();
      expect(result.u2.error?.type).toBe("PARSE_ERROR");

      expect(result.u3.value).toBe(false);
      expect(result.u3.error).toBeNull();
    });

    it("returns PARSE_ERROR for all when bulk response is array", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse([{ value: true }]));
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluateBulk("flag", ["u1", "u2"]);

      expect(result.u1.error?.type).toBe("PARSE_ERROR");
      expect(result.u2.error?.type).toBe("PARSE_ERROR");
    });

    it("throws StrictHttpError on 403 when strict4xx", async () => {
      fetchMock
        .mockResolvedValueOnce(createJsonResponse({}, 403))
        .mockResolvedValueOnce(createJsonResponse({}, 403));
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        strict4xx: true,
      });
      await expect(client.evaluateBulk("flag", ["u1"])).rejects.toThrow(StrictHttpError);
      const err = await client.evaluateBulk("flag", ["u1"]).catch((e: unknown) => e);
      expect((err as StrictHttpError).status).toBe(403);
    });

    it("ignores extra keys from server in bulk result", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({
          u1: { value: true, matchedRuleType: null, error: null },
          u2: { value: false, matchedRuleType: null, error: null },
          extra: { value: true, matchedRuleType: null, error: null },
        })
      );
      const client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      const result = await client.evaluateBulk("flag", ["u1", "u2"]);

      expect(result.u1.value).toBe(true);
      expect(result.u2.value).toBe(false);
      expect(result.extra).toBeUndefined();
      expect(Object.keys(result).sort()).toEqual(["u1", "u2"]);
    });
  });

  describe("edge cases - in-flight and cache", () => {
    it("does not dedupe when same flag+user but different defaultValue", async () => {
      fetchMock
        .mockResolvedValueOnce(createJsonResponse({}, 401))
        .mockResolvedValueOnce(createJsonResponse({}, 401));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });

      const [r1, r2] = await Promise.all([
        client.evaluate("flag", "user", false),
        client.evaluate("flag", "user", true),
      ]);

      expect(r1.value).toBe(false);
      expect(r2.value).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("evaluate works after destroy without preserving stale in-flight state", async () => {
      fetchMock
        .mockResolvedValueOnce(createJsonResponse({ value: true, matchedRuleType: null, error: null }))
        .mockResolvedValueOnce(createJsonResponse({ value: false, matchedRuleType: null, error: null }));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });

      const r1 = await client.evaluate("flag", "user");
      client.destroy();
      const r2 = await client.evaluate("flag", "user");

      expect(r1.value).toBe(true);
      expect(r2.value).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("evaluateBulk with different defaultValue does not dedupe", async () => {
      fetchMock
        .mockResolvedValueOnce(createJsonResponse({}, 429))
        .mockResolvedValueOnce(createJsonResponse({}, 429));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });

      const [r1, r2] = await Promise.all([
        client.evaluateBulk("flag", ["u1"], false),
        client.evaluateBulk("flag", ["u1"], true),
      ]);

      expect(r1.u1.value).toBe(false);
      expect(r2.u1.value).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("edge cases - HTTP status", () => {
    it("returns fallback on 502", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 502));
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: true,
      });
      const result = await client.evaluate("flag", "user");
      expect(result.error?.type).toBe("HTTP_ERROR");
      expect(result.error?.message).toBe("HTTP 502");
      expect(result.value).toBe(true);
    });

    it("returns fallback on 503", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 503));
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluate("flag", "user");
      expect(result.error?.type).toBe("HTTP_ERROR");
      expect(result.error?.message).toBe("HTTP 503");
      expect(result.value).toBe(false);
    });

    it("throws StrictHttpError on 400 when strict4xx", async () => {
      fetchMock
        .mockResolvedValueOnce(createJsonResponse({}, 400))
        .mockResolvedValueOnce(createJsonResponse({}, 400));
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        strict4xx: true,
      });
      await expect(client.evaluate("flag", "user")).rejects.toThrow(StrictHttpError);
      const err = await client.evaluate("flag", "user").catch((e: unknown) => e);
      expect((err as StrictHttpError).status).toBe(400);
    });
  });

  describe("edge cases - constructor", () => {
    it("does not set background cleanup intervals", () => {
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });
      expect(client).toBeInstanceOf(ReleaseAnchor);
      expect(setIntervalSpy).not.toHaveBeenCalled();
      setIntervalSpy.mockRestore();
    });

    it("does not keep dedup state after requests settle", async () => {
      fetchMock
        .mockResolvedValueOnce(createJsonResponse({ value: true, matchedRuleType: null, error: null }))
        .mockResolvedValueOnce(createJsonResponse({ value: false, matchedRuleType: null, error: null }));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });

      const r1 = await client.evaluate("flag", "user");
      const r2 = await client.evaluate("flag", "user");

      expect(r1.value).toBe(true);
      expect(r2.value).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("edge cases - parse", () => {
    it("returns PARSE_ERROR when response body is empty", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: true,
      });
      const result = await client.evaluate("flag", "user");
      expect(result.error?.type).toBe("PARSE_ERROR");
      expect(result.value).toBe(true);
    });

    it("returns PARSE_ERROR when JSON is truncated", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('{"value": true, "matchedRuleType":', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: false,
      });
      const result = await client.evaluate("flag", "user");
      expect(result.error?.type).toBe("PARSE_ERROR");
      expect(result.value).toBe(false);
    });
  });

  describe("defaultValue", () => {
    it("uses config.defaultValue when no per-call override", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 401));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: true,
      });
      const result = await client.evaluate("flag", "user");

      expect(result.value).toBe(true);
    });

    it("per-call defaultValue overrides config", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 401));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
        defaultValue: true,
      });
      const result = await client.evaluate("flag", "user", false);

      expect(result.value).toBe(false);
    });

    it("defaults to false when not specified", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 500));

      const client = new ReleaseAnchor({
        apiKey: "key",
        baseUrl: TEST_BASE_URL,
      });
      const result = await client.evaluate("flag", "user");

      expect(result.value).toBe(false);
    });
  });

  // ─── T004: EvaluateResponse evaluationId field ───────────────────────────
  describe("EvaluateResponse evaluationId field", () => {
    let client: ReleaseAnchor;
    afterEach(() => { client.destroy(); });

    it("passes evaluationId through when present in evaluate response", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: true, matchedRuleType: "PERCENTAGE", error: null, evaluationId: "abc-123" })
      );
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      const result = await client.evaluate("flag", "user");
      expect(result.evaluationId).toBe("abc-123");
    });

    it("evaluationId is undefined when absent from evaluate response", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({ value: true, matchedRuleType: null, error: null })
      );
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      const result = await client.evaluate("flag", "user");
      expect(result.evaluationId).toBeUndefined();
    });

    it("passes evaluationId through per-user in evaluateBulk response", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse({
          "user-1": { value: true, matchedRuleType: "STATIC", error: null, evaluationId: "eval-001" },
          "user-2": { value: false, matchedRuleType: null, error: null },
        })
      );
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      const result = await client.evaluateBulk("flag", ["user-1", "user-2"]);
      expect(result["user-1"].evaluationId).toBe("eval-001");
      expect(result["user-2"].evaluationId).toBeUndefined();
    });
  });

  // ─── T011: reportSuccess ──────────────────────────────────────────────────
  describe("reportSuccess", () => {
    let client: ReleaseAnchor;
    afterEach(() => { client.destroy(); });

    it("POSTs to /feedback/report with result true when evaluationId is present", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      const evaluation = { value: true, matchedRuleType: null as null, error: null, evaluationId: "eval-abc" };
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await client.reportSuccess(evaluation);

      expect(fetchMock).toHaveBeenCalledWith(
        `${TEST_BASE_URL}/v1/feedback/report`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ evaluationId: "eval-abc", result: true }),
        })
      );
    });

    it("includes latencyMs in payload when provided", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      const evaluation = { value: true, matchedRuleType: null as null, error: null, evaluationId: "eval-xyz" };
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await client.reportSuccess(evaluation, { latencyMs: 150 });

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({ evaluationId: "eval-xyz", result: true, latencyMs: 150 });
    });

    it("is no-op when evaluationId is absent", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      const evaluation = { value: true, matchedRuleType: null as null, error: null };
      await client.reportSuccess(evaluation);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("is no-op when evaluation is null", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      await client.reportSuccess(null);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("is no-op when evaluation is undefined", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      await client.reportSuccess(undefined);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("swallows errors silently when feedback POST fails", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      const evaluation = { value: true, matchedRuleType: null as null, error: null, evaluationId: "eval-err" };
      fetchMock.mockRejectedValueOnce(new Error("Network error"));
      await expect(client.reportSuccess(evaluation)).resolves.toBeUndefined();
    });
  });

  // ─── T012: reportFailure ──────────────────────────────────────────────────
  describe("reportFailure", () => {
    let client: ReleaseAnchor;
    afterEach(() => { client.destroy(); });

    it("POSTs to /feedback/report with result false and default errorType UNKNOWN", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      const evaluation = { value: false, matchedRuleType: null as null, error: null, evaluationId: "eval-fail" };
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await client.reportFailure(evaluation);

      expect(fetchMock).toHaveBeenCalledWith(
        `${TEST_BASE_URL}/v1/feedback/report`,
        expect.objectContaining({
          body: JSON.stringify({ evaluationId: "eval-fail", result: false, errorType: "UNKNOWN" }),
        })
      );
    });

    it("uses custom errorType when provided", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      const evaluation = { value: false, matchedRuleType: null as null, error: null, evaluationId: "eval-fail2" };
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await client.reportFailure(evaluation, { errorType: "EXECUTION_FAILED" });

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({ evaluationId: "eval-fail2", result: false, errorType: "EXECUTION_FAILED" });
    });

    it("includes latencyMs and errorType when both provided", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      const evaluation = { value: false, matchedRuleType: null as null, error: null, evaluationId: "eval-fail3" };
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await client.reportFailure(evaluation, { latencyMs: 200, errorType: "EXECUTION_FAILED" });

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({ evaluationId: "eval-fail3", result: false, errorType: "EXECUTION_FAILED", latencyMs: 200 });
    });

    it("is no-op when evaluationId is absent", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      const evaluation = { value: false, matchedRuleType: null as null, error: null };
      await client.reportFailure(evaluation);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("is no-op when evaluation is null", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      await client.reportFailure(null);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("is no-op when evaluation is undefined", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      await client.reportFailure(undefined);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("swallows errors silently when feedback POST fails", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      const evaluation = { value: false, matchedRuleType: null as null, error: null, evaluationId: "eval-err2" };
      fetchMock.mockRejectedValueOnce(new Error("Network error"));
      await expect(client.reportFailure(evaluation)).resolves.toBeUndefined();
    });
  });

  // ─── T013: executeWithFeedback (single-user) ──────────────────────────────
  describe("executeWithFeedback (single-user)", () => {
    let client: ReleaseAnchor;
    afterEach(() => { client.destroy(); });

    function mockEvalResponse(evaluationId?: string) {
      return createJsonResponse({
        value: true, matchedRuleType: "STATIC", error: null,
        ...(evaluationId !== undefined ? { evaluationId } : {}),
      });
    }

    it("calls evaluate and passes the full result to the handler", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      fetchMock
        .mockResolvedValueOnce(mockEvalResponse("eval-1"))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));

      const handler = vi.fn().mockResolvedValue(true);
      await client.executeWithFeedback("flag", "user-1", handler);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ value: true, evaluationId: "eval-1" })
      );
    });

    it("reports success and returns true when handler returns true", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      fetchMock
        .mockResolvedValueOnce(mockEvalResponse("eval-success"))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));

      const result = await client.executeWithFeedback("flag", "user", async () => true);

      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const feedbackBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
      expect(feedbackBody).toEqual({ evaluationId: "eval-success", result: true });
      expect(fetchMock.mock.calls[1][0]).toBe(`${TEST_BASE_URL}/v1/feedback/report`);
    });

    it("reports failure with EXECUTION_FAILED and returns false when handler returns false", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      fetchMock
        .mockResolvedValueOnce(mockEvalResponse("eval-efail"))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));

      const result = await client.executeWithFeedback("flag", "user", async () => false);

      expect(result).toBe(false);
      const feedbackBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
      expect(feedbackBody).toEqual({ evaluationId: "eval-efail", result: false, errorType: "EXECUTION_FAILED" });
    });

    it("reports failure with UNKNOWN and rethrows when handler throws", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      fetchMock
        .mockResolvedValueOnce(mockEvalResponse("eval-throw"))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));

      const error = new Error("handler exploded");
      await expect(
        client.executeWithFeedback("flag", "user", async () => { throw error; })
      ).rejects.toThrow("handler exploded");

      const feedbackBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
      expect(feedbackBody).toEqual({ evaluationId: "eval-throw", result: false, errorType: "UNKNOWN" });
    });

    it("runs handler but does not report feedback when evaluationId is absent", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      fetchMock.mockResolvedValueOnce(mockEvalResponse()); // no evaluationId

      const handler = vi.fn().mockResolvedValue(true);
      const result = await client.executeWithFeedback("flag", "user", handler);

      expect(result).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1); // only the evaluate call
    });

    it("propagates evaluate error without calling handler (strict4xx case)", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL, strict4xx: true });
      fetchMock.mockResolvedValueOnce(createJsonResponse({}, 403));

      const handler = vi.fn();
      await expect(
        client.executeWithFeedback("flag", "user", handler)
      ).rejects.toBeInstanceOf(StrictHttpError);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ─── T021 + T022: executeWithFeedback (bulk-user) ─────────────────────────
  describe("executeWithFeedback (bulk-user)", () => {
    let client: ReleaseAnchor;
    afterEach(() => { client.destroy(); });

    const evalWithId = (id: string) =>
      ({ value: true, matchedRuleType: "STATIC" as const, error: null, evaluationId: id });
    const evalNoId = () =>
      ({ value: false, matchedRuleType: null, error: null });

    it("returns empty map immediately for empty user array without calling evaluateBulk", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      const result = await client.executeWithFeedback("flag", [], async () => true);
      expect(result).toEqual({});
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("processes all users and returns correct result map", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      fetchMock
        .mockResolvedValueOnce(createJsonResponse({ "u1": evalWithId("e1"), "u2": evalWithId("e2") }))
        .mockResolvedValueOnce(createJsonResponse({ accepted: 2, rejected: [] }));

      const result = await client.executeWithFeedback(
        "flag", ["u1", "u2"],
        async (userId) => userId === "u1"
      );

      expect(result).toEqual({ "u1": true, "u2": false });
    });

    it("continues processing remaining users when one handler returns false", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      fetchMock
        .mockResolvedValueOnce(createJsonResponse({
          "u1": evalWithId("e1"), "u2": evalWithId("e2"), "u3": evalWithId("e3"),
        }))
        .mockResolvedValueOnce(createJsonResponse({ accepted: 3, rejected: [] }));

      const callOrder: string[] = [];
      const result = await client.executeWithFeedback(
        "flag", ["u1", "u2", "u3"],
        async (userId) => { callOrder.push(userId); return userId !== "u2"; }
      );

      expect(callOrder).toEqual(["u1", "u2", "u3"]);
      expect(result).toEqual({ "u1": true, "u2": false, "u3": true });
    });

    it("continues processing remaining users when one handler throws", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      fetchMock
        .mockResolvedValueOnce(createJsonResponse({
          "u1": evalWithId("e1"), "u2": evalWithId("e2"), "u3": evalWithId("e3"),
        }))
        .mockResolvedValueOnce(createJsonResponse({ accepted: 3, rejected: [] }));

      const callOrder: string[] = [];
      const result = await client.executeWithFeedback(
        "flag", ["u1", "u2", "u3"],
        async (userId) => {
          callOrder.push(userId);
          if (userId === "u2") throw new Error("u2 failed");
          return true;
        }
      );

      expect(callOrder).toEqual(["u1", "u2", "u3"]);
      expect(result).toEqual({ "u1": true, "u2": false, "u3": true });
    });

    it("does not rethrow handler errors in bulk mode", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      fetchMock
        .mockResolvedValueOnce(createJsonResponse({ "u1": evalWithId("e1") }))
        .mockResolvedValueOnce(createJsonResponse({ accepted: 1, rejected: [] }));

      await expect(
        client.executeWithFeedback("flag", ["u1"], async () => { throw new Error("boom"); })
      ).resolves.toEqual({ "u1": false });
    });

    it("sends a single POST /feedback/bulk after all handlers complete (T022)", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      fetchMock
        .mockResolvedValueOnce(createJsonResponse({ "u1": evalWithId("e1"), "u2": evalWithId("e2") }))
        .mockResolvedValueOnce(createJsonResponse({ accepted: 2, rejected: [] }));

      await client.executeWithFeedback("flag", ["u1", "u2"], async () => true);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe(`${TEST_BASE_URL}/v1/feedback/bulk`);
      expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe("POST");
    });

    it("batch payload contains only users with evaluationId", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      fetchMock
        .mockResolvedValueOnce(createJsonResponse({
          "u1": evalWithId("e1"),
          "u2": evalNoId(),  // excluded from batch
          "u3": evalWithId("e3"),
        }))
        .mockResolvedValueOnce(createJsonResponse({ accepted: 2, rejected: [] }));

      await client.executeWithFeedback("flag", ["u1", "u2", "u3"], async () => true);

      const batchBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
      expect(batchBody).toHaveLength(2);
      expect(batchBody).toContainEqual(expect.objectContaining({ evaluationId: "e1", result: true }));
      expect(batchBody).toContainEqual(expect.objectContaining({ evaluationId: "e3", result: true }));
    });

    it("does not call feedback bulk when no users have evaluationId", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      fetchMock.mockResolvedValueOnce(createJsonResponse({ "u1": evalNoId() }));

      await client.executeWithFeedback("flag", ["u1"], async () => true);

      expect(fetchMock).toHaveBeenCalledTimes(1); // only evaluateBulk
    });

    it("swallows bulk feedback POST failure without affecting result map", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      fetchMock
        .mockResolvedValueOnce(createJsonResponse({ "u1": evalWithId("e1") }))
        .mockRejectedValueOnce(new Error("Network error")); // bulk POST fails

      const result = await client.executeWithFeedback("flag", ["u1"], async () => true);
      expect(result).toEqual({ "u1": true });
    });
  });

  // ─── T028 + T029: Manual feedback reporting ───────────────────────────────
  describe("manual feedback reporting (standalone)", () => {
    let client: ReleaseAnchor;
    afterEach(() => { client.destroy(); });

    it("reportSuccess can be called with result from evaluate() without executeWithFeedback", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      fetchMock
        .mockResolvedValueOnce(
          createJsonResponse({ value: true, matchedRuleType: "STATIC", error: null, evaluationId: "manual-eval-1" })
        )
        .mockResolvedValueOnce(new Response(null, { status: 204 }));

      const evaluation = await client.evaluate("flag", "user-manual");
      await client.reportSuccess(evaluation);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const feedbackBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
      expect(feedbackBody).toEqual({ evaluationId: "manual-eval-1", result: true });
    });

    it("reportSuccess and reportFailure both send POSTs when called independently for same evaluationId (idempotency)", async () => {
      client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
      const evaluation = { value: true, matchedRuleType: null as null, error: null, evaluationId: "dup-eval" };
      fetchMock
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));

      await client.reportSuccess(evaluation);
      await client.reportFailure(evaluation, { errorType: "EXECUTION_FAILED" });

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
    // ─── Additional coverage: feedback/report behavior, validation, bulk edge cases ─────────────
    describe("additional feedback coverage", () => {
        let client: ReleaseAnchor;

        afterEach(() => {
            client?.destroy?.();
        });

        describe("reportSuccess / reportFailure HTTP response handling", () => {
            it("reportSuccess swallows non-2xx HTTP response", async () => {
                client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
                const evaluation = {
                    value: true,
                    matchedRuleType: null as null,
                    error: null,
                    evaluationId: "eval-http-500",
                };

                fetchMock.mockResolvedValueOnce(createJsonResponse({}, 500));

                await expect(client.reportSuccess(evaluation)).resolves.toBeUndefined();
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });

            it("reportFailure swallows non-2xx HTTP response", async () => {
                client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
                const evaluation = {
                    value: false,
                    matchedRuleType: null as null,
                    error: null,
                    evaluationId: "eval-http-429",
                };

                fetchMock.mockResolvedValueOnce(createJsonResponse({}, 429));

                await expect(
                    client.reportFailure(evaluation, { errorType: "EXECUTION_FAILED" })
                ).resolves.toBeUndefined();
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });
        });

        describe("reportFailure defaults and payload shape", () => {
            it("reportFailure uses UNKNOWN when errorType is undefined even if latencyMs is provided", async () => {
                client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
                const evaluation = {
                    value: false,
                    matchedRuleType: null as null,
                    error: null,
                    evaluationId: "eval-latency-only",
                };

                fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

                await client.reportFailure(evaluation, { latencyMs: 321 });

                const body = JSON.parse(
                    (fetchMock.mock.calls[0][1] as RequestInit).body as string
                );

                expect(body).toEqual({
                    evaluationId: "eval-latency-only",
                    result: false,
                    errorType: "UNKNOWN",
                    latencyMs: 321,
                });
            });

            it("reportSuccess sends only expected fields", async () => {
                client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });
                const evaluation = {
                    value: true,
                    matchedRuleType: "STATIC" as const,
                    error: null,
                    evaluationId: "eval-shape-1",
                };

                fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

                await client.reportSuccess(evaluation);

                const body = JSON.parse(
                    (fetchMock.mock.calls[0][1] as RequestInit).body as string
                );

                expect(body).toEqual({
                    evaluationId: "eval-shape-1",
                    result: true,
                });
            });
        });

        describe("executeWithFeedback (single-user) validation and latency", () => {
            it("throws when single-user executeWithFeedback flagKey is empty", async () => {
                client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });

                await expect(
                    client.executeWithFeedback("", "user", async () => true)
                ).rejects.toThrow("ReleaseAnchor: flagKey is required");
            });

            it("throws when single-user executeWithFeedback userId is empty", async () => {
                client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });

                await expect(
                    client.executeWithFeedback("flag", "", async () => true)
                ).rejects.toThrow("ReleaseAnchor: userIdentifier is required");
            });

        });

        describe("executeWithFeedback (bulk-user) additional edge cases", () => {
            const evalWithId = (id: string) => ({
                value: true,
                matchedRuleType: "STATIC" as const,
                error: null,
                evaluationId: id,
            });

            it("returns empty map when bulk user list becomes empty after sanitize", async () => {
                client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });

                const result = await client.executeWithFeedback(
                    "flag",
                    ["", "   ", "  "],
                    async () => true
                );

                expect(result).toEqual({});
                expect(fetchMock).not.toHaveBeenCalled();
            });

            it("throws when bulk executeWithFeedback flagKey is empty", async () => {
                client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });

                await expect(
                    client.executeWithFeedback("   ", ["u1"], async () => true)
                ).rejects.toThrow("ReleaseAnchor: flagKey is required");
            });

            it("sanitizes bulk executeWithFeedback userIds before evaluateBulk", async () => {
                client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });

                fetchMock
                    .mockResolvedValueOnce(
                        createJsonResponse({
                            u1: evalWithId("e1"),
                            u2: evalWithId("e2"),
                        })
                    )
                    .mockResolvedValueOnce(createJsonResponse({ accepted: 2, rejected: [] }));

                await client.executeWithFeedback(
                    "flag",
                    ["  u1  ", "", "u2", "u1", "   "],
                    async () => true
                );

                expect(fetchMock.mock.calls[0][0]).toBe(`${TEST_BASE_URL}/v1/evaluate/bulk`);
                expect(fetchMock.mock.calls[0][1]).toEqual(
                    expect.objectContaining({
                        body: JSON.stringify({
                            flagKey: "flag",
                            userIdentifiers: ["u1", "u2"],
                        }),
                    })
                );
            });

            it("batch payload marks returned false as EXECUTION_FAILED", async () => {
                client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });

                fetchMock
                    .mockResolvedValueOnce(
                        createJsonResponse({
                            u1: evalWithId("e1"),
                        })
                    )
                    .mockResolvedValueOnce(createJsonResponse({ accepted: 1, rejected: [] }));

                await client.executeWithFeedback("flag", ["u1"], async () => false);

                const body = JSON.parse(
                    (fetchMock.mock.calls[1][1] as RequestInit).body as string
                );

                expect(body).toEqual([
                    {
                        evaluationId: "e1",
                        result: false,
                        errorType: "EXECUTION_FAILED",
                    },
                ]);
            });

            it("batch payload marks thrown handler error as UNKNOWN", async () => {
                client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });

                fetchMock
                    .mockResolvedValueOnce(
                        createJsonResponse({
                            u1: evalWithId("e1"),
                        })
                    )
                    .mockResolvedValueOnce(createJsonResponse({ accepted: 1, rejected: [] }));

                await client.executeWithFeedback("flag", ["u1"], async () => {
                    throw new Error("boom");
                });

                const body = JSON.parse(
                    (fetchMock.mock.calls[1][1] as RequestInit).body as string
                );

                expect(body).toEqual([
                    {
                        evaluationId: "e1",
                        result: false,
                        errorType: "UNKNOWN",
                    },
                ]);
            });

            it("sends one batch entry per processed user with evaluationId", async () => {
                client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });

                fetchMock
                    .mockResolvedValueOnce(
                        createJsonResponse({
                            u1: evalWithId("e1"),
                            u2: evalWithId("e2"),
                            u3: evalWithId("e3"),
                        })
                    )
                    .mockResolvedValueOnce(createJsonResponse({ accepted: 3, rejected: [] }));

                await client.executeWithFeedback(
                    "flag",
                    ["u1", "u2", "u3"],
                    async (userId) => userId !== "u2"
                );

                const body = JSON.parse(
                    (fetchMock.mock.calls[1][1] as RequestInit).body as string
                );

                expect(body).toHaveLength(3);
                expect(body).toContainEqual({
                    evaluationId: "e1",
                    result: true,
                });
                expect(body).toContainEqual({
                    evaluationId: "e2",
                    result: false,
                    errorType: "EXECUTION_FAILED",
                });
                expect(body).toContainEqual({
                    evaluationId: "e3",
                    result: true,
                });
            });

            it("swallows non-2xx response from /feedback/bulk without affecting returned results", async () => {
                client = new ReleaseAnchor({ apiKey: "key", baseUrl: TEST_BASE_URL });

                fetchMock
                    .mockResolvedValueOnce(
                        createJsonResponse({
                            u1: evalWithId("e1"),
                            u2: evalWithId("e2"),
                        })
                    )
                    .mockResolvedValueOnce(createJsonResponse({}, 500));

                const result = await client.executeWithFeedback(
                    "flag",
                    ["u1", "u2"],
                    async (userId) => userId === "u1"
                );

                expect(result).toEqual({
                    u1: true,
                    u2: false,
                });
            });
        });
    });
});
