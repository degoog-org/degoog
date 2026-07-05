# CodeRabbit Code Review Context for Degoog

Degoog is a Bun and Hono TypeScript search aggregator created by fccview. It combines server-side search orchestration, a browser UI, extension registries, themes, admin settings, a plugin store, optional Valkey caching, Docker deployment, and tests. 

As an AI code reviewer, use the following guidelines to evaluate PRs, generate feedback, and flag regressions.

## Key Review Directives

- **Enforce Standards:** Verify that PRs align with `STANDARDS.md` (located in the same folder). Flag any violations.
- **Protect App Behavior:** Flag any changes that alter existing app behavior unless the PR explicitly notes that the behavior change is intended and approved.
- **Protect Public Contracts:** Ensure public API routes, response shapes, settings keys, environment variables, plugin APIs, extension IDs, theme behavior, and UI expectations remain strictly intact.
- **Scope Checking:** Call out massive rewrites or scope creep. Suggest breaking large, unstructured PRs into smaller, reviewable changes.
- **Test Coverage:** Verify that focused tests have been added or updated for the behavior touched in the PR. Flag missing test coverage for new logic.
- **Reject Style Churn:** Flag and discourage style-only code churn across unrelated files.
- **CSS/SCSS Enforcement:** Check that UI styling is done in modularised `.scss` files. Flag any modifications to standard `.css` files unless the changes are strictly within a `./store` folder.
- **Class Naming:** Ensure new UI elements follow the existing styling patterns and the `degoog-*` class name convention.

## Architecture Context (For validating file placement)

When reviewing, ensure changes are logically placed according to this architecture:
- **Boot/Entry:** Server entrypoint and app boot live around `src/server/index.ts`.
- **Routing:** Hono routes live under `src/server/routes/`.
- **Search Logic:** Core search lives around `src/server/search.ts`. Route-specific handlers are under `src/server/routes/search/` and streaming search is in `src/server/routes/search-stream.ts`.
- **Extensions:** Registries live under `src/server/extensions/` (sharing behavior via `src/server/extensions/registry-factory.ts`). Store install, update, uninstall, and repo handling live under `src/server/extensions/store/`.
- **Utilities:** Server settings, plugin settings, cache, rate limiting, proxy handling, auth helpers, and path helpers live under `src/server/utils/`.
- **Frontend:** Client UI code lives under `src/client/`. Public templates and theme files live under `src/public/`.
- **Testing:** Tests live under `tests/`.

## Important Project Values

- **Strict UI Consistency:** The Front End tech lead is highly particular about UI consistency. Reject PRs that introduce borders, blur, or transparency. Enforce existing styling paradigms strictly.
- **No Developer Comments:** Flag and request the removal of any inline code comments added in the PR. Only the human lead developer is permitted to manually add comments.
- **Code Quality:** Prioritize readability and maintainability over clever, overly terse code in your review suggestions.
- **Backward Compatibility:** Existing users must not be forced to change configuration, URLs, plugins, themes, or workflows due to a PR. Flag any breaking migration impacts immediately.
- **Security vs. Compatibility:** Security fixes are welcome, but scrutinize them heavily for compatibility and migration impact. 
- **Extension Trust Model:** Treat installed plugins, themes, engines, and transports as a trusted extension system unless the PR explicitly introduces a stricter user-requested trust model.

## What to Look For During Refactors / Cleanups

Praise or suggest the following improvements during PR reviews:
- **Deduplication:** Look for opportunities to reduce duplicated logic between streaming and non-streaming search, provided the response formats do not change.
- **Cache Integrity:** Verify that cache keys remain complete and behavior-specific.
- **Deterministic IDs:** Ensure extension IDs and settings IDs remain deterministic and backward compatible.
- **Reliable Registries:** Check that registry loading remains deterministic, paying special attention to duplicate triggers, duplicate names, and skip behavior.
- **Data Safety:** Verify that file writes remain atomic for persistent JSON settings or store metadata.
- **Route Consistency:** Ensure route JSON parsing, auth checks, and rate limiting remain consistent across endpoints.
- **Path Safety:** Scrutinize path handling for plugin, theme, proxy, and store assets to prevent directory traversal or unsafe access.
- **Modularization:** Encourage developers moving large modules toward smaller, responsibility-focused modules.

## PR Rejection Criteria (What to Flag Immediately)

Leave blocking review comments if a PR attempts to do any of the following:
- Rewrite the app or replace core architectural decisions.
- Replace Bun or Hono.
- Rename public routes or settings without a clear, approved compatibility strategy.
- Break plugin, theme, engine, transport, or store compatibility.
- Redesign the UI as a byproduct of a cleanup/refactor.
- Change production defaults without explicit approval documented in the PR.