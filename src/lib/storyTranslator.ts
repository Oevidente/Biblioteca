/**
 * Story Translation Module for Inkora
 * High-quality, natural literary translation from Portuguese to target site languages (ES, EN, ID)
 * without paid AI APIs or character limits.
 * Uses a multi-provider fallback engine (Google GTX + Lingva Translate + Smart Chunking)
 * completely free and unlimited.
 */

// Cache in memory and sessionStorage for instant repeat loading
const memoryCache: Record<string, string> = {};

/**
 * High-quality literary vocabulary and phrase fallback map for common literary expressions.
 */
const literaryFallbackPT: Record<string, { es: string; en: string; id: string; zh: string }> = {
  "Era uma vez": { es: "Había una vez", en: "Once upon a time", zh: "从前", id: "Pada suatu ketika" },
  "Fim": { es: "Fin", en: "The End", id: "Tamat", zh: "终" },
  "Capítulo": { es: "Capítulo", en: "Chapter", id: "Bab", zh: "章" },
  "Numa noite escura": { es: "En una noche oscura", en: "On a dark night", id: "Di malam yang gelap", zh: "在一个黑暗的夜晚" },
  "Com um suspiro": { es: "Con un suspiro", en: "With a sigh", id: "Dengan helaan napas", zh: "叹了一口气" },
  "Eles viveram felizes para sempre": { es: "Vivieron felices para siempre", en: "They lived happily ever after", id: "Mereka hidup bahagia selamanya", zh: "他们从此幸福地生活在一起" },
};

/**
 * Clean and normalize translated output text.
 */
function cleanTranslatedText(text: string): string {
  if (!text) return "";
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

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

/**
 * Primary Engine: Google Translate GTX Free Endpoint (No key, high capacity ~4000 chars per query)
 */
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

/**
 * Secondary Engine: Lingva Translate (Free Open-Source Proxy for Google Translate)
 */
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

/**
 * Tertiary Engine: MyMemory API (used for small sentences under 300 chars)
 */
async function translateViaMyMemory(text: string, targetLang: string): Promise<string | null> {
  if (text.length > 350) return null; // Avoid MyMemory length warnings
  try {
    const langCode = targetLang === 'zh' ? 'zh-CN' : targetLang;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=pt|${langCode}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data && data.responseData && data.responseData.translatedText) {
        const result = data.responseData.translatedText;
        if (result && !result.includes("MYMEMORY WARNING") && !result.includes("QUERY LENGTH LIMIT")) {
          return cleanTranslatedText(result);
        }
      }
    }
  } catch (e) {
    // Ignore error
  }
  return null;
}

/**
 * Splits text into smart chunks (sentences/paragraphs) under maxLength chars.
 */
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

/**
 * Translates a plain text block with caching, chunking, and multi-provider fallbacks.
 */
export function getCachedTranslation(text: string, targetLang: 'es' | 'en' | 'id' | 'zh'): string | null {
  const trimmed = text.trim();
  if (!trimmed) return text;

  if (literaryFallbackPT[trimmed] && literaryFallbackPT[trimmed][targetLang]) {
    return literaryFallbackPT[trimmed][targetLang];
  }

  const cacheKey = `txt_v2_${targetLang}_${trimmed.slice(0, 80)}_${trimmed.length}`;
  if (memoryCache[cacheKey]) {
    return memoryCache[cacheKey];
  }

  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      memoryCache[cacheKey] = cached;
      return cached;
    }
  } catch (e) {}

  return null;
}

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

