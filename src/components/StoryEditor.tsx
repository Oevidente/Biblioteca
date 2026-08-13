import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../contexts/LanguageContext';
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
  CheckCheck,
  Check,
  Globe,
  X,
  CheckCircle2,
  AlertTriangle,
  Plus,
  BookMarked,
  Trash2,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Minimize2,
  Type,
  Moon,
  Sun,
  ChevronLeft,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  runSpellCheckOnPages,
  addToPersonalDictionary,
  getPersonalDictionary,
  clearPersonalDictionary,
  ignoreWordInSession,
  ReviewIssue,
  ReviewLanguage,
  IssueCategory,
} from '../lib/spellChecker';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StoryEditorProps {
  initialPages?: string[];
  onChange: (pages: string[], fullText: string, wordCount: number) => void;
  className?: string;
}

export function StoryEditor({
  initialPages = [],
  onChange,
  className,
}: StoryEditorProps) {
  const { t } = useLanguage();
  const editorRef = useRef<HTMLDivElement>(null);

  const isInitialized = useRef(false);

  const getInitialHtml = () => {
    if (initialPages && initialPages.length > 0) {
      return initialPages
        .map((p, idx) => {
          if (idx === 0) return p;
          const markerText = t('pageBreakMarker', { page: idx + 1 });
          return (
            `<div class="page-break-marker" contenteditable="false" style="margin: 2rem 0; padding: 0.75rem 1rem; background: rgba(0,0,0,0.03); border: 1px dashed rgba(0,0,0,0.2); border-radius: 0.75rem; text-align: center; font-size: 0.75rem; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; color: #888; user-select: none;">${markerText}</div>` +
            p
          );
        })
        .join('');
    }
    return '';
  };

  const [autoPagination, setAutoPagination] = useState<boolean>(true);
  const [wordsPerPage, setWordsPerPage] = useState<number>(300);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [previewPageIdx, setPreviewPageIdx] = useState<number>(0);

  // Advanced Typography & Themes synced with Reader
  const [fontFamily, setFontFamily] = useState<'serif' | 'sans' | 'opendyslexic'>(() => {
    try {
      return (localStorage.getItem('inkora_font_family') as any) || 'serif';
    } catch (e) {
      return 'serif';
    }
  });

  const [lineSpacing, setLineSpacing] = useState<'compact' | 'relaxed' | 'loose'>(() => {
    try {
      return (localStorage.getItem('inkora_line_spacing') as any) || 'relaxed';
    } catch (e) {
      return 'relaxed';
    }
  });

  const [readerMode, setReaderMode] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('inkora_reader_mode');
      return saved === 'light' ? 'light' : 'dark';
    } catch (e) {
      return 'dark';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('inkora_font_family', fontFamily);
    } catch (e) {
      console.error(e);
    }
  }, [fontFamily]);

  useEffect(() => {
    try {
      localStorage.setItem('inkora_line_spacing', lineSpacing);
    } catch (e) {
      console.error(e);
    }
  }, [lineSpacing]);

  useEffect(() => {
    try {
      localStorage.setItem('inkora_reader_mode', readerMode);
    } catch (e) {
      console.error(e);
    }
  }, [readerMode]);
  const [mobileTab, setMobileTab] = useState<
    'style' | 'format' | 'align' | 'insert' | 'review'
  >('format');

  // Review & Spellcheck State
  const [reviewLanguage, setReviewLanguage] = useState<ReviewLanguage>('auto');
  const [showReviewPanel, setShowReviewPanel] = useState<boolean>(false);
  const [reviewFilterCategory, setReviewFilterCategory] = useState<
    'all' | IssueCategory
  >('all');
  const [issues, setIssues] = useState<ReviewIssue[]>([]);
  const [activePopoverIssue, setActivePopoverIssue] =
    useState<ReviewIssue | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [showPersonalDictModal, setShowPersonalDictModal] =
    useState<boolean>(false);
  const [dictWords, setDictWords] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string>('');

  // Derived state
  const [computedPages, setComputedPages] = useState<string[]>([]);
  const [totalWords, setTotalWords] = useState<number>(0);

  const executeCommand = (
    command: string,
    value: string | undefined = undefined,
  ) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    handleContentChange();
  };

  const handleFormatBlock = (tag: string) => {
    executeCommand('formatBlock', `<${tag}>`);
  };

  const insertPageBreak = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const markerText = t('pageBreakMarkerSimple');
    const marker = `<div class="page-break-marker" contenteditable="false" style="margin: 2rem 0; padding: 0.75rem 1rem; background: rgba(0,0,0,0.03); border: 1px dashed rgba(0,0,0,0.2); border-radius: 0.75rem; text-align: center; font-size: 0.75rem; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; color: #888; user-select: none;">${markerText}</div><p><br/></p>`;
    document.execCommand('insertHTML', false, marker);
    handleContentChange();
  };

  // Helper function to split HTML into pages
  const processHtmlIntoPages = (
    html: string,
  ): { pages: string[]; wordCount: number; cleanText: string } => {
    const hasManualBreaks = html.includes('class="page-break-marker"');

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    const markers = tempDiv.querySelectorAll('.page-break-marker');
    markers.forEach((m) => m.remove());

    const cleanText = tempDiv.textContent || tempDiv.innerText || '';
    const words = cleanText
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    const wordCount = words.length;

    if (hasManualBreaks) {
      const rawParts = html.split(
        /<div class="page-break-marker"[^>]*>.*?<\/div>/gi,
      );
      const pages = rawParts
        .map((p) => p.trim())
        .filter(
          (p) => p.length > 0 && p !== '<p><br></p>' && p !== '<p><br/></p>',
        );

      return {
        pages: pages.length > 0 ? pages : [html],
        wordCount,
        cleanText,
      };
    }

    if (autoPagination && wordsPerPage > 0) {
      const paragraphs = Array.from(tempDiv.children);
      if (paragraphs.length === 0) {
        const rawContent = tempDiv.innerHTML || html;
        return { pages: [rawContent || '<p></p>'], wordCount, cleanText };
      }

      const pages: string[] = [];
      let currentChunkHtml = '';
      let currentChunkWords = 0;

      paragraphs.forEach((child) => {
        const text = child.textContent || '';
        const childWordCount = text
          .trim()
          .split(/\s+/)
          .filter((w) => w.length > 0).length;

        if (
          currentChunkWords > 0 &&
          currentChunkWords + childWordCount > wordsPerPage + 50
        ) {
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
        cleanText,
      };
    }

    return {
      pages: [html || '<p></p>'],
      wordCount,
      cleanText,
    };
  };

  // Run async spellcheck with debounce (Stress test support CT-04)
  const spellCheckTimer = useRef<NodeJS.Timeout | null>(null);
  const triggerSpellCheck = useCallback(
    (pagesToScan: string[]) => {
      if (spellCheckTimer.current) clearTimeout(spellCheckTimer.current);
      spellCheckTimer.current = setTimeout(() => {
        const found = runSpellCheckOnPages(pagesToScan, reviewLanguage);
        setIssues(found);
      }, 150);
    },
    [reviewLanguage],
  );

  const handleContentChange = () => {
    if (!editorRef.current) return;
    const currentHtml = editorRef.current.innerHTML;

    const { pages, wordCount, cleanText } = processHtmlIntoPages(currentHtml);
    setComputedPages(pages);
    setTotalWords(wordCount);
    onChange(pages, cleanText, wordCount);

    triggerSpellCheck(pages);
  };

  useEffect(() => {
    if (editorRef.current && !isInitialized.current) {
      const html = getInitialHtml();
      editorRef.current.innerHTML = html;
      isInitialized.current = true;
      const { pages, wordCount, cleanText } = processHtmlIntoPages(html);
      setComputedPages(pages);
      setTotalWords(wordCount);
      onChange(pages, cleanText, wordCount);
      triggerSpellCheck(pages);
    }
  }, [initialPages]);

  useEffect(() => {
    if (editorRef.current) {
      const currentHtml = editorRef.current.innerHTML;
      const { pages, wordCount, cleanText } = processHtmlIntoPages(currentHtml);
      setComputedPages(pages);
      setTotalWords(wordCount);
      triggerSpellCheck(pages);
    }
  }, [autoPagination, wordsPerPage, reviewLanguage, triggerSpellCheck]);

  // Load personal dictionary words
  useEffect(() => {
    setDictWords(getPersonalDictionary());
  }, [showPersonalDictModal]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Replace misspelled word in editor content (CT-02)
  const handleApplySuggestion = (issue: ReviewIssue, suggestion: string) => {
    if (!editorRef.current) return;

    const currentHtml = editorRef.current.innerHTML;

    // Use boundary-safe replacement for the exact word/phrase
    const escapeRegex = (s: string) =>
      s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapeRegex(issue.word)}\\b`, 'g');

    // Replace first occurrence corresponding to issue
    const newHtml = currentHtml.replace(regex, suggestion);
    editorRef.current.innerHTML = newHtml;

    handleContentChange();
    setActivePopoverIssue(null);
    setPopoverPosition(null);
    showToast(t('applySuggestion') + `: ${issue.word} ➔ ${suggestion}`);
  };

  // Ignore word in session
  const handleIgnoreWord = (issue: ReviewIssue) => {
    ignoreWordInSession(issue.word);
    if (editorRef.current) {
      handleContentChange();
    }
    setActivePopoverIssue(null);
    setPopoverPosition(null);
  };

  // Add word to personal dictionary
  const handleAddToDictionary = (issue: ReviewIssue) => {
    addToPersonalDictionary(issue.word);
    setDictWords(getPersonalDictionary());
    if (editorRef.current) {
      handleContentChange();
    }
    setActivePopoverIssue(null);
    setPopoverPosition(null);
    showToast(t('wordAddedToDictionary'));
  };

  // Scroll to and highlight issue in Editor (CT-03, CT-06, RF-05)
  const handleNavigateToIssue = (issue: ReviewIssue) => {
    setActiveTab('edit');
    if (!editorRef.current) return;

    // Search for element containing issue word
    const textNodes: Node[] = [];
    const walk = document.createTreeWalker(
      editorRef.current,
      NodeFilter.SHOW_TEXT,
      null,
    );
    let node: Node | null;
    while ((node = walk.nextNode())) {
      textNodes.push(node);
    }

    const targetNode = textNodes.find((n) =>
      (n.textContent || '').includes(issue.word),
    );

    if (targetNode && targetNode.parentElement) {
      const parent = targetNode.parentElement;

      // Add temporary focus glow / highlight visual effect
      parent.classList.add(
        'ring-2',
        'ring-red-500',
        'ring-offset-2',
        'bg-red-500/10',
        'transition-all',
        'duration-300',
        'rounded-lg',
      );
      setTimeout(() => {
        parent.classList.remove(
          'ring-2',
          'ring-red-500',
          'ring-offset-2',
          'bg-red-500/10',
          'transition-all',
          'duration-300',
          'rounded-lg',
        );
      }, 2500);

      // Smooth scroll to the exact paragraph / snippet
      parent.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });

      // Position popover near parent element
      const rect = parent.getBoundingClientRect();
      setPopoverPosition({
        top: Math.max(80, rect.top - 120),
        left: Math.min(window.innerWidth - 300, Math.max(20, rect.left)),
      });
      setActivePopoverIssue(issue);
    } else {
      // Fallback position
      setPopoverPosition({ top: 150, left: 100 });
      setActivePopoverIssue(issue);
    }
  };

  // Filter issues based on active tab
  const filteredIssues = issues.filter((i) => {
    if (reviewFilterCategory === 'all') return true;
    return i.category === reviewFilterCategory;
  });

  const spellingCount = issues.filter((i) => i.category === 'spelling').length;
  const grammarCount = issues.filter((i) => i.category === 'grammar').length;
  const punctuationCount = issues.filter(
    (i) => i.category === 'punctuation',
  ).length;

  return (
    <div className={cn('space-y-4 w-full relative', className)}>
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-[#1A1A1A] text-white dark:bg-[#F5F5F0] dark:text-[#1A1A1A] px-4 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Toolbar Header */}
      <div className="bg-[#F5F5F0] dark:bg-[#0A0A0A] p-2.5 sm:p-3 rounded-2xl border border-[#1A1A1A]/10 dark:border-white/10 space-y-3 max-w-full overflow-hidden">
        {/* Format & Tools Bar - Desktop / Tablet Layout */}
        <div className="hidden sm:flex items-center justify-between gap-2 border-b border-[#1A1A1A]/10 dark:border-white/10 pb-3 overflow-x-auto max-w-full">
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Format selector */}
            <div className="flex items-center bg-white dark:bg-[#1A1A1A] rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => handleFormatBlock('h1')}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg text-xs font-bold flex items-center gap-1"
                title={t('formatTitle')}
              >
                <Heading1 className="w-4 h-4" />
                <span className="hidden sm:inline">{t('formatTitle')}</span>
              </button>
              <button
                type="button"
                onClick={() => handleFormatBlock('h2')}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg text-xs font-bold flex items-center gap-1"
                title={t('formatSubtitle')}
              >
                <Heading2 className="w-4 h-4" />
                <span className="hidden sm:inline">{t('formatSubtitle')}</span>
              </button>
              <button
                type="button"
                onClick={() => handleFormatBlock('p')}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg text-xs font-bold flex items-center gap-1"
                title={t('formatParagraph')}
              >
                <Pilcrow className="w-4 h-4" />
                <span className="hidden sm:inline">{t('formatParagraph')}</span>
              </button>
            </div>

            <div className="h-5 w-px bg-[#1A1A1A]/10 dark:bg-white/10 mx-1" />

            {/* Inline Styles */}
            <div className="flex items-center bg-white dark:bg-[#1A1A1A] rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 p-0.5">
              <button
                type="button"
                onClick={() => executeCommand('bold')}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t('bold')}
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand('italic')}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t('italic')}
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand('underline')}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t('underline')}
              >
                <Underline className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand('strikeThrough')}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t('strikethrough')}
              >
                <Strikethrough className="w-4 h-4" />
              </button>
            </div>

            <div className="h-5 w-px bg-[#1A1A1A]/10 dark:bg-white/10 mx-1 hidden sm:block" />

            {/* Alignments */}
            <div className="flex items-center bg-white dark:bg-[#1A1A1A] rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 p-0.5">
              <button
                type="button"
                onClick={() => executeCommand('justifyLeft')}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t('alignLeft')}
              >
                <AlignLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand('justifyCenter')}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t('alignCenter')}
              >
                <AlignCenter className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand('justifyRight')}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t('alignRight')}
              >
                <AlignRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand('justifyFull')}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t('alignJustify')}
              >
                <AlignJustify className="w-4 h-4" />
              </button>
            </div>

            <div className="h-5 w-px bg-[#1A1A1A]/10 dark:bg-white/10 mx-1 hidden md:block" />

            {/* Lists & Quotes */}
            <div className="flex items-center bg-white dark:bg-[#1A1A1A] rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 p-0.5">
              <button
                type="button"
                onClick={() => executeCommand('insertUnorderedList')}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t('bulletList')}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand('insertOrderedList')}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t('numberList')}
              >
                <ListOrdered className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleFormatBlock('blockquote')}
                className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                title={t('quote')}
              >
                <Quote className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Action Tools & Review Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={insertPageBreak}
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl text-xs font-bold hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 transition-colors"
              title={t('insertPageBreak')}
            >
              <Split className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="hidden sm:inline">{t('insertPageBreak')}</span>
            </button>

            {/* Review Button (RF-03, RF-04) */}
            <button
              type="button"
              onClick={() => setShowReviewPanel(!showReviewPanel)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all relative',
                showReviewPanel
                  ? 'bg-red-600 text-white shadow-md'
                  : issues.length > 0
                  ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-white dark:bg-[#1A1A1A] border border-[#1A1A1A]/10 dark:border-white/10 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5',
              )}
              title={t('reviewButton')}
            >
              <CheckCheck className="w-4 h-4 text-red-500 dark:text-red-400" />
              <span>{t('reviewButton')}</span>
              {issues.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black animate-pulse">
                  {issues.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Format & Tools Bar - Mobile Touch Layout */}
        <div className="block sm:hidden space-y-1.5 border-b border-[#1A1A1A]/10 dark:border-white/10 pb-2">
          <div className="grid grid-cols-5 gap-0.5 bg-[#1A1A1A]/5 dark:bg-white/5 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setMobileTab('style')}
              className={cn(
                'h-8 rounded-md text-[9px] font-extrabold transition-all flex flex-col items-center justify-center gap-0',
                mobileTab === 'style'
                  ? 'bg-white text-[#1A1A1A] dark:bg-[#1C1C1E] dark:text-[#F5F5F0] shadow-xs'
                  : 'text-[#1A1A1A]/60 dark:text-[#F5F5F0]/60',
              )}
            >
              <Pilcrow className="w-3 h-3" />
              <span>{t('styleTab')}</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('format')}
              className={cn(
                'h-8 rounded-md text-[9px] font-extrabold transition-all flex flex-col items-center justify-center gap-0',
                mobileTab === 'format'
                  ? 'bg-white text-[#1A1A1A] dark:bg-[#1C1C1E] dark:text-[#F5F5F0] shadow-xs'
                  : 'text-[#1A1A1A]/60 dark:text-[#F5F5F0]/60',
              )}
            >
              <Bold className="w-3 h-3" />
              <span>{t('formatTab')}</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('align')}
              className={cn(
                'h-8 rounded-md text-[9px] font-extrabold transition-all flex flex-col items-center justify-center gap-0',
                mobileTab === 'align'
                  ? 'bg-white text-[#1A1A1A] dark:bg-[#1C1C1E] dark:text-[#F5F5F0] shadow-xs'
                  : 'text-[#1A1A1A]/60 dark:text-[#F5F5F0]/60',
              )}
            >
              <AlignCenter className="w-3 h-3" />
              <span>{t('alignTab')}</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('insert')}
              className={cn(
                'h-8 rounded-md text-[9px] font-extrabold transition-all flex flex-col items-center justify-center gap-0',
                mobileTab === 'insert'
                  ? 'bg-white text-[#1A1A1A] dark:bg-[#1C1C1E] dark:text-[#F5F5F0] shadow-xs'
                  : 'text-[#1A1A1A]/60 dark:text-[#F5F5F0]/60',
              )}
            >
              <Split className="w-3 h-3" />
              <span>{t('extrasTab')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileTab('review');
                setShowReviewPanel(!showReviewPanel);
              }}
              className={cn(
                'h-8 rounded-md text-[9px] font-extrabold transition-all flex flex-col items-center justify-center gap-0 relative',
                showReviewPanel
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-[#1A1A1A]/60 dark:text-[#F5F5F0]/60',
              )}
            >
              <CheckCheck className="w-3 h-3" />
              <span>{t('reviewButton')}</span>
              {issues.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">
                  {issues.length}
                </span>
              )}
            </button>
          </div>

          {/* RF-10: Mobile Active Tab Controls with reduced padding, compact sizes and spacing */}
          <div className="bg-white dark:bg-[#1A1A1A] rounded-lg p-1 border border-[#1A1A1A]/10 dark:border-white/10 flex items-center justify-center gap-1 min-h-[36px]">
            {mobileTab === 'style' && (
              <div className="flex items-center gap-1 w-full justify-around">
                <button
                  type="button"
                  onClick={() => handleFormatBlock('p')}
                  className="px-2 py-1 bg-[#1A1A1A]/5 dark:bg-white/5 hover:bg-[#1A1A1A]/10 dark:hover:bg-white/10 rounded-md text-[9px] font-bold flex items-center gap-1"
                >
                  <Pilcrow className="w-3 h-3" />
                  <span>{t('formatParagraph')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFormatBlock('h1')}
                  className="px-2 py-1 bg-[#1A1A1A]/5 dark:bg-white/5 hover:bg-[#1A1A1A]/10 dark:hover:bg-white/10 rounded-md text-[9px] font-bold flex items-center gap-1"
                >
                  <Heading1 className="w-3 h-3" />
                  <span>{t('formatTitle')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFormatBlock('h2')}
                  className="px-2 py-1 bg-[#1A1A1A]/5 dark:bg-white/5 hover:bg-[#1A1A1A]/10 dark:hover:bg-white/10 rounded-md text-[9px] font-bold flex items-center gap-1"
                >
                  <Heading2 className="w-3 h-3" />
                  <span>{t('formatSubtitle')}</span>
                </button>
              </div>
            )}

            {mobileTab === 'format' && (
              <div className="flex items-center justify-around w-full gap-1">
                <button
                  type="button"
                  onClick={() => executeCommand('bold')}
                  className="p-1 bg-[#1A1A1A]/5 dark:bg-white/5 hover:bg-[#1A1A1A]/10 dark:hover:bg-white/10 rounded-md"
                  title={t('bold')}
                >
                  <Bold className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand('italic')}
                  className="p-1 bg-[#1A1A1A]/5 dark:bg-white/5 hover:bg-[#1A1A1A]/10 dark:hover:bg-white/10 rounded-md"
                  title={t('italic')}
                >
                  <Italic className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand('underline')}
                  className="p-1 bg-[#1A1A1A]/5 dark:bg-white/5 hover:bg-[#1A1A1A]/10 dark:hover:bg-white/10 rounded-md"
                  title={t('underline')}
                >
                  <Underline className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand('strikeThrough')}
                  className="p-1 bg-[#1A1A1A]/5 dark:bg-white/5 hover:bg-[#1A1A1A]/10 dark:hover:bg-white/10 rounded-md"
                  title={t('strikethrough')}
                >
                  <Strikethrough className="w-3 h-3" />
                </button>
              </div>
            )}

            {mobileTab === 'align' && (
              <div className="flex items-center justify-around w-full gap-1">
                <button
                  type="button"
                  onClick={() => executeCommand('justifyLeft')}
                  className="p-1 bg-[#1A1A1A]/5 dark:bg-white/5 hover:bg-[#1A1A1A]/10 dark:hover:bg-white/10 rounded-md"
                  title={t('alignLeft')}
                >
                  <AlignLeft className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand('justifyCenter')}
                  className="p-1 bg-[#1A1A1A]/5 dark:bg-white/5 hover:bg-[#1A1A1A]/10 dark:hover:bg-white/10 rounded-md"
                  title={t('alignCenter')}
                >
                  <AlignCenter className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand('justifyRight')}
                  className="p-1 bg-[#1A1A1A]/5 dark:bg-white/5 hover:bg-[#1A1A1A]/10 dark:hover:bg-white/10 rounded-md"
                  title={t('alignRight')}
                >
                  <AlignRight className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand('justifyFull')}
                  className="p-1 bg-[#1A1A1A]/5 dark:bg-white/5 hover:bg-[#1A1A1A]/10 dark:hover:bg-white/10 rounded-md"
                  title={t('alignJustify')}
                >
                  <AlignJustify className="w-3 h-3" />
                </button>
              </div>
            )}

            {mobileTab === 'insert' && (
              <div className="flex items-center justify-around w-full gap-1">
                <button
                  type="button"
                  onClick={insertPageBreak}
                  className="px-2 py-1 bg-[#1A1A1A]/5 dark:bg-white/5 hover:bg-[#1A1A1A]/10 dark:hover:bg-white/10 rounded-md text-[9px] font-bold flex items-center gap-1"
                >
                  <Split className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>{t('insertPageBreak')}</span>
                </button>
              </div>
            )}

            {mobileTab === 'review' && (
              <div className="text-[9px] font-bold text-[#1A1A1A]/70 dark:text-[#F8FAFC]/70 flex items-center gap-1">
                <CheckCheck className="w-3.5 h-3.5 text-red-500" />
                <span>{issues.length > 0 ? `${t('reviewButton')} (${issues.length})` : t('noErrorsFound')}</span>
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
              <span>{t('autoPageBreak')}</span>
            </label>

            {autoPagination && (
              <div className="flex items-center gap-1.5 opacity-80">
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  {t('wordsPerPage')}:
                </span>
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
            <span>{t('wordsCount', { count: totalWords })}</span>
            <span>
              {t('readTimeEstimate', { count: Math.ceil(totalWords / 250) })}
            </span>
            <span className="px-2 py-0.5 bg-[#1A1A1A]/10 dark:bg-white/10 rounded-full font-bold">
              {t('pagesCount', { count: computedPages.length || 1 })}
            </span>
          </div>
        </div>
      </div>

      {/* Editor / Preview Mode Tabs */}
      <div className="flex items-center justify-between border-b border-[#1A1A1A]/10 dark:border-white/10 pb-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('edit')}
            className={cn(
              'px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors',
              activeTab === 'edit'
                ? 'bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A]'
                : 'opacity-60 hover:opacity-100',
            )}
          >
            {t('editInSite')}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('preview');
              setPreviewPageIdx(0);
            }}
            className={cn(
              'px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5',
              activeTab === 'preview'
                ? 'bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A]'
                : 'opacity-60 hover:opacity-100',
            )}
          >
            <BookOpen className="w-3.5 h-3.5" /> {t('previewPages')}
          </button>
        </div>

        {activeTab === 'preview' && computedPages.length > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={previewPageIdx === 0}
              onClick={() => setPreviewPageIdx((prev) => Math.max(0, prev - 1))}
              className="px-2 py-1 bg-[#1A1A1A]/10 dark:bg-white/10 rounded-lg text-xs font-bold disabled:opacity-30"
            >
              {t('previous')}
            </button>
            <span className="text-xs font-mono font-bold">
              {t('stylePage')} {previewPageIdx + 1} / {computedPages.length}
            </span>
            <button
              type="button"
              disabled={previewPageIdx >= computedPages.length - 1}
              onClick={() =>
                setPreviewPageIdx((prev) =>
                  Math.min(computedPages.length - 1, prev + 1),
                )
              }
              className="px-2 py-1 bg-[#1A1A1A]/10 dark:bg-white/10 rounded-lg text-xs font-bold disabled:opacity-30"
            >
              {t('next')}
            </button>
          </div>
        )}
      </div>

      {/* Main Container: Editor Writing Canvas (ALWAYS 100% full width, CT-05) */}
      <div className="w-full relative">
        <div className="w-full">
          {activeTab === 'edit' ? (
            <div className="relative">
              <div
                ref={editorRef}
                contentEditable
                onInput={handleContentChange}
                className="w-full min-h-[380px] max-h-[650px] overflow-y-auto p-4 sm:p-8 bg-white dark:bg-[#1A1A1A] border border-[#1A1A1A]/15 dark:border-white/15 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white font-serif text-base sm:text-lg leading-relaxed text-[#1A1A1A] dark:text-[#F5F5F0] shadow-inner prose dark:prose-invert max-w-none transition-all duration-300"
                style={{ minHeight: '380px' }}
              />
              {totalWords === 0 && (
                <div className="absolute top-4 left-4 sm:top-8 sm:left-8 text-sm sm:text-base font-serif opacity-40 pointer-events-none">
                  {t('typeContentHere')}
                </div>
              )}
            </div>
          ) : (
            /* Preview Mode Page View */
            <div 
              className={cn(
                "relative min-h-[380px] p-6 sm:p-12 rounded-2xl transition-all overflow-hidden w-full break-words shadow-lg border border-black/5",
                readerMode === "dark" 
                  ? "paper-card text-[#F5F5F0]" 
                  : "bg-[#FDFCF9] text-[#1A1A1A]"
              )}
            >
              <div className="flex flex-col gap-4 pb-4 border-b border-[#1A1A1A]/10 dark:border-white/10 mb-6">
                <div className="flex justify-between items-center text-xs font-mono opacity-50 uppercase tracking-widest">
                  <span>{t('readerPreview')}</span>
                  <span>
                    {t('stylePage')} {previewPageIdx + 1} /{' '}
                    {computedPages.length || 1}
                  </span>
                </div>

                {/* Typography & Theme controls in Preview (Parity RF-06, RF-07) */}
                <div className="flex flex-wrap items-center justify-between gap-4 bg-black/5 dark:bg-white/5 p-3 rounded-2xl text-xs font-sans">
                  {/* Font Selector */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold opacity-70 uppercase tracking-wider text-[10px]">{t('fontFamily')}:</span>
                    <div className="flex gap-1 p-0.5 rounded-lg bg-black/5 dark:bg-white/5">
                      <button
                        type="button"
                        onClick={() => setFontFamily('serif')}
                        className={cn(
                          "px-2.5 py-1 text-[11px] font-serif font-bold rounded-md transition-all",
                          fontFamily === 'serif'
                            ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] shadow-sm"
                            : "opacity-60 hover:opacity-100"
                        )}
                      >
                        Serif
                      </button>
                      <button
                        type="button"
                        onClick={() => setFontFamily('sans')}
                        className={cn(
                          "px-2.5 py-1 text-[11px] font-sans font-bold rounded-md transition-all",
                          fontFamily === 'sans'
                            ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] shadow-sm"
                            : "opacity-60 hover:opacity-100"
                        )}
                      >
                        Sans
                      </button>
                      <button
                        type="button"
                        onClick={() => setFontFamily('opendyslexic')}
                        className={cn(
                          "px-2.5 py-1 text-[11px] font-bold rounded-md transition-all font-opendyslexic",
                          fontFamily === 'opendyslexic'
                            ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] shadow-sm"
                            : "opacity-60 hover:opacity-100"
                        )}
                      >
                        Dyslexic
                      </button>
                    </div>
                  </div>

                  {/* Line Spacing */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold opacity-70 uppercase tracking-wider text-[10px]">{t('lineSpacing')}:</span>
                    <div className="flex gap-1 p-0.5 rounded-lg bg-black/5 dark:bg-white/5">
                      <button
                        type="button"
                        onClick={() => setLineSpacing('compact')}
                        className={cn(
                          "px-2.5 py-1 text-[11px] font-bold rounded-md transition-all",
                          lineSpacing === 'compact'
                            ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] shadow-sm"
                            : "opacity-60 hover:opacity-100"
                        )}
                      >
                        1.4
                      </button>
                      <button
                        type="button"
                        onClick={() => setLineSpacing('relaxed')}
                        className={cn(
                          "px-2.5 py-1 text-[11px] font-bold rounded-md transition-all",
                          lineSpacing === 'relaxed'
                            ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] shadow-sm"
                            : "opacity-60 hover:opacity-100"
                        )}
                      >
                        1.8
                      </button>
                      <button
                        type="button"
                        onClick={() => setLineSpacing('loose')}
                        className={cn(
                          "px-2.5 py-1 text-[11px] font-bold rounded-md transition-all",
                          lineSpacing === 'loose'
                            ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] shadow-sm"
                            : "opacity-60 hover:opacity-100"
                        )}
                      >
                        2.2
                      </button>
                    </div>
                  </div>

                  {/* Theme Mode */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold opacity-70 uppercase tracking-wider text-[10px]">{t('readingTheme')}:</span>
                    <button
                      type="button"
                      onClick={() => setReaderMode(readerMode === 'dark' ? 'light' : 'dark')}
                      className="p-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                      title={readerMode === 'dark' ? t('lightTheme') : t('darkTheme')}
                    >
                      {readerMode === 'dark' ? (
                        <Sun className="w-3.5 h-3.5 text-amber-500" />
                      ) : (
                        <Moon className="w-3.5 h-3.5 text-indigo-500" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  'prose prose-lg prose-neutral mx-auto prose-p:mb-6 prose-p:text-base sm:prose-p:text-lg prose-headings:tracking-tight break-words',
                  readerMode === 'dark' ? 'dark:prose-invert text-[#F5F5F0]' : 'text-[#1A1A1A]',
                  fontFamily === 'opendyslexic'
                    ? 'font-opendyslexic'
                    : fontFamily === 'sans'
                      ? 'font-sans'
                      : 'font-serif',
                  lineSpacing === 'compact'
                    ? 'prose-p:leading-[1.4]'
                    : lineSpacing === 'loose'
                      ? 'prose-p:leading-[2.2]'
                      : 'prose-p:leading-[1.8]',
                )}
                dangerouslySetInnerHTML={{
                  __html:
                    computedPages[previewPageIdx] ||
                    `<p class='opacity-40 italic'>${t('emptyPage')}</p>`,
                }}
              />
            </div>
          )}
        </div>

        {showReviewPanel && createPortal(
          <>
            {/* RF-09: Backdrop overlay on mobile for sliding drawer feel */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 sm:hidden animate-in fade-in duration-200"
              onClick={() => setShowReviewPanel(false)}
            />

            {/* RF-09: Responsive Drawer: bottom-sliding on mobile, standard sidebar on desktop */}
            <div className="fixed bottom-0 left-0 right-0 sm:bottom-auto sm:left-auto sm:top-20 sm:right-8 z-50 sm:z-40 w-full sm:w-[380px] max-h-[80vh] sm:max-h-[82vh] overflow-y-auto bg-white dark:bg-[#121212] sm:bg-white/95 sm:dark:bg-[#121212]/95 backdrop-blur-md rounded-t-3xl sm:rounded-3xl border-t border-x sm:border border-[#1A1A1A]/20 dark:border-white/20 p-5 sm:p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom sm:slide-in-from-right-6 duration-200 text-[#1A1A1A] dark:text-[#F8FAFC]">
              {/* Mobile Drawer visual handle indicator */}
              <div className="w-12 h-1 bg-black/10 dark:bg-white/20 rounded-full mx-auto mb-1.5 sm:hidden shrink-0" />
            {/* Review Panel Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#1A1A1A]/10 dark:border-white/10 sticky top-0 bg-white/90 dark:bg-[#121212]/90 backdrop-blur-xs z-10 pt-1">
              <div className="flex items-center gap-2">
                <CheckCheck className="w-5 h-5 text-red-500" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#1A1A1A] dark:text-[#F8FAFC]">
                  {t('reviewPanelTitle')}
                </h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowReviewPanel(false)}
                  className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-[#1A1A1A]/70 dark:text-[#F8FAFC]/80 hover:text-[#1A1A1A] hover:dark:text-white transition-colors"
                  title="Fechar / Minimizar"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowReviewPanel(false)}
                  className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-[#1A1A1A]/70 dark:text-[#F8FAFC]/80 hover:text-[#1A1A1A] hover:dark:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Language Selector (RF-01, CT-01) */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-widest text-[#1A1A1A]/80 dark:text-[#F8FAFC]/90 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                <span>{t('spellingLanguage')}</span>
              </label>
              <select
                value={reviewLanguage}
                onChange={(e) =>
                  setReviewLanguage(e.target.value as ReviewLanguage)
                }
                className="w-full bg-[#F5F5F0] dark:bg-[#1A1A1A] border border-[#1A1A1A]/15 dark:border-white/15 rounded-xl px-3 py-2 text-xs font-bold text-[#1A1A1A] dark:text-[#F8FAFC] focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                <option value="auto" className="bg-white dark:bg-[#121212] text-[#1A1A1A] dark:text-[#F8FAFC]">
                  🌐 {t('autoDetectLanguage')} (Auto)
                </option>
                <option value="pt" className="bg-white dark:bg-[#121212] text-[#1A1A1A] dark:text-[#F8FAFC]">🇵🇹 / 🇧🇷 Português</option>
                <option value="es" className="bg-white dark:bg-[#121212] text-[#1A1A1A] dark:text-[#F8FAFC]">🇪🇸 Español</option>
                <option value="en" className="bg-white dark:bg-[#121212] text-[#1A1A1A] dark:text-[#F8FAFC]">🇺🇸 / 🇬🇧 English</option>
                <option value="id" className="bg-white dark:bg-[#121212] text-[#1A1A1A] dark:text-[#F8FAFC]">🇮🇩 Indonesia</option>
                <option value="zh" className="bg-white dark:bg-[#121212] text-[#1A1A1A] dark:text-[#F8FAFC]">🇨🇳 中文 (Chinese)</option>
              </select>
            </div>

            {/* Category Filter Tabs */}
            <div className="grid grid-cols-4 gap-1 bg-[#F5F5F0] dark:bg-[#1A1A1A] rounded-xl p-1 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setReviewFilterCategory('all')}
                className={cn(
                  'py-1.5 rounded-lg text-center transition-all',
                  reviewFilterCategory === 'all'
                    ? 'bg-white dark:bg-[#252525] shadow-xs text-red-600 dark:text-red-400 font-extrabold'
                    : 'text-[#1A1A1A]/70 dark:text-[#F8FAFC]/70 hover:text-[#1A1A1A] hover:dark:text-white',
                )}
              >
                {t('all')} ({issues.length})
              </button>
              <button
                type="button"
                onClick={() => setReviewFilterCategory('spelling')}
                className={cn(
                  'py-1.5 rounded-lg text-center transition-all',
                  reviewFilterCategory === 'spelling'
                    ? 'bg-white dark:bg-[#252525] shadow-xs text-red-600 dark:text-red-400 font-extrabold'
                    : 'text-[#1A1A1A]/70 dark:text-[#F8FAFC]/70 hover:text-[#1A1A1A] hover:dark:text-white',
                )}
              >
                {t('spellingIssues')} ({spellingCount})
              </button>
              <button
                type="button"
                onClick={() => setReviewFilterCategory('grammar')}
                className={cn(
                  'py-1.5 rounded-lg text-center transition-all',
                  reviewFilterCategory === 'grammar'
                    ? 'bg-white dark:bg-[#252525] shadow-xs text-red-600 dark:text-red-400 font-extrabold'
                    : 'text-[#1A1A1A]/70 dark:text-[#F8FAFC]/70 hover:text-[#1A1A1A] hover:dark:text-white',
                )}
              >
                {t('grammarIssues')} ({grammarCount})
              </button>
              <button
                type="button"
                onClick={() => setReviewFilterCategory('punctuation')}
                className={cn(
                  'py-1.5 rounded-lg text-center transition-all',
                  reviewFilterCategory === 'punctuation'
                    ? 'bg-white dark:bg-[#252525] shadow-xs text-red-600 dark:text-red-400 font-extrabold'
                    : 'text-[#1A1A1A]/70 dark:text-[#F8FAFC]/70 hover:text-[#1A1A1A] hover:dark:text-white',
                )}
              >
                {t('punctuationIssues')} ({punctuationCount})
              </button>
            </div>

            {/* Personal Dictionary Manage Button */}
            <div className="flex justify-between items-center text-[11px] px-1 pt-1 text-[#1A1A1A] dark:text-[#F8FAFC]">
              <button
                type="button"
                onClick={() => setShowPersonalDictModal(true)}
                className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:underline font-bold"
              >
                <BookMarked className="w-3.5 h-3.5" />
                <span>{t('personalDictionary')}</span>
              </button>
              <span className="text-[10px] font-mono text-[#1A1A1A]/65 dark:text-[#F8FAFC]/75 font-bold">
                {t('wordsInDictionary', { count: dictWords.length })}
              </span>
            </div>

            {/* Review Issues List */}
            <div className="space-y-2.5 pr-1">
              {filteredIssues.length === 0 ? (
                <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <h4 className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    {t('noErrorsFound')}
                  </h4>
                  <p className="text-[11px] text-[#1A1A1A]/80 dark:text-[#F8FAFC]/90">{t('noErrorsDesc')}</p>
                </div>
              ) : (
                filteredIssues.map((issue) => (
                  <div
                    key={issue.id}
                    onClick={() => handleNavigateToIssue(issue)}
                    className="p-3 rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 bg-[#F5F5F0]/50 dark:bg-[#1A1A1A]/50 space-y-2 hover:border-red-500/50 hover:bg-red-500/5 transition-all cursor-pointer group text-[#1A1A1A] dark:text-[#F8FAFC]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full',
                            issue.category === 'spelling'
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                              : issue.category === 'grammar'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                              : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
                          )}
                        >
                          {issue.category === 'spelling'
                            ? t('spellingIssues')
                            : issue.category === 'grammar'
                            ? t('grammarIssues')
                            : t('punctuationIssues')}
                        </span>
                        <span className="text-[9px] font-mono text-[#1A1A1A]/60 dark:text-[#F8FAFC]/70 font-bold">
                          {t('pageIssueGroup', { page: issue.pageIndex + 1 })}
                        </span>
                      </div>

                      {/* Quick Navigate Button (CT-03, CT-06, RF-05) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNavigateToIssue(issue);
                        }}
                        className="text-[10px] font-bold text-red-600 dark:text-red-400 hover:underline flex items-center gap-0.5 opacity-90 group-hover:opacity-100"
                      >
                        <span>{t('goToPage')}</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Word & Context Snippet */}
                    <div className="text-xs text-[#1A1A1A] dark:text-[#F8FAFC]">
                      <span className="font-bold text-red-600 dark:text-red-400 underline decoration-wavy">
                        {issue.word}
                      </span>
                      <p className="text-[11px] text-[#1A1A1A]/80 dark:text-[#F8FAFC]/90 italic font-serif mt-0.5 line-clamp-2">
                        "{issue.context}"
                      </p>
                    </div>

                    {/* Suggestions Pills (CT-02) */}
                    {issue.suggestions.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <span className="text-[9px] uppercase font-bold tracking-wider text-[#1A1A1A]/65 dark:text-[#F8FAFC]/75 block">
                          {t('suggestions')}:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {issue.suggestions.map((sug) => (
                            <button
                              key={sug}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApplySuggestion(issue, sug);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-[11px] font-bold transition-all active:scale-95"
                            >
                              {sug}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-1 border-t border-black/5 dark:border-white/5 text-[10px] text-[#1A1A1A]/70 dark:text-[#F8FAFC]/80">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleIgnoreWord(issue);
                        }}
                        className="hover:underline hover:text-[#1A1A1A] hover:dark:text-white"
                      >
                        {t('ignore')}
                      </button>
                      <span className="opacity-40">•</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToDictionary(issue);
                        }}
                        className="hover:underline flex items-center gap-1 hover:text-[#1A1A1A] hover:dark:text-white"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{t('addToDictionary')}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>,
        document.body
      )}
      </div>

      {/* Floating Suggestions Popover (RF-02, CT-02) */}
      {activePopoverIssue && popoverPosition && createPortal(
        <div
          style={{ top: popoverPosition.top, left: popoverPosition.left }}
          className="fixed z-50 w-72 bg-white dark:bg-[#1C1C1E] rounded-2xl border border-[#1A1A1A]/20 dark:border-white/20 p-4 shadow-2xl space-y-3 animate-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between pb-2 border-b border-[#1A1A1A]/10 dark:border-white/10">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs font-bold text-red-600 dark:text-red-400">
                "{activePopoverIssue.word}"
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActivePopoverIssue(null)}
              className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 opacity-60"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Suggestions List */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
              {t('suggestions')}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {activePopoverIssue.suggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() =>
                    handleApplySuggestion(activePopoverIssue, sug)
                  }
                  className="w-full text-left px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-bold transition-colors flex items-center justify-between"
                >
                  <span>{sug}</span>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                </button>
              ))}
            </div>
          </div>

          {/* Ignore / Personal Dictionary actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[#1A1A1A]/10 dark:border-white/10 text-[10px]">
            <button
              type="button"
              onClick={() => handleIgnoreWord(activePopoverIssue)}
              className="px-2.5 py-1 rounded-lg bg-[#1A1A1A]/5 dark:bg-white/5 hover:bg-[#1A1A1A]/10 font-bold"
            >
              {t('ignore')}
            </button>
            <button
              type="button"
              onClick={() => handleAddToDictionary(activePopoverIssue)}
              className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>{t('addToDictionary')}</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Personal Dictionary Drawer / Modal */}
      {showPersonalDictModal && createPortal(
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#121212] rounded-3xl border border-[#1A1A1A]/20 dark:border-white/20 p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1A1A1A]/10 dark:border-white/10">
              <div className="flex items-center gap-2">
                <BookMarked className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  {t('personalDictionary')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPersonalDictModal(false)}
                className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 opacity-60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs opacity-70">
              {t('wordsInDictionary', { count: dictWords.length })}
            </p>

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {dictWords.length === 0 ? (
                <div className="p-4 text-center text-xs opacity-50 italic">
                  Nenhuma palavra personalizada salva ainda.
                </div>
              ) : (
                dictWords.map((w) => (
                  <div
                    key={w}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#F5F5F0] dark:bg-[#1A1A1A] text-xs font-mono font-bold"
                  >
                    <span>{w}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = dictWords.filter((item) => item !== w);
                        localStorage.setItem(
                          'inkora_personal_dictionary',
                          JSON.stringify(updated),
                        );
                        setDictWords(updated);
                      }}
                      className="p-1 text-red-500 hover:text-red-700"
                      title="Remover do dicionário"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-[#1A1A1A]/10 dark:border-white/10">
              {dictWords.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearPersonalDictionary();
                    setDictWords([]);
                  }}
                  className="text-xs font-bold text-red-500 hover:underline"
                >
                  {t('clearPersonalDictionary')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowPersonalDictModal(false)}
                className="ml-auto px-4 py-2 rounded-xl bg-[#1A1A1A] text-white dark:bg-[#F5F5F0] dark:text-[#1A1A1A] text-xs font-bold uppercase tracking-wider"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
