# NudeShared

Central shared assets and server modules for NudeFlow + NudeForge.

## Structure

- `server/`
	- `index.js` – Aggregated server exports for clean imports.
	- `logger/serverLogger.js` – Unified server-side logger.
	- `db/db.js` – DB abstraction (PostgreSQL preferred; SQLite fallback).
	- `db/migrate.js` – Minimal migrations (creates users table).
	- `auth/authRoutes.js` – Express auth router (signup/login/logout/me, admin list, password reset demo).
- Client assets (served at `/shared` by apps)
	- `theme.css` – Design tokens/utilities.
	- `toast.js`, `auth-modal.js`, `theme-toggle.js`, `clientLogger.js`.
- `views/` – Shared EJS views (partials, admin/users, auth reset pages).
- `config/sharedConfig.js` – Cross-app config helper.

Recommended imports in apps:

- Server side: `import { Logger, initDb, runMigrations, buildAuthRouter } from '../../NudeShared/server/index.js'`
- Client assets: mount `/shared` static pointing to `NudeShared` root.

## Why this repo
Previously both applications duplicated theme, logging, and auth/db glue. Centralizing:
- Eliminates drift (one place to update colors, spacing, tokens).
- Provides consistent log formatting across services.
- Simplifies future extraction into an npm package if desired.

## How apps consume it
Apps import server modules directly from `NudeShared/server/index.js`. For client assets, both apps expose `/shared` static from the NudeShared root so scripts/styles can be referenced in EJS.

## Environment variables (used by each app's entrypoint)
| Variable | Default | Purpose |
|----------|---------|---------|
| `NUDESHARED_REPO` | `https://github.com/gabriel20xx/NudeShared.git` | Git clone URL for this repo. |
| `NUDESHARED_BRANCH` | `master` | Branch/tag to fetch. |
| `NUDESHARED_DIR` | `../NudeShared` (local), `/app/NudeShared/src` (container) | Target clone directory where this repo will be available. |
| `GITHUB_TOKEN` | (empty) | Optional token for private access (read-only).

Add these to the consuming app's `.env` (never commit real tokens):
```env
NUDESHARED_REPO=https://github.com/gabriel20xx/NudeShared.git
NUDESHARED_BRANCH=master
# Local dev:
NUDESHARED_DIR=../NudeShared
# Container:
# NUDESHARED_DIR=/app/NudeShared
GITHUB_TOKEN=
```

## Local development (without container)
You have two easy options:

### 1. Manual clone once
```
# From the parent directory containing NudeFlow / NudeForge
git clone https://github.com/gabriel20xx/NudeShared.git
```
Run either app normally; the entrypoint (or a manual copy script you run) will sync the files.

### 2. Symlink (for instant edits) – macOS/Linux
```
ln -s ../NudeShared/theme.css NudeFlow/src/public/css/theme.css
ln -s ../NudeShared/theme.css NudeForge/src/public/css/theme.css
```
(Windows: use `mklink` in an elevated Command Prompt.)

When using symlinks, you can comment out the copy step in `entrypoint.sh` or adapt a dev-only script.

### Native module (better-sqlite3) "invalid ELF header" troubleshooting

If you see log lines like:

```
[ERROR] [DB] better-sqlite3 native module load failed { code: 'ERR_DLOPEN_FAILED', message: '... invalid ELF header' }
```

It means a prebuilt native binary compiled for a different OS/architecture leaked into the runtime container (common when mounting host `node_modules` from Windows/macOS into a Linux container).

Remediation options:
1. Prefer a clean install inside the container (do not bind-mount host `node_modules`).
2. Ensure the runtime entrypoint rebuilds the module. The shared `NodeDocker/docker-entrypoint.sh` now runs `npm rebuild better-sqlite3 --build-from-source` for both the app and shared directories automatically.
3. Remove the stale binary and allow reinstall:
	```bash
	rm -rf NudeShared/node_modules/better-sqlite3
	npm install --workspace @gabriel20xx/nude-shared
	```
