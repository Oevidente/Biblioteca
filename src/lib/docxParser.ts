import mammoth from "mammoth";

function getByteSize(str: string): number {
  return new TextEncoder().encode(str).length;
}

function splitLargePage(html: string, maxBytes = 700000): string[] {
  if (getByteSize(html) <= maxBytes) {
    return [html];
  }

  const result: string[] = [];
  const paragraphs = html.split(/(?<=<\/p>)/gi);
  let currentChunk = "";

  for (const p of paragraphs) {
    if (!p) continue;
    if (getByteSize(currentChunk + p) > maxBytes && currentChunk.length > 0) {
      result.push(currentChunk);
      currentChunk = p;
    } else {
      currentChunk += p;
    }
  }

  if (currentChunk) {
    result.push(currentChunk);
  }

  return result.length > 0 ? result : [html];
}

export async function parseDocx(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;

        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            styleMap: [
              "p[style-name='Page Break'] => hr.page-break:empty"
            ],
            ignoreEmptyParagraphs: false
          }
        );

        let rawHtml = result.value || "";

        // 1. Split into raw pages first
        let rawPages = rawHtml.split('<hr class="page-break" />');

        if (rawPages.length === 1) {
          // Fallback pagination by character length
          rawPages = [];
          const paragraphs = rawHtml.split('</p>');
          let currentPage = "";
          for (const p of paragraphs) {
            if (p.trim() === "") continue;
            currentPage += p + "</p>";
            if (currentPage.length > 2500) {
              rawPages.push(currentPage);
              currentPage = "";
            }
          }
          if (currentPage) rawPages.push(currentPage);
        }

        if (rawPages.length === 0) {
          rawPages = [rawHtml];
        }

        // 2. Enforce size limits on each page
        const finalPages: string[] = [];

        for (const pageHtml of rawPages) {
          const safelySizedPages = splitLargePage(pageHtml, 700000);
          finalPages.push(...safelySizedPages);
        }

        resolve(finalPages);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

