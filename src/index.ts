/**
 * ReleaseAnchor JavaScript SDK
 * Evaluates feature flags via the ReleaseAnchor evaluation API.
 * Works in Node.js and browser environments.
 *
 * Transport/fallback layer only — passes through backend responses unchanged.
 * Fallback applies only for technical errors (network, timeout, 401, 429, 5xx, parse failure).
 */

const DEFAULT_BASE_URL = "https://api.releaseanchor.com";
const DEFAULT_TIMEOUT_MS = 3000;
const SDK_VERSION = "1.0.0";

export interface ReleaseAnchorConfig {
  /** Required. Your environment API key from the dashboard. */
  apiKey: string;
  /** Override API base URL. Default: https://api.releaseanchor.com */
  baseUrl?: string;
  /** Request timeout in milliseconds. Default: 3000 */
  timeout?: number;
  /** Used only when a technical error occurs (network, timeout, 401, 429, 5xx). Optional, defaults to false. */
  defaultValue?: boolean;
  /** Optional logger for technical errors. Default: console.warn */
  logger?: (message: string, context?: unknown) => void;
}

export interface EvaluateResponse {
  value: boolean;
  matchedRuleType: "STATIC" | "SEGMENT" | "PERCENTAGE" | null;
  error: EvaluationError | null;
}

export interface EvaluationError {
  type: string;
  message: string;
}

export type BulkEvaluateResult = Record<string, EvaluateResponse>;

type TechnicalErrorType =
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNAUTHORIZED"
  | "HTTP_ERROR"
  | "PARSE_ERROR";

function createFallbackResponse(
  errorType: TechnicalErrorType,
  message: string,
  defaultValue: boolean
): EvaluateResponse {
  return {
    value: defaultValue,
    matchedRuleType: null,
    error: { type: errorType, message },
  };
}

export class ReleaseAnchor {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly defaultValue: boolean;
  private readonly logger: (message: string, context?: unknown) => void;

  constructor(config: ReleaseAnchorConfig) {
    if (!config.apiKey || typeof config.apiKey !== "string") {
      throw new Error("ReleaseAnchor: apiKey is required");
    }
    this.apiKey = config.apiKey.trim();
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
    this.defaultValue = config.defaultValue ?? false;
    this.logger = config.logger ?? ((msg, ctx) => console.warn(msg, ctx ?? ""));
  }

  /**
   * Evaluates a single flag for a user. Returns the full EvaluateResponse.
   * Passes through backend response unchanged on 200.
   * On technical error (network, timeout, 401, 429, 5xx, parse failure): logs, then returns fallback using defaultValue.
   */
  async evaluate(
    flagKey: string,
    userIdentifier: string
  ): Promise<EvaluateResponse> {
    try {
      const res = await this.fetchWithTimeout(
        `${this.baseUrl}/v1/evaluate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `ApiKey ${this.apiKey}`,
            "X-SDK": `js/${SDK_VERSION}`,
          },
          body: JSON.stringify({
            flagKey,
            userIdentifier,
          }),
        },
        this.timeout
      );

      if (!res.ok) {
        return this.handleTechnicalError(res, "evaluate", { flagKey, userIdentifier });
      }

      const data = await this.parseJson<EvaluateResponse>(res);
      if (data === null) {
        return this.handleParseError("evaluate", { flagKey, userIdentifier });
      }
      return data;
    } catch (err) {
      return this.handleNetworkError(err, "evaluate", { flagKey, userIdentifier });
    }
  }

  /**
   * Evaluates a single flag for multiple users in one request.
   * Returns Record<userIdentifier, EvaluateResponse>.
   * Passes through backend response unchanged on 200.
   * On technical error: logs, then returns { [userId]: fallback } for each userIdentifier.
   */
  async evaluateBulk(
    flagKey: string,
    userIdentifiers: string[]
  ): Promise<Record<string, EvaluateResponse>> {
    try {
      const res = await this.fetchWithTimeout(
        `${this.baseUrl}/v1/evaluate/bulk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `ApiKey ${this.apiKey}`,
            "X-SDK": `js/${SDK_VERSION}`,
          },
          body: JSON.stringify({
            flagKey,
            userIdentifiers,
          }),
        },
        this.timeout
      );

