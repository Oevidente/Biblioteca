import React, { useState, useEffect, useRef } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify, 
  List, 
  ListOrdered, 
  Quote, 
  Split, 
  Heading1, 
  Heading2, 
  Pilcrow, 
  BookOpen, 
  Layers, 
  Sparkles,
  Settings2
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StoryEditorProps {
  initialPages?: string[];
  onChange: (pages: string[], fullText: string, wordCount: number) => void;
  className?: string;
}

export function StoryEditor({ initialPages = [], onChange, className }: StoryEditorProps) {
  const { t, language } = useLanguage();
  const editorRef = useRef<HTMLDivElement>(null);
  
  // Combine initial pages into editor content
  const [editorHtml, setEditorHtml] = useState<string>(() => {
    if (initialPages && initialPages.length > 0) {
      return initialPages
        .map((p, idx) => {
          if (idx === 0) return p;
          return `<div class="page-break-marker" contenteditable="false" style="margin: 2rem 0; padding: 0.75rem 1rem; background: rgba(0,0,0,0.03); border: 1px dashed rgba(0,0,0,0.2); border-radius: 0.75rem; text-align: center; font-size: 0.75rem; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; color: #888; user-select: none;">--- Quebra de Página (Pág. ${idx + 1}) ---</div>` + p;
        })
        .join("");
    }
    return "";
  });

  const [autoPagination, setAutoPagination] = useState<boolean>(true);
  const [wordsPerPage, setWordsPerPage] = useState<number>(300);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [previewPageIdx, setPreviewPageIdx] = useState<number>(0);
  const [showAllToolsMobile, setShowAllToolsMobile] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<"style" | "format" | "align" | "insert">("format");

  // Derived state
  const [computedPages, setComputedPages] = useState<string[]>([]);
  const [totalWords, setTotalWords] = useState<number>(0);

  const executeCommand = (command: string, value: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    handleContentChange();
  };

  const handleFormatBlock = (tag: string) => {
    executeCommand("formatBlock", `<${tag}>`);
  };

  const insertPageBreak = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const marker = `<div class="page-break-marker" contenteditable="false" style="margin: 2rem 0; padding: 0.75rem 1rem; background: rgba(0,0,0,0.03); border: 1px dashed rgba(0,0,0,0.2); border-radius: 0.75rem; text-align: center; font-size: 0.75rem; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; color: #888; user-select: none;">--- Quebra de Página ---</div><p><br/></p>`;
    document.execCommand("insertHTML", false, marker);
    handleContentChange();
  };

  // Helper function to split HTML into pages
  const processHtmlIntoPages = (html: string): { pages: string[]; wordCount: number; cleanText: string } => {
    // Check if manual page breaks exist
    const hasManualBreaks = html.includes('class="page-break-marker"') || html.includes('Quebra de Página');

    let cleanHtml = html;
    // Extract plain text for word count
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    
    // Remove break markers from clean text calculations
    const markers = tempDiv.querySelectorAll(".page-break-marker");
    markers.forEach(m => m.remove());

    const cleanText = tempDiv.textContent || tempDiv.innerText || "";
    const words = cleanText.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    if (hasManualBreaks) {
      // Split by marker
      const rawParts = html.split(/<div class="page-break-marker"[^>]*>.*?<\/div>/gi);
      const pages = rawParts
        .map(p => p.trim())
        .filter(p => p.length > 0 && p !== "<p><br></p>" && p !== "<p><br/></p>");
      
      return {
        pages: pages.length > 0 ? pages : [html],
        wordCount,
        cleanText
      };
    }

    if (autoPagination && wordsPerPage > 0) {
      // Split automatically by paragraphs / word budget
      const paragraphs = Array.from(tempDiv.children);
      if (paragraphs.length === 0) {
        // Fallback if plain text without HTML tags
        const rawContent = tempDiv.innerHTML || html;
        return { pages: [rawContent || "<p></p>"], wordCount, cleanText };
      }

      const pages: string[] = [];
      let currentChunkHtml = "";
      let currentChunkWords = 0;

      paragraphs.forEach((child) => {
        const text = child.textContent || "";
        const childWordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;

        if (currentChunkWords > 0 && currentChunkWords + childWordCount > wordsPerPage + 50) {
          pages.push(currentChunkHtml);
          currentChunkHtml = child.outerHTML;
          currentChunkWords = childWordCount;
        } else {
          currentChunkHtml += child.outerHTML;
          currentChunkWords += childWordCount;
        }
      });

      if (currentChunkHtml.trim().length > 0) {
        pages.push(currentChunkHtml);
      }

      return {
        pages: pages.length > 0 ? pages : [html],
        wordCount,
        cleanText
      };
    }

    return {
      pages: [html || "<p></p>"],
      wordCount,
      cleanText
    };
  };

  const handleContentChange = () => {
    if (!editorRef.current) return;
    const currentHtml = editorRef.current.innerHTML;
    setEditorHtml(currentHtml);

    const { pages, wordCount, cleanText } = processHtmlIntoPages(currentHtml);
    setComputedPages(pages);
    setTotalWords(wordCount);
    onChange(pages, cleanText, wordCount);
  };

  useEffect(() => {
    // Initial calculation
    if (editorHtml) {
      const { pages, wordCount, cleanText } = processHtmlIntoPages(editorHtml);
      setComputedPages(pages);
      setTotalWords(wordCount);
      onChange(pages, cleanText, wordCount);
    }
  }, [autoPagination, wordsPerPage]);

  return (
    <div className={cn("space-y-4 w-full overflow-hidden", className)}>
      {/* Top Toolbar Header */}
      <div className="bg-[#F5F5F0] dark:bg-[#0A0A0A] p-2.5 sm:p-3 rounded-2xl border border-[#1A1A1A]/10 dark:border-white/10 space-y-3 max-w-full overflow-hidden">
        {/* Format & Tools Bar - Desktop / Tablet Layout */}
        <div className="hidden sm:flex items-center justify-between gap-2 border-b border-[#1A1A1A]/10 dark:border-white/10 pb-3 overflow-x-auto max-w-full">
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Format selector */}
            <div className="flex items-center bg-white dark:bg-[#1A1A1A] rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => handleFormatBlock("h2")}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg text-xs font-bold flex items-center gap-1"
                title={t("formatTitle")}
              >
                <Heading1 className="w-4 h-4" />
                <span className="hidden sm:inline">{t("formatTitle")}</span>
              </button>
              <button
                type="button"
                onClick={() => handleFormatBlock("h3")}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg text-xs font-bold flex items-center gap-1"
                title={t("formatSubtitle")}
              >
                <Heading2 className="w-4 h-4" />
                <span className="hidden sm:inline">{t("formatSubtitle")}</span>
              </button>
              <button
                type="button"
                onClick={() => handleFormatBlock("p")}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg text-xs font-bold flex items-center gap-1"
                title={t("formatParagraph")}
              >
                <Pilcrow className="w-4 h-4" />
                <span className="hidden sm:inline">{t("formatParagraph")}</span>
              </button>
            </div>

            <div className="h-5 w-px bg-[#1A1A1A]/10 dark:bg-white/10 mx-1" />

            {/* Inline Styles */}
            <div className="flex items-center bg-white dark:bg-[#1A1A1A] rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 p-0.5">
              <button
                type="button"
                onClick={() => executeCommand("bold")}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t("bold")}
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand("italic")}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t("italic")}
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand("underline")}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t("underline")}
              >
                <Underline className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand("strikeThrough")}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t("strikethrough")}
              >
                <Strikethrough className="w-4 h-4" />
              </button>
            </div>

            <div className="h-5 w-px bg-[#1A1A1A]/10 dark:bg-white/10 mx-1 hidden sm:block" />

            {/* Alignments */}
            <div className="flex items-center bg-white dark:bg-[#1A1A1A] rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 p-0.5">
              <button
                type="button"
                onClick={() => executeCommand("justifyLeft")}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t("alignLeft")}
              >
                <AlignLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand("justifyCenter")}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t("alignCenter")}
              >
                <AlignCenter className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand("justifyRight")}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t("alignRight")}
              >
                <AlignRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand("justifyFull")}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t("alignJustify")}
              >
                <AlignJustify className="w-4 h-4" />
              </button>
            </div>

            <div className="h-5 w-px bg-[#1A1A1A]/10 dark:bg-white/10 mx-1 hidden md:block" />

            {/* Lists & Quotes */}
            <div className="flex items-center bg-white dark:bg-[#1A1A1A] rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 p-0.5">
              <button
                type="button"
                onClick={() => executeCommand("insertUnorderedList")}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t("bulletList")}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand("insertOrderedList")}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t("numberList")}
              >
                <ListOrdered className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleFormatBlock("blockquote")}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t("quote")}
              >
                <Quote className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Action Tools */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={insertPageBreak}
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl text-xs font-bold hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 transition-colors"
              title={t("insertPageBreak")}
            >
              <Split className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="hidden sm:inline">{t("insertPageBreak")}</span>
            </button>
          </div>
        </div>

        {/* Format & Tools Bar - Mobile Touch Layout (Categorized & Grouped Blocks) */}
        <div className="block sm:hidden space-y-3.5 border-b border-[#1A1A1A]/10 dark:border-white/10 pb-3">
          {/* Segmented Tab Selector for Mobile Tool Blocks */}
          <div className="grid grid-cols-4 gap-1 bg-[#1A1A1A]/5 dark:bg-white/5 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setMobileTab("style")}
              className={cn(
                "h-10 rounded-lg text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-0.5",
                mobileTab === "style"
                  ? "bg-white text-[#1A1A1A] dark:bg-[#1C1C1E] dark:text-[#F5F5F0] shadow-sm"
                  : "text-[#1A1A1A]/60 dark:text-[#F5F5F0]/60 hover:text-[#1A1A1A] dark:hover:text-[#F5F5F0]"
              )}
            >
              <Pilcrow className="w-3.5 h-3.5" />
              <span>{language === "pt" || language === "es" ? "Estilo" : language === "id" ? "Gaya" : "Style"}</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("format")}
              className={cn(
                "h-10 rounded-lg text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-0.5",
                mobileTab === "format"
                  ? "bg-white text-[#1A1A1A] dark:bg-[#1C1C1E] dark:text-[#F5F5F0] shadow-sm"
                  : "text-[#1A1A1A]/60 dark:text-[#F5F5F0]/60 hover:text-[#1A1A1A] dark:hover:text-[#F5F5F0]"
              )}
            >
              <Bold className="w-3.5 h-3.5" />
              <span>{language === "pt" || language === "es" ? "Formato" : language === "id" ? "Format" : "Format"}</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("align")}
              className={cn(
                "h-10 rounded-lg text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-0.5",
                mobileTab === "align"
                  ? "bg-white text-[#1A1A1A] dark:bg-[#1C1C1E] dark:text-[#F5F5F0] shadow-sm"
                  : "text-[#1A1A1A]/60 dark:text-[#F5F5F0]/60 hover:text-[#1A1A1A] dark:hover:text-[#F5F5F0]"
              )}
            >
              <AlignCenter className="w-3.5 h-3.5" />
              <span>{language === "pt" ? "Alinhar" : language === "es" ? "Alinear" : language === "id" ? "Rata" : "Align"}</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("insert")}
              className={cn(
                "h-10 rounded-lg text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-0.5",
                mobileTab === "insert"
                  ? "bg-white text-[#1A1A1A] dark:bg-[#1C1C1E] dark:text-[#F5F5F0] shadow-sm"
                  : "text-[#1A1A1A]/60 dark:text-[#F5F5F0]/60 hover:text-[#1A1A1A] dark:hover:text-[#F5F5F0]"
              )}
            >
              <Split className="w-3.5 h-3.5" />
              <span>{language === "pt" ? "Extras" : language === "es" ? "Extras" : language === "id" ? "Ekstra" : "Insert"}</span>
            </button>
          </div>

          {/* Active Tool Block Pane (Spacious, 44px touch targets, no horizontal scroll) */}
          <div className="bg-white dark:bg-[#121212] rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 p-2.5 shadow-sm">
            {/* Style Block */}
            {mobileTab === "style" && (
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleFormatBlock("h2")}
                  className="h-12 bg-[#F5F5F0]/60 dark:bg-[#1E1E1E] rounded-lg text-[11px] font-bold flex flex-col items-center justify-center gap-1 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 text-[#1A1A1A] dark:text-[#F5F5F0] transition-colors active:scale-95"
                >
                  <Heading1 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{t("formatTitle")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFormatBlock("h3")}
                  className="h-12 bg-[#F5F5F0]/60 dark:bg-[#1E1E1E] rounded-lg text-[11px] font-bold flex flex-col items-center justify-center gap-1 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 text-[#1A1A1A] dark:text-[#F5F5F0] transition-colors active:scale-95"
                >
                  <Heading2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{t("formatSubtitle")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFormatBlock("p")}
                  className="h-12 bg-[#F5F5F0]/60 dark:bg-[#1E1E1E] rounded-lg text-[11px] font-bold flex flex-col items-center justify-center gap-1 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 text-[#1A1A1A] dark:text-[#F5F5F0] transition-colors active:scale-95"
                >
                  <Pilcrow className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{t("formatParagraph")}</span>
                </button>
              </div>
            )}

            {/* Format Block */}
            {mobileTab === "format" && (
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => executeCommand("bold")}
                  className="h-12 bg-[#F5F5F0]/60 dark:bg-[#1E1E1E] rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 text-[#1A1A1A] dark:text-[#F5F5F0] transition-colors active:scale-95"
                >
                  <Bold className="w-4 h-4" />
                  <span>{language === "pt" ? "Negrito" : language === "es" ? "Negrita" : language === "id" ? "Tebal" : "Bold"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand("italic")}
                  className="h-12 bg-[#F5F5F0]/60 dark:bg-[#1E1E1E] rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 text-[#1A1A1A] dark:text-[#F5F5F0] transition-colors active:scale-95"
                >
                  <Italic className="w-4 h-4" />
                  <span>{language === "pt" ? "Itálico" : language === "es" ? "Itálica" : language === "id" ? "Miring" : "Italic"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand("underline")}
                  className="h-12 bg-[#F5F5F0]/60 dark:bg-[#1E1E1E] rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 text-[#1A1A1A] dark:text-[#F5F5F0] transition-colors active:scale-95"
                >
                  <Underline className="w-4 h-4" />
                  <span>{language === "pt" ? "Sublinhado" : language === "es" ? "Subrayado" : language === "id" ? "Garisbwh" : "Underline"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand("strikeThrough")}
                  className="h-12 bg-[#F5F5F0]/60 dark:bg-[#1E1E1E] rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 text-[#1A1A1A] dark:text-[#F5F5F0] transition-colors active:scale-95"
                >
                  <Strikethrough className="w-4 h-4" />
                  <span>{language === "pt" ? "Riscado" : language === "es" ? "Tachado" : language === "id" ? "Coret" : "Strike"}</span>
                </button>
              </div>
            )}

            {/* Align Block */}
            {mobileTab === "align" && (
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => executeCommand("justifyLeft")}
                  className="h-12 bg-[#F5F5F0]/60 dark:bg-[#1E1E1E] rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 text-[#1A1A1A] dark:text-[#F5F5F0] transition-colors active:scale-95"
                >
                  <AlignLeft className="w-4 h-4" />
                  <span>{language === "pt" ? "Esquerda" : language === "es" ? "Izquierda" : language === "id" ? "Kiri" : "Left"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand("justifyCenter")}
                  className="h-12 bg-[#F5F5F0]/60 dark:bg-[#1E1E1E] rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 text-[#1A1A1A] dark:text-[#F5F5F0] transition-colors active:scale-95"
                >
                  <AlignCenter className="w-4 h-4" />
                  <span>{language === "pt" ? "Centro" : language === "es" ? "Centro" : language === "id" ? "Tengah" : "Center"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand("justifyRight")}
                  className="h-12 bg-[#F5F5F0]/60 dark:bg-[#1E1E1E] rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 text-[#1A1A1A] dark:text-[#F5F5F0] transition-colors active:scale-95"
                >
                  <AlignRight className="w-4 h-4" />
                  <span>{language === "pt" ? "Direita" : language === "es" ? "Derecha" : language === "id" ? "Kanan" : "Right"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand("justifyFull")}
                  className="h-12 bg-[#F5F5F0]/60 dark:bg-[#1E1E1E] rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 text-[#1A1A1A] dark:text-[#F5F5F0] transition-colors active:scale-95"
                >
                  <AlignJustify className="w-4 h-4" />
                  <span>{language === "pt" ? "Justificar" : language === "es" ? "Justificar" : language === "id" ? "Rata" : "Justify"}</span>
                </button>
              </div>
            )}

            {/* Insert Block */}
            {mobileTab === "insert" && (
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => executeCommand("insertUnorderedList")}
                  className="h-12 bg-[#F5F5F0]/60 dark:bg-[#1E1E1E] rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 text-[#1A1A1A] dark:text-[#F5F5F0] transition-colors active:scale-95"
                  title={t("bulletList")}
                >
                  <List className="w-4 h-4" />
                  <span>{language === "pt" ? "Marcas" : language === "es" ? "Viñetas" : language === "id" ? "Poin" : "Bullets"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand("insertOrderedList")}
                  className="h-12 bg-[#F5F5F0]/60 dark:bg-[#1E1E1E] rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 text-[#1A1A1A] dark:text-[#F5F5F0] transition-colors active:scale-95"
                  title={t("numberList")}
                >
                  <ListOrdered className="w-4 h-4" />
                  <span>{language === "pt" ? "Números" : language === "es" ? "Números" : language === "id" ? "Nomor" : "Numbers"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFormatBlock("blockquote")}
                  className="h-12 bg-[#F5F5F0]/60 dark:bg-[#1E1E1E] rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 text-[#1A1A1A] dark:text-[#F5F5F0] transition-colors active:scale-95"
                  title={t("quote")}
                >
                  <Quote className="w-4 h-4" />
                  <span>{language === "pt" ? "Citar" : language === "es" ? "Cita" : language === "id" ? "Kutipan" : "Quote"}</span>
                </button>
                <button
                  type="button"
                  onClick={insertPageBreak}
                  className="h-12 bg-[#F5F5F0]/60 dark:bg-[#1E1E1E] rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 text-[#1A1A1A] dark:text-[#F5F5F0] transition-colors active:scale-95"
                  title={t("insertPageBreak")}
                >
                  <Split className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>{language === "pt" ? "Pág" : language === "es" ? "Pág" : language === "id" ? "Hal" : "Page"}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Pagination Controls & Stats Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer font-bold select-none">
              <input
                type="checkbox"
                checked={autoPagination}
                onChange={(e) => setAutoPagination(e.target.checked)}
                className="rounded border-[#1A1A1A]/20 dark:border-white/20 text-[#1A1A1A] focus:ring-0"
              />
              <span>{t("autoPageBreak")}</span>
            </label>

            {autoPagination && (
              <div className="flex items-center gap-1.5 opacity-80">
                <span className="text-[10px] font-bold uppercase tracking-wider">{t("wordsPerPage")}:</span>
                <select
                  value={wordsPerPage}
                  onChange={(e) => setWordsPerPage(Number(e.target.value))}
                  className="bg-white dark:bg-[#1A1A1A] border border-[#1A1A1A]/20 dark:border-white/20 rounded-lg px-2 py-1 text-xs font-mono font-bold"
                >
                  <option value={200}>200</option>
                  <option value={300}>300</option>
                  <option value={400}>400</option>
                  <option value={500}>500</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 font-mono text-[11px] opacity-70">
            <span>{totalWords} palavras</span>
            <span>~{Math.ceil(totalWords / 250)} min leitura</span>
            <span className="px-2 py-0.5 bg-[#1A1A1A]/10 dark:bg-white/10 rounded-full font-bold">
              {t("pagesCount", { count: computedPages.length || 1 })}
            </span>
          </div>
        </div>
      </div>

      {/* Editor / Preview Mode Tabs */}
      <div className="flex items-center justify-between border-b border-[#1A1A1A]/10 dark:border-white/10 pb-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("edit")}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors",
              activeTab === "edit" ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A]" : "opacity-60 hover:opacity-100"
            )}
          >
            Escrever
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("preview");
              setPreviewPageIdx(0);
            }}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5",
              activeTab === "preview" ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A]" : "opacity-60 hover:opacity-100"
            )}
          >
            <BookOpen className="w-3.5 h-3.5" /> Previsualizar Páginas
          </button>
        </div>

        {activeTab === "preview" && computedPages.length > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={previewPageIdx === 0}
              onClick={() => setPreviewPageIdx(prev => Math.max(0, prev - 1))}
              className="px-2 py-1 bg-[#1A1A1A]/10 dark:bg-white/10 rounded-lg text-xs font-bold disabled:opacity-30"
            >
              Anterior
            </button>
            <span className="text-xs font-mono font-bold">
              Pág. {previewPageIdx + 1} / {computedPages.length}
            </span>
            <button
              type="button"
              disabled={previewPageIdx >= computedPages.length - 1}
              onClick={() => setPreviewPageIdx(prev => Math.min(computedPages.length - 1, prev + 1))}
              className="px-2 py-1 bg-[#1A1A1A]/10 dark:bg-white/10 rounded-lg text-xs font-bold disabled:opacity-30"
            >
              Próxima
            </button>
          </div>
        )}
      </div>

      {/* Editor Content Box */}
      {activeTab === "edit" ? (
        <div className="relative">
          <div
            ref={editorRef}
            contentEditable
            onInput={handleContentChange}
            dangerouslySetInnerHTML={{ __html: editorHtml }}
            className="w-full min-h-[350px] max-h-[600px] overflow-y-auto p-4 sm:p-8 bg-white dark:bg-[#1A1A1A] border border-[#1A1A1A]/15 dark:border-white/15 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white font-serif text-base sm:text-lg leading-relaxed text-[#1A1A1A] dark:text-[#F5F5F0] shadow-inner prose dark:prose-invert max-w-none"
            style={{ minHeight: "350px" }}
          />
          {!editorHtml && (
            <div className="absolute top-4 left-4 sm:top-8 sm:left-8 text-sm sm:text-base font-serif opacity-40 pointer-events-none">
              {t("typeContentHere")}
            </div>
          )}
        </div>
      ) : (
        /* Preview Mode Page View */
        <div className="bg-white dark:bg-[#1A1A1A] p-4 sm:p-12 rounded-2xl border border-[#1A1A1A]/15 dark:border-white/15 shadow-sm min-h-[350px]">
          <div className="flex justify-between items-center pb-4 border-b border-[#1A1A1A]/10 dark:border-white/10 mb-6 text-xs font-mono opacity-50 uppercase tracking-widest">
            <span>Pré-visualização do Leitor</span>
            <span>Página {previewPageIdx + 1} de {computedPages.length || 1}</span>
          </div>
          
          <div 
            className="font-serif text-base sm:text-lg leading-relaxed space-y-4 prose dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: computedPages[previewPageIdx] || "<p className='opacity-40 italic'>Página vazia</p>" }}
          />
        </div>
      )}
    </div>
  );
}
