# AI Coding Agent Instructions (NudeCollection Monorepo)

> Purpose: Give an AI agent just enough high–value context (architecture, workflows, conventions) to make correct, idiomatic changes quickly without rediscovering patterns. Keep this file short, specific, and living.

## 1. Monorepo Layout & Roles
```
NudeAdmin/   Admin dashboard (EJS + Express) – moderation, analytics, user + media management
NudeFlow/    Consumer / streaming style app (media browsing, viewing)
NudeForge/   Generation / creation side (workflows, model invocations, generation stats)
NudeShared/  Shared server modules (db/auth/logger/cache helpers), theme.css, client utilities, consolidated tests
NodeDocker/  Container scaffolding (entrypoints, Dockerfiles)
media/, input/, output/  Media artefact roots (served / transformed)
database/    SQLite file fallback (PostgreSQL preferred when DATABASE_URL present)
```
All three apps import from `NudeShared/server/index.js` and mount `/shared` static for unified assets.

## 2. Runtime & Stack
- Pure ESM ("type": "module") across packages; use `import` only.
- Express + EJS (no React/Vue). Client interactivity = vanilla JS in templates.
- DB abstraction (`NudeShared/server/db/db.js`): chooses Postgres (pg) if available else SQLite (better-sqlite3). Always code against a minimal SQL superset supported by both.
- Migrations: `NudeShared/server/db/migrate.js` – idempotent, additive only. Add new tables/indexes there; never destructive edits in-place.

## 3. Shared Conventions
- Central styling: `NudeShared/client/theme.css` (design tokens, utilities, button variants, responsive rules). NEVER restyle core tokens inside app CSS; extend with utility classes.
- Strive to reuse existing unified utility classes before adding new ones; when a new style repeats twice, promote it to a single reusable class (keep `theme.css` lean—actively remove or consolidate obsolete utilities rather than accreting bloat).
- Tests: All new tests live under `NudeShared/test/**`. Spin up the relevant app inside the test (see existing `adminMediaEngagementCountsViews.test.mjs`). Do not add per-app test folders.
- IMPORTANT: Absolutely all automated tests (past + future) belong only under `NudeShared/test/` – never recreate `test/` folders in `NudeAdmin`, `NudeFlow`, or `NudeForge`.
- Metrics aggregation (likes/saves/views/downloads) performed server-side; return shape: `{ mediaKey: { likes, saves, views, downloads } }` – preserve field order when extending for diff-friendly output.
- Engagement endpoints expect POST with `{ keys: [] }`. Batch queries; never loop N+1 fetches from client.
- Admin UI patterns: fetch bulk data once, cache counts locally (`lastCounts`) and client-side sort without additional round-trips.
- Sorting persistence: Use `localStorage` keys prefixed with `adminMedia` or `adminUsers` (existing: `adminMediaSort`). Keep naming stable.
- Bulk actions: POST single endpoint with `{ action, ids, ...extra }` rather than multiple per-item requests.
- Overlay + live region UX: Use the shared `NudeShared/client/overlay.js` utility (`NCOverlay.createOverlayController`) instead of per-page ad-hoc implementations; tests should assert presence of required aria-live regions for new admin pages.

### 3.1 Testing & Planning Policy (Augmented)
- Every discrete workflow or feature (even small) MUST have at least one focused test (`NudeShared/test/**`).
- STRICT: One test file per focused test (1 file = 1 describe/it purpose). Do not aggregate unrelated assertions into a single large file. If you add 3 new endpoints you should normally add 3 new test files.
- When implementing changes: always produce a concise but comprehensive plan (todo breakdown) before edits and keep it updated (one in-progress item at a time).
- After implementing code changes: run the full test suite locally; do not conclude with failing tests unless explicitly deferred with reason.
- Any modification that alters behavior or adds endpoints requires simultaneous updates to README(s) and this instructions file summarizing the change.
- Accessibility: New dynamic data views require aria-live regions; add a test verifying their presence.

