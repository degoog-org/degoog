# CodeRabbit PR Review Standards for Degoog

Degoog is a Bun + Hono TypeScript search aggregator. As an AI code reviewer, use these standards to evaluate pull requests, ensuring the project remains maintainable without forcing rewrites or breaking public behavior. 

Apply these standards strictly to new code. For existing code, suggest improvements only when the module is already being touched for a feature, bug fix, or security update.

## 0. Two Things That Get Added Uninvited

Read this before the rest. Both of these arrive in almost every generated PR and neither is wanted.

### Comments
Code here carries no comments. Not explanatory ones, not section dividers, not JSDoc. If a line needs a sentence above it to make sense, the naming is wrong, so fix the naming. The bar for an exception is genuinely high: a workaround whose reason cannot be read off the code, or a warning about something that will bite the next person. "Absolutely necessary" means the code is correct but surprising, not that the code is hard.

JSDoc appears only where the author was explicitly asked for it. A comment restating the line below it should be stripped before merge. Comments already in the tree are not permission to add more.

### Tests
Tests matter here, which is why the bar is high rather than low. A test earns its place when it pins behaviour that can realistically break and that somebody would notice breaking. Auth gates, cache keys, registry load order, route shapes, parser defaults, rendered markup surviving a refactor. Those exist because they broke once.

Everything else is weight. Reject tests that assert a constant equals itself, walk through the implementation line by line, check a getter returns what was just passed in, or exist so a coverage number moves. A test that cannot fail is worse than no test, because it still has to be read, maintained and trusted.

Be blunt about this with generated PRs. Agents write tests in bulk and most of them prove nothing. Ask what would have to break for the test to go red. If the answer is nothing a user would ever hit, say so and cut it. Ten focused tests are worth more than two hundred that restate the code.

## 1. Core Principles Review

### Directives
- **Protect Contracts:** Flag any unannounced changes to existing APIs, UI contracts, config names, environment variables, plugin/theme/engine interfaces, store layouts, and route behavior. Require a documented migration path or `@deprecated` shim.
- **Scope Control:** Reject massive, style-only rewrites. Praise and encourage small, behavior-preserving changes.
- **Test Enforcement:** Block refactors of routes, search orchestration, persistence, extension loading, security gates, or user settings if they lack tests covering observable behavior.
- **Readability:** Push back on overly clever abstractions. Code must be readable so future contributors can trace route/search/registry behavior easily.
- **Trust Boundaries:** Treat installed extensions/themes as trusted, but rigorously verify that PRs treat their inputs, paths, URLs, rendered HTML, and persisted metadata as untrusted. Section 8 covers what this means for `Raw` and `innerHTML`.

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
  - Components: `PascalCase`, in a `kebab-case.tsx` file named after them.
- **Function Size:** Suggest splitting functions that exceed ~60 lines or try to handle parsing, validation, persistence, rendering, and logging all at once. A component that is long because it is mostly markup is not the same problem, so judge it on whether it mixes fetching or state with rendering, not on line count.
- **Correct Placement:** Ensure changes respect module boundaries (e.g., HTTP concerns in `routes/`, shared logic in `utils/search.ts`, UI orchestration in `client/modules/`).
- **The UI Runtime Is Shared:** `src/shared/ui` is imported by both the server and the browser, so not everything in it is safe everywhere. `core/html`, `core/raw`, `core/escape`, `core/types` and the plain components run in both. `core/dom` and `components/overlay/shell` touch `document` and are browser-only. The server imports deep paths and never the `components/index.ts` barrel, which is what keeps browser-only modules out of it. `no-restricted-imports` enforces that for `src/server/**`. What lint cannot see is a new `document` or `window` reference added to a module the server already imports, so reject those on sight. A component reaching for `window.scopedT` belongs beside its feature, not in `src/shared/ui/components`.

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
- **Accessibility:** Ensure interactive elements are semantic (`<button>`, `<a>`), have `aria-label`s if icon-only, preserve keyboard navigation, and handle loading states visibly.

## 7a. The UI Component System