      if (!res.ok) {
        return this.handleTechnicalErrorBulk(res, flagKey, userIdentifiers);
      }

      const data = await this.parseJson<Record<string, EvaluateResponse>>(res);
      if (data === null) {
        return this.buildBulkFallback(
          "PARSE_ERROR",
          "Failed to parse response body",
          userIdentifiers
        );
      }
      return data;
    } catch (err) {
      const fallback = this.handleNetworkError(err, "evaluateBulk", {
        flagKey,
        userIdentifiers,
      });
      return this.buildBulkFallback(
        fallback.error!.type as TechnicalErrorType,
        fallback.error!.message,
        userIdentifiers
      );
    }
  }

  private handleTechnicalError(
    res: Response,
    method: string,
    context: Record<string, unknown>
  ): EvaluateResponse {
    const status = res.status;
    if (status === 401) {
      this.logger(`[ReleaseAnchor] ${method}: 401 Unauthorized`, context);
      return createFallbackResponse(
        "UNAUTHORIZED",
        "Invalid or revoked API key",
        this.defaultValue
      );
    }
    if (status === 429) {
      this.logger(`[ReleaseAnchor] ${method}: 429 Too Many Requests`, context);
      return createFallbackResponse(
        "HTTP_ERROR",
        "Rate limit exceeded",
        this.defaultValue
      );
    }
    if (status >= 500) {
      this.logger(`[ReleaseAnchor] ${method}: ${status} Server Error`, context);
      return createFallbackResponse(
        "HTTP_ERROR",
        `HTTP ${status}`,
        this.defaultValue
      );
    }
    this.logger(`[ReleaseAnchor] ${method}: HTTP ${status}`, context);
    return createFallbackResponse(
      "HTTP_ERROR",
      `HTTP ${status}`,
      this.defaultValue
    );
  }

  private handleTechnicalErrorBulk(
    res: Response,
    flagKey: string,
    userIdentifiers: string[]
  ): Record<string, EvaluateResponse> {
    const status = res.status;
    let type: TechnicalErrorType = "HTTP_ERROR";
    let message = `HTTP ${status}`;

    if (status === 401) {
      type = "UNAUTHORIZED";
      message = "Invalid or revoked API key";
    } else if (status === 429) {
      type = "HTTP_ERROR";
      message = "Rate limit exceeded";
    }

    this.logger(`[ReleaseAnchor] evaluateBulk: ${status}`, {
      flagKey,
      userCount: userIdentifiers.length,
    });
    return this.buildBulkFallback(type, message, userIdentifiers);
  }

  private handleParseError(
    method: string,
    context: Record<string, unknown>
  ): EvaluateResponse {
    this.logger(`[ReleaseAnchor] ${method}: Failed to parse response body`, context);
    return createFallbackResponse(
      "PARSE_ERROR",
      "Failed to parse response body",
      this.defaultValue
    );
  }

  private handleNetworkError(
    err: unknown,
    method: string,
    context: Record<string, unknown>
  ): EvaluateResponse {
    const message = err instanceof Error ? err.message : "Network error";
    const type: TechnicalErrorType =
      message === "Request timeout" ? "TIMEOUT" : "NETWORK_ERROR";
    this.logger(`[ReleaseAnchor] ${method}: ${type}`, { ...context, error: message });
    return createFallbackResponse(type, message, this.defaultValue);
  }

  private buildBulkFallback(
    errorType: TechnicalErrorType,
    message: string,
    userIdentifiers: string[]
  ): Record<string, EvaluateResponse> {
    const fallback = createFallbackResponse(
      errorType,
      message,
      this.defaultValue
    );
    const result: Record<string, EvaluateResponse> = {};
    for (const userId of userIdentifiers) {
      result[userId] = fallback;
    }
    return result;
  }

  private async parseJson<T>(res: Response): Promise<T | null> {
    try {
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return res;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Request timeout");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
