import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface ImageLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: string[];
  initialIndex?: number;
}

export function ImageLightboxModal({
  isOpen,
  onClose,
  images,
  initialIndex = 0,
}: ImageLightboxModalProps) {
  const { t } = useLanguage();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // Sync index when initialIndex changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.max(0, Math.min(initialIndex, images.length - 1)));
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [isOpen, initialIndex, images.length]);

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  const handlePrev = useCallback(() => {
    if (images.length <= 1) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [images.length]);

  const handleNext = useCallback(() => {
    if (images.length <= 1) return;
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [images.length]);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(3, Number((prev + 0.5).toFixed(1))));
  };

  const handleZoomOut = () => {
    setZoom((prev) => {
      const next = Math.max(1, Number((prev - 0.5).toFixed(1)));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (zoom > 1) {
      handleResetZoom();
    } else {
      setZoom(2);
      setPan({ x: 0, y: 0 });
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        if (zoom === 1) {
          e.preventDefault();
          handlePrev();
        }
      } else if (e.key === 'ArrowRight') {
        if (zoom === 1) {
          e.preventDefault();
          handleNext();
        }
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        handleResetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, zoom, handlePrev, handleNext, onClose]);

  // Mouse pan handling when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStartRef.current || zoom <= 1) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.startPanX + dx,
      y: dragStartRef.current.startPanY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Touch swipe handling
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
      if (zoom > 1) {
        dragStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          startPanX: pan.x,
          startPanY: pan.y,
        };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (zoom > 1 && dragStartRef.current && e.touches.length === 1) {
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      setPan({
        x: dragStartRef.current.startPanX + dx,
        y: dragStartRef.current.startPanY + dy,
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (zoom === 1 && touchStartRef.current && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      const dt = Date.now() - touchStartRef.current.time;

      // Quick horizontal swipe detection
      if (Math.abs(dx) > 40 && Math.abs(dy) < 60 && dt < 400) {
        if (dx < 0) {
          handleNext();
        } else {
          handlePrev();
        }
      }
    }
    touchStartRef.current = null;
    dragStartRef.current = null;
  };

  if (typeof document === 'undefined') return null;

  const currentImage = images[currentIndex];
  const hasMultiple = images.length > 1;

  return createPortal(
    <AnimatePresence>
      {isOpen && currentImage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/92 backdrop-blur-md select-none touch-none"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={t('closeImage')}
        >
          {/* Top Bar with Counter, Zoom Tools & Close Button */}
          <div
            className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-3 sm:p-5 bg-gradient-to-b from-black/80 via-black/40 to-transparent"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Gallery Counter */}
            <div className="flex items-center gap-2">
              {hasMultiple && (
                <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs sm:text-sm font-medium tracking-wide text-white/90 shadow-sm border border-white/10">
                  {t('imageCounter', {
                    current: currentIndex + 1,
                    total: images.length,
                  })}
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Zoom Out */}
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 1}
                title={t('zoomOut')}
                aria-label={t('zoomOut')}
                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 disabled:opacity-30 disabled:pointer-events-none transition-all border border-white/10"
              >
                <ZoomOut className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </button>

              {/* Reset Zoom */}
              <button
                type="button"
                onClick={handleResetZoom}
                disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
                title={t('resetZoom')}
                aria-label={t('resetZoom')}
                className="px-2.5 h-9 sm:h-10 flex items-center justify-center gap-1 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 text-xs font-medium disabled:opacity-30 disabled:pointer-events-none transition-all border border-white/10"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{Math.round(zoom * 100)}%</span>
              </button>

              {/* Zoom In */}
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 3}
                title={t('zoomIn')}
                aria-label={t('zoomIn')}
                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 disabled:opacity-30 disabled:pointer-events-none transition-all border border-white/10"
              >
                <ZoomIn className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </button>

              <div className="w-px h-5 bg-white/15 mx-1" />

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                title={t('closeImage')}
                aria-label={t('closeImage')}
                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-red-500/80 active:scale-95 text-white transition-all shadow-md border border-white/20 ml-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Previous Gallery Button */}
          {hasMultiple && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              title={t('prevImage')}
              aria-label={t('prevImage')}
              className="absolute left-3 sm:left-6 z-20 w-11 h-11 sm:w-13 sm:h-13 flex items-center justify-center rounded-full bg-black/40 hover:bg-white/20 active:scale-95 text-white/90 hover:text-white transition-all backdrop-blur-md border border-white/15 shadow-xl"
            >
              <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>
          )}

          {/* Main Image Container */}
          <div
            className="relative w-full h-full flex items-center justify-center p-4 sm:p-10 overflow-hidden"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <motion.img
              key={currentImage}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{
                scale: zoom,
                x: pan.x,
                y: pan.y,
                opacity: 1,
              }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              src={currentImage}
              alt="Story illustration full view"
              onDoubleClick={handleDoubleClick}
              onClick={(e) => e.stopPropagation()}
              draggable={false}
              className={`max-w-full max-h-[85vh] sm:max-h-[88vh] object-contain rounded-lg shadow-2xl transition-shadow ${
                zoom > 1
                  ? isDragging
                    ? 'cursor-grabbing'
                    : 'cursor-grab'
                  : 'cursor-zoom-in'
              }`}
            />
          </div>

          {/* Next Gallery Button */}
          {hasMultiple && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              title={t('nextImage')}
              aria-label={t('nextImage')}
              className="absolute right-3 sm:right-6 z-20 w-11 h-11 sm:w-13 sm:h-13 flex items-center justify-center rounded-full bg-black/40 hover:bg-white/20 active:scale-95 text-white/90 hover:text-white transition-all backdrop-blur-md border border-white/15 shadow-xl"
            >
              <ChevronRight className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>
          )}

          {/* Bottom helper pill */}
          <div
            className="absolute bottom-4 inset-x-0 z-20 flex justify-center pointer-events-none"
          >
            <div className="px-3.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-[11px] sm:text-xs text-white/70 border border-white/10 tracking-wide">
              {hasMultiple
                ? 'Duplo clique para zoom · Setas ou arrastar para navegar'
                : 'Duplo clique para zoom · Esc ou clique fora para fechar'}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
