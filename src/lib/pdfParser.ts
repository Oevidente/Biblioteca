import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { compressBase64Image, splitLargeHtmlContent } from './imageOptimizer';

// Configure the PDF.js worker
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  } catch (e) {
    // Fallback if URL import fails in specific build configurations
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }
}

export interface ParsedPdfResult {
  title?: string;
  author?: string;
  pages: string[];
  totalPages: number;
  wordCount: number;
  coverImage?: string;
}

interface TextItem {
  str: string;
  x: number;
  y: number;
  height: number;
  width: number;
}

/**
 * Extracts structured HTML pages from a PDF file.
 * Each PDF page is converted into a clean HTML page containing formatted paragraphs (<p>) and headings (<h2>).
 * If a page has no text (e.g. cover illustrations or scanned page), it renders the page canvas as a compressed JPEG.
 */
export async function parsePdf(
  file: File,
  onProgress?: (percent: number, message: string) => void
): Promise<ParsedPdfResult> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  let extractedTitle = '';
  let extractedAuthor = '';

  try {
    const meta = await pdfDoc.getMetadata();
    const info = (meta?.info as Record<string, any>) || {};
    if (info.Title && typeof info.Title === 'string' && info.Title.trim().length > 0) {
      extractedTitle = info.Title.trim();
    }
    if (info.Author && typeof info.Author === 'string' && info.Author.trim().length > 0) {
      extractedAuthor = info.Author.trim();
    }
  } catch (err) {
    console.warn('PDF metadata extraction warning:', err);
  }

  const rawPages: string[] = [];
  let firstPageCover: string | undefined = undefined;

  for (let i = 1; i <= numPages; i++) {
    if (onProgress) {
      const pct = Math.min(Math.floor((i / numPages) * 70), 70);
      onProgress(pct, `Processando página ${i} de ${numPages}...`);
    }

    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];

    // Extract structured text from text items
    const textItems: TextItem[] = [];
    for (const item of items) {
      if (item && typeof item.str === 'string') {
        const str = item.str;
        // transform is [scaleX, skewY, skewX, scaleY, tx, ty]
        const tx = item.transform?.[4] || 0;
        const ty = item.transform?.[5] || 0;
        const h = Math.abs(item.height || item.transform?.[3] || 12);
        const w = item.width || 0;
        textItems.push({ str, x: tx, y: ty, height: h, width: w });
      }
    }

    const totalTextLength = textItems.reduce((acc, it) => acc + it.str.trim().length, 0);

    let pageHtml = '';

    if (totalTextLength > 30) {
      // Group items into lines by matching Y position (within 3px tolerance)
      textItems.sort((a, b) => {
        // PDF Y-axis goes from bottom to top, so higher Y means higher on page
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) > 3) {
          return yDiff;
        }
        return a.x - b.x;
      });

      const lines: { text: string; fontSize: number; y: number }[] = [];
      let currentLineItems: TextItem[] = [];
      let currentLineY = textItems[0]?.y ?? 0;

      for (const item of textItems) {
        if (Math.abs(item.y - currentLineY) <= 3) {
          currentLineItems.push(item);
        } else {
          if (currentLineItems.length > 0) {
            currentLineItems.sort((a, b) => a.x - b.x);
            const lineText = currentLineItems
              .map((it) => it.str)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
            const avgHeight =
              currentLineItems.reduce((acc, it) => acc + it.height, 0) / currentLineItems.length;
            if (lineText.length > 0) {
              lines.push({ text: lineText, fontSize: avgHeight, y: currentLineY });
            }
          }
          currentLineItems = [item];
          currentLineY = item.y;
        }
      }

      if (currentLineItems.length > 0) {
        currentLineItems.sort((a, b) => a.x - b.x);
        const lineText = currentLineItems
          .map((it) => it.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        const avgHeight =
          currentLineItems.reduce((acc, it) => acc + it.height, 0) / currentLineItems.length;
        if (lineText.length > 0) {
          lines.push({ text: lineText, fontSize: avgHeight, y: currentLineY });
        }
      }

      // Calculate median font size to distinguish headings from body text
      const fontSizes = lines.map((l) => l.fontSize).sort((a, b) => a - b);
      const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 12;

      // Group lines into paragraphs based on vertical line gaps
      const paragraphsHtml: string[] = [];
      let currentParagraph = '';

      for (let lIdx = 0; lIdx < lines.length; lIdx++) {
        const line = lines[lIdx];
        const prevLine = lines[lIdx - 1];

        const isHeading = line.fontSize >= medianFontSize * 1.35 && line.text.length < 120;
        const lineSpacing = prevLine ? Math.abs(prevLine.y - line.y) : 0;
        const isNewParagraph = !prevLine || lineSpacing > line.fontSize * 1.6 || isHeading;

        if (isHeading) {
          if (currentParagraph.trim()) {
            paragraphsHtml.push(`<p>${escapeHtml(currentParagraph.trim())}</p>`);
            currentParagraph = '';
          }
          paragraphsHtml.push(`<h2>${escapeHtml(line.text)}</h2>`);
        } else if (isNewParagraph && currentParagraph.trim()) {
          paragraphsHtml.push(`<p>${escapeHtml(currentParagraph.trim())}</p>`);
          currentParagraph = line.text;
        } else {
          if (currentParagraph.length > 0) {
            // Check if hyphenated word at line end
            if (currentParagraph.endsWith('-')) {
              currentParagraph = currentParagraph.slice(0, -1) + line.text;
            } else {
              currentParagraph += ' ' + line.text;
            }
          } else {
            currentParagraph = line.text;
          }
        }
      }

      if (currentParagraph.trim()) {
        paragraphsHtml.push(`<p>${escapeHtml(currentParagraph.trim())}</p>`);
      }

      pageHtml = paragraphsHtml.join('\n');
    } else {
      // Illustrated page / Cover page with no text: render canvas snapshot
      try {
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Render page to canvas
          await (page as any).render({ canvasContext: ctx, viewport }).promise;
          const rawDataUrl = canvas.toDataURL('image/jpeg', 0.72);
          const compressed = await compressBase64Image(rawDataUrl, 1080, 0.70);

          if (i === 1 && !firstPageCover) {
            firstPageCover = compressed;
          }

          pageHtml = `<div class="story-pdf-canvas-page my-4 flex justify-center"><img src="${compressed}" alt="Página ${i}" class="max-w-full rounded-xl shadow-md" style="max-height: 85vh;" /></div>`;
        }
      } catch (renderErr) {
        console.warn(`Failed to render canvas for PDF page ${i}:`, renderErr);
        pageHtml = `<p><em>[Página ${i}]</em></p>`;
      }
    }

    if (!pageHtml.trim()) {
      pageHtml = `<p></p>`;
    }

    rawPages.push(pageHtml);
  }

  // Ensure every page adheres strictly to the safe 500KB boundary
  const finalPages: string[] = [];
  for (const p of rawPages) {
    const splitPages = splitLargeHtmlContent(p, 500000);
    finalPages.push(...splitPages);
  }

  // Calculate total word count
  const allText = finalPages.map((p) => p.replace(/<[^>]*>?/gm, ' ')).join(' ');
  const wordCount = allText.split(/\s+/).filter((w) => w.length > 0).length;

  return {
    title: extractedTitle,
    author: extractedAuthor,
    pages: finalPages.length > 0 ? finalPages : ['<p></p>'],
    totalPages: finalPages.length || 1,
    wordCount,
    coverImage: firstPageCover,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