4. Use PostgreSQL (`DATABASE_URL=postgres://...`) so the native SQLite dependency is only a fallback.

Environment override (force memory-only fallback if native keeps failing) – set before app start:
```
SQLITE_PATH=:memory:
```
(Data will be ephemeral – only recommended for smoke tests.)

If you continue to experience issues, rebuild with full toolchain available:
```
docker build -t nudeflow:rt ./NodeDocker --no-cache
docker run --rm -e APP_REPO=gabriel20xx/NudeFlow -p 8080:8080 nudeflow:rt
```


## Updating assets & server modules
- Edit `theme.css` or client JS and reload apps; they serve directly from `/shared` when mounted to the `NudeShared` directory.
- Server-side changes (logger, db, auth) are imported at runtime by the apps; restart the server process to pick up changes.

## Logger API
Keep the API minimal: `debug, info, warn, error, success`. Extend with transports/JSON as needed while preserving backwards compatibility.

Example usage inside an app service:
```js
import { Logger } from '../../NudeShared/server/index.js';
Logger.info('MEDIA', 'Scanning started', { batch: 1 });
Logger.error('MEDIA', 'Failure scanning directory', err);
```

## Version pinning / stability
If you want to guarantee stability in production:
- Set `NUDESHARED_BRANCH` to a specific tag or commit hash (using a full git clone then checkout).
- Or convert this repo into a private npm package and add it as a dependency.

## Security considerations
- Never bake `GITHUB_TOKEN` into images. Inject at runtime (container secrets / environment).
- Token must have minimal scopes (read-only for this repo).

## Future enhancements
- Publish as npm package (scoped) and version properly.
- Add TypeScript types for the logger.
- Provide additional shared utilities (validation, response formatting, constants).
- Add automated tests for db/auth flows.
- Extend tag analytics (e.g., co-occurrence matrix endpoint) after category column fully removed.

## Shared HTTP Helpers (Static + Cache Policy)

Two server helpers eliminate duplicated logic across NudeForge, NudeFlow, and NudeAdmin:

### `mountSharedStatic(app, { candidates, logger })`
Mounts a chain of candidate directories at `/shared` with unified caching headers.

Caching tiers:
- CSS / JS: `public, max-age=3600`
- Images (png/jpg/gif/webp/svg): `public, max-age=86400, stale-while-revalidate=604800`

It registers every candidate (even if it does not exist) to preserve prior fallback semantics; the first existing directory is logged. Default candidate ordering can be produced by:

```js
import { defaultSharedCandidates, mountSharedStatic } from '../../NudeShared/server/index.js';
mountSharedStatic(app, { candidates: defaultSharedCandidates(__dirname), logger });
```

Environment override: set `NUDESHARED_DIR` to force the first lookup path (e.g. container deployments).

