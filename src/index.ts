/**
 * ReleaseAnchor JavaScript SDK
 * Evaluates feature flags via the ReleaseAnchor evaluation API.
 * Works in Node.js and browser environments.
 *
 * Transport/fallback layer only — passes through backend responses unchanged.
 * Fallback applies only for technical errors (network, timeout, 401, 429, 5xx, parse failure).
 * When strict4xx=true, 4xx responses (except 401/429) throw StrictHttpError instead of returning fallback.
 */

/** API base URL when baseUrl is not provided */
const DEFAULT_BASE_URL = "https://api.releaseanchor.com";
/** Request timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 5000;
/** SDK identifier and version sent in x-releaseanchor-sdk header */
declare const __SDK_VERSION__: string;
const SDK_HEADER = `release-anchor-js:${__SDK_VERSION__}`;

const VALID_RULE_TYPES = new Set(["STATIC", "SEGMENT", "PERCENTAGE"]);

/** Supported API versions */
export type ApiVersion = "v1" | "v2";

export interface ReleaseAnchorConfig {
    /** Required. Your environment API key from the dashboard. */
    apiKey: string;
    /** API version. Default: v1 */
    apiVersion?: ApiVersion;
    /** Override API base URL. Default: https://api.releaseanchor.com */
    baseUrl?: string;
    /** Request timeout in milliseconds. Default: 5000 */
    timeout?: number;
    /** Fallback when a technical error occurs and no per-call defaultValue is passed. Optional, defaults to false. */
    defaultValue?: boolean;
    /** Optional logger for technical errors. Default: console.warn */
    logger?: (message: string, context?: unknown) => void;
    /** When true, 4xx responses (except 401/429) throw StrictHttpError instead of returning fallback. Helps surface integration bugs. Default: false */
    strict4xx?: boolean;
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

type TechnicalErrorType =
    | "NETWORK_ERROR"
    | "TIMEOUT"
    | "UNAUTHORIZED"
    | "RATE_LIMITED"
    | "HTTP_ERROR"
    | "PARSE_ERROR";

/** Thrown when a request times out. Use instanceof for reliable detection. */
export class TimeoutError extends Error {
    constructor() {
        super("Request timeout");
        this.name = "TimeoutError";
    }
}

/** Thrown when strict4xx=true and a 4xx (non-401/429) response is received. Check err.status for the HTTP status code. */
export class StrictHttpError extends Error {
    constructor(public readonly status: number) {
        super(`HTTP ${status}`);
        this.name = "StrictHttpError";
    }
}

/**
 * Runtime shape validation for EvaluateResponse.
 * Rejects arrays, unknown matchedRuleType values, and malformed error objects.
 */
function isValidEvaluateResponse(data: unknown): data is EvaluateResponse {
    if (data === null || typeof data !== "object" || Array.isArray(data)) return false;
    const o = data as Record<string, unknown>;
    if (typeof o.value !== "boolean") return false;
    if (o.matchedRuleType !== null && !VALID_RULE_TYPES.has(o.matchedRuleType as string)) return false;
    if (o.error !== null) {
        if (typeof o.error !== "object" || Array.isArray(o.error)) return false;
        const e = o.error as Record<string, unknown>;
        if (typeof e.type !== "string" || typeof e.message !== "string") return false;
    }
    return true;
}

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
    private readonly apiVersion: ApiVersion;
    private readonly timeout: number;
    private readonly defaultValue: boolean;
    private readonly logger: (message: string, context?: unknown) => void;
    private readonly strict4xx: boolean;
    /** In-flight single evaluate requests for deduplication */
    private readonly inFlight = new Map<string, Promise<EvaluateResponse>>();
    /** In-flight bulk evaluate requests for deduplication */
    private readonly inFlightBulk = new Map<string, Promise<Record<string, EvaluateResponse>>>();

    constructor(config: ReleaseAnchorConfig) {
        if (!config.apiKey?.trim()) {
            throw new Error("ReleaseAnchor: apiKey is required");
        }
        if (config.timeout !== undefined && config.timeout <= 0) {
            throw new Error("timeout must be a positive number");
        }
        this.apiKey = config.apiKey.trim();
        this.apiVersion = config.apiVersion ?? "v1";
        this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
        this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
        this.defaultValue = config.defaultValue ?? false;
        this.logger = config.logger ?? ((msg, ctx) => console.warn(msg, ctx));
        this.strict4xx = config.strict4xx ?? false;
    }

    /**
     * Clears all in-flight request deduplication state.
     * Call during test teardown or app shutdown.
     */
    destroy(): void {
        this.inFlight.clear();
        this.inFlightBulk.clear();
    }

