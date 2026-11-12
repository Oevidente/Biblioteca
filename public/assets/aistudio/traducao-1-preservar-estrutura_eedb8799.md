# Tradução 1 de 3 — Traduzir sem destruir imagens, formatação e parágrafos em `<div>`

> Arquivo alterado: `src/lib/storyTranslator.ts`. Só isso.
> Executa este plano sozinho. O Plano 2 (tradutor mais confiável) e o Plano 3 (aviso no Leitor) vêm depois.

## O problema
Na versão traduzida do Leitor:
- **imagens somem** (algumas aparecem, outras não);
- **parte do texto fica em português** e parte vira inglês no mesmo trecho;
- a formatação (cor, negrito) some.

## Causa (reproduzi no navegador com o código real da `main`)
A função `translateStoryPageHtml` faz isto:

```ts
const elements = Array.from(doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote, li'));
...
el.textContent = translatedText;
```

Três defeitos aí:

1. **`el.textContent = ...` apaga tudo que está dentro do parágrafo**, inclusive `<img>`. O editor insere a imagem **dentro** de um `<p>` (inclusive as imagens com texto ao redor), então ela some. As imagens que ficam fora de um `<p>` sobrevivem. Por isso "algumas aparecem, outras não". Também somem negrito, itálico, cor e links.
2. **Só traduz `p, h1–h6, blockquote, li`.** Parágrafo em `<div>` (o contentEditable cria `<div>` ao apertar Enter), texto solto e `<span>` ficam em português. Quando a página só tem `<div>`, o fallback junta tudo num único `<p>` e destrói os parágrafos.
3. **Elementos aninhados** (`<blockquote><p>…</p></blockquote>`) entram na lista duas vezes e um sobrescreve o outro. Além disso, **todos os parágrafos são traduzidos ao mesmo tempo** (40 parágrafos = 40 pedidos simultâneos), o que estoura o limite do serviço gratuito e deixa trechos sem tradução.

Resultados no teste (mesma entrada, antes e depois):

| Entrada | Antes | Depois |
|---|---|---|
| `<p>Texto <img> texto</p>` | imagem some | imagem mantida |
| `<p><img float>Ela estava…</p>` | imagem some | imagem mantida |
| `Solta<div>Em div</div>` | tudo junto num `<p>` | estrutura mantida, tudo traduzido |
| `<p>Ela disse <b>oi</b></p>` | negrito some | negrito mantido |
| 40 parágrafos | 40 pedidos ao mesmo tempo | no máximo 4 |

## A ideia
Em vez de trocar o `textContent` de cada elemento, percorrer **só os nós de texto** da página e trocar o texto de cada um. Nenhuma tag é tocada, então imagens, cores, classes, `float` e estilos ficam exatamente como estão. Os pedidos rodam em lotes de 4.

## Passo único — Substituir o fim do arquivo

Em `src/lib/storyTranslator.ts`, **apagar** a função `getContentFingerprint` e a função `translateStoryPageHtml` atuais (tudo a partir do comentário `/** Generate a fast numeric hash fingerprint for HTML content */` até o final do arquivo) e colocar no lugar **exatamente** isto:

```ts
/**
 * Quantos pedidos de tradução rodam ao mesmo tempo (evita 429 do serviço gratuito).
 */
const TRANSLATION_CONCURRENCY = 4;

const HAS_LETTER = /\p{L}/u;
const SKIP_TRANSLATION_SELECTOR = 'script, style, noscript, code, pre, textarea';

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

/**
 * Todos os nós de TEXTO com letras (em qualquer tag: p, div, span, h1.., ou solto na raiz).
 * Só o texto é trocado; <img>, formatação, cores e classes ficam intactos.
 */
function collectTranslatableTextNodes(root: HTMLElement): Text[] {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    const textNode = current as Text;
    if (HAS_LETTER.test(textNode.data) && !textNode.parentElement?.closest(SKIP_TRANSLATION_SELECTOR)) {
      nodes.push(textNode);
    }
    current = walker.nextNode();
  }
  return nodes;
}

/**
 * Traduz o HTML de uma página preservando toda a estrutura (imagens, formatação, flutuação).
 */
export async function translateStoryPageHtml(
  htmlContent: string,
  targetLang: 'es' | 'en' | 'id' | 'zh',
  storyId: string,
  pageIndex: number
): Promise<string> {
  if (!htmlContent || targetLang === ('pt' as any)) return htmlContent;

  try {
    const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
    doc.body.normalize();

    const nodes = collectTranslatableTextNodes(doc.body);

    await mapWithConcurrency(nodes, TRANSLATION_CONCURRENCY, async (node) => {
      const raw = node.data;
      const lead = raw.match(/^\s*/)?.[0] ?? '';
      const trail = raw.match(/\s*$/)?.[0] ?? '';
      const translated = await translateTextBlock(raw, targetLang);
      node.data = lead + translated.trim() + trail;
    });

    return doc.body.innerHTML;
  } catch (err) {
    console.error("Error parsing/translating HTML story page:", err);
    return htmlContent;
  }
}
```

Não mexer nas outras funções do arquivo (`translateTextBlock`, `getCachedTranslation`, provedores etc.) neste plano.

Observação: o cache de página inteira no `sessionStorage` (`inkora_story_trans_v3_...`) deixa de existir. Ele guardava o HTML da página com as imagens em base64 (pesado) e não é necessário: cada trecho continua em cache por texto (`txt_v2_...`), então voltar numa página já traduzida continua instantâneo.

## Critério de pronto
1. `npm run lint` sem erro novo.
2. Abrir uma história com imagens no meio dos parágrafos, ligar a tradução e trocar o idioma: **todas as imagens aparecem**, nas mesmas posições (inclusive as com texto ao redor).
3. Nenhum trecho fica em português no meio do texto traduzido (parágrafos soltos, em `<div>` e em citação).
4. Cor e negrito de falas continuam na versão traduzida.
5. Voltar pra versão em português: nada mudou.

## Cuidados
- Texto formatado no meio de uma frase (ex.: uma palavra em negrito) é traduzido em pedaços separados, então a tradução desse trecho pode ficar um pouco menos natural do que a frase inteira. É o preço de manter a formatação.
- `alt` de imagem não é traduzido.
