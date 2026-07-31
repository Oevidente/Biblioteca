interface MetaTagOptions {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
}

const DEFAULT_TITLE = 'INKORA - Biblioteca Digital';
const DEFAULT_DESCRIPTION = 'Leia, crie e compartilhe histórias incríveis no INKORA.';
const DEFAULT_IMAGE = 'https://oevidente.github.io/Biblioteca/favicon.png';

export function updateMetaTags(options: MetaTagOptions) {
  const title = options.title ? `${options.title} | INKORA` : DEFAULT_TITLE;
  const description = options.description || DEFAULT_DESCRIPTION;
  const image = options.image || DEFAULT_IMAGE;
  const url = options.url || window.location.href;

  // Document Title
  document.title = title;

  // Helper to set or create meta tag
  const setMeta = (selector: string, attrName: string, attrVal: string, content: string) => {
    let element = document.querySelector(selector);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attrName, attrVal);
      document.head.appendChild(element);
    }
    element.setAttribute('content', content);
  };

  // Primary
  setMeta('meta[name="title"]', 'name', 'title', title);
  setMeta('meta[name="description"]', 'name', 'description', description);

  // Open Graph
  setMeta('meta[property="og:title"]', 'property', 'og:title', title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', description);
  setMeta('meta[property="og:image"]', 'property', 'og:image', image);
  setMeta('meta[property="og:url"]', 'property', 'og:url', url);

  // Twitter
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
  setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);
  setMeta('meta[name="twitter:url"]', 'name', 'twitter:url', url);
}
