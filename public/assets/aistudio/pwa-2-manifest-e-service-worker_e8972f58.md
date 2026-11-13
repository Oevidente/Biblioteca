# PWA 2 de 2 — Manifest, service worker e registro (instalável, tela cheia, sem botão)

> Só executa depois do **PWA 1** (os ícones precisam existir no deploy).
> Arquivos: criar `public/manifest.webmanifest` e `public/sw.js`; alterar `index.html`, `src/main.tsx` e `.github/workflows/deploy.yml`.

## Regras (leia antes de qualquer coisa)
- **NÃO colocar botão, banner, popup, menu nem texto de "Instalar app" em lugar nenhum do site.** Não usar `beforeinstallprompt`. O próprio navegador oferece a instalação (no Chrome do Android: menu ⋮ > "Instalar app"). Este plano não mexe em nenhum componente visual.
- **NÃO criar arquivos de imagem** (o AI Studio corrompe binário; os ícones vêm do PWA 1).
- **NÃO instalar `vite-plugin-pwa`, `workbox` nem nenhuma dependência.** São só arquivos estáticos em `public/`.
- **Caminhos relativos** (`./`). O site fica numa subpasta do GitHub Pages (`/Biblioteca/`), então qualquer caminho começando com `/` dentro do manifest ou do service worker quebra.
- **O service worker só pode ser registrado no site publicado**, nunca no modo de desenvolvimento (senão atrapalha o recarregamento no AI Studio).
- Não mexer no `HashRouter`, no `base: './'` do `vite.config.ts` nem no resto do `index.html`.

## O que o PWA precisa pra ser instalável (e o que cada arquivo faz)
1. `manifest.webmanifest` com nome, `start_url`, `scope`, `display` e ícones de 192 e 512 px.
2. Um service worker registrado, com tratador de `fetch` (deixa o app abrir mesmo sem internet).
3. Tudo em HTTPS (o GitHub Pages já é).

**Tela cheia:** `"display": "fullscreen"`, com `display_override` pra cair em `standalone` caso o aparelho não suporte tela cheia.

## Passo 1 — Criar `public/manifest.webmanifest`

Conteúdo exato:

```json
{
  "id": "/Biblioteca/",
  "name": "INKORA - Biblioteca Digital",
  "short_name": "INKORA",
  "description": "Leia, crie e compartilhe histórias incríveis no INKORA.",
  "lang": "pt-BR",
  "dir": "ltr",
  "start_url": "./",
  "scope": "./",
  "display": "fullscreen",
  "display_override": ["fullscreen", "standalone", "minimal-ui"],
  "background_color": "#07080B",
  "theme_color": "#07080B",
  "categories": ["books", "education", "entertainment"],
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Pontos que não podem mudar: `start_url` e `scope` são `"./"`; os `src` dos ícones **não** começam com `/`; o `id` é `"/Biblioteca/"`; `display` é `"fullscreen"`; a cor `#07080B` é a do fundo escuro do site.

## Passo 2 — Criar `public/sw.js`

Conteúdo exato:

```js
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
```

O que ele faz: páginas HTML tentam a internet primeiro (o site novo aparece logo) e, sem internet, abrem a última versão guardada; os arquivos `assets/*.js|css` (com hash no nome) ficam guardados; ícones e manifest atualizam em segundo plano; Firebase, Google Fonts e traduções (outros domínios) **nunca** passam pelo cache.

## Passo 3 — `index.html`

Dentro do `<head>`, logo depois da linha `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`, adicionar (sem alterar a linha do viewport):

