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
const literaryFallbackPT: Record<string, { es: string; en: string; id: string }> = {
  "Era uma vez": { es: "Había una vez", en: "Once upon a time", id: "Pada suatu ketika" },
  "Fim": { es: "Fin", en: "The End", id: "Tamat" },
  "Capítulo": { es: "Capítulo", en: "Chapter", id: "Bab" },
  "Numa noite escura": { es: "En una noche oscura", en: "On a dark night", id: "Di malam yang gelap" },
  "Com um suspiro": { es: "Con un suspiro", en: "With a sigh", id: "Dengan helaan napas" },
  "Eles viveram felizes para sempre": { es: "Vivieron felices para siempre", en: "They lived happily ever after", id: "Mereka hidup bahagia selamanya" },
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
 * Primary Engine: Google Translate GTX Free Endpoint (No key, high capacity ~4000 chars per query)
 */
async function translateViaGoogleGTX(text: string, targetLang: string): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
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
    }
  } catch (err) {
    console.warn("Google GTX translation attempt failed:", err);
  }
  return null;
}

/**
 * Secondary Engine: Lingva Translate (Free Open-Source Proxy for Google Translate)
 */
async function translateViaLingva(text: string, targetLang: string): Promise<string | null> {
  const instances = [
    `https://lingva.ml/api/v1/pt/${targetLang}/${encodeURIComponent(text)}`,
    `https://lingva.lunar.icu/api/v1/pt/${targetLang}/${encodeURIComponent(text)}`
  ];

  for (const url of instances) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data && data.translation) {
          return cleanTranslatedText(data.translation);
        }
      }
    } catch (e) {
      // Try next instance
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
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=pt|${targetLang}`;
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
  // Split by sentence endings (. ! ? \n)
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
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

  return chunks.length > 0 ? chunks : [text];
}

/**
 * Translates a plain text block with caching, chunking, and multi-provider fallbacks.
 */
export async function translateTextBlock(text: string, targetLang: 'es' | 'en' | 'id'): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;

  // Exact phrase match from literary dictionary
  if (literaryFallbackPT[trimmed] && literaryFallbackPT[trimmed][targetLang]) {
    return literaryFallbackPT[trimmed][targetLang];
  }

  const cacheKey = `txt_v2_${targetLang}_${trimmed.slice(0, 80)}_${trimmed.length}`;
  if (memoryCache[cacheKey]) {
    return memoryCache[cacheKey];
  }

  // If text is very long, chunk it into smaller blocks
  const chunks = splitIntoSmartChunks(trimmed, 1200);
  const translatedChunks: string[] = [];

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

    // Final safety fallback: keep original chunk if all providers fail
    translatedChunks.push(translatedChunk || chunk);
  }

  const finalTranslation = translatedChunks.join(" ");
  memoryCache[cacheKey] = finalTranslation;
  return finalTranslation;
}

/**
 * Generate a fast numeric hash fingerprint for HTML content
 */
function getContentFingerprint(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return `${text.length}_${Math.abs(hash)}`;
}

/**
 * Translates an entire HTML page content while preserving HTML structure.
 */
export async function translateStoryPageHtml(
  htmlContent: string, 
  targetLang: 'es' | 'en' | 'id', 
  storyId: string, 
  pageIndex: number
): Promise<string> {
  if (!htmlContent || targetLang === ('pt' as any)) return htmlContent;

  const contentKey = getContentFingerprint(htmlContent);
  const sessionKey = `inkora_story_trans_v3_${storyId}_${pageIndex}_${targetLang}_${contentKey}`;
  try {
    const cached = sessionStorage.getItem(sessionKey);
    if (cached) return cached;
  } catch (e) {
    // Ignore storage errors
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // Collect all text-bearing elements (<p>, <h1>..<h6>, blockquote, li)
    const elements = Array.from(doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote, li'));

    if (elements.length === 0) {
      const bodyText = doc.body.textContent || '';
      if (bodyText.trim()) {
        const translated = await translateTextBlock(bodyText, targetLang);
        return `<p>${translated}</p>`;
      }
      return htmlContent;
    }

    // Process elements in parallel batches
    const translatePromises = elements.map(async (el) => {
      const originalText = el.textContent || '';
      if (originalText.trim().length > 0) {
        const translatedText = await translateTextBlock(originalText, targetLang);
        el.textContent = translatedText;
      }
    });

    await Promise.all(translatePromises);

    const resultHtml = doc.body.innerHTML;

    try {
      sessionStorage.setItem(sessionKey, resultHtml);
    } catch (e) {
      // Ignore quota errors
    }

    return resultHtml;
  } catch (err) {
    console.error("Error parsing/translating HTML story page:", err);
    return htmlContent;
  }
}
