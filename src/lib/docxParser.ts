import mammoth from "mammoth";
import { compressBase64Image, splitLargeHtmlContent } from "./imageOptimizer";

export interface ParsedDocxResult {
  pages: string[];
  totalPages: number;
  wordCount: number;
}

export async function parseDocx(file: File): Promise<string[]> {
  const result = await parseDocxDetailed(file);
  return result.pages;
}

export async function parseDocxDetailed(file: File): Promise<ParsedDocxResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;

        const imageConverter = async (image: any) => {
          try {
            const base64Data = await image.read("base64");
            const mimeType = image.contentType || "image/png";
            const rawDataUrl = `data:${mimeType};base64,${base64Data}`;
            // Compress and downscale embedded images automatically to prevent Firestore 1MB limits
            const compressed = await compressBase64Image(rawDataUrl, 1080, 0.72);
            return { src: compressed };
          } catch (err) {
            console.error("Error converting image in parseDocx:", err);
            return { src: "" };
          }
        };

        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            convertImage: mammoth.images.imgElement(imageConverter),
            styleMap: [
              "p[style-name='Page Break'] => hr.page-break:empty",
              "p[style-name='Heading 1'] => h1:fresh",
              "p[style-name='Heading 2'] => h2:fresh",
              "p[style-name='Heading 3'] => h3:fresh"
            ],
            ignoreEmptyParagraphs: false
          }
        );

        let rawHtml = result.value || "";

        // 1. Split into raw pages first by page breaks
        let rawPages = rawHtml
          .split(/<hr class="page-break" \/>|<hr \/>|<hr>|<!-- pagebreak -->/i)
          .map(p => p.trim())
          .filter(p => p.length > 0);

        if (rawPages.length <= 1) {
          // Fallback pagination by logical word blocks if no explicit page breaks exist
          const singleHtml = rawPages[0] || rawHtml;
          const paragraphs = singleHtml.split(/(?<=<\/p>)/gi);
          
          if (paragraphs.length > 1) {
            rawPages = [];
            let currentPage = "";
            let currentWords = 0;

            for (const p of paragraphs) {
              if (p.trim() === "") continue;
              const textContent = p.replace(/<[^>]*>?/gm, '');
              const words = textContent.trim().split(/\s+/).filter(w => w.length > 0).length;

              if (currentWords > 0 && currentWords + words > 400) {
                rawPages.push(currentPage);
                currentPage = p;
                currentWords = words;
              } else {
                currentPage += p;
                currentWords += words;
              }
            }
            if (currentPage) rawPages.push(currentPage);
          }
        }

        if (rawPages.length === 0) {
          rawPages = [rawHtml || "<p></p>"];
        }

        // 2. Enforce strict 500KB maximum size limits on each page
        const finalPages: string[] = [];

        for (const pageHtml of rawPages) {
          const safelySizedPages = splitLargeHtmlContent(pageHtml, 500000);
          finalPages.push(...safelySizedPages);
        }

        const safeResult = finalPages.length > 0 ? finalPages : ["<p></p>"];
        const fullText = safeResult.map(p => p.replace(/<[^>]*>?/gm, ' ')).join(' ');
        const wordCount = fullText.split(/\s+/).filter(w => w.length > 0).length;

        resolve({
          pages: safeResult,
          totalPages: safeResult.length,
          wordCount
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}
