export function paginateHtmlByWords(html: string, maxWords: number): string[] {
  if (maxWords <= 0) return [html || '<p></p>'];

  const container = document.createElement('div');
  container.innerHTML = html;
  const children = Array.from(container.children);
  if (children.length === 0) return [html || '<p></p>'];

  const pages: string[] = [];
  let currentHtml = '';
  let currentWords = 0;

  const splitOversizedBlock = (
    block: Element,
  ): Array<{ html: string; wordCount: number }> => {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const wordEnds: Array<{ node: Text; offset: number }> = [];
    let textNode = walker.nextNode() as Text | null;

    while (textNode) {
      const wordPattern = /\S+/g;
      let match: RegExpExecArray | null;
      while ((match = wordPattern.exec(textNode.textContent || ''))) {
        wordEnds.push({ node: textNode, offset: match.index + match[0].length });
      }
      textNode = walker.nextNode() as Text | null;
    }

    if (wordEnds.length <= maxWords) {
      return [{ html: block.outerHTML, wordCount: wordEnds.length }];
    }

    const chunks: Array<{ html: string; wordCount: number }> = [];
    const fullRange = document.createRange();
    fullRange.selectNodeContents(block);
    let startNode = wordEnds[0].node;
    let startOffset = 0;

    for (let startIndex = 0; startIndex < wordEnds.length; startIndex += maxWords) {
      const endIndex = Math.min(startIndex + maxWords - 1, wordEnds.length - 1);
      const end = wordEnds[endIndex];
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      if (endIndex === wordEnds.length - 1) {
        range.setEnd(fullRange.endContainer, fullRange.endOffset);
      } else {
        range.setEnd(end.node, end.offset);
      }

      const chunk = block.cloneNode(false) as Element;
      chunk.appendChild(range.cloneContents());
      chunks.push({
        html: chunk.outerHTML,
        wordCount: endIndex - startIndex + 1,
      });
      startNode = end.node;
      startOffset = end.offset;
    }

    return chunks;
  };

  children.forEach((child) => {
    splitOversizedBlock(child).forEach(({ html: blockHtml, wordCount }) => {
      if (currentWords > 0 && currentWords + wordCount > maxWords) {
        pages.push(currentHtml);
        currentHtml = blockHtml;
        currentWords = wordCount;
      } else {
        currentHtml += blockHtml;
        currentWords += wordCount;
      }
    });
  });

  if (currentHtml.trim()) pages.push(currentHtml);
  return pages.length > 0 ? pages : [html || '<p></p>'];
}