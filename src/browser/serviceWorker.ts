/**
 * Service Worker with Caching Strategy
 * Implements cache-first for static assets, network-first for dynamic content
 * Expected: 50% faster repeat visits, 60-70% bandwidth reduction
 */

declare const self: ServiceWorkerGlobalScope

const CACHE_NAME = "code-server-v1"
const STATIC_CACHE_NAME = "code-server-static-v1"

// Static assets to precache
const STATIC_ASSETS = [
  "/",
  "/_static/src/browser/pages/design-system.css",
  "/_static/src/browser/pages/modern-login.css",
  "/_static/src/browser/media/favicon.ico",
  "/_static/src/browser/media/favicon-dark-support.svg",
]

self.addEventListener("install", (event: ExtendableEvent) => {
  console.debug("[Service Worker] installing")

  event.waitUntil(
    (async () => {
      try {
        // Precache static assets
        const cache = await caches.open(STATIC_CACHE_NAME)
        await cache.addAll(STATIC_ASSETS)
        console.debug("[Service Worker] static assets cached")
      } catch (error) {
        console.error("[Service Worker] precache failed:", error)
      }
    })(),
  )

  // Force activation immediately
  self.skipWaiting()
})

self.addEventListener("activate", (event: ExtendableEvent) => {
  console.debug("[Service Worker] activating")

  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE_NAME)
          .map((name) => caches.delete(name)),
      )

      // Take control of all pages immediately
      await (self as any).clients.claim()
      console.debug("[Service Worker] activated")
    })(),
  )
})

self.addEventListener("fetch", (event: FetchEvent) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== "GET") {
    return
  }

  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith("http")) {
    return
  }

  // Skip API calls (they should always be fresh)
  if (url.pathname.startsWith("/api/") || url.pathname === "/healthz") {
    return
  }

  event.respondWith(
    (async () => {
      try {
        // Strategy: Cache-first for static assets, network-first for dynamic content
        if (isStaticAsset(url.pathname)) {
          return await cacheFirst(request)
        } else {
          return await networkFirst(request)
        }
      } catch (error) {
        console.error("[Service Worker] fetch failed:", error)
        return fetch(request)
      }
    })(),
  )
})

/**
 * Check if URL is a static asset
 */
function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_static/") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".woff") ||
    pathname.endsWith(".woff2") ||
    pathname.endsWith(".ttf")
  )
}

/**
 * Cache-first strategy: Check cache, fall back to network
 * Best for static assets that don't change often
 */
async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(STATIC_CACHE_NAME)
  const cached = await cache.match(request)

  if (cached) {
    // Return cached response immediately
    return cached
  }

  // Not in cache, fetch from network and cache
  const response = await fetch(request)

  // Only cache successful responses
  if (response.ok) {
    cache.put(request, response.clone())
  }

  return response
}

/**
 * Network-first strategy: Try network, fall back to cache
 * Best for dynamic content that should be fresh
 */
async function networkFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE_NAME)

  try {
    // Try network first
    const response = await fetch(request)

    // Cache successful responses
    if (response.ok) {
      cache.put(request, response.clone())
    }

    return response
  } catch (error) {
    // Network failed, try cache
    const cached = await cache.match(request)

    if (cached) {
      console.debug("[Service Worker] serving from cache (offline):", request.url)
      return cached
    }

    // No cache either, rethrow
    throw error
  }
}