### `registerCachePolicyEndpoint(app, { service, getPolicies, note })`
Adds a standardized `GET /__cache-policy` endpoint with:
- Strong ETag emission (reports app's configured ETag style)
- 60 req/min/IP in-memory rate limiting
- Optional auth gating via `REQUIRE_CACHE_POLICY_AUTH=true` (returns 404 when gated & unauthenticated)

Example usage:
```js
registerCachePolicyEndpoint(app, {
	service: 'NudeFlow',
	getPolicies: () => ({
		shared: { cssJs: 'public, max-age=3600', images: 'public, max-age=86400, stale-while-revalidate=604800' },
		themeCss: 'public, max-age=3600'
	}),
	note: 'Adjust in NudeFlow/src/app.js when modifying static caching.'
});
```

Returned JSON shape:
```jsonc
{
	"etag": "strong",          // Express etag setting
	"service": "NudeFlow",      // Service label you passed
	"policies": { /* your object */ },
	"note": "..."                // Optional note
}
```

### When to Extend
If you add more asset classes (e.g., fonts) or want immutable hashed bundles, extend `mountSharedStatic` or layer another static mount before it. Keep cache policy docs in each service aligned with what `getPolicies()` returns.

### Testing
Helper unit tests live in `test/httpHelpers.test.mjs` covering:
- Candidate resolution & mounting log message
- Cache policy endpoint shape & rate limiting overflow (429 after >60 rapid hits)

Feel free to expand with integration cases when adding new tiers.

## Shared Base App Helper (`applySharedBase`)

To further reduce repeated boilerplate across NudeAdmin, NudeFlow, and NudeForge a consolidated helper lives at `server/app/applySharedBase.js`.

Responsibilities (configurable):
- Strong ETag (`app.set('etag','strong')`)
- Standard hardening (security headers, `/healthz`, `/ready`, `/health` legacy redirect)
- `/shared` static mounting (tiered caching) via `mountSharedStatic`
- Theme mounting at `/assets/theme.css` (project override precedence)
- Optional `/auth` router (enabled by default)
- Optional cache policy endpoint (`GET /__cache-policy`) when `cachePolicies` provided
- Optional locals injection (`locals` object or middleware function)
- Optional standardized 404/error handlers (`attachErrorHandlers:true`)

Example:
```js
import { applySharedBase } from '../../NudeShared/server/app/applySharedBase.js';
const app = express();
applySharedBase(app, {
	serviceName: 'NudeFlow',
	projectDir: __dirname,
	cachePolicies: {
		shared: { cssJs: 'public, max-age=3600', images: 'public, max-age=86400, stale-while-revalidate=604800' },
		themeCss: 'public, max-age=3600'
	},
	locals: { appCssHref: '/css/style.css', disableSignup: false }
});
```

Benefits:
- Removes ~150 lines of repeated setup per service (auth + static + theme + cache policy boilerplate)
- Ensures uniform behavior (health endpoints, cache policy exposure)
- Single change surface for future security/caching adjustments

Extending:
- Add new options as additive (do not break existing call sites)
- Keep domain‑specific logic (carousel, sockets, media stats) inside each service
- If a concern repeats across two services, consider promoting it here behind an option flag

Testing: `test/app/sharedBaseHelper.test.mjs` verifies critical mounts (health, ready, auth, theme). Expand only when new helper features warrant explicit coverage.

## Unified Session Factory (`createStandardSessionMiddleware`)

All platform services (Admin, Flow, Forge) now rely on a single session initializer exported from `server/index.js` as `createStandardSessionMiddleware`.

Responsibilities:
- Select Postgres session store (`connect-pg-simple`) when `DATABASE_URL` is present (and `enablePgStore !== false`).
- Graceful fallback to in-memory store for local dev / tests with a one-time WARN (never recommended for production longevity).
- Apply consistent cookie settings: `httpOnly`, `sameSite: 'lax'`, `maxAge` default 7 days (override via `maxAgeMs`). Secure flag is auto-set on HTTPS unless `secureOverride` is passed.
- Namespace service identity (used in logs + potential future metrics) via required `serviceName` option.

Signature:
```js
createStandardSessionMiddleware({
	serviceName,            // string (required)
	secret,                 // string (required) – falls back to 'dev-secret' with WARN if absent
	cookieName,             // optional, default 'sid'
	domain,                 // optional cookie domain
	maxAgeMs,               // optional override (ms)
	enablePgStore = true,   // disable to force memory even with DATABASE_URL (tests)
	secureOverride          // true/false to force secure flag; leave undefined for auto
});
```

Integration Pattern (inside each app before auth routes):
```js
app.use(createStandardSessionMiddleware({ serviceName: 'NudeFlow', secret: process.env.SESSION_SECRET }));
```

Order Requirement: mount AFTER body parsers (`express.json()` / `urlencoded`) so auth routes relying on parsed bodies function correctly. Each app therefore calls the factory prior to `applySharedBase` auth router mounting (or sets `mountAuth:false` and mounts auth manually after sessions).

Extending Behavior: Add new cross‑service needs (rolling renewal, stricter production attributes, instrumentation) inside the factory—do NOT implement per‑app session blocks. Tests (`sessionCookieConsistency.test.mjs`) assert attribute parity across services; extend that test if you add attributes.


## License
(Insert license info here if required.)

---
Maintained by: gabriel20xx

## Centralized Test Suite (Important)

All automated tests for NudeAdmin, NudeFlow, and NudeForge have been consolidated here under `NudeShared/test/`.

Add every new test (even if it targets an Admin/Flow/Forge route) inside this directory. Spin up the specific app within the test file when needed. Shared utilities now live at:

- `test/utils/httpClient.mjs` – JSON & raw HTTP helpers.
- `test/utils/factories.mjs` – user/admin creation & promotion helpers.
- `test/utils/binaryClient.mjs` – binary, streaming, async iterator + backpressure simulation.

Dedicated backpressure validation: `backpressure.test.mjs` ensures the async iterator wrapper correctly slices and delays streaming responses.

Do not recreate per-app `test/` folders going forward; this prevents divergence and encourages reuse.

## Category → Tag Migration Support

The system is transitioning from a legacy single `media.category` column to multi-tag classification via `media_tags`.

### New Supporting Endpoints
| Endpoint | Purpose | Shape (append-only fields) |
|----------|---------|---------------------------|
| `GET /api/admin/schema/category-usage` | Shows remaining non-null legacy categories + top counts | `{ remaining, distinct:[{ category, uses }] }` |
| `GET /api/admin/media/tags/suggestions?limit=20` | Frequency-ranked tag suggestions (default 20, max 200) | `{ tags:[{ tag, uses }], cached? }` |
| `GET /api/admin/media/tags/cooccurrence?limit=50` | Top tag pair co-occurrences w/ association metrics | `{ pairs:[{ a,b,count,jaccard,lift }], cached? }` |
| `GET /api/admin/media/tags/coverage?min=1&limit=2000&full=0` | Tagging completeness summary (sampled unless `full=1`) | `{ total, withMin, percent, distribution:[{tagCount,items}], topUntaggedSample:[...], min, limit, full }` |
| `GET /api/admin/media/tags/typo-candidates?distance=2&max=50&minUses=1` | Near-duplicate / normalization candidates (Levenshtein <= distance) | `{ groups:[{ normalized, variants:[{ tag, uses }], size }] }` |
| `GET /api/admin/media/tags/recency?limit=50` | Recent tag usage ordering + age/span metrics | `{ tags:[{ tag, uses, firstUsed, lastUsed, spanDays, ageDays }] }` |

Caching: `suggestions` & `cooccurrence` responses cached in-process for 60s unless `?nocache=1` provided; cached responses include `cached:true`.

Script utilities:
| Script | Description | Output |
|--------|-------------|--------|
| `node NudeShared/scripts/simulate-category-removal.mjs` | Non-destructive readiness simulation for legacy category removal | Single-line JSON `{ preRemaining, postSoftNullRemaining, tagSample, ok, notes, error }` |
| `node NudeShared/scripts/taxonomy-report.mjs --json` | Consolidated taxonomy analytics snapshot | JSON `{ remainingCategories, topTags, pairCardinality, coverage{...}, ms }` |
| `node NudeShared/test/globalPostCleanup.mjs` | Post-suite hygiene removal of stray mkdtemp temp directories | JSON `{ ok, removed, candidates }` |

### Tag Mode Toggle
Admin media UI allows switching between ANY-match and ALL-match tag filtering. State persists via `localStorage` key `adminMediaTagMode` (`any` or `all`). Backend respects `tagMode=all` query param on listing endpoint.

### Simulation Script
Use the simulation script to validate readiness for fully dropping the legacy column (non-destructive):

```
node NudeShared/scripts/simulate-category-removal.mjs
```

It emits single-line JSON:
```
{"preRemaining":2,"postSoftNullRemaining":0,"tagSample":[{"tag":"scenery","uses":5}],"ok":true,"notes":[],"error":null}
```

Fields:
- `preRemaining` – Count of legacy non-null categories before soft-null pass.
- `postSoftNullRemaining` – Count after running migrations with `ENABLE_SOFT_NULL_CATEGORY=1`.
- `tagSample` – Up to 10 most-used tags (frequency desc, then alpha).
- `ok` – True if conditions indicate safe progression; false when anomalies detected.
- `notes` – Explanatory notes when soft-null didn’t reduce counts or other query failures occurred.
- `error` – High-level failure reason if an exception bubbled up.

### Readiness Criteria (Summary)
1. `remaining=0` in `/api/admin/schema/category-usage`.
2. Simulation script outputs `ok:true` (or documented acceptable warnings).
3. No new code writes to `media.category` outside migration backfill blocks.
4. Tag coverage near-universal for active media assets.

See `.github/ISSUE_TEMPLATE/category-removal-readiness.md` for the full checklist.

## User Tagging & Voting (Flow)

Schema additions:
- `media_tags.contributor_user_id` (nullable) – attribution for first user adding a tag to a media item.
- `media_tag_votes(media_id, tag, user_id, direction, created_at)` – vote rows; unique `(media_id, tag, user_id)`; `direction` ∈ {-1,1}. Setting direction=0 via API removes the vote.

Shared helpers (`NudeShared/server/tags/tagHelpers.js`):
- `normalizeTag(raw)` – lowercase, trimmed, collapse whitespace, max length 40.
- `addTagToMedia(mediaKey, tag, userId)` – idempotent insert with attribution.
- `applyTagVote(mediaKey, tag, userId, direction)` – upsert or delete (for 0) vote.
- `getMediaTagsWithScores(mediaKey, userId)` – aggregated list `[ { tag, score, myVote, contributorUserId } ]` where `score = Σ direction`.

Flow API endpoints:
| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/media/:mediaKey/tags` | — | `{ ok, tags:[...] }` |
| POST | `/api/media/:mediaKey/tags` | `{ tag }` | `{ ok, added, tags }` |
| POST | `/api/media/:mediaKey/tags/:tag/vote` | `{ direction }` (-1,0,1) | `{ ok, tags }` |

UI: Minimal list + add field + vote buttons (▲ / ▼) on `home.ejs`. Future enhancement: stronger binding to currently displayed media key (placeholder inference for now).

Tests (under `NudeShared/test/flow/`):
- `flowMediaTagAdd.test.mjs` – attribution insertion.
- `flowMediaTagVote.test.mjs` – vote score transition lifecycle.

Planned hardening (not yet implemented): per-user add rate limiting, moderation queue, spam/abuse detection heuristics.

## Shared Auth Guard Partial

Unauthenticated views across apps should now use the shared partial `views/shared/auth-guard.ejs` instead of duplicating inline login prompts. Parameters:

- `idPrefix` (string) – prefixes the generated login button id (e.g. `profile` → `profileLoginLink`).
- `message` (string) – explanatory paragraph above the button.
- `buttonLabel` (optional) – defaults to `Log In / Sign Up`.
- `containerId` (optional) – overrides the outer wrapping div id.

The partial injects the unified `.auth-btn` styled button and wires a one-time click handler that triggers the existing auth modal via `#authOpenBtn`. Example usage:

```ejs
<%- include('shared/auth-guard', { idPrefix: 'profile', message: 'You must be logged in to view your profile.' }) %>
```

Refactors completed:
- Shared profile partial now consumes it.
- NudeFlow playlists view uses it (guard hidden until a 401 check reveals it).

Test coverage: `flowAuthGuardPartial.test.mjs` asserts presence of the standardized IDs/classes on `/profile` and `/playlists` when unauthenticated.

### Running the unified suite

From the monorepo root (where `vitest.config.mjs` lives):

```
pnpm vitest run
# or
npm run test --workspace=nudeadmin
```
Unauthenticated views across apps should now use the shared partial `views/shared/auth-guard.ejs` instead of duplicating inline login prompts. Parameters:

Coverage combines sources from Admin, Flow, Forge, and Shared. Set `ENABLE_REAL_SHARP=1` to temporarily enable real image processing in a focused test.

## Test Artifact Cleanup & Environment Flags

The unified runner (`NudeShared/scripts/run-all-tests.mjs`) now performs automatic cleanup of transient test artifacts immediately before exiting (both on success and failure paths).

### What Gets Removed Automatically
- Mktemp / random output directories matching known patterns (e.g. `nudeadmin-out-*`, `tmp-shared-test-*`).

**Accessibility Semantics (2025-09)**
- The container now has `role="region"` and `aria-describedby` pointing to a generated message paragraph id `<idPrefix>AuthMsg`.
- The login button also references this same id via `aria-describedby` so screen reader users hear the contextual message when focusing the button.
- Tests for new unauth views must assert:
	1. Presence of `role="region"` wrapper with correct `aria-describedby`.
	2. Existence of the `<p id="<idPrefix>AuthMsg">` element.
	3. The button includes matching `aria-describedby` and retains the `auth-btn` class.
	4. Button id pattern `<idPrefix>LoginLink`.

If you add new unauth states, reuse this partial; do not recreate bespoke markup. Provide a succinct `message` so the description is meaningful.
- Stray copied media or ephemeral output assets created during tests inside top-level `output/`, `copy/`, or within `NudeShared/output/` that match ephemeral naming patterns.
- OS-level temp directories created via Node's `fs.mkdtemp` when they follow the suite's naming convention.

This makes repeated local runs and CI executions deterministic and prevents disk bloat from accumulating transient directories.

### Environment Flags
| Variable | Default | Effect |
|----------|---------|--------|
| `DISABLE_TEST_CLEANUP` | unset / `false` | When set to a truthy value (`1`, `true`), skips all automated artifact sweeping (legacy behavior). |
| `NUDE_REMOVE_TESTS_AFTER_RUN` | unset / `false` | When truthy, removes the entire `NudeShared/test/` directory after a successful run (intended ONLY for specialized CI cache-minimizing workflows). Logs a warning and is ignored on test failures. |

### Safety & Idempotence
The cleanup step only targets known ephemeral patterns and will noop safely if nothing matches. It logs each removal so you can audit what was deleted. If you encounter a scenario where an important artifact was removed inadvertently, open an issue and add a more restrictive pattern or explicit allowlist exception.

### Legacy Post-Cleanup Script
`NudeShared/test/globalPostCleanup.mjs` still exists but is now redundant. Prefer relying on the integrated cleanup in `run-all-tests.mjs`. The legacy script may be removed after a deprecation window once all pipelines are confirmed to rely exclusively on the integrated logic.

### Opting Out (Debugging)
Set `DISABLE_TEST_CLEANUP=1` when you need to inspect generated temp directories after a failing test. They will remain in place for manual inspection.

### Full Removal of Tests (Experimental)
`NUDE_REMOVE_TESTS_AFTER_RUN` is an aggressive optimization for space-sensitive CI layers. Use with caution—subsequent tasks in the same job that expect test files will fail. Never enable this in a developer workstation environment.

### Example Commands
```
# Normal run with cleanup (default)
pnpm vitest run

# Skip cleanup for debugging
set DISABLE_TEST_CLEANUP=1; pnpm vitest run   # Windows PowerShell / CMD style

# CI space optimization (after caching artifacts)
NUDE_REMOVE_TESTS_AFTER_RUN=1 pnpm vitest run
```

### Logging
During the run you'll see log lines similar to:
```
[cleanup] Removed directory: C:\\...\\tmp-shared-test-abcd12
[cleanup] Removed file: output\\test-output-one.png
```
If `DISABLE_TEST_CLEANUP` is set you'll instead see:
```
[cleanup] Skipped (DISABLE_TEST_CLEANUP=1)
```

---
