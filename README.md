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

### Running the unified suite

From the monorepo root (where `vitest.config.mjs` lives):

```
pnpm vitest run
# or
npm run test --workspace=nudeadmin
```

Coverage combines sources from Admin, Flow, Forge, and Shared. Set `ENABLE_REAL_SHARP=1` to temporarily enable real image processing in a focused test.
