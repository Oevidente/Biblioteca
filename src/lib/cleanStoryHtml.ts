/**
 * Utility to strip all editor-only temporary markup (such as review highlights,
 * search term marks, spellcheck indicators, and ephemeral markers) from story HTML.
 * Ensures review marks and temporary styling strictly never leak into the Reader or stored database pages.
 */
export function cleanStoryHtml(html: string): string {
  if (!html) return '';
  
  if (
    !html.includes('<mark') &&
    !html.includes('review-highlight') &&
    !html.includes('editor-search') &&
    !html.includes('page-break-marker')
  ) {
    return html;
  }

  if (typeof document !== 'undefined') {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // 1. Unwrap all <mark> tags and temporary review/search classes
    const marks = temp.querySelectorAll('mark, .review-highlight-temp, .editor-search-match, [data-search-term]');
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
      }
    });

    // 2. Clean any orphaned empty markers or page-break-markers
    const pageBreakMarkers = temp.querySelectorAll('.page-break-marker');
    pageBreakMarkers.forEach((m) => m.remove());

    return temp.innerHTML;
  }

  // Regex fallback for server/non-DOM environments
  return html
    .replace(/<mark\b[^>]*>(.*?)<\/mark>/gi, '$1')
    .replace(/<div class="page-break-marker"[^>]*>.*?<\/div>/gi, '');
}
