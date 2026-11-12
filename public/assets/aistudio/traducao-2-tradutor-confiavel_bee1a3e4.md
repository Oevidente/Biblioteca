# Tradução 2 de 3 — Tradutor mais confiável (tentar de novo, não gravar falha, não perder o fim do texto)

> Só executa depois do **Tradução 1**. Arquivo alterado: `src/lib/storyTranslator.ts`.

## O problema
Mesmo com a estrutura preservada, ainda pode sobrar trecho em português, e uma falha ficava "presa".

## Causas (reproduzi cada uma no navegador)
1. **Sem nova tentativa.** Se o Google devolve 429 (limite) ou o pedido dá erro de rede uma vez, o código desiste do provedor na hora e passa pro próximo; se todos falham, **mantém o texto em português sem avisar**.
2. **A falha é gravada no cache.** `translateTextBlock` guarda o resultado (mesmo quando ficou em português) em `memoryCache` e `sessionStorage`. Depois que o serviço volta, o trecho continua em português até fechar a aba. Teste: serviço fora do ar → serviço volta → o código antigo continua devolvendo o texto original.
3. **O fim de parágrafos longos some.** Em `splitIntoSmartChunks`, o `match(/[^.!?\n]+[.!?\n]+/g)` só pega frases que terminam em pontuação; o resto final sem ponto é descartado (só em parágrafos acima de 1200 caracteres). No teste, "E este é o final sem ponto" desaparecia.
4. Não existe jeito de saber se a tradução ficou completa (o Plano 3 usa isso pra avisar no Leitor).

## O que muda
- Pedidos com tempo limite de 8 s e até 3 tentativas com espera crescente em 429, erro de servidor e erro de rede.
- Trecho que falha em todos os provedores **não vai pro cache**: a próxima tentativa refaz.
- `splitIntoSmartChunks` não perde mais o fim (e quebra por palavras uma frase gigante sem pontuação).
- Novas funções `translateTextBlockDetailed` e `translateStoryPageHtmlDetailed`, que devolvem também se ficou completo. As funções antigas continuam existindo (viram wrappers), então nada que já usa elas quebra.

## Passos (todos em `src/lib/storyTranslator.ts`)

### 1) Adicionar, logo ANTES do comentário `/** Primary Engine: Google Translate GTX ...`:

```ts
/**
 * Busca JSON com timeout e novas tentativas (429/5xx/erro de rede) com espera crescente.
 * Devolve null se todas as tentativas falharem.
 */
async function fetchJsonWithRetry(url: string, attempts: number = 3): Promise<any | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) return await res.json();
      // Erro que não adianta repetir (ex.: 400/404)
      if (res.status !== 429 && res.status < 500) return null;
    } catch (e) {
      // Erro de rede ou timeout: tenta de novo
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
  }
  return null;
}
```

### 2) Substituir a função `translateViaGoogleGTX` inteira por:

```ts
async function translateViaGoogleGTX(text: string, targetLang: string): Promise<string | null> {
  const langCode = targetLang === 'zh' ? 'zh-CN' : targetLang;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=${langCode}&dt=t&q=${encodeURIComponent(text)}`;
  const data = await fetchJsonWithRetry(url);
  if (Array.isArray(data) && Array.isArray(data[0])) {
    // data[0] contains pairs of [translated_sentence, original_sentence]
    const translatedParts = data[0]
      .map((item: any) => (Array.isArray(item) && item[0] ? item[0] : ""))
      .filter(Boolean);
    if (translatedParts.length > 0) {
      const joined = translatedParts.join("");
      if (joined && !joined.includes("MYMEMORY WARNING")) {
        return cleanTranslatedText(joined);
      }
    }
  }
  return null;
}
```

### 3) Substituir a função `translateViaLingva` inteira por:

```ts
async function translateViaLingva(text: string, targetLang: string): Promise<string | null> {
  const langCode = targetLang === 'zh' ? 'zh' : targetLang;
  const instances = [
    `https://lingva.ml/api/v1/pt/${langCode}/${encodeURIComponent(text)}`,
    `https://lingva.lunar.icu/api/v1/pt/${langCode}/${encodeURIComponent(text)}`
  ];

  for (const url of instances) {
    const data = await fetchJsonWithRetry(url, 2);
    if (data && data.translation) {
      return cleanTranslatedText(data.translation);
    }
  }
  return null;
}
```

(`translateViaMyMemory` fica como está.)

### 4) Substituir a função `splitIntoSmartChunks` inteira por:

```ts
function splitIntoSmartChunks(text: string, maxLength: number = 1000): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  // Frases terminadas em . ! ? ou quebra de linha, MAIS o resto final sem pontuação
  // (antes esse resto era descartado e o fim do parágrafo sumia da tradução)
  const sentences = text.match(/[^.!?\n]*[.!?\n]+|[^.!?\n]+$/g) || [text];
  let currentChunk = "";

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxLength) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // Frase gigante sem pontuação: quebra por palavras
  const result: string[] = [];
  for (const chunk of chunks.length > 0 ? chunks : [text]) {
    if (chunk.length <= maxLength) {
      result.push(chunk);
      continue;
    }
    let piece = "";
    for (const word of chunk.split(/(\s+)/)) {
      if ((piece + word).length > maxLength && piece.trim()) {
        result.push(piece.trim());
        piece = word;
      } else {
        piece += word;
      }
    }
    if (piece.trim()) result.push(piece.trim());
  }
  return result;
}
```

### 5) Substituir `export async function translateTextBlock(...)` inteira por estas duas funções:

```ts
/**
 * Traduz um bloco de texto e informa se TODOS os trechos foram traduzidos.
 * Trecho que falhou em todos os provedores fica no original e a tradução NÃO é gravada
 * no cache, então a próxima tentativa tenta de novo.
 */
