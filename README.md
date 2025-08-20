# NudeShared

Central shared assets for the NudeFlow + NudeForge ecosystem:

- `logger.js` – Unified server-side logging utility.
- `theme.css` – Single source of truth for UI design tokens and utility classes.

## Why this repo
Previously both applications duplicated identical theme and logging code. Centralizing:
- Eliminates drift (one place to update colors, spacing, tokens).
- Provides consistent log formatting across services.
- Simplifies future extraction into an npm package if desired.

## How apps consume it
At container start, each app's `entrypoint.sh` script will:
1. Read environment variables (see below).
2. Clone or update this repository into a sibling directory (default: `../NudeShared`).
3. Copy `theme.css` into `src/public/css/theme.css` of the app.
4. Copy `logger.js` into `src/utils/logger.js` (or rely on stub requiring the shared file).

`AppUtils` (NudeFlow) and service modules (NudeForge) import the logger via their local `src/utils/logger.js` stub, which defers to this shared implementation.

## Environment variables (used by each app's entrypoint)
| Variable | Default | Purpose |
|----------|---------|---------|
| `NUDESHARED_REPO` | `https://github.com/gabriel20xx/NudeShared.git` | Git clone URL for this repo. |
| `NUDESHARED_BRANCH` | `master` | Branch/tag to fetch. |
| `NUDESHARED_DIR` | `../NudeShared` | Target clone directory relative to the app root. |
| `GITHUB_TOKEN` | (empty) | Optional token for private access (read-only).

Add these to the consuming app's `.env` (never commit real tokens):
```env
NUDESHARED_REPO=https://github.com/gabriel20xx/NudeShared.git
NUDESHARED_BRANCH=master
NUDESHARED_DIR=../NudeShared
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

## Updating the theme
Edit `theme.css` here, commit, redeploy apps. Because apps copy the file at startup, any restart or new container build picks up the change automatically.

## Updating the logger
Keep the API surface minimal: `debug, info, warn, error, success`. If you need structured logging or transports (e.g. JSON, file, external service), extend this module and ensure backward compatibility.

Example usage inside an app service:
```js
const Logger = require('./utils/logger');
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
- Publish as npm package (`@nudex/shared` or similar).
- Add TypeScript types for the logger.
- Provide additional shared utilities (validation, response formatting, constants).
- Add automated tests for the logger formatting.

## License
(Insert license info here if required.)

---
Maintained by: gabriel20xx
