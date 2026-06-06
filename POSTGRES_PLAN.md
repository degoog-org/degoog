# Postgres indexer backend - plan and implementation notes

## Problem

The SQLite indexer bogs down on busy public instances. A 33MB database with ~30k entries (5k image queries, 250 video queries, 24k web queries) was already noticeably slow. The root causes:

- SQLite WAL mode helps concurrent reads but all writes still serialize
- FTS5 does not scale as well as Postgres tsvector under real load
- Multi-process deployments hit SQLite's single-writer ceiling hard

## Approach

Add an optional `DEGOOG_POSTGRES` environment variable. When set, the indexer uses Postgres instead of SQLite. When unset, nothing changes - SQLite remains the default and existing installs are unaffected.

### Why Postgres

- Native `tsvector`/`tsquery` FTS with GIN indexes - faster at scale than FTS5
- `ON CONFLICT DO UPDATE` UPSERT works identically to SQLite
- Proper connection pooling handles concurrent writes that SQLite serializes
- `postgres.js` (npm: `postgres`) works natively in Bun with minimal overhead
- Straightforward migration path: SQLite rows stream directly into Postgres via the existing export format

### Why not something else

- **DuckDB** - analytical workload, not suited for concurrent web-server writes
- **Meilisearch** - completely different architecture, breaking change for operators

## Adapter pattern

Rather than forking the indexer logic, a `IndexerAdapter` interface was introduced. Both backends implement the same contract. The rest of the codebase (`store.ts`, `queue.ts`, routes) talks only to the adapter - no SQLite-specific code leaks out.

```
DEGOOG_POSTGRES set?
  yes -> PgAdapter  (adapter-postgres.ts)
  no  -> SqliteAdapter (adapter-sqlite.ts)
```

A factory (`db-factory.ts`) creates the singleton adapter at first use and exposes `isPostgresMode()` for the handful of places that need to branch (export route, stats response).

### Per-type schema sharding

SQLite used one `.db` file per result type (`index-web.db`, `index-images.db`, etc.). Postgres mirrors this with one schema per type (`web.urls`, `images.urls`, etc.). Types are not hardcoded - they come from whatever result categories installed engines produce.

### Full-text search

- SQLite: FTS5 virtual table with triggers, `buildFtsQuery` produces `"term1" OR "term2"` MATCH expressions
- Postgres: `tsvector GENERATED ALWAYS AS STORED` column on `urls`, GIN index, `plainto_tsquery('simple', ...)` for fuzzy queries

## Migration - no data loss, no CLI

Operators run the Docker image and do not have repo access, so a CLI script was not an option. Instead:

- The Indexer tab in admin settings shows an **"Import .db file"** button when `DEGOOG_POSTGRES` is configured
- User picks the result type (web / images / etc.), selects the local `.db` file, uploads it
- The server opens the uploaded SQLite file read-only, streams rows in batches of 500 into Postgres via `ON CONFLICT DO NOTHING`
- Fully idempotent - uploading the same file twice imports nothing new
- Route: `POST /api/indexer/import` (master-auth, multipart, max 500MB)

## Export - format stays the same

The existing export (`GET /api/indexer/export`) produces a SQLite `.db` file. This format is kept regardless of backend so operators can share, back up, and re-import indexes freely.

When Postgres is the active backend, the export route builds a fresh SQLite `.db` in `/tmp` from the Postgres rows and serves that. The download is identical to a native SQLite export.

## Files changed

| File | What changed |
| :--- | :----------- |
| `src/server/indexer/adapter.ts` | New - `IndexerAdapter` interface and shared types (`UrlRow`, `HitRow`, `ExportRow`, `TypeCounts`) |
| `src/server/indexer/adapter-sqlite.ts` | New - full SQLite implementation (absorbed from `db.ts`, `store.ts`, `queue.ts`) |
| `src/server/indexer/adapter-postgres.ts` | New - Postgres implementation via `postgres.js` |
| `src/server/indexer/db-factory.ts` | New - singleton factory, `getAdapter()`, `isPostgresMode()`, `bootAdapter()` |
| `src/server/indexer/importer.ts` | New - file upload import logic (reads uploaded SQLite, streams into adapter) |
| `src/server/indexer/export-builder.ts` | New - builds a SQLite `.db` from Postgres rows for consistent exports |
| `src/server/indexer/db.ts` | Thinned to a wrapper over the adapter |
| `src/server/indexer/store.ts` | Adapter-driven; `getStats`, `listHits`, `countHits`, `sampleRows` are now async; stats response includes `backend` field |
| `src/server/indexer/queue.ts` | Adapter-driven; calls `bootAdapter()` on start |
| `src/server/routes/indexer.ts` | Added `POST /api/indexer/import`; export route branches on `isPostgresMode()`; awaits now-async store calls |
| `src/client/settings/indexer-tab.ts` | Import button (hidden unless `stats.backend === "postgres"`), type dropdown, file input, progress and result feedback |
| `package.json` | Added `postgres@3.4.5` |
| `.env.example` | Documented `DEGOOG_POSTGRES` |
| `docker-compose.yml` | Added commented-out Postgres service block |
| `docker-compose-examples/` | Four ready-to-use compose files (simple, valkey, postgres, full) |
| `README.md` | Docker Compose section replaced with table linking example files |

## Bonus fix - cache partial-engine failure

Discovered while working on this: `hasFailedEngines()` was blocking the entire search response from being cached if any single engine returned 0 results. With 10 engines, one timing out meant 9 good results never got cached and everything re-triggered on the next identical query.

Fixed by splitting the guard into two functions:

- `allEnginesFailed` - every engine returned 0 - skip cache entirely
- `someEnginesFailed` - at least one returned 0 - cache with `SHORT_TTL` so partial results are served while the failing engine retries

Applied to both the streaming and non-streaming search handlers.

## Deploy checklist

**Switching an existing instance to Postgres:**

1. Pull the new image
2. Add `DEGOOG_POSTGRES=postgresql://...` to the environment (see `docker-compose-examples/postgres.yml`)
3. Start degoog - it will boot and create schemas automatically on first write
4. Open Settings > Indexer
5. For each type (web, images, etc.) click "Import .db file" and upload the corresponding `data/indexer/index-{type}.db` from the host
6. Verify row counts in the stats panel match what you had before
7. The old `.db` files can be kept as a backup or removed once you're happy