    /**
     * Evaluates a single flag for a user.
     * Returns the backend EvaluateResponse unchanged on 200.
     * On technical error (network, timeout, 401, 429, 5xx, parse failure): logs and returns fallback.
     * Concurrent calls for the same flagKey+userIdentifier are deduplicated — only one HTTP request is made.
     * @throws {StrictHttpError} When strict4xx=true and a 4xx (non-401/429) response is received.
     */
    async evaluate(
        flagKey: string,
        userIdentifier: string,
        defaultValue?: boolean
    ): Promise<EvaluateResponse> {
        const fk = flagKey.trim();
        const uid = userIdentifier.trim();
        if (!fk) throw new Error("ReleaseAnchor: flagKey is required");
        if (!uid) throw new Error("ReleaseAnchor: userIdentifier is required");

        const fallbackValue = defaultValue ?? this.defaultValue;
        const inFlightKey = `${fk}:${uid}:${fallbackValue}`;

        const existing = this.inFlight.get(inFlightKey);
        if (existing) return existing;

        const cleanup = () => this.inFlight.delete(inFlightKey);
        const promise = this.doEvaluate(fk, uid, fallbackValue).then(
            (v) => { cleanup(); return v; },
            (err) => { cleanup(); throw err; }
        );
        this.inFlight.set(inFlightKey, promise);
        return promise;
    }

    private async doEvaluate(
        flagKey: string,
        userIdentifier: string,
        fallbackValue: boolean
    ): Promise<EvaluateResponse> {
        try {
            const res = await this.fetchWithTimeout(
                `${this.baseUrl}/${this.apiVersion}/evaluate`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `ApiKey ${this.apiKey}`,
                        "x-releaseanchor-sdk": SDK_HEADER,
                    },
                    body: JSON.stringify({ flagKey, userIdentifier }),
                },
                this.timeout
            );

            if (!res.ok) {
                return this.handleTechnicalError(res, "evaluate", { flagKey, userIdentifier }, fallbackValue);
            }

            const data = await this.parseJson<unknown>(res);
            if (!isValidEvaluateResponse(data)) {
                return this.handleParseError("evaluate", { flagKey, userIdentifier }, fallbackValue);
            }

