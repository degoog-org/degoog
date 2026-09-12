# Degoog

Degoog is a search aggregator you run yourself. One query fans out to every engine you have enabled, in parallel, from your own server. What comes back is one merged list. Nobody signs in and nothing follows you around afterwards.

It ships with zero search engines installed. That is deliberate. Almost everything interesting is an extension: engines, autocomplete providers, transports, plugins, themes, shortcuts. They arrive from git repositories through the Store, and most of them were written by somebody who is not me.

There is no company behind this and no support desk. When something breaks there is a person who self-hosts it and whatever backup they happened to take. Some of those people run public instances that strangers use as their daily search engine.

This file covers what we value. Branching and pull requests live in `CONTRIBUTING.md`, coding standards live in `.coderabbit/STANDARDS.md`, and the user and developer documentation lives at https://degoog-org.github.io/docs.

## The core stays small

Degoog exists because searxng exists and I wanted a lighter, more modular take on it. That only holds if the core resists growing.

Before you add a feature to core, ask whether it could be an extension. Bang commands, result panels, engines, outgoing request strategies, keyboard bindings and whole HTTP routes are already extension types. If your idea fits one, it belongs in a store repo rather than `src/server`.

Core owns the fan-out, the merge, the settings, the registries and the store. Everything else is somebody else's plugin folder.

## Extensions are a public API

Installing an extension copies files into `data/` and then dynamic-imports them into the running process. There is no sandbox. Install is code execution, and the docs say so. Do not add wrappers that imply otherwise, and do not tighten the trust model without being asked.

The contract that community authors code against is wider than it looks:

- Canonical IDs from `makeExtID`, which is `{folder}-{kind}`. Every settings key, the enabled-engine map, the active theme and every shortcut binding hang off these strings.
- Export names the registries match on: `executeSearch`, `getSuggestions`, `intercept`, `trigger` and `execute`, `fetch`, `run`, `plugin`, `routes`, `searchBarActions`.
- Context fields those hooks receive: `ctx.fetch`, `ctx.signProxyUrl`, `ctx.useCache`, `ctx.sentinel`, `ctx.pluginId`, `ctx.apiBase`.
- Reserved settings keys: `disabled`, `outgoingTransport`, `searchTypeOverride`, `slotPosition`, `priority`, `score`, `theme`, `shortcuts`.
- Slot position strings, `data-slot`, the `degoog-*` template keys and the DOM IDs that shortcuts and themes query from the browser.
- `/api/plugin/<folder>/` and the injected `__PLUGIN_ID__`.

Rename any of those and a community extension stops loading, or worse, loads with everything the user configured now orphaned. Nobody reads the changelog before pulling `latest`.

One settings migration exists, `runCanonicalIdsMigration052028`, gated on `__schemaVersion`. It is one-shot. A second rename needs its own version bump and its own migration, and it has to survive data that is old, new, half done or already migrated.

`minDegoogVersion` is a warning on a store card. It does not block an install and it does not stop the module loading. Do not treat it as a compatibility gate.

## Two search paths, one session

Page one arrives over SSE from `search-stream.ts`. Page two and everything after it comes as JSON from `_search-handlers.ts`. The same user hits both in one session without ever knowing there are two, so a change that lands in one path and not the other means page two looks like a different search engine than page one.

They already share the parts that matter: `parseSearchRequest`, `applyDomainRules`, `selectActiveEngines`, `runIntercepts`, `signResultThumbnails`, `agreedPageTotal`. If your change touches the query, the engine set, the result shape or the page count, put it in the shared helper and let both routes call it. Bolting it onto one route body is how they drift.

If it cannot be shared, run one query through both and tell me in the pull request what you compared: engine set, result count and order, page total, tabs, and the proxied thumbnail URLs. "I checked both paths" on its own tells me nothing. Nothing asserts parity for you. That is a hole in the tests, not permission.

The fan-out is `Promise.all`, and it only survives because `searchSingleEngine` never throws. A broken engine returns an empty run with a status. If you let an exception escape, one dead engine takes down search for everybody.

Cache keys are per engine run. `runKey` covers engine, query, type, page, time filter, language, dates, image filter and a fingerprint of that engine's settings. Drop a component and users get results for the wrong page or the wrong language for the next twelve hours. Empty results cache for that same full TTL, which is why engines must call `context.sentinel` and throw on a block page instead of returning an empty array. A captcha page that parses as zero results poisons that engine for the rest of the day.

Transports exist because the sites we query fight back. Fetch, curl, curl-impersonate, FlareSolverr, a real Firefox session over WebSocket. If you make outgoing requests, go through `context.fetch` so proxy settings and the per-engine transport choice still apply.

## An instance is not a service

There are no user accounts. Server-side there is one shared password list in `DEGOOG_SETTINGS_PASSWORDS`, and every password in it is full admin. Do not invent user IDs or roles.

A visitor owns their browser and nothing else. Theme, engine toggles, POST search, sidebar behaviour and the rest live in IndexedDB under the keys in `src/shared/sync.ts`. An admin can publish instance defaults, but existing local values always win. Do not move visitor preferences onto the server, and do not move instance-wide settings like tab order into the browser.

`DEGOOG_PUBLIC_INSTANCE=true` is a lockdown switch. `/settings` becomes a cut-down page with no admin tabs, admin moves to `/admin`, and the setup wizard never appears. If a public instance has no password configured, `gandalf()` returns false forever and `/admin` answers 404 with no hint it exists. That last part is intentional.

Every mutation route goes through `gandalf()` or `guardSettingsRoute()`. `tests/routes/gated-apis.test.ts` is the list, and it is the contract. A mutation shipped without its gate is the first thing I look for. The unauthenticated extension listing redacts `settings` to `{}` so API keys do not leak; keep it that way.

