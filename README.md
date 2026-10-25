# Cube Studio

**Current deployment:** [Cloudflare app](https://cube-studio.cube-studio.workers.dev). See [CLOUDFLARE.md](CLOUDFLARE.md) for free hosting, private sync, PWA installation and offline use.

A personal 3×3 timer with phone and desktop layouts, two-finger start, keyboard timing, optional beginner/CFOP/custom step splits, solve history, CSV import/export and shared storage.

## Use

- Hold two fingers on the timer, wait for green, then lift both to start. On a PC, hold and release Space, or hold and release the mouse on the timer.
- Tap the timer or press Space to stop. With step tracking enabled, these actions mark the next step; the last step finishes the solve. Enter also marks steps. Escape cancels without recording.
- Enable step tracking with the Splits button. Choose the seven-stage beginner method, CFOP, or custom step names in Timer settings.
- The timer page is one card with the scramble, cube preview, clock and optional splits. Wide desktop screens also show recent solves on the right. The recent list disappears below 1700px and in fullscreen. Fullscreen hides the app navigation and the card border while keeping the same timer layout and controls. History and progress charts have their own pages.
- After a solve, fullscreen shows recent-median differences, gold personal bests, green improvements, and a 50-solve ranking strip with your all-time position. Prepare the next solve normally, or leave fullscreen with the corner button or Escape.
- Open a solve to edit its penalty or practice note. Deletion has an Undo notification.
- Insights includes all history by default. Filters include today and recent periods.
- History keeps filters and pagination in place while the solve list scrolls. Import, export and app installation are in Settings.
- Time and split charts use chronological solve numbers on the x-axis, with dates available in point details. The header shows Update only when an app update is ready; it reloads after applying the update between solves.
- Export includes IDs, exact milliseconds, penalties, step splits, and notes. Reimporting the export skips duplicate IDs.

## Run locally

Requires Node 22.13+ (Node 22.19+ recommended for its built-in SQLite support). Run `npm ci` for the Cloudflare development tools. The browser app uses native web APIs.

```powershell
npm ci
npm run dev
```

Open `http://localhost:5188`. Local records are in ignored `.local/solves.sqlite`. The development server binds to the local network; only run it on a trusted network. Use the Cloudflare app for shared history across devices. Local and hosted databases are separate.

```powershell
npm test
npm run build
npm run validate
```

## Importing history

Import a timer CSV or TSV in the app to bring over your history. UTF-16 exports are supported. All solves count equally; missing split times are never inferred. Public checkouts start empty and tests use synthetic examples. Personal solve exports and the optional local `data/seed.json` import are excluded from Git.

Random-state scrambles use [cubing.js](https://js.cubing.net/cubing/scramble/). If the generator cannot load in six seconds, a labelled 25-move practice scramble is generated locally; it is not a uniform random-state scramble. A displayed scramble never changes until the next solve or an explicit refresh.

## Data and sync

Cloud sync is protected by a private sync code. D1 stores individual solve updates and deletion tombstones. Writes are idempotent, with newer timestamps winning for edits to the same solve. Independent solves from different devices are merged. Device clocks should be correct when editing the same solve from multiple devices.

The browser keeps a local copy and pending writes in localStorage, retries on reconnection and every minute while visible and idle, and exposes a manual sync button. Storage failures are surfaced; export a backup before clearing browser data. Device settings stay local. The Cloudflare PWA also caches app files for offline reopening after the first online visit.

## Hosting

Copy `wrangler.example.jsonc` to ignored `wrangler.jsonc`, create a Cloudflare D1 database and enter its ID, then run `npm run deploy:cloudflare`. Run `npm run setup:sync -- --url https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev` to set up a private sync code for your deployment. See [CLOUDFLARE.md](CLOUDFLARE.md) for the full setup.

Tests cover UTF-16 decoding, CSV roundtrips and duplicates, exact split preservation, time parsing, +2/DNF averages, feedback rankings, split progress, server validation, stale-write protection, deletion/undo, offline caching, sync authorization, and practice scramble syntax.