            return { ...data, error: data.error ? { ...data.error } : null };
        } catch (err) {
            if (err instanceof StrictHttpError) throw err;
            return this.handleNetworkError(err, "evaluate", { flagKey, userIdentifier }, fallbackValue);
        }
    }

    /**
     * Evaluates a single flag for multiple users in one request.
     * Returns Record<userIdentifier, EvaluateResponse> for all requested identifiers.
     * Missing keys in the server response are filled with a fallback entry.
     * On technical error: logs and returns fallback for every identifier.
     * @throws {StrictHttpError} When strict4xx=true and a 4xx (non-401/429) response is received.
     */
    async evaluateBulk(
        flagKey: string,
        userIdentifiers: string[],
        defaultValue?: boolean
    ): Promise<Record<string, EvaluateResponse>> {
        const fk = flagKey.trim();
        if (!fk) throw new Error("ReleaseAnchor: flagKey is required");

        const uids = [...new Set(userIdentifiers.map((id) => id.trim()).filter(Boolean))];
        if (uids.length === 0) return {};

        const fallbackValue = defaultValue ?? this.defaultValue;
        const bulkKey = `${fk}:${JSON.stringify([...uids].sort())}:${fallbackValue}`;

        const existing = this.inFlightBulk.get(bulkKey);
        if (existing) return existing;

        const cleanup = () => this.inFlightBulk.delete(bulkKey);
        const promise = this.doEvaluateBulk(fk, uids, fallbackValue).then(
            (v) => { cleanup(); return v; },
            (err) => { cleanup(); throw err; }
        );
        this.inFlightBulk.set(bulkKey, promise);
        return promise;
    }

    private async doEvaluateBulk(
        flagKey: string,
        userIdentifiers: string[],
        fallbackValue: boolean
    ): Promise<Record<string, EvaluateResponse>> {
        try {
            const res = await this.fetchWithTimeout(
                `${this.baseUrl}/${this.apiVersion}/evaluate/bulk`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `ApiKey ${this.apiKey}`,
                        "x-releaseanchor-sdk": SDK_HEADER,
                    },
                    body: JSON.stringify({ flagKey, userIdentifiers }),
                },
                this.timeout
            );

            if (!res.ok) {
                return this.handleTechnicalErrorBulk(res, flagKey, userIdentifiers, fallbackValue);
            }

            const raw = await this.parseJson<unknown>(res);
            if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
                return this.buildBulkFallback("PARSE_ERROR", "Failed to parse response body", userIdentifiers, fallbackValue);
            }
            const data = raw as Record<string, unknown>;

            const result: Record<string, EvaluateResponse> = {};
            for (const uid of userIdentifiers) {
                const entry = data[uid];
                if (!isValidEvaluateResponse(entry)) {
                    this.logger("[ReleaseAnchor] evaluateBulk: invalid or missing entry in response", { flagKey, userIdentifier: uid });
                    result[uid] = createFallbackResponse("PARSE_ERROR", "Invalid or missing entry in bulk response", fallbackValue);
                } else {
                    result[uid] = { ...entry, error: entry.error ? { ...entry.error } : null };
                }
            }
            return result;
        } catch (err) {
            if (err instanceof StrictHttpError) throw err;
            const fallback = this.handleNetworkError(err, "evaluateBulk", { flagKey, userIdentifiers }, fallbackValue);
            return this.buildBulkFallback(
                (fallback.error?.type ?? "NETWORK_ERROR") as TechnicalErrorType,
                fallback.error?.message ?? "Network error",
                userIdentifiers,
                fallbackValue
            );
        }
    }

    private classifyHttpError(status: number): { type: TechnicalErrorType; message: string } {
        if (status === 401) return { type: "UNAUTHORIZED", message: "Invalid or revoked API key" };
        if (status === 429) return { type: "RATE_LIMITED", message: "Rate limit exceeded" };
        return { type: "HTTP_ERROR", message: `HTTP ${status}` };
    }

    private handleTechnicalError(
        res: Response,
        method: string,
        context: Record<string, unknown>,
        fallbackValue: boolean
    ): EvaluateResponse {
        const status = res.status;
        if (this.strict4xx && status >= 400 && status < 500 && status !== 401 && status !== 429) {
            this.logger(`[ReleaseAnchor] ${method}: HTTP ${status}`, context);
            throw new StrictHttpError(status);
        }
        const { type, message } = this.classifyHttpError(status);
        if (status === 401) this.logger(`[ReleaseAnchor] ${method}: 401 Unauthorized`, context);
        else if (status === 429) this.logger(`[ReleaseAnchor] ${method}: 429 Too Many Requests`, context);
        else if (status >= 500) this.logger(`[ReleaseAnchor] ${method}: ${status} Server Error`, context);
        else this.logger(`[ReleaseAnchor] ${method}: HTTP ${status}`, context);
        return createFallbackResponse(type, message, fallbackValue);
    }

    private handleTechnicalErrorBulk(
        res: Response,
        flagKey: string,
        userIdentifiers: string[],
        fallbackValue: boolean
    ): Record<string, EvaluateResponse> {
        const status = res.status;
        if (this.strict4xx && status >= 400 && status < 500 && status !== 401 && status !== 429) {
            this.logger(`[ReleaseAnchor] evaluateBulk: ${status}`, { flagKey, userCount: userIdentifiers.length });
            throw new StrictHttpError(status);
        }
        const { type, message } = this.classifyHttpError(status);
        this.logger(`[ReleaseAnchor] evaluateBulk: ${status}`, { flagKey, userCount: userIdentifiers.length });
        return this.buildBulkFallback(type, message, userIdentifiers, fallbackValue);
    }

    private handleParseError(
        method: string,
        context: Record<string, unknown>,
        fallbackValue: boolean
    ): EvaluateResponse {
        this.logger(`[ReleaseAnchor] ${method}: Failed to parse response body`, context);
        return createFallbackResponse("PARSE_ERROR", "Failed to parse response body", fallbackValue);
    }

    private handleNetworkError(
        err: unknown,
        method: string,
        context: Record<string, unknown>,
        fallbackValue: boolean
    ): EvaluateResponse {
        const type: TechnicalErrorType = err instanceof TimeoutError ? "TIMEOUT" : "NETWORK_ERROR";
        const message = err instanceof Error ? err.message : "Network error";
        this.logger(`[ReleaseAnchor] ${method}: ${type}`, { ...context, error: message });
        return createFallbackResponse(type, message, fallbackValue);
    }

    private buildBulkFallback(
        errorType: TechnicalErrorType,
        message: string,
        userIdentifiers: string[],
        fallbackValue: boolean
    ): Record<string, EvaluateResponse> {
        const result: Record<string, EvaluateResponse> = {};
        for (const userId of userIdentifiers) {
            result[userId] = createFallbackResponse(errorType, message, fallbackValue);
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
            const res = await fetch(url, { ...init, signal: controller.signal });
            clearTimeout(timeoutId);
            return res;
        } catch (err) {
            clearTimeout(timeoutId);
            if (err instanceof Error && err.name === "AbortError") throw new TimeoutError();
            throw err;
        }
    }
}