## 4. Logging & Observability
- Use `Logger.info('DOMAIN', 'Message', meta)` – domain tokens ALL CAPS (e.g., `MEDIA`, `AUTH`, `MIGRATE`).
- Cache policy introspection endpoint: `/__cache-policy` registered per app via shared helper. Respect optional `REQUIRE_CACHE_POLICY_AUTH` gate.
- Prefer adding lightweight, domain-scoped log lines over verbose generic traces.
- Client: log each meaningful UI action (bulk apply, sort change, media toggle, user update) via `console.info('[ACTION]', details)` or the shared `clientLogger` wrapper—avoid silent state changes (helps test triage).
- Server: emit a single structured log per high-level action (bulk media action, user role change, generation event) using the shared `Logger` domains.
- Never introduce a parallel notification system—always use the shared toast/notification utilities in `NudeShared/client`.

## 5. Adding Schema / Data Features
1. Extend `migrate.js` with new table (CREATE TABLE IF NOT EXISTS ...). Include minimal indexes.
2. Reflect usage in feature-specific route file (`NudeShared/server/api/*Routes.js` or app-local route).
3. Add aggregation to existing multi-metric endpoints if logically grouped (e.g., extend engagement counts rather than adding a sibling endpoint).
4. Add a focused test seeding minimal rows + asserting new field presence.

### 5.1 Categories → Tags Migration (Phased Plan)
- Legacy single `category` column on `media` retained (read-only) purely for backward compatibility.
- `media_tags(media_id, tag, created_at, UNIQUE(media_id, tag))` enables multi-tag classification.
- Bulk actions: `add_tags`, `remove_tags`, `replace_tags` (input normalized: lowercase, trimmed, deduped, max 40 chars).
- Listing endpoint (`/api/admin/media`) returns `tags: []`; query params: `tag` (comma/space separated ANY-match by default) and optional `tagMode=all` for intersection filtering.
- UI: Tag pills with inline remove; per-row add & replace; bulk input re-used for tag actions; accessible overlay + live region integrated.
- Backfill: Migration inserts lowercase copy of any non-empty legacy `category` into `media_tags` if absent (idempotent, safe on repeat runs).
- Legacy route support: `/admin/media` now 302 redirects to `/media` (tests & old links).
- Flow legacy categories UI fully removed: `/categories` now returns a 301 redirect to `/` (home) and dynamic `/:categoryName` handler deleted. Client now relies purely on tag-based filtering mechanisms.
- Deprecation phases:
	1. (Done) Add `media_tags` + backfill + UI/API parity.
	2. (Current) Monitor usage; forbid new writes to `category` outside migrations (avoid adding set_category actions beyond legacy necessity).
	3. (Implemented – guarded) Soft-null migration behind `ENABLE_SOFT_NULL_CATEGORY=1` env flag: re-runs safe backfill, archives distinct legacy categories to `media_legacy_category_backup`, then NULLs `media.category` values.
	4. (Future major) Remove `category` column via new additive migration (never rewrite historical migration blocks). Provide temporary view or backup table for audit.
- Removal Preconditions: Zero search hits / telemetry for `media.category` in external consumers; tag tests stable; no API responses rely on `category`.
 - Operational Note: To exercise Phase 3 in tests or staging, set `ENABLE_SOFT_NULL_CATEGORY=1` before migrations run. Leave unset in production until external dependency audit is complete.

