import { useEffect, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { getCachedTranslation, translateTextBlock } from "../lib/storyTranslator";

interface TranslatedTextProps {
  text: string;
  className?: string;
}

export function TranslatedText({ text, className }: TranslatedTextProps) {
  const { language } = useLanguage();
  const [displayedText, setDisplayedText] = useState<string>(() => {
    if (!text) return "";
    if (language === "pt") return text;
    const cached = getCachedTranslation(text, language as 'es' | 'en' | 'id');
    return cached || text; // default to original text if not cached
  });
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => {
    if (!text) {
      setDisplayedText("");
      return;
    }

    if (language === "pt") {
      setDisplayedText(text);
      setIsTranslating(false);
      return;
    }

    const cached = getCachedTranslation(text, language as 'es' | 'en' | 'id');
    if (cached) {
      setDisplayedText(cached);
      setIsTranslating(false);
      return;
    }

    // Not cached, translate asynchronously
    let isCancelled = false;
    setIsTranslating(true);

    async function performTranslation() {
      try {
        const result = await translateTextBlock(text, language as 'es' | 'en' | 'id');
        if (!isCancelled) {
          setDisplayedText(result);
          setIsTranslating(false);
        }
      } catch (err) {
        console.warn("Error translating title/text:", err);
        if (!isCancelled) {
          setDisplayedText(text);
          setIsTranslating(false);
        }
      }
    }

    performTranslation();

    return () => {
      isCancelled = true;
    };
  }, [text, language]);

  return (
    <span 
      className={`${className || ""} transition-opacity duration-300 ${isTranslating ? "opacity-70" : "opacity-100"}`}
    >
      {displayedText}
    </span>
  );
}
