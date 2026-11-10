/**
 * Utility for in-browser client-side image compression and safe page splitting.
 * Keeps document sizes comfortably below the Firestore 1MB (1,048,576 bytes) limit.
 * Runs 100% locally with HTML5 Canvas (zero API costs, no external dependencies, no AI).
 */

export function getByteSize(str: string): number {
  if (!str) return 0;
  return new TextEncoder().encode(str).length;
}

/**
 * Compresses an image Data URL (e.g. data:image/png;base64,...)
 * Redimensions to maxDimension (default 1080px) and compresses to JPEG 0.72.
 * Typically reduces a 2MB-8MB base64 image down to ~60KB-160KB.
 */
export async function compressBase64Image(
  dataUrl: string,
  maxDimension = 1080,
  quality = 0.72
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:image')) {
    return dataUrl;
  }

  // If already under 70KB, no need to compress further unless it's a huge PNG
  const originalSize = getByteSize(dataUrl);
  if (originalSize < 70000 && dataUrl.startsWith('data:image/jpeg')) {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width <= 0 || height <= 0) {
          resolve(dataUrl);
          return;
        }

        // Scale down if either dimension exceeds maxDimension
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        // Fill white background for transparent PNG conversion to JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        const compressedSize = getByteSize(compressedDataUrl);

        // Use compressed if it's smaller, otherwise fallback to original
        if (compressedSize < originalSize || originalSize > 700000) {
          resolve(compressedDataUrl);
        } else {
          resolve(dataUrl);
        }
      } catch (err) {
        console.warn('Image compression warning, retaining original:', err);
        resolve(dataUrl);
      }
    };

    img.onerror = () => {
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}

/**
 * Replaces all large embedded base64 <img> tags in an HTML string with compressed versions.
 */
export async function optimizeHtmlImages(html: string): Promise<string> {
  if (!html || !html.includes('data:image/')) {
    return html;
  }

  // Find all img tags with data:image sources
  const imgRegex = /<img\b([^>]*?)src=["'](data:image\/[^"']+)["']([^>]*?)>/gi;
  const matches: { fullTag: string; prefix: string; src: string; suffix: string }[] = [];

  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(html)) !== null) {
    matches.push({
      fullTag: match[0],
      prefix: match[1],
      src: match[2],
      suffix: match[3],
    });
  }

  if (matches.length === 0) {
    return html;
  }

  let optimizedHtml = html;
  for (const item of matches) {
    const originalSrc = item.src;
    // Only compress if the base64 src is large (> 60KB)
    if (getByteSize(originalSrc) > 60000) {
      const compressedSrc = await compressBase64Image(originalSrc, 1080, 0.72);
      optimizedHtml = optimizedHtml.replace(originalSrc, compressedSrc);
    }
  }

  return optimizedHtml;
}

/**
 * Splits HTML content if its total byte size exceeds maxBytes (default 500,000 bytes = ~500KB).
 * Firestore document limit is 1,048,576 bytes. 500KB provides a 100% safe safety margin.
 */
export function splitLargeHtmlContent(html: string, maxBytes = 500000): string[] {
  if (!html) return ['<p></p>'];

  if (getByteSize(html) <= maxBytes) {
    return [html];
  }

  const result: string[] = [];

  // Split on paragraph/heading/break tags
  const blocks = html.split(/(?<=<\/p>)|(?<=<\/div>)|(?<=<\/h[1-6]>)|(?<=<hr[^>]*>)/gi);
  let currentChunk = '';

  for (const block of blocks) {
    if (!block) continue;
    const blockSize = getByteSize(block);

    // If an individual block itself exceeds maxBytes (e.g. huge text without tags),
    // we must sub-partition the block content
    if (blockSize > maxBytes) {
      if (currentChunk.trim().length > 0) {
        result.push(currentChunk);
        currentChunk = '';
      }

      // Hard partition the oversized block
      const subChunks = hardSliceLargeBlock(block, maxBytes);
      for (let i = 0; i < subChunks.length - 1; i++) {
        result.push(subChunks[i]);
      }
      currentChunk = subChunks[subChunks.length - 1] || '';
      continue;
    }

    if (getByteSize(currentChunk + block) > maxBytes && currentChunk.trim().length > 0) {
      result.push(currentChunk);
      currentChunk = block;
    } else {
      currentChunk += block;
    }
  }

  if (currentChunk.trim().length > 0) {
    result.push(currentChunk);
  }

  return result.length > 0 ? result : [html];
}

/**
 * Hard-splits an oversized single block (e.g. raw text without paragraph tags)
 * safely wrapping text parts in <p> tags so HTML remains valid.
 */
function hardSliceLargeBlock(content: string, maxBytes: number): string[] {
  const parts: string[] = [];
  let remaining = content;

  // Estimate safe character length (each UTF-8 char is 1-4 bytes, average ~1.5)
  const safeCharChunk = Math.floor(maxBytes / 2);

  while (remaining.length > 0) {
    if (getByteSize(remaining) <= maxBytes) {
      parts.push(remaining);
      break;
    }

    let sliceIndex = safeCharChunk;
    // Try to break on whitespace or punctuation if possible
    const spaceIndex = remaining.lastIndexOf(' ', safeCharChunk);
    if (spaceIndex > safeCharChunk * 0.7) {
      sliceIndex = spaceIndex;
    }

    const chunk = remaining.slice(0, sliceIndex);
    remaining = remaining.slice(sliceIndex).trim();

    // Ensure valid HTML wrap
    if (!chunk.startsWith('<') && !chunk.endsWith('>')) {
      parts.push(`<p>${chunk}</p>`);
    } else {
      parts.push(chunk);
    }
  }

  return parts;
}
