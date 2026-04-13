# 2.0.0 (2026-04-09)


* feat!: add caching, request deduplication, strict4xx mode, and per-call defaultValue ([e2c05b2](https://github.com/ozturkaburak/release-anchor-js/commit/e2c05b2ee4ebdd79adb52abe24437c06b89507c7))


### Bug Fixes

* add publishConfig to publish scoped package as public ([8ddf40c](https://github.com/ozturkaburak/release-anchor-js/commit/8ddf40c2e511fa41f0b6c2fe805c186f6f180e34))
* correct repository URL in package.json ([84369ab](https://github.com/ozturkaburak/release-anchor-js/commit/84369abd0880d5b681b2bf8d55c177b2827b9eec))
* derive SDK header version from package.json in test assertion ([527ebda](https://github.com/ozturkaburak/release-anchor-js/commit/527ebdaded6e58d287aee5e1391180231bd9db40))
* remove dev-oriented example section, fix misleading TimeoutError catch ([a36ed60](https://github.com/ozturkaburak/release-anchor-js/commit/a36ed602048913bb7df1b3a51447a03044e371dc))
* remove localhost example from README ([a8a811e](https://github.com/ozturkaburak/release-anchor-js/commit/a8a811e6e12a52bebec1b9ed95340177022e64f7))


### Features

* production-readiness hardening before first public release ([c83b9b1](https://github.com/ozturkaburak/release-anchor-js/commit/c83b9b1898e88265b7eedf4c202679545ebf62b1))


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

## [1.1.3](https://github.com/ozturkaburak/release-anchor-js/compare/v1.1.2...v1.1.3) (2026-03-28)


### Bug Fixes

* remove dev-oriented example section, fix misleading TimeoutError catch ([85cc5cd](https://github.com/ozturkaburak/release-anchor-js/commit/85cc5cdbbd4b0a3032fdf253b155b95e1b99fbdd))

## [1.1.2](https://github.com/ozturkaburak/release-anchor-js/compare/v1.1.1...v1.1.2) (2026-03-25)


### Bug Fixes

* remove localhost example from README ([8c3eee7](https://github.com/ozturkaburak/release-anchor-js/commit/8c3eee7642cf3776964db7ec399f5ccc9621ca6e))

## [1.1.1](https://github.com/ozturkaburak/release-anchor-js/compare/v1.1.0...v1.1.1) (2026-03-25)


### Bug Fixes

* add publishConfig to publish scoped package as public ([4885600](https://github.com/ozturkaburak/release-anchor-js/commit/4885600926eae8564b712e592038eb55ec8186e9))

# [1.1.0](https://github.com/ozturkaburak/release-anchor-js/compare/v1.0.0...v1.1.0) (2026-03-25)


### Bug Fixes

* correct repository URL in package.json ([0424b23](https://github.com/ozturkaburak/release-anchor-js/commit/0424b23414a57dc8131afe94c2a949f53a2f3fe0))
* derive SDK header version from package.json in test assertion ([6335e23](https://github.com/ozturkaburak/release-anchor-js/commit/6335e23b318cb0eea86999ed00e4cd16ab575a23))


### Features

* production-readiness hardening before first public release ([34f9160](https://github.com/ozturkaburak/release-anchor-js/commit/34f9160f030fd0688ddcc8b2c8839aac9b33f295))

# [1.1.0](https://github.com/ozturkaburak/release-anchor-js/compare/v1.0.0...v1.1.0) (2026-03-25)


### Bug Fixes

* correct repository URL in package.json ([0424b23](https://github.com/ozturkaburak/release-anchor-js/commit/0424b23414a57dc8131afe94c2a949f53a2f3fe0))
* derive SDK header version from package.json in test assertion ([6335e23](https://github.com/ozturkaburak/release-anchor-js/commit/6335e23b318cb0eea86999ed00e4cd16ab575a23))


### Features

* production-readiness hardening before first public release ([34f9160](https://github.com/ozturkaburak/release-anchor-js/commit/34f9160f030fd0688ddcc8b2c8839aac9b33f295))

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

# Changelog

All notable changes to this project will be documented in this file. See [commit convention](https://www.conventionalcommits.org/) for commit guidelines.
