// North's service worker (audit 3 PR 21): opens the app shell offline, nothing more.
// - Navigations: network first, falling back to the cached shell.
// - Same-origin hashed assets (/assets/*, all precached on install) and the icons: cache first.
// - Google Fonts: stale while revalidate.
// - Everything else (Supabase, any API, any non-GET) goes straight to the network and is never cached.
// No background sync and no push. A new version waits until the page says "Reload".
// The build id from the registration URL (sw.js?v=…): each deploy is a new version with its own caches.
const VERSION = `north-${new URL(self.location.href).searchParams.get('v') || 'dev'}`
const SHELL = `${VERSION}-shell`, ASSETS = `${VERSION}-assets`, FONTS = `${VERSION}-fonts`
const scope = new URL(self.registration.scope)
const shellUrl = new URL('./', scope).href
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400..800&display=swap'

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL)
    const response = await fetch(shellUrl, { cache: 'no-cache' })
    if (!response.ok) return
    await cache.put(shellUrl, response.clone())
    // Every hashed file of this build (asset-manifest.json, written by vite.config.ts), so every screen opens offline.
    const listed = await fetch(new URL('asset-manifest.json', scope), { cache: 'no-cache' }).then(list => list.ok ? list.json() : []).catch(() => [])
    const assetCache = await caches.open(ASSETS)
    await Promise.all([...listed, 'icons/favicon-32.png', 'icons/north.svg', 'manifest.webmanifest'].map(file => assetCache.add(new URL(file, scope).href).catch(() => undefined)))
    // The font's stylesheet too (its files are cached as they load).
    const fonts = await caches.open(FONTS)
    await fetch(FONT_CSS, { mode: 'no-cors' }).then(css => fonts.put(FONT_CSS, css)).catch(() => undefined)
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key)
    await self.clients.claim()
  })())
})

self.addEventListener('message', event => {
  if (event.data?.type === 'skip-waiting') self.skipWaiting()
})

const isAsset = url => url.origin === scope.origin && url.pathname.startsWith(new URL('assets/', scope).pathname)
const isIcon = url => url.origin === scope.origin && (url.pathname.startsWith(new URL('icons/', scope).pathname) || url.pathname === new URL('manifest.webmanifest', scope).pathname)
const isFont = url => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (request.mode === 'navigate' && url.origin === scope.origin) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok && url.href.split('?')[0] === shellUrl) { const copy = response.clone(); caches.open(SHELL).then(cache => cache.put(shellUrl, copy)) }
      return response
    }).catch(async () => (await caches.match(shellUrl, { ignoreVary: true })) || Response.error()))
    return
  }
  if (isAsset(url) || isIcon(url)) {
    // ignoreVary: hosts send "Vary: Origin" and module scripts carry an Origin header the precache didn't.
    event.respondWith(caches.open(ASSETS).then(async cache => (await cache.match(request, { ignoreVary: true })) || fetch(request).then(response => { if (response.ok) cache.put(request, response.clone()); return response })))
    return
  }
  if (isFont(url)) {
    event.respondWith(caches.open(FONTS).then(async cache => {
      const cached = await cache.match(request, { ignoreVary: true })
      const fresh = fetch(request).then(response => { if (response.ok || response.type === 'opaque') cache.put(request, response.clone()); return response }).catch(() => cached)
      return cached || fresh
    }))
  }
  // Anything else (Supabase, cross-origin APIs) isn't touched: the browser fetches it as usual.
})
