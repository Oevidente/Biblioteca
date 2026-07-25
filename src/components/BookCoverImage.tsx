import { useState } from "react";
import { formatCoverUrl } from "../utils/imageUtils";
import { BookOpen } from "lucide-react";

interface BookCoverImageProps {
  src?: string;
  alt: string;
  className?: string;
  title?: string;
}

export function BookCoverImage({ src, alt, className = "", title }: BookCoverImageProps) {
  const [hasError, setHasError] = useState(false);
  const formattedUrl = formatCoverUrl(src);

  if (!formattedUrl || hasError) {
    return (
      <div 
        className={`bg-gradient-to-br from-[#2A2A20] to-[#1A1A1A] text-[#F5F5F0] flex flex-col items-center justify-center p-3 text-center relative overflow-hidden select-none ${className}`}
      >
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#F5F5F0_1px,transparent_1px)] [background-size:8px_8px]" />
        <BookOpen className="w-6 h-6 opacity-40 mb-1.5" />
        <span className="text-[10px] font-serif font-bold line-clamp-2 px-1 opacity-90 leading-tight">
          {title || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={formattedUrl}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
      loading="lazy"
    />
  );
}
