/**
 * Dialogue detection, navigation and format conversion utility for Inkora Story Editor.
 * Supports:
 * - Em-dash (travessão `—`), en-dash (`–`), horizontal bar (`―`), hyphen (`-`)
 * - Double quotes (`"..."`), smart quotes (`“...”`, `«...»`)
 * - Action/narration clause splitting
 * - Bulk conversion per-page or entire story
 */

export type DialogueStyle = 'dash' | 'quotes' | 'mixed' | 'none';

export interface DialogueSegment {
  type: 'speech' | 'action';
  text: string;
}

export interface DialogueItem {
  id: string; // e.g. "diag-p0-b3"
  pageIndex: number;
  blockIndex: number;
  rawText: string;
  style: DialogueStyle;
  preview: string;
  segments: DialogueSegment[];
}

// Regex to test if a block starts with dash or quotation marks
const OPENING_DASH_REGEX = /^[\s\uFEFF]*([—–―]|--|-)(\s*)/u;
const OPENING_QUOTE_REGEX = /^[\s\uFEFF]*["“«„]/u;

/**
 * Checks whether a plain text block is a dialogue.
 */
export function detectDialogueStyle(text: string): DialogueStyle {
  const trimmed = text.trim();
  if (!trimmed) return 'none';

  const startsWithDash = OPENING_DASH_REGEX.test(trimmed);
  const startsWithQuote = OPENING_QUOTE_REGEX.test(trimmed);

  if (startsWithDash && startsWithQuote) return 'mixed';
  if (startsWithDash) return 'dash';
  if (startsWithQuote) return 'quotes';

  return 'none';
}

/**
 * Parses a dash-styled dialogue into speech and action segments.
 * Example:
 * "— Hum, olha, ruins não estão. — Deslizando a foto para o lado."
 * -> speech: "Hum, olha, ruins não estão."
 * -> action: "Deslizando a foto para o lado."
 */
export function parseDashDialogue(text: string): DialogueSegment[] {
  const trimmed = text.trim();
  // Remove leading dash
  const withoutLead = trimmed.replace(OPENING_DASH_REGEX, '');

  // Split by internal dashes: " — " or " —" or ". — " or ", — "
  // Look for dash delimiters separated by spaces or punctuation
  const rawParts = withoutLead.split(/\s+[—–―]\s*|[.,!?;:]\s*[—–―]\s+/u);

  // If simple split didn't find anything, try regex with punctuation preserved
  const regex = /([—–―])/g;
  const parts: DialogueSegment[] = [];

  // Match segments between dashes:
  // e.g. "Fala, — disse ele —, continuação."
  const tokens = withoutLead.split(/\s*(?:—|–|―)\s*/);

  tokens.forEach((token, idx) => {
    const clean = token.trim();
    if (!clean) return;
    // Even indices: speech (0, 2, 4...)
    // Odd indices: action / narration (1, 3, 5...)
    const type: 'speech' | 'action' = idx % 2 === 0 ? 'speech' : 'action';
    parts.push({ type, text: clean });
  });

  return parts;
}

/**
 * Parses a quotes-styled dialogue into speech and action segments.
 * Example:
 * '"Hum, olha, ruins não estão." Deslizando a foto para o lado.'
 * -> speech: "Hum, olha, ruins não estão."
 * -> action: "Deslizando a foto para o lado."
 */
export function parseQuotesDialogue(text: string): DialogueSegment[] {
  const trimmed = text.trim();
  const segments: DialogueSegment[] = [];

  // Match all quoted speech blocks and unquoted narration between them
  // Handles straight quotes "...", curly quotes “...”, and guillemets «...»
  const quoteRegex = /(["“«][^"”»]*["”»])/gu;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = quoteRegex.exec(trimmed)) !== null) {
    const speechWithQuotes = match[0];
    const matchStart = match.index;

    // Check if there was narration before this quote (e.g. if quotes weren't at index 0)
    if (matchStart > lastIndex) {
      const narration = trimmed.slice(lastIndex, matchStart).trim();
      if (narration) {
        segments.push({ type: 'action', text: narration });
      }
    }

    // Strip outer quotes from speech
    const cleanSpeech = speechWithQuotes.replace(/^["“«]|["”»]$/gu, '').trim();
    if (cleanSpeech) {
      segments.push({ type: 'speech', text: cleanSpeech });
    }

    lastIndex = matchStart + speechWithQuotes.length;
  }

  // Any trailing narration after the last quote
  if (lastIndex < trimmed.length) {
    const trailingNarration = trimmed.slice(lastIndex).trim();
    if (trailingNarration) {
      segments.push({ type: 'action', text: trailingNarration });
    }
  }

  return segments;
}

/**
 * Converts a dialogue line from any style to 'dash' (travessão).
 * Input: '"Hum, olha, ruins não estão." Deslizando a foto para o lado.'
 * Output: '— Hum, olha, ruins não estão. — Deslizando a foto para o lado.'
 */
export function convertToDash(text: string): string {
  const currentStyle = detectDialogueStyle(text);
  if (currentStyle === 'none') return text;

  let segments: DialogueSegment[];
  if (currentStyle === 'quotes') {
    segments = parseQuotesDialogue(text);
  } else if (currentStyle === 'dash') {
    // Already dash, but we re-normalize to ensure standard em-dash formatting
    segments = parseDashDialogue(text);
  } else {
    // Mixed: strip existing dashes and quotes and reconstruct
    const clean = text.replace(/^[—–―-]\s*/, '').replace(/^["“«]|["”»]$/g, '');
    segments = [{ type: 'speech', text: clean.trim() }];
  }

  if (segments.length === 0) return text;

  let result = '';
  segments.forEach((seg, idx) => {
    if (idx === 0) {
      // First speech starts with em-dash
      result += `— ${seg.text}`;
    } else {
      if (seg.type === 'action') {
        // Punctuate before action if needed, then em-dash
        const needsDash = !result.endsWith('— ');
        result += needsDash ? ` — ${seg.text}` : ` ${seg.text}`;
      } else {
        // Speech following action
        const needsDash = !result.endsWith('— ');
        result += needsDash ? ` — ${seg.text}` : ` ${seg.text}`;
      }
    }
  });

  return result.trim();
}

/**
 * Converts a dialogue line from any style to 'quotes' (aspas).
 * User requirement: "Aspas apenas nos trechos de fala e narração livre"
 * Input: '— Hum, olha, ruins não estão. — Deslizando a foto para o lado.'
 * Output: '"Hum, olha, ruins não estão." Deslizando a foto para o lado.'
 */
export function convertToQuotes(text: string): string {
  const currentStyle = detectDialogueStyle(text);
  if (currentStyle === 'none') return text;

  let segments: DialogueSegment[];
  if (currentStyle === 'dash') {
    segments = parseDashDialogue(text);
  } else if (currentStyle === 'quotes') {
    // Re-normalize quotes
    segments = parseQuotesDialogue(text);
  } else {
    const clean = text.replace(/^[—–―-]\s*/, '').replace(/^["“«]|["”»]$/g, '');
    segments = [{ type: 'speech', text: clean.trim() }];
  }

  if (segments.length === 0) return text;

  let result = '';
  segments.forEach((seg, idx) => {
    if (seg.type === 'speech') {
      const speech = seg.text.trim();
      if (idx > 0) result += ' ';
      result += `"${speech}"`;
    } else {
      // Action is free/unquoted
      const action = seg.text.trim();
      if (action) {
        result += ` ${action}`;
      }
    }
  });

  return result.trim();
}

/**
 * Converts dialogue text to target style ('dash' | 'quotes').
 */
export function convertDialogueText(text: string, targetStyle: 'dash' | 'quotes'): string {
  return targetStyle === 'dash' ? convertToDash(text) : convertToQuotes(text);
}

/**
 * Scans an HTML page string (or editor innerHTML) and extracts all detected dialogues.
 */
export function extractDialoguesFromHtml(html: string, pageIndex: number): DialogueItem[] {
  if (!html) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Check paragraphs and div text containers
  const blockElements = Array.from(doc.body.querySelectorAll('p, div, blockquote, li'));
  const dialogues: DialogueItem[] = [];

  // Fallback if no block elements (e.g. plain text or single lines)
  const blocksToProcess: Element[] = blockElements.length > 0 ? blockElements : [doc.body];

  blocksToProcess.forEach((el, blockIdx) => {
    // Ignore page break markers or helper containers
    if (el.classList.contains('page-break-marker') || el.closest('.page-break-marker')) {
      return;
    }
    // Ignore elements that contain child block elements to avoid duplicate entries
    if (el.querySelector('p, div, blockquote, li')) {
      return;
    }

    const text = el.textContent || '';
    const style = detectDialogueStyle(text);
    if (style !== 'none') {
      const segments = style === 'dash' ? parseDashDialogue(text) : parseQuotesDialogue(text);
      dialogues.push({
        id: `diag-p${pageIndex}-b${blockIdx}`,
        pageIndex,
        blockIndex: blockIdx,
        rawText: text.trim(),
        style,
        preview: text.trim().slice(0, 90) + (text.trim().length > 90 ? '...' : ''),
        segments,
      });
    }
  });

  return dialogues;
}

/**
 * Converts all dialogues inside a single HTML page string to target style.
 * Leaves non-dialogue paragraphs completely untouched.
 */
export function convertPageDialogues(
  html: string,
  targetStyle: 'dash' | 'quotes'
): { html: string; convertedCount: number } {
  if (!html) return { html, convertedCount: 0 };

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const blockElements = Array.from(doc.body.querySelectorAll('p, div, blockquote, li'));
  const blocks = blockElements.length > 0 ? blockElements : [doc.body];

  let convertedCount = 0;

  blocks.forEach((el) => {
    if (el.classList.contains('page-break-marker') || el.closest('.page-break-marker')) {
      return;
    }
    if (el.querySelector('p, div, blockquote, li')) {
      return;
    }

    const currentText = el.textContent || '';
    const style = detectDialogueStyle(currentText);

    if (style !== 'none' && style !== targetStyle) {
      const converted = convertDialogueText(currentText, targetStyle);
      // If element has no formatting child nodes (just text or simple text node)
      if (el.children.length === 0) {
        el.textContent = converted;
      } else {
        // Has inline formatting tags: preserve outer element and replace text content safely
        el.textContent = converted;
      }
      convertedCount++;
    }
  });

  return { html: doc.body.innerHTML, convertedCount };
}

/**
 * Calculates dialogue stats across a story's pages.
 */
export function getDialogueStats(pages: string[]): {
  total: number;
  dashCount: number;
  quotesCount: number;
  mixedCount: number;
  dominantStyle: 'dash' | 'quotes' | 'mixed' | 'none';
} {
  let dashCount = 0;
  let quotesCount = 0;
  let mixedCount = 0;

  pages.forEach((pageHtml, pageIdx) => {
    const list = extractDialoguesFromHtml(pageHtml, pageIdx);
    list.forEach((item) => {
      if (item.style === 'dash') dashCount++;
      else if (item.style === 'quotes') quotesCount++;
      else if (item.style === 'mixed') mixedCount++;
    });
  });

  const total = dashCount + quotesCount + mixedCount;
  let dominantStyle: 'dash' | 'quotes' | 'mixed' | 'none' = 'none';
  if (total > 0) {
    if (dashCount >= quotesCount && dashCount >= mixedCount) dominantStyle = 'dash';
    else if (quotesCount >= dashCount && quotesCount >= mixedCount) dominantStyle = 'quotes';
    else dominantStyle = 'mixed';
  }

  return { total, dashCount, quotesCount, mixedCount, dominantStyle };
}