Markup lives in `.tsx` components, not in template literals. The runtime is hand-rolled and pulls in nothing. `tsconfig.json` sets `jsx: "react-jsx"` and `jsxImportSource: "@degoog/ui"`, aliased to `src/shared/ui`. This is not React. There are no hooks and no lifecycle.

### What to Look For
- **No HTML in Strings:** Reject new markup built by string concatenation or template literals in `.ts` files. Markup belongs in a component that returns `JSX.Element`.
- **One Component Per File:** Every `.tsx` file declares exactly one component. Shared components live in `src/shared/ui/components/<group>/<name>.tsx`. Feature-specific ones sit beside the feature. `tests/unit/ui/one-component-per-file.test.ts` enforces this, so a second component in a file fails CI rather than needing a reviewer to spot it.
- **Compose, Do Not Stringify:** A component must not take pre-rendered HTML from another component. A prop typed `html: string` whose producer is our own code is the defect. That producer should return `JSX.Element` or `Child` and be passed as children. Reject new `html={string}` props.
- **Escaping Is the Renderer's Job:** The renderer escapes text children for you. Reject `escapeHtml(...)` followed by injection, and reject hand-built entities. That is where escaping bugs come from.
- **Explicit Return Types:** Components return `JSX.Element`, or `JSX.Element | null` when they can render nothing. Helpers that accept arbitrary children use `Child` from `src/shared/ui/core/types.ts`.

### The Two Renderers
One VNode tree, two outputs. Picking the wrong one is a review finding.
- `renderHtml(node): string` for the server, for theme template substitution, and for the nojs layer. The server has no DOM, so this is correct there. It should not appear in `src/client` at all; there are currently zero uses and a new one is a finding.
- `render(node, container)` for the browser. It does a keyed diff and reuses DOM nodes.
- `append(node, container)` builds nodes and appends them after whatever is already there. Use it instead of rendering a component to a string for `insertAdjacentHTML`.
- `clear(container)` empties a container and drops the renderer's cached tree for it. This is the replacement for `innerHTML = ""`.

There is no reactive layer. Signals were removed once it turned out one file used them. If a change reintroduces `signal`, `computed` or `mount`, ask what the second and third consumers are before it lands.

### innerHTML
Assigning `innerHTML` and calling `insertAdjacentHTML` are lint errors across `src`. Eleven files are allowlisted by name at the top of `eslint.config.js`, and the allowlist exists for exactly three reasons:
1. Theme `renderTemplate()` output, which is the public theming contract.
2. Server or plugin HTML that must execute its own `<script>` tags.
3. Markdown already sanitised by DOMPurify.

Reading `.innerHTML` is not an assignment and is fine anywhere.

CI catches a new file. It does not catch a new `innerHTML` inside an already-allowlisted file, so that is the case to read carefully. A PR that adds a file to the allowlist has to justify it against one of the three reasons above, and growing that list should be rare enough to be memorable.

### Escape Hatches
`<Raw html={...}/>` and `raw(...)` inject a string verbatim. They earn their place for extension-supplied HTML, theme partials, sanitised markdown, and translation strings that carry markup. They are a defect when the string came from one of our own components. The `static` prop opts a subtree out of diffing and exists for DOM that extensions mutate. A new use of it needs a reason in the PR.

### Traps That Have Already Caused Regressions
- **Entry files:** never rename an `index.ts` to `index.tsx`. The extension loader resolves `index.{js,ts,mjs,cjs}` only, so the rename makes the extension vanish at runtime with nothing in the logs. Put the JSX in a sibling `render.tsx` and import it.
- **Button variant:** the shared `Button` defaults `variant` to `"secondary"`, which silently adds `btn--secondary degoog-btn--secondary`. If a call site must not carry those classes, it needs a plain `<button>`. This shipped once already.
- **nojs has no JavaScript:** it runs under `script-src 'none'`, so `renderHtml` drops event handlers on purpose. A handler that only works in the JS path is not a nojs bug.

### Event Handlers
Handlers are props, `onClick` and `onChange`. The diff rebinds a listener only when the handler's identity changes, so an inline arrow in a view that re-renders often rebinds on every pass. Flag manual `addEventListener` in code that also calls `render()`. The listener outlives the diff and leaks.

