# Cube Studio

**Current deployment:** [Cloudflare app](https://cube-studio.cube-studio.workers.dev). See [CLOUDFLARE.md](CLOUDFLARE.md) for free hosting, private sync, PWA installation and offline use.

A personal 3×3 timer with phone and desktop layouts, two-finger start, keyboard timing, optional beginner/CFOP/custom step splits, solve history, CSV import/export and shared storage.

## Use

- Hold two fingers on the timer, wait for green, then lift both to start. On a PC, hold and release Space, or hold and release the mouse on the timer.
- Tap the timer or press Space to stop. With step tracking enabled, these actions mark the next step; the last step finishes the solve. Enter also marks steps. Escape cancels without recording.
- On phones, swipe left or right between Timer, Analysis, Lessons, Practice and Splits, following the bottom navigation. Vertical drags scroll normally. Swiping is disabled during timing, in fullscreen, and while a dialog is open.
- Lesson cards always preview the canonical teaching view with the marked target pieces visible. White up/down preferences apply inside lessons and practice, without changing the card thumbnail.
- **Lessons** shows six F2L group cards covering all 41 standard cases. These groups follow [CubeHead's tutorial](https://www.youtube.com/watch?v=3tYj-9f4dA0): Easy Inserts, Disconnected Pairs, Corner in Slot, Edge in Slot, Connected Pairs, and Both Pieces in Slot. Open a group for its demonstrations, then use its **Practice** tab to drill it. Choose demonstrations with the horizontal cube row at the top on desktop and phone. The larger lesson scramble sits just above the cube and move controls. Desktop cards span the available width and preview every case side by side; phones show as many complete previews as fit in one row.
- **Practice** in the main navigation opens a list of practice cards. Each card title includes F2L and its group name. Tap a card to practice that group immediately. Desktop checkboxes are always visible; check groups, then click a card to open the selected mix. On phones, hold a card to reveal checkboxes and include it in your saved mix. Clearing the last checkbox hides phone selection controls. After a reload, desktop restores checked groups immediately; phones keep controls hidden until holding a card restores the saved mix. Keyboard users can reveal selection with Shift+F10 on a focused card. Group selection stays on the list. Desktop practice also shows a horizontal row of case cubes inside the main solve box, above its controls, scramble and timer: click to include or exclude cases, keeping at least one selected. The row scrolls only when needed, locks during timing, and hides in fullscreen. Use **All practices** to return. Clicking the active navigation tab preserves your current screen and exercise.
- Manage split lists in the **Splits** tab. Beginner, CFOP, CFOP with individual pairs, and Roux are included. Create, edit, select, or delete named lists of 1-12 steps; enter steps on separate lines or with commas. Enable tracking there or with the timer's toggle, labelled with the selected split list; use its adjacent arrow to choose any saved list without changing the toggle. The selector also works in fullscreen and locks during timing. Existing custom steps migrate automatically, and recorded steps remain available in Analysis after a list changes.
- **Settings > Default cube position** chooses the top and front colors, with a live preview and only physically valid combinations. Scramble notation follows the selected frame and preserves the same physical scramble when the frame changes. **Cross position** saves your top/bottom solving preference and sets the white-cross lesson orientation. **Solving colors** saves whether you solve color neutral (any color), white/yellow, or always white. These preferences are stored on the device.
- The timer page is one card with the scramble, cube preview, clock and optional splits. Wide desktop screens also show recent solves on the right. The recent list disappears below 1700px and in fullscreen. Fullscreen hides the app navigation and the card border while keeping the same timer layout and controls. The **Analysis** page opens on its Analysis tab, with the solve list under **Solves**.
- After a solve, fullscreen shows recent-median differences, gold personal bests, green improvements, and a 50-solve ranking strip with your all-time position. Prepare the next solve normally, or leave fullscreen with the corner button or Escape.
- Open a solve to edit its penalty or practice note. Deletion has an Undo notification.
- Analysis includes all history by default, with filters for the last 200, 100, 50, 20, 10 or 5 solves. Green and red dots mark the fastest and slowest displayed results, including in split graphs. Stat changes compare the selected solves with the preceding group of the same size (or the available earlier solves); All time compares the latest four calendar months with the four months before them. Comparison badges appear only when a valid baseline exists.
- The **Solves** tab keeps filters and pagination in place while the solve list scrolls. **Settings** is in the desktop sidebar and phone bottom bar; import, export and app installation are in Settings.
- Time and split charts use chronological solve numbers on the x-axis, with dates available in point details. Page controls live above Settings in the desktop sidebar and in the top-right **⋯** popup on phones. These include filters, back buttons, sync actions and **Update**. Update appears only when an app update is ready; it reloads after applying the update between solves.
- Filtered charts use earlier hidden solves to calculate ao12 from the first visible point whenever enough history exists. Split means begin at the first recorded point and average up to five matching recordings, including earlier hidden history. Distribution groups the selected solves into five-second buckets.
- Split progress cards compare mean step durations across the same groups as the main stats, showing percentage and seconds gained or lost when a valid baseline exists. The large time remains the latest recorded split.
- Export includes normal solves and lesson attempts, with IDs, exact milliseconds, penalties, step splits, notes, and lesson/case/completion metadata. Reimporting restores lesson attempts to practice history and skips duplicate IDs. Older CSV files without lesson columns still import as normal solves.

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

### Browser integration tests

```powershell
npm ci
npm run test:browser:install
npm run test:browser
```

The Playwright suite runs the real UI in Chromium with real service workers, IndexedDB, legacy localStorage migration, keyboard input, and browser-generated multi-touch input. It checks persistence after reload, offline reopening in a new tab, applying a waiting PWA update between solves, automatic upload on reconnect, and retry after a failed upload. `npm test` remains the fast Node suite; run both when changing timing, PWA, or sync behavior.

Each browser test gets a fresh browser context, an OS-assigned loopback port, and an in-memory SQLite database. The fixture serves the current `web/` files and generated icons, runs the real API handler and sync-code verification, and never reads private seeds, `.local`, or deployment configuration. External requests are blocked; scrambles use the bundled random-state worker, including after an offline reload. No dev server or build is required. PWA updates change only the fixture's service-worker version, without editing source files. The fixture tests HTTP and SQL behavior, not Cloudflare's hosting or D1 runtime.

Use `npm run test:browser -- --headed` to watch, `npm run test:browser -- --grep "offline"` to select tests, and `npx playwright show-report` to inspect failures. Screenshots and traces are retained on failure in ignored `test-results/` and `playwright-report/` directories. Linux CI may need `npx playwright install --with-deps chromium` before running.

This suite targets Chromium. Multi-touch uses the Chromium DevTools Protocol and verifies trusted pointer events with distinct contact IDs; it is browser input emulation, not a physical touchscreen test. Safari/iOS, Android installation UI, OS eviction of offline storage, and reopening after the entire browser process exits still need device checks. The offline test closes and reopens a tab within the same isolated browser context. See Playwright's [service-worker guidance](https://playwright.dev/docs/service-workers) and [CDP session API](https://playwright.dev/docs/api/class-cdpsession).

## Importing history

Import a timer CSV or TSV in the app to bring over your history. UTF-16 exports are supported. All solves count equally; missing split times are never inferred. Public checkouts start empty and tests use synthetic examples. Personal solve exports and the optional local `data/seed.json` import are excluded from Git.

Random-state scrambles sample legal cubie states with browser cryptographic randomness and invert solutions from the bundled cubejs solver. Generation runs in a local worker, and all required files are cached for offline use. If the worker fails or takes longer than 30 seconds, a labelled 25-move practice scramble remains available; this fallback is not a uniform random-state scramble. A displayed scramble never changes until the next solve or an explicit refresh.

## Data and sync

Cloud sync is protected by a private sync code. D1 stores individual solve updates and deletion tombstones. Lesson attempts sync through a separate collection and never enter normal solve statistics. Existing local lesson history is queued for upload automatically. Writes are idempotent, with newer timestamps winning for edits to the same solve. Independent solves from different devices are merged. Device clocks should be correct when editing the same solve from multiple devices.

The browser keeps individual solves, lesson attempts, and pending writes in IndexedDB. Existing localStorage history is migrated atomically on first use, and the original JSON is retained untouched as a migration backup. Later saves write only changed records and small settings metadata. Sync retries on reconnection and every minute while visible and idle, with a manual sync button available. Storage failures are surfaced; export a backup before clearing browser data. Device settings stay local. The Cloudflare PWA also caches app files for offline reopening after the first online visit.

If device storage fails, a persistent warning replaces any claim that data is saved locally. Keep the page open and use **Retry saving** or **Download recovery data**. Startup validation retains usable records from damaged data and backs up the original contents before replacing them. The recovery JSON includes current solves, lesson attempts, settings, and the exact damaged contents when available; keep it for recovery (it is not a CSV import). If a blocked read later succeeds, retry merges existing history with work recorded in the meantime.

IndexedDB transactions coordinate writes across tabs, merging records, deletion tombstones, pending upload acknowledgements, and changed settings. Each tab loads history once, then reads changes through a revision index. BroadcastChannel notifies idle tabs of new commits; returning focus also refreshes history. Edits made while a transaction commits remain in memory for the following save. Keep a page open if a storage warning is visible; closing while a save is queued asks the browser to warn you. Tabs running an older app version must be updated before using multiple tabs together.

Cloud downloads use server-issued change cursors and pages of up to 350 changed database records, including tombstones. Cursors advance only after local persistence succeeds. A new app session starts a fresh paginated download; subsequent syncs in that session request only changes. The server keeps one change entry per record, and older clients can still request full snapshots. Client timestamps still resolve conflicting edits, but cannot cause a download to skip a late-arriving update.

The timer state machine lives in `web/timer-session.js`; lesson selection, practice filtering, and lesson-worker lifetime live in `web/lesson-session.js`. Settings forms, history dialogs/import/export, scramble layout, and normal scramble generation live in dedicated modules. `app.js` connects these workflows to the UI. Cloud deployments must apply `0003_incremental_sync.sql` before deploying the worker; the existing deployment command does this automatically.

## Hosting

Copy `wrangler.example.jsonc` to ignored `wrangler.jsonc`, create a Cloudflare D1 database and enter its ID, then run `npm run deploy:cloudflare`. Run `npm run setup:sync -- --url https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev` to set up a private sync code for your deployment. See [CLOUDFLARE.md](CLOUDFLARE.md) for the full setup.

Tests cover UTF-16 decoding, CSV roundtrips and duplicates, exact split preservation, time parsing, +2/DNF averages, feedback rankings, split progress, server validation, stale-write protection, deletion/undo, offline caching, sync authorization, and practice scramble syntax.
