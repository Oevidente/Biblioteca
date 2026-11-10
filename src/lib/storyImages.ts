/**
 * Utilitários para imagens dentro do texto das histórias.
 *
 * As imagens são comprimidas no navegador e salvas como data URL (base64) dentro
 * do HTML da página, igual às capas. Cada página é um documento do Firestore, que
 * tem limite de 1 MiB, então aqui também ficam as funções que mantêm cada página
 * abaixo desse limite.
 */

export const MAX_IMAGE_WIDTH = 1000;
export const MAX_IMAGE_HEIGHT = 1600;
/** Tamanho alvo de cada imagem já em base64 (~180 KB). */
export const MAX_IMAGE_BYTES = 180000;
/** Tamanho máximo de uma página ao dividir (mesmo limite do docxParser). */
export const MAX_PAGE_BYTES = 700000;
/** Acima disso o Firestore recusa o documento (limite real é 1.048.576 bytes). */
export const FIRESTORE_SAFE_LIMIT_BYTES = 950000;

export function getByteSize(str: string): number {
  return new TextEncoder().encode(str).length;
}

function loadImage(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler a imagem'));
    };
    img.src = url;
  });
}

interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  maxBytes?: number;
}

/**
 * Redimensiona e comprime uma imagem (arquivo ou blob) para JPEG em data URL,
 * baixando qualidade/tamanho até caber em maxBytes.
 */
export async function compressImageToDataUrl(
  source: Blob,
  options: CompressOptions = {},
): Promise<string> {
  const maxWidth = options.maxWidth ?? MAX_IMAGE_WIDTH;
  const maxHeight = options.maxHeight ?? MAX_IMAGE_HEIGHT;
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;

  const img = await loadImage(source);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) throw new Error('Imagem inválida');

  let scale = Math.min(1, maxWidth / srcW, maxHeight / srcH);
  let quality = 0.85;
  let result = '';

  for (let attempt = 0; attempt < 10; attempt++) {
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponível');
    // Fundo branco: JPEG não tem transparência
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    result = canvas.toDataURL('image/jpeg', quality);
    if (getByteSize(result) <= maxBytes) return result;
    if (quality > 0.55) quality -= 0.1;
    else scale *= 0.8;
  }
  return result;
}

/**
 * HTML de uma imagem. Vai SEM <p> em volta de propósito: o execCommand('insertHTML')
 * funde o primeiro bloco inserido com o parágrafo onde o cursor está, o que
 * centralizava o texto do parágrafo junto. Com display:block + margin auto a
 * imagem aparece sozinha na linha, centralizada, e o cursor continua depois dela.
 */
export function buildImageHtml(src: string): string {
  return `<img src="${src}" alt="" loading="lazy" decoding="async" style="display:block;max-width:100%;height:auto;margin:1rem auto;border-radius:0.5rem" />`;
}

export function buildImageGalleryHtml(sources: string[]): string {
  const images = sources
    .map(
      (src) =>
        `<img src="${src}" alt="" loading="lazy" decoding="async" />`,
    )
    .join('');
  return `<div class="story-image-gallery">${images}</div><p><br></p>`;
}

/**
 * Varre as <img> do editor e troca as que não vão sobreviver ao salvamento
 * (blob:, data: gigante, link remoto acessível) por versões comprimidas em base64.
 * Retorna true se mudou alguma coisa.
 */
export async function normalizeEditorImages(root: HTMLElement): Promise<boolean> {
  const imgs = Array.from(root.querySelectorAll('img'));
  let changed = false;

  for (const img of imgs) {
    if (!img.getAttribute('loading')) {
      img.setAttribute('loading', 'lazy');
    }
    if (!img.getAttribute('decoding')) {
      img.setAttribute('decoding', 'async');
    }

    const src = img.getAttribute('src') || '';
    const isData = src.startsWith('data:');
    const isBlob = src.startsWith('blob:');
    const isRemote = /^https?:/i.test(src);

    if (isData && getByteSize(src) <= MAX_IMAGE_BYTES * 1.25) continue;

    if (!isData && !isBlob && !isRemote) {
      // file://, caminhos locais etc. não existem pra ninguém depois de salvar
      img.remove();
      changed = true;
      continue;
    }

    try {
      const response = await fetch(src);
      const blob = await response.blob();
      img.setAttribute('src', await compressImageToDataUrl(blob));
      img.removeAttribute('srcset');
      changed = true;
    } catch {
      // blob: que falhou não existe mais depois de recarregar, então remove.
      // Link remoto bloqueado por CORS (ou data: ilegível) fica como está.
      if (isBlob) {
        img.remove();
        changed = true;
      }
    }
  }

  return changed;
}

function nodeToHtml(node: Node): string {
  if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).outerHTML;
  const holder = document.createElement('div');
  holder.appendChild(node.cloneNode(true));
  return holder.innerHTML;
}

/**
 * Quebra um bloco grande (ex.: um <p> com várias imagens coladas em sequência)
 * em vários blocos da mesma tag, agrupando os filhos até maxBytes.
 * Se o bloco não tem como ser dividido, devolve ele inteiro.
 */
function splitBlock(node: Node, maxBytes: number): string[] {
  const html = nodeToHtml(node);
  if (getByteSize(html) <= maxBytes) return [html];
  if (node.nodeType !== Node.ELEMENT_NODE || node.childNodes.length < 2) return [html];

  const el = node as Element;
  const parts: string[] = [];
  let wrapper = el.cloneNode(false) as Element;
  let bytes = 0;

  for (const child of Array.from(el.childNodes)) {
    const childHtml = nodeToHtml(child);
    const childBytes = getByteSize(childHtml);
    if (wrapper.childNodes.length > 0 && bytes + childBytes > maxBytes) {
      parts.push(wrapper.outerHTML);
      wrapper = el.cloneNode(false) as Element;
      bytes = 0;
    }
    wrapper.appendChild(child.cloneNode(true));
    bytes += childBytes;
  }
  if (wrapper.childNodes.length > 0) parts.push(wrapper.outerHTML);
  return parts.length > 0 ? parts : [html];
}

/**
 * Divide qualquer página que passe de maxBytes em várias, cortando entre os
 * blocos de nível superior (parágrafos etc.). Um bloco que sozinho passa do
 * limite é quebrado por dentro (splitBlock).
 */
export function splitOversizedPages(
  pages: string[],
  maxBytes: number = MAX_PAGE_BYTES,
): string[] {
  const result: string[] = [];

  for (const page of pages) {
    // Atalho: UTF-8 usa no máximo 3 bytes por caractere
    if (page.length * 3 <= maxBytes || getByteSize(page) <= maxBytes) {
      result.push(page);
      continue;
    }

    const temp = document.createElement('div');
    temp.innerHTML = page;

    let chunk = '';
    let chunkBytes = 0;

    for (const node of Array.from(temp.childNodes)) {
      for (const html of splitBlock(node, maxBytes)) {
        const bytes = getByteSize(html);
        if (chunk && chunkBytes + bytes > maxBytes) {
          result.push(chunk);
          chunk = '';
          chunkBytes = 0;
        }
        chunk += html;
        chunkBytes += bytes;
      }
    }
    if (chunk) result.push(chunk);
  }

  return result.length > 0 ? result : ['<p></p>'];
}

/** Índice da primeira página que o Firestore recusaria, ou -1 se todas couberem. */
export function findOversizedPageIndex(pages: string[]): number {
  return pages.findIndex((p) => getByteSize(p) > FIRESTORE_SAFE_LIMIT_BYTES);
}