## Queries pass through, they do not pile up

Nothing phones home. Upstream engines see the server's IP rather than the visitor's, which is most of the reason anybody bothers self-hosting this.

Two exceptions exist and there should not be a third. The indexer, when the admin turns it on, records normalised queries and the results that were shown. The search cache holds query text until its TTL expires. Both are documented. Do not add a query log, and never attach an IP or any other identifier to an index row.

`getClientIp` ignores `X-Forwarded-For` unless `DEGOOG_DISTRUST_PROXY` says otherwise, because trusting it by default lets anyone spoof past rate limits and honeypot bans.

The image proxy refuses unsigned URLs and checks every resolved address against `isSafeHost`, on the original request and on each redirect. Engine fetches do not go through that guard, on purpose. Routing them through it would break engines, so do not "fix" it uninvited.

## The disk is the database

Everything except the indexer is JSON files and extension folders under `data/`. Settings, plugin settings, the store catalogue, aliases, tokens, blocklists. Use `writeJsonAtomic`. A half-written settings file is somebody's whole configuration.

`server-settings.json` failing to parse is the nastiest case in the codebase. The loader writes a fresh file with a brand new `instanceId`, which resets proxies and auth flags and orphans the Valkey namespace. Treat any change to that read path with suspicion.

The indexer queue clears its pending buffer before the write lands, so a failed flush drops those rows with nothing in the logs to say so. If you touch `queue.ts`, keep that in mind rather than making it worse.

The `data/` directory on this machine is my real instance. Don't clear it, reshape it or tidy it to make a test pass.

## Translations

Use translation keys for anything a user reads. The server resolves the locale per request, gathers the extension namespaces and injects `window.__DEGOOG_T__` into the page. A hardcoded string is an English word sitting in somebody's Hebrew interface.

Server-rendered plugin HTML uses `{{ t:namespace.key }}`. Client code uses `window.scopedT("core")`. `src/locales/en-US.json` has to be complete. The others are community work and fall back when a key is missing.

## How I like to work

NEVER run a build or the development server without asking, if I am working on this chances are it's already running.

Look before you build. This codebase is bigger than it looks and I name things for fun, so what you need probably exists under a name you would not have picked. Most requests are a settings key, a guard on an existing route, or four lines next to a case that is already handled.

Fix causes. A guard that stops the crash while leaving a corrupt file on disk is worse than the crash.

Boy scout rule, within reason. Tidy the small mess next to your change while you are in the file. Do not turn a bug fix into a refactor of the search pipeline.

Pull requests go to `develop`. Never `main`.

Don't run production builds, write to git, or edit `.env`, unless I asked for it in the message you are answering. If a variable is missing, name it and ask.

Treat all of this as good defaults. What I ask for in the message you are answering beats anything here. What you decided on your own does not, so if a rule here fights the task, say so and ask.

## Taste

- No comments. Say it in the naming, or say it to me in the pull request. JSDoc only if a user SPECIFICALLY asks for it.
- Arrow functions for anything that returns a value, `function` declarations for side effects only, `_` prefix for private helpers.
- `any` is not a solution. using any will likely get the PR rejected.
- Explicit return types on exported functions, route helpers, registry helpers, persistence and anything security-sensitive.
- Constants over magic strings. `UPPER_SNAKE_CASE` for the global ones.
- Log when you catch. Use the project logger and sanitise what goes into it. Raw `console.*` in server code only before the logger exists.
- Small files and real modules. If you cannot hold the file in your head, split it while you are in there.
- New abstractions earn their place. Two similar things are not a pattern.
- I am a front end lead and I will notice. No borders, no blur, no transparency unless the surrounding design already does it. Reuse the existing `degoog-*` classes and SCSS variables so themes and light mode keep working. Never edit generated CSS.
- Keep it quirky. The auth check is `gandalf()` and it refuses you with "You shall not pass!". Engines have a `sentinel`. There are easter eggs in `uovadipasqua`. Understandable first, funny second, but a codebase that reads like a tax return is one nobody opens on a Sunday.

## Words

Same words for the same things, please.

- **you** is the agent reading this. **we** is me, fccview, plus whoever is contributing. **user** is somebody using a running instance, not the developer and not me.
- **instance** is one deployment somebody self-hosts. **public instance** is one with `DEGOOG_PUBLIC_INSTANCE` set, open to strangers and locked down accordingly. There is no admin account, only whoever holds a settings password.
- **extension** covers all six installable kinds. **engine** is where results come from, **transport** is how the server makes the outgoing request, **plugin** is anything that adds behaviour, **theme** restyles the UI, **autocomplete provider** feeds the suggestion box, **shortcut** is a keybinding.
- **slot** is a plugin panel rendered at a named position around the results. **bang** is a `!trigger` command. **alias** is a second name for an existing trigger.
- **type** is what an engine declares it returns, and types become the tabs on the results page.
- **store** is the install UI. **repo** is a git repository listing extensions in its root `package.json`. The official one cannot be removed and the community ones are explicitly unvetted.
- **indexer** is the optional local record of results users have already seen, served back as the Degoog engine.
- **canonical ID** is the `{folder}-{kind}` string everything is keyed by.

## Verifying

Smallest thing that proves the change works. `yarn typecheck`, `yarn lint` on what you touched, and the tests covering the area. `bun test` runs the suite.

Bug fixes come with a regression test where it is practical. If you changed behaviour the tests cover, update them and tell me you did.

The tests around auth, gated routes, SSRF, cache keys and registry load order exist because those things broke once. If your change makes one of them fail, the change is wrong until proven otherwise.
