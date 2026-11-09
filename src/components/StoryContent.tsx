interface StoryContentProps {
  html: string;
  readerMode: 'dark' | 'light';
  fontFamily: 'serif' | 'sans' | 'opendyslexic';
  lineSpacing: 'compact' | 'relaxed' | 'loose';
}

export function StoryContent({
  html,
  readerMode,
  fontFamily,
  lineSpacing,
}: StoryContentProps) {
  const fontClass =
    fontFamily === 'opendyslexic'
      ? 'font-opendyslexic'
      : fontFamily === 'sans'
        ? 'font-sans'
        : 'font-serif';
  const lineSpacingClass =
    lineSpacing === 'compact'
      ? 'prose-p:leading-[1.4]'
      : lineSpacing === 'loose'
        ? 'prose-p:leading-[2.2]'
        : 'prose-p:leading-[1.8]';

  return (
    <div
      className={`prose prose-lg prose-neutral mx-auto prose-p:mb-6 prose-p:text-base sm:prose-p:text-lg prose-headings:tracking-tight break-words ${
        readerMode === 'dark'
          ? 'dark:prose-invert text-[#F5F5F0]'
          : 'text-[#1A1A1A]'
      } ${fontClass} ${lineSpacingClass}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
