# PR 21 · Installable app: manifest, icons, offline shell

| | |
| --- | --- |
| **Suggested PR title** | `Audit 3 · 21: installable North — web manifest, icons, offline app shell` |
| **Size** | S (≈250 lines plus icon files) |
| **Needs** | PR 01 merged (it also edits `index.html`). Otherwise independent. **Decision D13.** |
| **Unblocks** | — |
| **Branch** | `audit3/21-pwa` |

## Goal

Make the phone check-in feel like an app. North gets added to the home screen with its own icon, opens standalone in pine, and opens instantly, even offline, for the local-first document. This carries audit 2's V3.

## Findings it fixes

- [F29 · Not installable](../review.md#f29)

## Current behaviour

`index.html` has a phone-only `theme-color` and a description, and no manifest, icons or service worker. A phone "check-in" is a browser tab with browser chrome, and it can't open without a network, though the data is in `localStorage` in local-only mode.

## Target behaviour

- **`public/manifest.webmanifest`:**
  ```json
  { "name": "North", "short_name": "North", "start_url": "/?view=home", "scope": "/", "display": "standalone",
    "background_color": "#f3eedf", "theme_color": "#203e32",
    "icons": [ { "src": "/icons/north-192.png", "sizes": "192x192", "type": "image/png" },
               { "src": "/icons/north-512.png", "sizes": "512x512", "type": "image/png" },
               { "src": "/icons/north-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" } ] }
  ```
- **Icons:** a pine square (#203e32) with the "n." of the wordmark in cream, Manrope 800, centred. The maskable version keeps the glyph inside the safe 80% circle.
  - Author `public/icons/north.svg`.
  - Export PNGs at 180 (apple-touch-icon), 192 and 512, plus the maskable 512. There's no image tool in the repo, so render the SVG with Playwright (`page.setContent` and an element screenshot), as `docs/audit-3/tools/capture.mjs` does. Commit the PNGs.
- **`index.html`:**
  - `<link rel="manifest">`, `<link rel="apple-touch-icon" href="/icons/north-180.png">`, `<meta name="apple-mobile-web-app-capable" content="yes">` and `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` (the pine header handles the safe area, per #114);
  - an SVG favicon;
  - `<title>North</title>`, which PageHeader overrides per screen (PR 06).
- **Service worker** (`public/sw.js`, registered in `main.tsx` only when `import.meta.env.PROD`):
  - **Navigations:** network-first, falling back to the cached `/index.html`.
  - **Same-origin `/assets/*`** (hashed): cache-first, filled at runtime.
  - **Google Fonts CSS and font files:** stale-while-revalidate.
  - **Never cache** Supabase or any cross-origin API request (match the Supabase URL from `import.meta.env`, passed as a query param to the SW registration, or skip all non-GET and all cross-origin requests except fonts).
  - **Versioned cache name;** delete old caches on `activate`.
  - **No background sync, no push.**
- **Update flow:** when a new SW is waiting, show a quiet `Toast`: "A new version of North is ready · Reload". There's no forced reload.

## Files

- **Add:** `public/manifest.webmanifest`, `public/icons/*`, `public/sw.js`, and `src/registerServiceWorker.ts` (+ test for the "update ready" toast logic).
- **Change:** `index.html`, `src/main.tsx`, and `docs/product-design-spec.md` (Visual identity: icon; Navigation: standalone).
- **Don't touch:** app routes, or the data or sync code.

## Acceptance criteria

- [ ] Chrome DevTools › Application › Manifest shows no errors, and "Installable" is true. Lighthouse PWA "Installable" passes.
- [ ] On iPhone Safari, Add to Home Screen gives the pine "n." icon. It opens standalone at Home, and the pine header sits under the status bar without clashing (this ties in the open on-device check from #114).
- [ ] After one online visit in a production build (`npm run build && npm run preview`), going offline and reloading opens the app with local data. In cloud mode it shows the existing sign-in or "Budget unavailable" screen, not the browser's offline page.
- [ ] Supabase requests are never served from the cache (check the Network panel: "from ServiceWorker" never appears for them).
- [ ] Deploying a new build shows "A new version of North is ready · Reload" once.
- [ ] Dev mode (`npm run dev`) doesn't register the service worker.
- [ ] `npm run check` passes.

## How to check

`npm run build && npm run preview -- --port 5175`, then open `http://localhost:5175/?view=home` in Chrome. Check Application › Manifest and Service workers. Tick Offline and reload. Then install from the address bar.

## Working in this repo

- **Run it:** `npm run dev -- --port 5174 --strictPort --mode localonly` (local storage, no sign-in). Seed by opening `http://localhost:5174/scripts/baseline-seed.html`. It loads `docs/fixtures/plan-transfers-baseline.json` (Ada and Ben, 40 items, an Amex card with October and November statements and an Amex pot) and lands on Plan for November 2026. Re-seed before each check. Figures like "19 days left" depend on today's date.
- **Screenshots:** `node docs/audit-3/tools/capture.mjs <name> "<query>"` writes phone (375×812) and desktop (1440×900) PNGs, viewport and full height, to `/tmp/north-shots`. Add `--width 1100` for in-between widths. Playwright isn't a dependency; see the script header.
- **Check:** `npm run check` (eslint, vitest, build) must pass. CI runs the same.
- **CI guards:** `src/styles.tokens.test.ts` (no raw colours, sizes or spacing outside `:root`; breakpoints 640/768/1100 only), `src/styles.contrast.test.ts`, `src/copy.vocabulary.test.ts` (retired words; the glossary is in `docs/product-design-spec.md`), `src/styles.views.test.ts`.
- **Tests:** jsdom has no `matchMedia`, so components render their phone presentation. Stub `window.matchMedia` with `matches: false` to test desktop.
- **Docs:** update your screen's section of `docs/product-design-spec.md`, and any rules doc whose behaviour changes. Never `git add -A docs`: untracked review notes live there.
- **Style:** match the surrounding code (some files are dense one-liners) and don't reformat code you aren't changing. Design rules: [plan.md §2.3](../plan.md#design-system).
- **Branch:** `audit3/NN-short-name` from a fresh `main`. One PR, squash-merged.
