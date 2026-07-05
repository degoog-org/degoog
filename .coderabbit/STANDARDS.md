# CodeRabbit PR Review Standards for Degoog

Degoog is a Bun + Hono TypeScript search aggregator. As an AI code reviewer, use these standards to evaluate pull requests, ensuring the project remains maintainable without forcing rewrites or breaking public behavior. 

Apply these standards strictly to new code. For existing code, suggest improvements only when the module is already being touched for a feature, bug fix, or security update.

## 1. Core Principles Review

### Directives
- **Protect Contracts:** Flag any unannounced changes to existing APIs, UI contracts, config names, environment variables, plugin/theme/engine interfaces, store layouts, and route behavior. Require a documented migration path or `@deprecated` shim.
- **Scope Control:** Reject massive, style-only rewrites. Praise and encourage small, behavior-preserving changes.
- **Test Enforcement:** Block refactors of routes, search orchestration, persistence, extension loading, security gates, or user settings if they lack tests covering observable behavior.
- **Readability:** Push back on overly clever abstractions. Code must be readable so future contributors can trace route/search/registry behavior easily.
- **Trust Boundaries:** Treat installed extensions/themes as trusted, but rigorously verify that PRs treat their inputs, paths, URLs, rendered HTML, and persisted metadata as untrusted.

## 2. TypeScript Style & Module Boundaries

### What to Look For
- **Strict DTOs:** Verify strict types for data crossing boundaries (client/server, route/orchestration, registry/extensions). Ensure shared shapes use `src/shared` to avoid client/server drift.
- **Return Types:** Flag missing explicit return types on exported functions, route helpers, registry helpers, persistence functions, and security-sensitive utilities.
- **Typing Rules:** Enforce `unknown` at external boundaries (followed by validation/narrowing) over `any`.
- **Naming Conventions:**
  - Types/Interfaces: `PascalCase`.
  - Constants: `UPPER_SNAKE_CASE`.
  - Internal Helpers: Leading underscore `_` only if file-private and matching local convention.
  - Verbs: `parse*`, `is*`/`assert*`, `to*`/`from*`, `load*`/`write*`.
- **Function Size:** Suggest splitting functions that exceed ~60 lines or try to handle parsing, validation, persistence, rendering, and logging all at once.
- **Correct Placement:** Ensure changes respect module boundaries (e.g., HTTP concerns in `routes/`, shared logic in `utils/search.ts`, UI orchestration in `client/modules/`).

## 3. Hono Route Standards

### Route PR Checklist
- **Guard Placement:** Verify that rate limiting and auth guards (`guardApiKey`, settings guards) are placed at the *top* of the route handler, before expensive operations.
- **JSON Parsing:** Flag repeated `try/catch` blocks for body parsing; suggest extracting or using existing JSON parser helpers.
- **Error Envelopes:** Ensure JSON routes return consistent `{ error: string }` envelopes and appropriate status codes. Do not allow plain text errors unless the route is a binary/text proxy with an established contract.
- **Separation of Concerns:** Route handlers must focus on HTTP. Suggest moving store mutations, search orchestration, and persistence into helper functions.
- **Default Preservation:** Scrutinize parser refactors to ensure default values (search type, page, lang, streaming toggles) remain intact.

## 4. Extension Registry Standards

### Registry PR Checklist
- **Determinism:** Verify that directory reads/entries are explicitly sorted to guarantee stable load order across restarts.
- **ID Stability:** Enforce canonical ID structures `<folder>-<kind>` (`-engine`, `-slot`, `-command`, `-tab`, etc.). Reject renames of built-in IDs or settings IDs without a valid migration.
- **Duplicate Handling:** Ensure duplicate extension IDs are handled gracefully (logged with context) and do not silently merge unrelated settings.
- **Lifecycle Semantics:** `match() === null` should not log as an error. `onLoad` failures should log context without leaking secrets and safely skip the extension.
- **Immutability:** Ensure callers do not mutate registry-owned arrays (`items()`).

## 5. Store & Installation Standards

### Installation PR Checklist
- **Transparency:** Reject PRs that silently run package manager commands or hide dependency installations.
- **Path Containment:** Scrutinize repository operations. Verify URL scheme validation, git error sanitization, timeouts, and containment checks (reject `..`, absolute child paths, symlink escapes). Never trust repo-provided filenames for writes.
- **Atomic Writes:** Ensure persistence updates for store metadata are atomic (e.g., temp-file creation followed by rename).
- **Concurrency:** Look for locks on store writes, settings writes, and install/uninstall operations to prevent race conditions.
- **ID Preservation:** Ensure installed item IDs and `installedAs` names are preserved across updates unless explicitly changed by the user.

## 6. Search Orchestration Standards