#### New Supporting Tooling & Endpoints
- Audit endpoint: `GET /api/admin/schema/category-usage` → `{ remaining, top: [{ category, count }] }` (top limited to 10). Used to verify soft-null effectiveness & readiness for column removal.
- Tag suggestions endpoint: `GET /api/admin/media/tags/suggestions?limit=20` → frequency ranked `{ tags:[{ tag, uses }] }` (default 20, max 200). Client uses for autocomplete / quick add UI.
- Tag mode toggle: Admin media page now persists ANY vs ALL tag intersection filtering in `localStorage` key `adminMediaTagMode`. Query param `tagMode=all` triggers intersection; absent or `any` is default.
- Simulation script: `node NudeShared/scripts/simulate-category-removal.mjs` emits single-line JSON summary `{ preRemaining, postSoftNullRemaining, tagSample:[...], ok, notes, error }` to validate readiness & surface anomalies without destructive changes. Tests parse this directly.
- Tag co-occurrence endpoint: `GET /api/admin/media/tags/cooccurrence?limit=50` → `{ pairs:[{ a, b, count, jaccard, lift }], cached? }` pairs sorted by descending count then alphabetical tie-breaker. Supports exploratory analytics for taxonomy cleanup. Supports `?nocache=1` bypass (otherwise 60s in-memory TTL cache).
- Tag coverage endpoint: `GET /api/admin/media/tags/coverage?min=1&limit=2000&full=0` → `{ total, withMin, percent, distribution:[{ tagCount, items }], topUntaggedSample:[...], min, limit, full }` summarizing tagging completeness. `limit` defaults 2000 (max 10000). `full=1` disables limit (use sparingly).
- Tag typo candidates endpoint: `GET /api/admin/media/tags/typo-candidates?distance=2&max=50&minUses=1` → `{ groups:[{ normalized, variants:[{ tag, uses }], size }] }` using Levenshtein distance (<=3 clamp). Helps surface near-duplicate tags for normalization.
- Tag recency endpoint: `GET /api/admin/media/tags/recency?limit=50` → `{ tags:[{ tag, uses, firstUsed, lastUsed, spanDays, ageDays }] }` ordered by recent usage.
- Taxonomy report script: `node NudeShared/scripts/taxonomy-report.mjs --json` → consolidated JSON: `{ remainingCategories, topTags[], pairCardinality, coverage{...} }` (uses same 2000 media coverage sample).
- Endpoint caching: suggestions & cooccurrence endpoints cached in-process for 60s unless `?nocache=1` specified. Response includes `cached:true` on cache hits.

### 5.2 User-Facing Tag Contributions & Voting (NudeFlow)
- Schema additions (additive, idempotent):
	- `media_tags.contributor_user_id` (nullable legacy attribution for who first added the tag on a media item).
	- `media_tag_votes(media_id, tag, user_id, direction, created_at)` where `direction` ∈ {-1,1}; setting direction=0 via endpoint removes the vote (DELETE).
- Shared helpers: `NudeShared/server/tags/tagHelpers.js` exports:
	- `normalizeTag(raw)` → lowercase, trimmed, single-spaced, max length 40.
	- `addTagToMedia(mediaKey, tag, userId)` idempotent insert with attribution.
	- `applyTagVote(mediaKey, tag, userId, direction)` upsert / delete for direction 0.
	- `getMediaTagsWithScores(mediaKey, userId)` → aggregated `[{ tag, score, myVote, contributorUserId }]` (score = sum of vote directions).
- Flow API endpoints (auth required for mutating):
	- `GET /api/media/:mediaKey/tags` → `{ ok, tags:[...] }` (myVote = -1|0|1).
	- `POST /api/media/:mediaKey/tags` body `{ tag }` adds normalized tag (idempotent) → returns refreshed list.
	- `POST /api/media/:mediaKey/tags/:tag/vote` body `{ direction }` where direction -1,0,1; 0 removes vote → refreshed list.
- UI: `NudeFlow` `home.ejs` includes minimal tag list + add field + vote buttons (▲/▼). Future enhancements should integrate with currently displayed media key more robustly (placeholder inference now).
- Tests: `flowMediaTagAdd.test.mjs` (attribution) and `flowMediaTagVote.test.mjs` (score transitions) under `NudeShared/test/flow/` follow one-test-per-file rule.
- Future hardening (not yet implemented): rate limiting (per-user tag adds per media), moderation queue for flagged tags, spam detection (rapid toggling), and abuse monitoring metrics.