### Refactor PRs Touching Markup
Type checking does not see markup, and the test suite barely does. Make the author say how they proved the output is unchanged. Rendering old and new and diffing the normalised HTML is the bar. "I checked it looks the same" is not. Check that every DOM ID and `data-*` attribute survived, because other code queries them later.

## 8. Security Standards

### Security PR Checklist
- **SSRF Prevention:** Ensure proxied/fetched URLs strictly allow `http:` and `https:`, re-check protocols after redirects, and use signed proxy URLs for exposed assets.
- **Path Verification:** Assert that all extension/store paths are resolved and checked for containment before reads/writes.
- **Secret Hygiene:** Flag PRs that log settings/admin/search API tokens or nonces. Ensure secret settings are masked in UI/metadata responses.
- **Header Trust:** Do not allow trust of `X-Forwarded-*` headers unless explicit proxy trust settings are enabled.
- **Error Safety:** Ensure error responses do not leak local paths, tokens, repo internals, or stack traces.
- **The nojs Layer Parses, It Does Not Pattern-Match:** `src/server/nojs/dom.ts` injects rendered components into the active theme's own HTML file, which is why it exists at all. It uses Bun's `HTMLRewriter`. Reject a regex added to find or rewrite an element, and reject a new helper that does string surgery on theme HTML. Its helpers are async, so a missing `await` there is a silent wrong-type bug.
- **Markup In Translations:** A translated string that carries a `{placeholder}` for a link or button goes through `<TransText text slots/>`, which escapes the prose and substitutes a VNode for the slot. Reject a component rendered to a string and passed as a translation parameter, and reject markup built inside a locale value.
- **XSS Through the Escape Hatch:** `<Raw html={...}/>`, `raw(...)` and `innerHTML` are the only ways to bypass escaping, so they are where XSS gets in. For each one, trace the string back to its source. Extension and theme HTML is trusted by the install model. Markdown is fine only if DOMPurify ran. Anything derived from a query, a URL, an engine response, a repo field or a store listing is untrusted and must go through a component as a text child instead. A `Raw` whose input cannot be traced is a blocking finding, not a nitpick.
- **Do Not Hand-Roll Escaping:** Reject new `escapeHtml` calls in rendering paths. The renderer escapes text children, and a manual escape followed by string injection is how the escaping gets skipped on the next edit.

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
- **Renderer, Not Appearance:** `tests/unit/ui/` covers the renderer itself: escaping, keyed reuse by node identity, handler rebinding, `static` subtrees, recovery from foreign DOM writes. Changes to `src/shared/ui/core` need a test there. Do not ask for snapshot tests of component markup, they break on every harmless edit and prove nothing.
- **Markup Parity Over Snapshots:** When a PR moves or rewrites markup, the evidence is a rendered-output diff against the previous code, not a new committed test. Ask for the case count and the result. Those harnesses are throwaway and should not land in `tests/`.

## 12. Duplication Control

### Refactoring PR Checklist
- **Rule of Two:** Do not praise generic abstractions created for a single call site. Require at least two real use cases before extracting shared helpers. This applies to `src/shared/ui/components` as hard as anywhere else. A component used once belongs beside the feature that uses it, and it gets promoted when a second caller appears.
- **Splitting Is Not Abstracting:** One component per file is a layout rule, not an invitation to invent wrappers. A function whose whole body is a call to one component with the same arguments is indirection, so flag it and inline it.
- **Near-Duplicate Components:** Two components rendering nearly the same markup are worth a comment, but reuse is only correct if the output is genuinely identical. A shared component with a pile of boolean props to cover every caller is worse than two honest ones.
- **Focus:** Prefer small, narrowly-named helpers over dumping unrelated functions into large utility files.

## 13. Final Approval Gate (Rule of Thumb)

Before approving a PR, verify:
1. Does it preserve user-facing behavior? (Unless explicitly marked as a breaking change).
2. Are compatibility risks for extensions/plugins/themes considered?
3. Are secrets, paths, and HTML boundaries safely handled? Every `Raw` and `innerHTML` it adds should trace back to a trusted source.
4. If it changed markup, did the author show the rendered output is unchanged, DOM IDs and `data-*` included?
5. Is the PR small enough to review confidently? (If not, suggest splitting it up).