### Search PR Checklist
- **Streaming Parity:** Enforce identical orchestration paths between `/stream` and non-streaming search. Query parsing, engine selection, interceptors, scoring, and cache writes must not be duplicated or drifted.
- **Cache Integrity:** Verify that cache keys include *all* inputs (query, overrides, engine config, page, time, lang, image filters).
- **Interceptor Overrides:** Ensure `searchType`, `lang`, and `timeFilter` overrides from interceptors are correctly applied *before* cache key construction and engine selection.
- **Timeouts/Signals:** Verify that engine fetches receive `AbortSignal` and that streaming stops when the client disconnects.
- **Engine Type Model (CRITICAL):**
  - Reject restrictive unions for `EngineSearchType` (it must remain `string`).
  - Ensure type arrays (`["web", "karakeep"]`) are supported.
  - Verify `resolveTypes` in `engines/registry.ts` is the single source of truth for type resolution.
  - Verify `selectActiveEngines` uses unified paths (`getActiveWebEngines` vs `getEnginesForCustomType`). Ensure `includeCustom` is not reintroduced.

## 7. Client UI Standards

### Frontend PR Checklist
- **Layer Separation:** Suggest splitting UI functions that mix parsing, fetching, state updates, and DOM rendering.
- **Selector Stability:** Reject changes to stable DOM IDs, classes (`degoog-*`), and `data-*` attributes. These are public APIs for themes, plugins, and browser extensions.
- **Event Handlers:** Praise/suggest event delegation (`data-action`) over rebinding handlers on every render.
- **DOM Safety:** Strongly flag the use of `innerHTML` unless handling explicitly trusted templates or sanitized HTML. Recommend `textContent` for general data.
- **Accessibility:** Ensure interactive elements are semantic (`<button>`, `<a>`), have `aria-label`s if icon-only, preserve keyboard navigation, and handle loading states visibly.

## 8. Security Standards

### Security PR Checklist
- **SSRF Prevention:** Ensure proxied/fetched URLs strictly allow `http:` and `https:`, re-check protocols after redirects, and use signed proxy URLs for exposed assets.
- **Path Verification:** Assert that all extension/store paths are resolved and checked for containment before reads/writes.
- **Secret Hygiene:** Flag PRs that log settings/admin/search API tokens or nonces. Ensure secret settings are masked in UI/metadata responses.
- **Header Trust:** Do not allow trust of `X-Forwarded-*` headers unless explicit proxy trust settings are enabled.
- **Error Safety:** Ensure error responses do not leak local paths, tokens, repo internals, or stack traces.

## 9. Persistence & Cache Standards

### Persistence PR Checklist
- **JSON Schema:** Ensure JSON persistence logic tolerates missing fields, preserves unknown fields, and recovers safely.
- **Atomicity:** Flag direct overwrites of critical JSON files. Require atomic write patterns (write to temp file -> fsync -> rename).
- **Caching:** Ensure new cache APIs use async `useCache`. Verify cache invalidation clears both local memory and Valkey state. Ensure TTLs rely on safe defaults/env vars.

## 10. Logging & Observability

### Logging PR Checklist
- **Console Usage:** Reject raw `console.*` in server code (except for startup scripts). Enforce the central `logger` utility.
- **Namespaces:** Ensure logs use feature namespaces (e.g., `search`, `store:repo`, `settings`).
- **Telemetry Value:** Ensure logs contain meaningful metrics (query lengths, result counts, timings) and *never* log sensitive payloads, passwords, or tokens.
- **Structured Formats:** Encourage `key=value` paired strings for easier scanning.

## 11. Testing Standards

### Test PR Checklist
- **Coverage:** Reject bug fix PRs that lack regression tests (if testable). Demand tests for route shapes, auth guards, cache keys, and store safety.
- **Isolation:** Verify tests isolate runtime data using env vars/data paths.
- **Mocks:** Ensure network/git mocks are used sparingly and assert the critical commands/options.
- **Determinism:** Flag flaky tests. Inputs must be sorted, time controlled, and external search dependencies mocked or removed.

## 12. Duplication Control

### Refactoring PR Checklist
- **Rule of Two:** Do not praise generic abstractions created for a single call site. Require at least two real use cases before extracting shared helpers.
- **Focus:** Prefer small, narrowly-named helpers over dumping unrelated functions into large utility files.

## 13. Final Approval Gate (Rule of Thumb)

Before approving a PR, verify:
1. Does it preserve user-facing behavior? (Unless explicitly marked as a breaking change).
2. Are compatibility risks for extensions/plugins/themes considered?
3. Are secrets, paths, and HTML boundaries safely handled?
4. Is the PR small enough to review confidently? (If not, suggest splitting it up).