When modifying any of the above, keep response shapes append-only and update this file + a focused test under `NudeShared/test/admin/`.

## 6. Tests – Patterns to Follow
- Use `ensureTestDb()` + `startEphemeral(app)` utilities.
- Derive a unique media key using timestamp + Math.random to avoid unique constraint collisions.
- Query first admin user id rather than assuming `1` (see existing test pattern) but keep fallback.
- Seed counts (views/likes/saves/downloads) directly via SQL inserts, then hit the public endpoint.
- Keep each test single-purpose; no broad integration megatests.

## 7. Frontend Template Patterns
- Light JS IIFEs inside `.ejs` manage state; no build step.
- Escape dynamic strings with `escapeHtml` helper; never interpolate unescaped user input.
- Reuse utility classes (`.toolbar`, `.grid-auto-200`, `.full-width`, `.btn-ghost`, `.badge`). Avoid inline styles except for transient dynamic widths (prefer adding a utility if reused twice).
- Responsive adjustments live in `theme.css`. If you add new breakpoints for a component, co-locate them near existing responsive blocks (search for `@media (max-width:`).
- Minimize `theme.css` footprint: prefer composing existing utilities (e.g., flex, spacing, badge patterns) instead of introducing near-duplicate declarations; if refactoring, replace multiple bespoke inline styles with one shared class, then delete redundant rules.
- Always prefer an existing utility or pattern from `theme.css` before adding new CSS. If a new utility is required, add it once to `theme.css` (not per-app) and reference it everywhere.
- Authentication UI + logic (routes, session handling, auth modal, password toggle, theme toggling) are centralized in `NudeShared` – do not fork per app; extend via hooks or minor conditional logic only.

## 8. Adding a New Metric (Example Flow)
1. Migration: add table `media_newmetric (..., media_key, user_id, created_at)` + indexes.
2. Update engagement SQL block in `adminMediaRoutes.js` adding a `newmetricSql` parallel to others.
3. Merge into counts map (`out[k] = { likes, saves, views, downloads, newMetric }`). Maintain backward compatibility (UI should default 0 when absent).
4. UI: Add badge in `media.ejs` meta grid. Use consistent ordering; update responsive column rules if count of columns changes.
5. Test: Clone downloads test, seed events in new table, assert field.

## 9. Manual Refresh & Auto Refresh
- Buttons with class `.btn-refresh` add spinning animation via `.spinning` toggle; do NOT introduce separate interval timers—re-use existing `load()` or `loadStats()`.
- Auto-refresh: Dashboard uses a 10s loop gated by checkbox state; replicate pattern if adding new live views.

## 10. Error Handling & UX
- On fetch failure, replace target container HTML with `<div class="error">...</div>`; keep consistent for test scraping.
- Toasts: Use `toast.success/info/error` (provided by shared `toast.js`); never reinvent notification UI.
- All future notifications (toasts, ephemeral banners) must route through the shared NudeShared notification scripts—do not inline custom popups.

## 11. Docker / Environment Assumptions
- Entry scripts copy or mount `NudeShared` into each app container (`NUDESHARED_DIR`). Depend on that layout; don’t hardcode absolute host paths.
- Prefer environment flags to conditional logic (e.g., `ENABLE_REAL_SHARP`, `REQUIRE_CACHE_POLICY_AUTH`). When introducing new toggles, document them in the app README + (optionally) here if cross-cutting.

## 12. Safe Change Checklist (Before PR)
- Added table/index? => `migrate.js` updated idempotently.
- New endpoint? Add minimal test under `NudeShared/test/`.
- UI metric change? Media/users templates updated + responsive rules considered.
- Shared token or utility? Modify `theme.css` only (avoid per-app overrides).
- Breaking response shape? Provide fallback defaults in consumer templates.

