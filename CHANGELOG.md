# 1.0.0 (2026-03-20)


* feat!: add caching, request deduplication, strict4xx mode, and per-call defaultValue ([27fdc37](https://github.com/ozturkaburak/release-anchor-js/commit/27fdc37cc2e28a8d495e1eea92a65a4bf6a987b3))


### BREAKING CHANGES

* removes BulkEvaluateResult type export; default timeout
increased from 3000ms to 5000ms; SDK header renamed from X-SDK to
x-releaseanchor-sdk; evaluate() and evaluateBulk() now accept an optional
per-call defaultValue parameter.

- Add 30s in-memory cache with cloneEvaluateResponse for mutation safety
- Add in-flight deduplication for evaluate and evaluateBulk
- Add strict4xx mode that throws StrictHttpError instead of returning fallback
- Add apiVersion config option (v1/v2)
- Add RATE_LIMITED error type
- Add destroy() and clearCache() methods
- Add cacheGeneration counter to prevent stale in-flight write-back
- Add runtime shape validation via isValidEvaluateResponse
- Export TimeoutError and StrictHttpError

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

# Changelog

All notable changes to this project will be documented in this file. See [commit convention](https://www.conventionalcommits.org/) for commit guidelines.
