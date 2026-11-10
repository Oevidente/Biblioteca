import React, { useState, useMemo, useCallback } from 'react';
import { ImageLightboxModal } from './ImageLightboxModal';

interface StoryContentProps {
  html: string;
  readerMode: 'dark' | 'light';
  fontFamily: 'serif' | 'sans' | 'opendyslexic';
  lineSpacing: 'compact' | 'relaxed' | 'loose';
  enableLightbox?: boolean;
}

export function StoryContent({
  html,
  readerMode,
  fontFamily,
  lineSpacing,
  enableLightbox = true,
}: StoryContentProps) {
  const [lightboxState, setLightboxState] = useState<{
    isOpen: boolean;
    images: string[];
    initialIndex: number;
  }>({
    isOpen: false,
    images: [],
    initialIndex: 0,
  });

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

  // Otimização para celular: injeta loading="lazy" e decoding="async" em todas as <img>
  // para descarregar o uso de GPU/memória e garantir rolagem ultra fluida mesmo com várias imagens
  const optimizedHtml = useMemo(() => {
    if (!html || !html.includes('<img')) return html;
    return html.replace(/<img\b([^>]*?)>/gi, (match, attrs) => {
      let updated = attrs;
      if (!/\bloading\s*=/i.test(updated)) {
        updated += ' loading="lazy"';
      }
      if (!/\bdecoding\s*=/i.test(updated)) {
        updated += ' decoding="async"';
      }
      return `<img${updated}>`;
    });
  }, [html]);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!enableLightbox) return;
      const target = e.target;
      if (target instanceof HTMLImageElement && target.tagName === 'IMG') {
        const clickedSrc = target.currentSrc || target.src;
        if (!clickedSrc) return;

        // Check if image belongs to a gallery
        const gallery = target.closest('.story-image-gallery');
        if (gallery) {
          const galleryImgs = Array.from(gallery.querySelectorAll('img'))
            .map((img) => img.currentSrc || img.src)
            .filter((src) => Boolean(src && src.length > 0));

          const clickedIdx = galleryImgs.indexOf(clickedSrc);
          setLightboxState({
            isOpen: true,
            images: galleryImgs.length > 0 ? galleryImgs : [clickedSrc],
            initialIndex: clickedIdx >= 0 ? clickedIdx : 0,
          });
        } else {
          setLightboxState({
            isOpen: true,
            images: [clickedSrc],
            initialIndex: 0,
          });
        }
      }
    },
    [enableLightbox],
  );

  const closeLightbox = useCallback(() => {
    setLightboxState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return (
    <>
      <div
        onClick={handleContainerClick}
        className={`prose prose-lg prose-neutral mx-auto prose-p:mb-6 prose-p:text-base sm:prose-p:text-lg prose-headings:tracking-tight break-words story-content-optimized ${
          readerMode === 'dark'
            ? 'dark:prose-invert text-[#F5F5F0]'
            : 'text-[#1A1A1A]'
        } ${fontClass} ${lineSpacingClass}`}
        dangerouslySetInnerHTML={{ __html: optimizedHtml }}
      />
      {enableLightbox && (
        <ImageLightboxModal
          isOpen={lightboxState.isOpen}
          onClose={closeLightbox}
          images={lightboxState.images}
          initialIndex={lightboxState.initialIndex}
        />
      )}
    </>
  );
}

