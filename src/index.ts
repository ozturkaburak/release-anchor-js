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
  /** Default cache TTL in milliseconds (30 seconds). Set to 0 to disable cache. */                                                                                                                                       
  const DEFAULT_CACHE_TTL_MS = 30_000;                                                                                                                                                                                    
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
      /** Cache TTL in milliseconds. Default: 30000. Set to 0 to disable cache. */
      cacheTtlMs?: number;                                                                                                                                                                                                
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
                                                                                                                                                                                                                          
  /** Returns a shallow clone of EvaluateResponse to prevent consumer mutation from affecting the cache. */                                                                                                               
  function cloneEvaluateResponse(value: EvaluateResponse): EvaluateResponse {                                                                                                                                             
      return {                                                                                                                                                                                                            
          ...value,                                         
          error: value.error ? { ...value.error } : null,                                                                                                                                                                 
      };                                                                                                                                                                                                                  
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
      private readonly cacheTtlMs: number;                                                                                                                                                                                
      /** Cache for evaluate results: cacheKey -> { value, expiresAt } */
      private readonly cache = new Map<string, { value: EvaluateResponse; expiresAt: number }>();                                                                                                                         
      /** In-flight single evaluate requests for deduplication */
      private readonly inFlight = new Map<string, Promise<EvaluateResponse>>();                                                                                                                                           
      /** In-flight bulk evaluate requests for deduplication */                                                                                                                                                           
      private readonly inFlightBulk = new Map<string, Promise<Record<string, EvaluateResponse>>>();                                                                                                                       
      /** Cache cleanup interval handle, stored for destroy(). */                                                                                                                                                         
      private cleanupInterval?: ReturnType<typeof setInterval>;                                                                                                                                                           
      /** Incremented on every clearCache() call to prevent stale in-flight write-back. */                                                                                                                                
      private cacheGeneration = 0;                                                                                                                                                                                        
      /**                                                   
       * Set to true by destroy(). After destroy(), in-flight requests complete normally                                                                                                                                  
       * but their results are not written to the cache. New evaluate/evaluateBulk calls                                                                                                                                  
       * still work but no caching occurs.                                                                                                                                                                                
       */                                                                                                                                                                                                                 
      private destroyed = false;                                                                                                                                                                                          
                                                                                                                                                                                                                          
      constructor(config: ReleaseAnchorConfig) {            
          if (!config.apiKey?.trim()) {                                                                                                                                                                                   
              throw new Error("ReleaseAnchor: apiKey is required");                                                                                                                                                       
          }                                                                                                                                                                                                               
          if (config.timeout !== undefined && config.timeout <= 0) {
              throw new Error("timeout must be a positive number");
          }
          if (config.cacheTtlMs !== undefined && config.cacheTtlMs < 0) {
              throw new Error("cacheTtlMs must be >= 0");
          }
          this.apiKey = config.apiKey.trim();                                                                                                                                                                             
          this.apiVersion = config.apiVersion ?? "v1";                                                                                                                                                                    
          this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
          this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;                                                                                                                                                            
          this.cacheTtlMs = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
          this.defaultValue = config.defaultValue ?? false;                                                                                                                                                               
          this.logger = config.logger ?? ((msg, ctx) => console.warn(msg, ctx));
          this.strict4xx = config.strict4xx ?? false;                                                                                                                                                                     
                                                                                                                                                                                                                          
          if (this.cacheTtlMs > 0) {                                                                                                                                                                                      
              this.cleanupInterval = setInterval(() => {                                                                                                                                                                  
                  const now = Date.now();                                                                                                                                                                                 
                  for (const [key, entry] of this.cache) {
                      if (now >= entry.expiresAt) this.cache.delete(key);                                                                                                                                                 
                  }                                                                                                                                                                                                       
              }, this.cacheTtlMs * 2);
              const timer = this.cleanupInterval as { unref?: () => void };                                                                                                                                               
              if (typeof timer.unref === "function") timer.unref();                                                                                                                                                       
          }                                                                                                                                                                                                               
      }                                                                                                                                                                                                                   
                                                                                                                                                                                                                          
      /**                                                   
       * Stops the cache cleanup interval and clears all internal state.
       * After destroy(), in-flight requests complete but results are not cached.                                                                                                                                         
       * Call during test teardown or app shutdown to avoid timer leaks.                                                                                                                                                  
       */                                                                                                                                                                                                                 
      destroy(): void {                                                                                                                                                                                                   
          this.destroyed = true;                                                                                                                                                                                          
          if (this.cleanupInterval) {                       
              clearInterval(this.cleanupInterval);                                                                                                                                                                        
              this.cleanupInterval = undefined;                                                                                                                                                                           
          }
          this.cache.clear();                                                                                                                                                                                             
          this.inFlight.clear();                            
          this.inFlightBulk.clear();                                                                                                                                                                                      
      }                                                                                                                                                                                                                   
                                                                                                                                                                                                                          
      /**
       * Clears cached evaluate results.
       *
       * - clearCache(): clears the entire cache and increments cache generation
       *   to prevent stale in-flight write-back after a full reset.
       *
       * - clearCache(flagKey) / clearCache(flagKey, userIdentifier): clears only
       *   the targeted entries and does not affect unrelated in-flight requests.
       */
      clearCache(flagKey?: string, userIdentifier?: string): void {
          if (!flagKey) {
              this.cacheGeneration++;
              this.cache.clear();
              return;
          }

          if (!userIdentifier) {
              const prefix = `${flagKey.trim()}:`;
              for (const key of this.cache.keys()) {
                  if (key.startsWith(prefix)) this.cache.delete(key);
              }
              return;
          }

          this.cache.delete(`${flagKey.trim()}:${userIdentifier.trim()}`);
      }
   
      /**                                                                                                                                                                                                                 
       * Evaluates a single flag for a user.                
       * Returns the backend EvaluateResponse unchanged on 200.                                                                                                                                                           
       * On technical error (network, timeout, 401, 429, 5xx, parse failure): logs and returns fallback.                                                                                                                  
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
                                                                                                                                                                                                                          
          const cacheKey = `${fk}:${uid}`;                                                                                                                                                                                
          const fallbackValue = defaultValue ?? this.defaultValue;                                                                                                                                                        
          const inFlightKey = `${cacheKey}:${fallbackValue}`;                                                                                                                                                             
                                                                                                                                                                                                                          
          if (this.cacheTtlMs > 0) {                                                                                                                                                                                      
              const cached = this.cache.get(cacheKey);                                                                                                                                                                    
              if (cached && Date.now() < cached.expiresAt) {
                  return cloneEvaluateResponse(cached.value);                                                                                                                                                             
              }                                                                                                                                                                                                           
          }                                                                                                                                                                                                               
                                                                                                                                                                                                                          
          const existing = this.inFlight.get(inFlightKey);                                                                                                                                                                
          if (existing) return existing;
                                                                                                                                                                                                                          
          const cleanup = () => this.inFlight.delete(inFlightKey);
          const promise = this.doEvaluate(fk, uid, cacheKey, fallbackValue).then(                                                                                                                                         
              (v) => { cleanup(); return v; },                                                                                                                                                                            
              (err) => { cleanup(); throw err; }                                                                                                                                                                          
          );                                                                                                                                                                                                              
          this.inFlight.set(inFlightKey, promise);                                                                                                                                                                        
          return promise;                                                                                                                                                                                                 
      }                                                     

      private async doEvaluate(                                                                                                                                                                                           
          flagKey: string,
          userIdentifier: string,                                                                                                                                                                                         
          cacheKey: string,                                                                                                                                                                                               
          fallbackValue: boolean
      ): Promise<EvaluateResponse> {                                                                                                                                                                                      
          const genAtStart = this.cacheGeneration;          
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
   
              if (!this.destroyed && this.cacheTtlMs > 0 && genAtStart === this.cacheGeneration) {                                                                                                                        
                  this.cache.set(cacheKey, {                
                      value: cloneEvaluateResponse(data),                                                                                                                                                                 
                      expiresAt: Date.now() + this.cacheTtlMs,
                  });                                                                                                                                                                                                     
              }                                             
              return cloneEvaluateResponse(data);                                                                                                                                                                         
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
                                                                                                                                                                                                                          
              // Build result only from the requested identifiers.                                                                                                                                                        
              // Missing keys become fallback entries; extra keys from the server are ignored.
              const result: Record<string, EvaluateResponse> = {};                                                                                                                                                        
              for (const uid of userIdentifiers) {          
                  const entry = data[uid];                                                                                                                                                                                
                  if (!isValidEvaluateResponse(entry)) {    
                      this.logger("[ReleaseAnchor] evaluateBulk: invalid or missing entry in response", { flagKey, userIdentifier: uid });                                                                                
                      result[uid] = createFallbackResponse("PARSE_ERROR", "Invalid or missing entry in bulk response", fallbackValue);                                                                                    
                  } else {                                                                                                                                                                                                
                      result[uid] = cloneEvaluateResponse(entry);                                                                                                                                                         
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
