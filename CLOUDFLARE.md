# Cloudflare and phone installation

Live app: https://cube-studio.cube-studio.workers.dev

Cube Studio uses a Worker and D1 database in your own Cloudflare account. This deployment uses no ChatGPT sign-in, Cloudflare Access subscription, billing enrollment, purchased domain, KV, or R2. Personal history lives in D1 and on connected devices; it is excluded from this repository.

## Connect devices

During setup, open the private page at `http://127.0.0.1:5190` on your PC. Save its sync code in your password manager, then use **Connect this PC**. On your phone, open the deployed app, tap **Connect history** and paste the same code once. The setup page expires after 45 minutes; the code keeps working.

The code is generated from 32 random bytes (256 bits). The server stores only its SHA-256 verifier as a Cloudflare secret. Each connected device stores the code locally and sends it in an Authorization header over HTTPS. It is not included in public assets, logs or source files. The initial connection link uses a URL fragment, which the app immediately removes. API responses and authentication requests are excluded from service-worker caching.

Anyone with the code can access and change your history. To replace a lost code:

```powershell
npm run setup:sync -- --rotate
```

Rotation intentionally disconnects all devices until they use the new code. It preserves cloud history and local queued solves. Without `--rotate`, setup refuses to overwrite an existing code. Export backups before clearing browser data. Disconnecting sync leaves the device's local history in place, so clear its browser data if handing it to someone else.

## Install on your phone

Open the app online and connect history first.

- **Android / Chrome:** choose **Install app** in Cube Studio. If a direct prompt is unavailable, use Chrome's menu > **Install app** or **Add to Home screen**.
- **iPhone / Safari:** choose **Share** > **Add to Home Screen**, enable **Open as Web App** if offered, then tap **Add**. If the installed app has separate storage, connect its history using the code again.
- **PC / Edge or Chrome:** use the browser install icon or Cube Studio's **Install app** button.

The manifest specifies standalone display, 192px and 512px PNG icons, a maskable icon and an Apple touch icon. The installed app launches without browser navigation bars.

## Offline behavior

**Insights → Split progress** shows one graph for each step in the selected method. It uses individual step durations calculated from consecutive saved cumulative marks. Only completed, non-DNF solves with the full matching step sequence are included; original imports without split marks are not backfilled. The graphs share a seconds scale and follow the existing scope and date filters. **Mean 5** is an arithmetic mean of the latest five eligible solves; it begins only after five observations. Solve-level +2 penalties are not assigned to a step. Hover or focus a point for exact values, or tap/press Enter to open the original solve. The split charts work offline with history already stored on the device.

Phone navigation sits at the bottom. The timer page uses one card for the scramble, cube, clock and optional splits. Recent solves are available in History, and progress charts in Insights. Regular and fullscreen views share the same layout, controls, font sizes and cube size; fullscreen hides the surrounding app navigation and card border. Scrambles use large bold text and balanced lines, adding lines as needed for the screen width. Starting a solve opens fullscreen. Finishing keeps the result and feedback visible until the next solve or an explicit exit; cancelling an automatically opened timer restores the normal view. The cube shows the top, front and right faces; apply the scramble with white on top and green in front. The cube renderer works offline. The timer fills the app viewport without calling the browser Fullscreen API, avoiding Android's fullscreen entry notice. Launch the installed PWA to use it without browser tabs or an address bar.

Post-solve feedback uses the accepted **Small deltas** design. Gold means a new personal best; a green total beats at least 80% of the previous comparable results, and green split times beat their recent median. Signed differences appear under the existing split times and below the timer. The bottom strip shows up to 50 previous completed results, sorted fastest to slowest, with a separate marker showing where this result fits and its all-time rank / count. Fewer observations produce fewer squares. First observations have no invented median or personal best.

Comparisons include all completed history chronologically before the current solve. Deleted, DNF and later solves are excluded. The current solve is counted once; equal times share a rank. Total results include +2 penalties. Split baselines use up to 50 previous complete recordings with the same labels and order, and raw step durations; solve penalties are never allocated to steps. Original imports without recorded splits do not supply split baselines. Feedback resets when arming the next solve, works offline, and updates when the displayed solve is edited.

While preparing, the bold scramble sits directly above the centered cube, with the timer below it. Timer, cube and scramble sizes use the same responsive rules whether splits are enabled or disabled. The cube and scramble disappear as soon as timing starts. With split tracking enabled, the split list appears on the left on desktop, with completed times and a highlighted active step showing its live elapsed time. Phones stack the vertical list below the timer; the list scrolls inside the card when space is limited. The **Splits** button enables or disables split timing before starting a solve and locks during a solve. New scramble and manual entry controls are available at the top of the same card in both views.

Once **Offline ready** appears, you can reopen the app without a connection, time solves, record splits and view history previously loaded on that device. LocalStorage holds history and pending updates. These sync on reopening, on reconnection, on returning to the foreground, every minute while idle, or with the refresh button.

Online random-state scrambles use cubing.js. Offline practice scrambles are generated locally and labelled **25-move practice**. Fonts fall back to system fonts. A first-ever offline visit cannot download the app or cloud history.

App files are cached as one version. Available updates appear under **Install app** and are applied only when requested between solves. LocalStorage survives updates. Use **Keep offline data on this device** to request persistent storage; browsers decide whether to grant it. Keep CSV backups as well.

## Free-tier usage

Only Workers, Static Assets and D1 are used. Static asset requests are free and unlimited. Currently documented free allowances are 100,000 dynamic Worker requests/day with 10ms CPU per invocation, and D1's 5 million rows read/day, 100,000 rows written/day and 5GB total account storage.

Allowances apply across your account. This is suitable for personal timer use, subject to those limits. If Cloudflare rejects sync at a limit, solves remain queued on the device. Do not switch the Workers account to a paid plan if your requirement is a hard $0 budget.

Sources: [Static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

## Maintain and deploy

For a new installation, copy `wrangler.example.jsonc` to `wrangler.jsonc`. Run `npx wrangler login`, then `npx wrangler d1 create cube-studio` and put the returned database ID in `wrangler.jsonc`. Keep the default Worker and database names. Run the deployment commands below, then `npm run setup:sync -- --url https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev` using the deployment URL Wrangler reports. The API stays locked until a sync code is configured. The account-specific config is ignored by Git.

```powershell
npm ci
npm test
npm run deploy:cloudflare
```

`wrangler.jsonc` holds your local deployment configuration. The deploy command builds the PWA, applies schema migrations, and deploys static files and the API. The Cloudflare secret survives deployments. Missing configuration fails closed with 503; absent or incorrect codes receive 401 after setup. Static files contain no imported solve data.

`npm run dev` runs a separate local UI/SQLite server at http://localhost:5188 without the production sync code. `npm run dev:cloudflare` emulates the production Worker; apply local D1 migrations and configure a local `.dev.vars` verifier to test authenticated requests. Local credentials, migration backups and generated build output are ignored by Git. Never commit a plaintext sync code.