export async function translateTextBlockDetailed(
  text: string,
  targetLang: 'es' | 'en' | 'id' | 'zh'
): Promise<{ text: string; complete: boolean }> {
  const trimmed = text.trim();
  if (!trimmed) return { text, complete: true };

  const cached = getCachedTranslation(trimmed, targetLang);
  if (cached) return { text: cached, complete: true };

  const cacheKey = `txt_v2_${targetLang}_${trimmed.slice(0, 80)}_${trimmed.length}`;

  // If text is very long, chunk it into smaller blocks
  const chunks = splitIntoSmartChunks(trimmed, 1200);
  const translatedChunks: string[] = [];
  let complete = true;

  for (const chunk of chunks) {
    let translatedChunk: string | null = null;

    // 1. Try Google GTX (Unlimited, Fast)
    translatedChunk = await translateViaGoogleGTX(chunk, targetLang);

    // 2. Fallback to Lingva
    if (!translatedChunk) {
      translatedChunk = await translateViaLingva(chunk, targetLang);
    }

    // 3. Fallback to MyMemory for small chunks
    if (!translatedChunk) {
      translatedChunk = await translateViaMyMemory(chunk, targetLang);
    }

    if (!translatedChunk) complete = false;
    // Se todos os provedores falharem, mantém o trecho original
    translatedChunks.push(translatedChunk || chunk);
  }

  const finalTranslation = translatedChunks.join(" ");
  if (complete) {
    memoryCache[cacheKey] = finalTranslation;
    try {
      sessionStorage.setItem(cacheKey, finalTranslation);
    } catch (e) {}
  }

  return { text: finalTranslation, complete };
}

export async function translateTextBlock(text: string, targetLang: 'es' | 'en' | 'id' | 'zh'): Promise<string> {
  return (await translateTextBlockDetailed(text, targetLang)).text;
}
```

### 6) Substituir `translateStoryPageHtml` (a que o Plano 1 deixou no fim do arquivo) por estas duas:

Apagar a função `translateStoryPageHtml` atual (do comentário `/** Traduz o HTML de uma página preservando toda a estrutura ... */` até o fim do arquivo). **Manter** as funções auxiliares `mapWithConcurrency` e `collectTranslatableTextNodes` e as constantes que o Plano 1 colocou antes dela. No lugar, colar:

```ts
/**
 * Traduz o HTML de uma página preservando toda a estrutura (imagens, formatação, flutuação).
 * Informa se tudo foi traduzido (complete) ou se algum trecho ficou no original.
 */
export async function translateStoryPageHtmlDetailed(
  htmlContent: string,
  targetLang: 'es' | 'en' | 'id' | 'zh',
  storyId: string,
  pageIndex: number
): Promise<{ html: string; complete: boolean }> {
  if (!htmlContent || targetLang === ('pt' as any)) return { html: htmlContent, complete: true };

  try {
    const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
    doc.body.normalize();

    const nodes = collectTranslatableTextNodes(doc.body);
    let complete = true;

    await mapWithConcurrency(nodes, TRANSLATION_CONCURRENCY, async (node) => {
      const raw = node.data;
      const lead = raw.match(/^\s*/)?.[0] ?? '';
      const trail = raw.match(/\s*$/)?.[0] ?? '';
      const result = await translateTextBlockDetailed(raw, targetLang);
      if (!result.complete) complete = false;
      node.data = lead + result.text.trim() + trail;
    });

    return { html: doc.body.innerHTML, complete };
  } catch (err) {
    console.error("Error parsing/translating HTML story page:", err);
    return { html: htmlContent, complete: false };
  }
}

export async function translateStoryPageHtml(
  htmlContent: string,
  targetLang: 'es' | 'en' | 'id' | 'zh',
  storyId: string,
  pageIndex: number
): Promise<string> {
  return (await translateStoryPageHtmlDetailed(htmlContent, targetLang, storyId, pageIndex)).html;
}
```

## Critério de pronto
1. `npm run lint` sem erro novo.
2. Traduzir uma página longa: nenhum trecho fica em português; o fim de parágrafos grandes aparece.
3. Se o serviço der erro temporário, a tradução se recupera sozinha nas tentativas seguintes (a espera entre elas cresce: 0,4 s, 0,8 s).
4. Se o serviço ficar fora do ar, o texto aparece em português e, quando o serviço voltar, trocar de página e voltar traduz normalmente (a falha não fica gravada).
5. Nada mais chama `translateStoryPageHtml` com assinatura diferente: ela continua existindo e devolvendo só o HTML.

## O que eu testei
Rodei a versão antiga e a nova lado a lado num Chromium, com o serviço de tradução simulado: imagem em parágrafo, imagem flutuante, `<div>` e texto solto, citação aninhada, cor e negrito, parágrafo longo sem ponto final, 40 parágrafos (pedidos simultâneos: 40 antes, 4 depois), 429 duas vezes seguidas e depois sucesso, serviço fora do ar e depois de volta. Tudo se comportou como descrito. Não testei contra o serviço real do Google, só contra uma simulação.
