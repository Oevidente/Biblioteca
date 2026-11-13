/*
 * Service worker do INKORA (PWA).
 * O escopo é a pasta onde este arquivo fica (no GitHub Pages: /Biblioteca/).
 * Para forçar todo mundo a baixar tudo de novo, troque o número em CACHE_NAME.
 */
const CACHE_NAME = 'inkora-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// Páginas (HTML): sempre tenta a rede primeiro, assim o site novo aparece logo;
// sem internet, abre a última versão guardada.
async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached =
      (await cache.match(request)) ||
      (await cache.match(self.registration.scope)) ||
      (await cache.match(new URL('index.html', self.registration.scope).href));
    if (cached) return cached;
    throw error;
  }
}

// Arquivos com hash no nome (assets/*.js e *.css): nunca mudam, então ficam guardados.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

// Ícones, manifest e favicon: mostra o guardado e atualiza em segundo plano.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  // Firebase, Google Fonts, traduções etc. (outros domínios) vão direto pra rede
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (/\/assets\/[^/]+\.(?:js|css|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (/\/(?:icons\/|manifest\.webmanifest$|favicon\.png$)/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