## 13. Common Pitfalls (Avoid)
- Reintroducing per-app `test/` folders (causes drift) – always centralize.
- Inline CSS duplication instead of adding reusable utility class.
- N+1 queries for per-item media metrics (always batch with `IN (...)`).
- Forgetting to persist sort/filter preferences when adding new sort fields.
- Hardcoding user id = 1 in tests without fallback path.

## 14. Fast Reference Snippets
Engagement counts fetch (client):
```js
const { counts } = await api('/api/admin/media/engagement-counts', { method:'POST', body: JSON.stringify({ keys }) });
```
Seed metric (test):
```js
await query('INSERT INTO media_downloads (media_key, user_id, created_at) VALUES ($1,$2,$3)', [mediaKey, adminId, now]);
```

Immediate media copy on selection (distinct from explicit upload button flow):
```js
// When a media item is selected by the user (e.g., checkbox or selection UI)
// trigger an immediate POST that uploads/copies the file server-side into /copy
// (different from deferring until an Upload/Confirm button is pressed).
// Pattern: fire-and-forget fetch with FormData or key list; server handles copy pipe.
```

Key Principle Recap:
- Tests centralized in `NudeShared/test/` only.
- Styling/layout should reuse `theme.css` tokens & utilities (no per-app divergence).
- Auth logic + design lives in `NudeShared` – never reimplement locally.
- Selecting media triggers an immediate server copy into `copy/` (do not wait for a later bulk upload action).
- Classification now tag-based (multi). Use bulk tag actions; avoid reintroducing single-category assumptions in new code.
	- Plan for future removal of `category` column after external dependency audit (additive migration path documented; create follow-up migration instead of altering existing one).
 - One-test-per-file discipline: add new test file for every new endpoint or discrete behavior change to keep failures surgically informative.
 - Profile hardening: Shared `profile.ejs` script must guard JSON parsing (handle HTML/error responses) and null DOM elements when unauthenticated across all apps (Admin, Flow, Forge). Tests assert anonymous payload for unauthenticated `/api/profile` access.
 - After every newly implemented feature, bug fix, or code improvement: create a commit and push (small, frequent commits). Do not batch unrelated changes; keep diffs reviewable.
 - Post-test cleanup: optional `NudeShared/test/globalPostCleanup.mjs` script removes stray mkdtemp temp directories (e.g., `nudeadmin-out-*`, `tmp-shared-test-*`). Run after the unified test suite if temp dirs accumulate.

## 15. Agent Execution Mandate (Aug 2025 Addendum)
- Always fully implement every user-requested feature, fix, or improvement end-to-end in a single cohesive effort once direction is clear—include optional or "nice to have" follow-up enhancements enumerated by the user without asking for re-confirmation.
- Implementation-First Rule: When a new request arrives, implement (or modify) all requested features, fixes, and changes fully before executing the test suite. Only after code changes are in place should automated tests be run; avoid running tests on an unchanged codebase just after receiving a new feature/fix request.
- Produce a comprehensive, task-scoped todo list at the start of each multi-step request and keep it current (exactly one in-progress item at a time) until all items are completed.
- Do not defer obvious adjacent low-risk improvements (tests, minimal docs, logging, accessibility hooks); implement them proactively with the primary change.
- If ambiguity is encountered, make one clearly-reasoned assumption (document it inline as a `TODO:` comment) and proceed—do not stall waiting for clarification if the assumption is low risk.
- Every code mutation that changes runtime behavior must be paired with at least one focused test under `NudeShared/test/**` (one file per behavior) and any necessary README / instructions updates.
- Never leave partial scaffolds (unused routes, dead CSS, unreferenced helpers); remove or finish them in the same change.
- Always proceed automatically to the next logical required step (implementation, tests, docs, quality gates) without waiting for additional user prompts once a task scope is understood; only pause for clarification when a blocking ambiguity would risk an incorrect irreversible change.

---
Questions or ambiguity: leave TODO comment near change + add a focused test; prioritize observable behavior over speculative abstractions.