```html
    <!-- PWA -->
    <meta name="theme-color" content="#07080B" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="INKORA" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

(As linhas de favicon que já existem usam `/favicon.png`; o Vite reescreve esse tipo de caminho com o `base: './'`. O passo 5 confere se o do manifest também foi reescrito.)

## Passo 4 — `src/main.tsx`: registrar o service worker só em produção

No fim do arquivo, depois do `createRoot(...).render(...)`, adicionar:

```ts
// PWA: o service worker só roda no site publicado (em desenvolvimento ele atrapalharia o recarregamento)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((error) => console.warn('Service worker não registrado:', error));
  });
}
```

## Passo 5 — Conferência automática no `deploy.yml`

No job `build`, **logo depois** do passo `Build` e antes do passo `Upload artifact`, adicionar:

```yaml
      - name: Verificar PWA no build
        run: |
          set -e
          test -f dist/manifest.webmanifest
          test -f dist/sw.js
          for f in icon-192 icon-512 maskable-512 apple-touch-icon; do test -f "dist/icons/$f.png"; done
          python3 - <<'PY'
          import json
          m = json.load(open('dist/manifest.webmanifest', encoding='utf-8'))
          assert m['display'] == 'fullscreen', 'display precisa ser fullscreen'
          assert m['start_url'] == './' and m['scope'] == './', 'start_url e scope precisam ser ./'
          have = {(i['sizes'], i.get('purpose', 'any')) for i in m['icons']}
          for need in [('192x192', 'any'), ('512x512', 'any'), ('512x512', 'maskable')]:
              assert need in have, 'falta icone ' + str(need)
          print('manifest ok')
          PY
          grep -q 'manifest.webmanifest' dist/index.html
          if grep -Eq '<link[^>]*rel="manifest"[^>]*href="/' dist/index.html; then
            echo "::error::O link do manifest no index.html esta com caminho absoluto. No GitHub Pages precisa ser relativo (./manifest.webmanifest)."
            exit 1
          fi
```

Esse passo derruba o deploy com uma mensagem clara se faltar manifest, service worker ou ícone, se o `display` não for `fullscreen`, ou se o link do manifest ficar com caminho absoluto (o erro mais comum, que deixa o app não instalável sem aviso).

**Se o passo falhar por causa do link absoluto:** no `index.html`, trocar `href="/manifest.webmanifest"` por `href="./manifest.webmanifest"` e dar push de novo.

## Critério de pronto
1. `npm run lint` e `npm run build` sem erro novo; o site continua igual por fora (nenhum botão novo).
2. O deploy no GitHub Actions termina verde, incluindo "Verificar PWA no build" (aparece `manifest ok` no log).
3. Abrir `https://oevidente.github.io/Biblioteca/manifest.webmanifest` e `.../sw.js`: os dois abrem.
4. No Chrome do PC, F12 > aba **Application** > **Manifest**: sem erros, ícones aparecendo, em "Installability" nenhum problema; **Service workers** com status "activated".
5. No celular (Chrome): abrir o site, menu ⋮ > **Instalar app**. Instalar e abrir pelo ícone novo: abre **em tela cheia**, sem barra de endereço e sem barra de status.
6. Colocar o celular em modo avião e abrir o app instalado: a tela do app abre (o conteúdo que depende do Firebase precisa de internet).

## Cuidados
- Se já existir um atalho do site na tela inicial (feito com "Adicionar à tela inicial" antes do PWA), remover o atalho antes de instalar, senão o Chrome pode continuar abrindo o atalho antigo.
- Se mudar o manifest depois (ex.: `display`), o Android só atualiza o app instalado depois de um tempo; pra ver na hora, desinstalar e instalar de novo.
- **Tela cheia no computador também:** o Chrome do PC respeita `fullscreen` e abre o app instalado em tela cheia. Se isso incomodar no PC, trocar a ordem de `display_override` pra `["standalone", "fullscreen", "minimal-ui"]` (mas aí o celular também deixa de abrir em tela cheia).
- iPhone/Safari não tem tela cheia de PWA: abre em modo `standalone` (sem barra de endereço).
- Para forçar todo mundo a baixar tudo de novo após uma mudança grande, trocar o número em `CACHE_NAME` (`inkora-v1` para `inkora-v2`) no `public/sw.js`.
- Atualizações do site: como as páginas HTML vão sempre à internet primeiro, depois de cada deploy o app instalado mostra a versão nova assim que abrir com internet.

## O que eu testei
Montei um site de teste dentro de `/Biblioteca/` (como no GitHub Pages) com exatamente esse manifest e esse service worker e abri num Chromium: o manifest é lido sem nenhum erro, `display` fullscreen, ícones de 192/512/maskable com o tamanho real certo, `start_url` dentro do escopo, o service worker registra com escopo `/Biblioteca/`, passa a controlar a página e o app abre **sem internet**. O teste com o link do manifest em caminho absoluto (`/manifest.webmanifest`) falhou como esperado (404, manifest vazio), e o passo de verificação do deploy também pegou esse caso. Rodei os comandos do ImageMagick do PWA 1 na logo real e conferi os tamanhos. O que não deu pra testar aqui: o build do Vite em si (sem rede pra instalar) e a instalação real no teu celular, que é o item 5 do checklist.
