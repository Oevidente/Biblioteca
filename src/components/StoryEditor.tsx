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
  Search,
  Heart,
  RotateCcw,
  RotateCw,
  Palette,
  Baseline,
  ImagePlus,
  Loader2,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  runSpellCheckOnPages,
  checkWithLanguageTool,
  addToPersonalDictionary,
  getPersonalDictionary,
  clearPersonalDictionary,
  ignoreWordInSession,
  isWordIgnored,
  detectLanguageFromText,
  commonTypoRules,
  getCorrectionForWord,
  clearIgnoredWords,
  getIgnoredWordsCount,
  ReviewIssue,
  ReviewLanguage,
  IssueCategory,
} from '../lib/spellChecker';
import { cleanStoryHtml } from '../lib/cleanStoryHtml';
import { paginateHtmlByWords } from '../lib/storyPagination';
import { StoryContent } from './StoryContent';
import {
  compressImageToDataUrl,
  buildImageHtml,
  normalizeEditorImages,
  splitOversizedPages,
} from '../lib/storyImages';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StoryEditorProps {
  initialPages?: string[];
  onChange: (pages: string[], fullText: string, wordCount: number) => void;
  className?: string;
  supporters?: string[] | string;
  renderReaderPreview?: (pages: string[]) => React.ReactNode;
}

export function StoryEditor({
  initialPages = [],
  onChange,
  className,
  supporters,
  renderReaderPreview,
}: StoryEditorProps) {
  const { t, language } = useLanguage();
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionToolbarRef = useRef<HTMLDivElement>(null);
  const draggedImageRef = useRef<{
    image: HTMLImageElement;
    preview: HTMLImageElement | null;
    pointerId: number;
    startX: number;
    startY: number;
    originParent: Node;
    originNextSibling: Node | null;
    active: boolean;
  } | null>(null);
  const isResizingImageRef = useRef(false);
  const suppressImageClickRef = useRef(false);
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(
    null,
  );
  const [selectedImageWidth, setSelectedImageWidth] = useState(55);
  const [selectedImageWidthInput, setSelectedImageWidthInput] = useState('55');
  const [selectionToolbarPosition, setSelectionToolbarPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

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
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('inkora_toolbar_collapsed') === 'true';
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        'inkora_toolbar_collapsed',
        String(isToolbarCollapsed),
      );
    } catch (e) {}
  }, [isToolbarCollapsed]);

  // Advanced Typography & Themes synced with Reader
  const [fontFamily, setFontFamily] = useState<
    'serif' | 'sans' | 'opendyslexic'
  >(() => {
    try {
      return (localStorage.getItem('inkora_font_family') as any) || 'serif';
    } catch (e) {
      return 'serif';
    }
  });

  const [lineSpacing, setLineSpacing] = useState<
    'compact' | 'relaxed' | 'loose'
  >(() => {
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

  const [autoCorrectEnabled, setAutoCorrectEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('inkora_autocorrect_enabled');
      return saved !== 'false';
    } catch (e) {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        'inkora_autocorrect_enabled',
        String(autoCorrectEnabled),
      );
    } catch (e) {
      console.error(e);
    }
  }, [autoCorrectEnabled]);
  const [mobileTab, setMobileTab] = useState<
    'style' | 'format' | 'align' | 'insert' | 'review'
  >('format');

  // Review & Spellcheck State
  const [reviewLanguage, setReviewLanguage] = useState<ReviewLanguage>(
    language as ReviewLanguage,
  );

  // Sync spell check language with global site language on change
  useEffect(() => {
    if (language) {
      setReviewLanguage(language as ReviewLanguage);
    }
  }, [language]);
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
  const [ignoredCount, setIgnoredCount] = useState<number>(0);
  const [isFallbackMode, setIsFallbackMode] = useState<boolean>(false);
  const [isCheckingLanguageTool, setIsCheckingLanguageTool] =
    useState<boolean>(false);

  // Resolved / processed issues tracking (RF-22)
  const resolvedIssuesRef = useRef<Set<string>>(new Set());
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);

  const getIssueSignature = (issue: ReviewIssue): string => {
    return `${issue.pageIndex}_${issue.paragraphIndex}_${issue.wordOffset}_${issue.word.toLowerCase()}`;
  };

  useEffect(() => {
    setIgnoredCount(getIgnoredWordsCount());
  }, []);

  const [toastMessage, setToastMessage] = useState<string>('');

  // Text Color Picker (RF-19) & Recent Colors
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('inkora_recent_colors');
      return saved
        ? JSON.parse(saved)
        : ['#000000', '#DC2626', '#2563EB', '#16A34A', '#D97706', '#7C3AED'];
    } catch (e) {
      return ['#000000', '#DC2626', '#2563EB', '#16A34A', '#D97706', '#7C3AED'];
    }
  });

  const handleApplyColor = (color: string) => {
    executeCommand('foreColor', color);
    setRecentColors((prev) => {
      const filtered = prev.filter(
        (c) => c.toLowerCase() !== color.toLowerCase(),
      );
      const updated = [color, ...filtered].slice(0, 10);
      try {
        localStorage.setItem('inkora_recent_colors', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        colorPickerRef.current &&
        !colorPickerRef.current.contains(e.target as Node)
      ) {
        setShowColorPicker(false);
      }
    };
    if (showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorPicker]);

  const PREDEFINED_COLORS = [
    '#000000',
    '#434343',
    '#666666',
    '#999999',
    '#B7B7B7',
    '#CCCCCC',
    '#D9D9D9',
    '#EFEFEF',
    '#F3F3F3',
    '#FFFFFF',
    '#980000',
    '#FF0000',
    '#FF9900',
    '#FFFF00',
    '#00FF00',
    '#00FFFF',
    '#4A86E8',
    '#0000FF',
    '#9900FF',
    '#FF00FF',
    '#E6B8AF',
    '#F4CCCC',
    '#FCE5CD',
    '#FFF2CC',
    '#D9EAD3',
    '#D0E0E3',
    '#C9DAF8',
    '#CFE2F3',
    '#D9D2E9',
    '#EAD1DC',
    '#DD7E6B',
    '#EA9999',
    '#F9CB9C',
    '#FFE599',
    '#B6D7A8',
    '#A2C4C9',
    '#A4C2F4',
    '#9FC5E8',
    '#B4A7D6',
    '#D5A6BD',
    '#CC4125',
    '#E06666',
    '#F6B26B',
    '#FFD966',
    '#93C47D',
    '#76A5AF',
    '#6D9EEB',
    '#6FA8DC',
    '#8E7CC3',
    '#C27BA0',
    '#A61C00',
    '#CC0000',
    '#E69138',
    '#F1C232',
    '#6AA84F',
    '#45818E',
    '#3C78D8',
    '#3D85C6',
    '#674EA7',
    '#A64D79',
    '#85200C',
    '#990000',
    '#B45F06',
    '#BF9000',
    '#38761D',
    '#134F5C',
    '#1155CC',
    '#0B5394',
    '#351C75',
    '#741B47',
    '#5B0F00',
    '#660000',
    '#783F04',
    '#7F6000',
    '#274E13',
    '#0C343D',
    '#1C4587',
    '#073763',
    '#20124D',
    '#4C1130',
  ];

  // Local Search Tool (Ctrl + F / Cmd + F) States (RF-12, RF-13)
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
  const [searchMatches, setSearchMatches] = useState<HTMLElement[]>([]);

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

  const updateSelectionToolbar = useCallback(() => {
    if (isResizingImageRef.current) return;
    const editor = editorRef.current;
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;
    const focusNode = selection?.focusNode;

    if (activeTab !== 'edit' || !editor) {
      setSelectionToolbarPosition(null);
      return;
    }

    const hasTextSelection = Boolean(
      selection &&
      selection.rangeCount > 0 &&
      !selection.isCollapsed &&
      anchorNode &&
      focusNode &&
      editor.contains(anchorNode) &&
      editor.contains(focusNode),
    );
    const imageIsSelected = Boolean(
      selectedImage && editor.contains(selectedImage),
    );

    if (!hasTextSelection && !imageIsSelected) {
      setSelectionToolbarPosition(null);
      return;
    }

    const rect = hasTextSelection
      ? selection!.getRangeAt(0).getBoundingClientRect()
      : selectedImage!.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      setSelectionToolbarPosition(null);
      return;
    }

    const toolbarWidth =
      selectionToolbarRef.current?.offsetWidth ??
      Math.min(520, window.innerWidth - 24);
    const halfWidth = Math.min(toolbarWidth / 2, (window.innerWidth - 24) / 2);
    const selectionCenter = rect.left + rect.width / 2;
    const left = Math.min(
      window.innerWidth - halfWidth - 12,
      Math.max(halfWidth + 12, selectionCenter),
    );

    setSelectionToolbarPosition({
      top: rect.top > 56 ? rect.top - 48 : rect.bottom + 8,
      left,
    });
  }, [activeTab, selectedImage]);

  useEffect(() => {
    const refreshPosition = () => updateSelectionToolbar();
    document.addEventListener('selectionchange', refreshPosition);
    window.addEventListener('resize', refreshPosition);
    window.addEventListener('scroll', refreshPosition, true);
    refreshPosition();

    return () => {
      document.removeEventListener('selectionchange', refreshPosition);
      window.removeEventListener('resize', refreshPosition);
      window.removeEventListener('scroll', refreshPosition, true);
    };
  }, [updateSelectionToolbar]);

  // Clicar fora do editor e da barra flutuante desmarca a imagem selecionada
  useEffect(() => {
    if (!selectedImage) return;
    const onDocumentPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        editorRef.current?.contains(target) ||
        selectionToolbarRef.current?.contains(target)
      ) {
        return;
      }
      selectedImage.classList.remove('story-image-selected');
      setSelectedImage(null);
    };
    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () =>
      document.removeEventListener('pointerdown', onDocumentPointerDown);
  }, [selectedImage]);

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
  const processHtmlIntoPagesBase = (
    html: string,
  ): { pages: string[]; wordCount: number; cleanText: string } => {
    const cleanedHtml = cleanStoryHtml(html);
    const hasManualBreaks =
      cleanedHtml.includes('class="page-break-marker"') ||
      html.includes('class="page-break-marker"');

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = cleanedHtml;

    const markers = tempDiv.querySelectorAll('.page-break-marker');
    markers.forEach((m) => m.remove());

    const cleanText = tempDiv.textContent || tempDiv.innerText || '';
    const words = cleanText
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    const wordCount = words.length;

    if (hasManualBreaks) {
      const rawParts = cleanedHtml.split(
        /<div class="page-break-marker"[^>]*>.*?<\/div>/gi,
      );
      const pages = rawParts
        .map((p) => cleanStoryHtml(p.trim()))
        .filter(
          (p) => p.length > 0 && p !== '<p><br></p>' && p !== '<p><br/></p>',
        );

      return {
        pages: pages.length > 0 ? pages : [cleanedHtml || '<p></p>'],
        wordCount,
        cleanText,
      };
    }

    if (autoPagination && wordsPerPage > 0) {
      const pages = paginateHtmlByWords(cleanedHtml, wordsPerPage + 50).map(
        cleanStoryHtml,
      );

      return {
        pages,
        wordCount,
        cleanText,
      };
    }

    return {
      pages: [cleanedHtml || '<p></p>'],
      wordCount,
      cleanText,
    };
  };

  // Garante que nenhuma página passe do limite de tamanho do Firestore (imagens pesam)
  const processHtmlIntoPages = (
    html: string,
  ): { pages: string[]; wordCount: number; cleanText: string } => {
    const result = processHtmlIntoPagesBase(html);
    return { ...result, pages: splitOversizedPages(result.pages) };
  };

  // Run async LanguageTool / spellcheck with 1.8s debounce (RF-15, RF-16)
  const spellCheckTimer = useRef<NodeJS.Timeout | null>(null);
  const triggerSpellCheck = useCallback(
    (pagesToScan: string[]) => {
      if (spellCheckTimer.current) clearTimeout(spellCheckTimer.current);
      setIsCheckingLanguageTool(true);
      spellCheckTimer.current = setTimeout(async () => {
        try {
          const result = await checkWithLanguageTool(
            pagesToScan,
            reviewLanguage,
          );
          const filtered = result.issues.filter(
            (i) =>
              !resolvedIssuesRef.current.has(i.id) &&
              !resolvedIssuesRef.current.has(getIssueSignature(i)) &&
              !resolvedIssuesRef.current.has(i.word.toLowerCase()) &&
              !isWordIgnored(i.word),
          );
          setIssues(filtered);
          setIsFallbackMode(result.isFallback);
        } catch (e) {
          console.warn('Spellcheck execution error, using local fallback:', e);
          const fallbackIssues = runSpellCheckOnPages(
            pagesToScan,
            reviewLanguage,
          );
          const filtered = fallbackIssues.filter(
            (i) =>
              !resolvedIssuesRef.current.has(i.id) &&
              !resolvedIssuesRef.current.has(getIssueSignature(i)) &&
              !resolvedIssuesRef.current.has(i.word.toLowerCase()) &&
              !isWordIgnored(i.word),
          );
          setIssues(filtered);
          setIsFallbackMode(true);
        } finally {
          setIsCheckingLanguageTool(false);
        }
      }, 1800);
    },
    [reviewLanguage],
  );

  const handleContentChange = () => {
    if (!editorRef.current) return;
    const selectedImages = editorRef.current.querySelectorAll(
      'img.story-image-selected',
    );
    selectedImages.forEach((image) =>
      image.classList.remove('story-image-selected'),
    );
    const currentHtml = editorRef.current.innerHTML;
    selectedImages.forEach((image) =>
      image.classList.add('story-image-selected'),
    );

    const { pages, wordCount, cleanText } = processHtmlIntoPages(currentHtml);
    setComputedPages(pages);
    setTotalWords(wordCount);
    onChange(pages, cleanText, wordCount);

    triggerSpellCheck(pages);
  };

  // ---------- Imagens no texto ----------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [isInsertingImage, setIsInsertingImage] = useState(false);
  const [imageError, setImageError] = useState('');

  const saveSelection = () => {
    const sel = window.getSelection();
    if (
      sel &&
      sel.rangeCount > 0 &&
      editorRef.current?.contains(sel.anchorNode)
    ) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (savedRangeRef.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  };

  const insertImageFiles = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0 || !editorRef.current) return;

    setIsInsertingImage(true);
    setImageError('');
    try {
      const dataUrls: string[] = [];
      for (const file of images) {
        try {
          dataUrls.push(await compressImageToDataUrl(file));
        } catch (err) {
          console.error('Erro ao processar imagem:', err);
          setImageError(t('imageInsertError'));
        }
      }
      if (dataUrls.length === 0) return;

      restoreSelection();
      document.execCommand(
        'insertHTML',
        false,
        dataUrls.map(buildImageHtml).join(''),
      );
      editorRef.current.querySelectorAll('img').forEach((image) => {
        image.draggable = false;
      });
      handleContentChange();
    } finally {
      setIsInsertingImage(false);
    }
  };

  const handleEditorPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const clipboard = e.clipboardData;
    if (!clipboard) return;

    let imageFiles = (Array.from(clipboard.files || []) as File[]).filter((f) =>
      f.type.startsWith('image/'),
    );
    if (imageFiles.length === 0) {
      imageFiles = (Array.from(clipboard.items || []) as DataTransferItem[])
        .filter(
          (item) => item.kind === 'file' && item.type.startsWith('image/'),
        )
        .map((item) => item.getAsFile())
        .filter((f): f is File => f !== null);
    }

    // Print ou "copiar imagem": só tem imagem na área de transferência.
    // A gente mesmo insere a versão comprimida.
    if (imageFiles.length > 0 && !clipboard.getData('text/plain').trim()) {
      e.preventDefault();
      saveSelection();
      insertImageFiles(imageFiles);
      return;
    }

    // Colagem normal (texto, Word, site): o navegador cola como sempre e depois
    // a gente comprime qualquer imagem pesada que tenha vindo junto.
    window.setTimeout(async () => {
      const editor = editorRef.current;
      if (!editor) return;
      const changed = await normalizeEditorImages(editor);
      editor.querySelectorAll('img').forEach((image) => {
        image.draggable = false;
      });
      if (changed) handleContentChange();
    }, 0);
  };

  const handleEditorDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const files = (Array.from(e.dataTransfer?.files || []) as File[]).filter(
      (f) => f.type.startsWith('image/'),
    );
    if (files.length === 0) return;
    e.preventDefault();

    // Descobre onde o arquivo foi solto pra inserir ali
    let range: Range | null = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    } else if ((document as any).caretPositionFromPoint) {
      const pos = (document as any).caretPositionFromPoint(
        e.clientX,
        e.clientY,
      );
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }
    if (range && editorRef.current?.contains(range.startContainer)) {
      savedRangeRef.current = range;
    }
    insertImageFiles(files);
  };

  const getCaretRangeAtPoint = (x: number, y: number): Range | null => {
    if (document.caretRangeFromPoint) {
      return document.caretRangeFromPoint(x, y);
    }
    if ((document as any).caretPositionFromPoint) {
      const position = (document as any).caretPositionFromPoint(x, y);
      if (position) {
        const range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
        return range;
      }
    }
    return null;
  };

  const handleEditorPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target;
    if (
      !(target instanceof HTMLImageElement) ||
      !editorRef.current?.contains(target)
    ) {
      return;
    }

    e.preventDefault();

    const previousImage = selectedImage;
    previousImage?.classList.remove('story-image-selected');
    target.classList.add('story-image-selected');
    target.draggable = false;
    window.getSelection()?.removeAllRanges();
    const width = getImageWidthPercent(target);
    setSelectedImage(target);
    setSelectedImageWidth(width);
    setSelectedImageWidthInput(String(width));
    draggedImageRef.current = {
      image: target,
      preview: null,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originParent: target.parentNode!,
      originNextSibling: target.nextSibling,
      active: false,
    };
  };

  const handleEditorPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = draggedImageRef.current;
    const editor = editorRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !editor) return;

    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 8) {
        return;
      }

      // O arraste de verdade começou: agora sim captura o ponteiro
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}

      const preview = drag.image.cloneNode(true) as HTMLImageElement;
      preview.draggable = false;
      preview.classList.add('story-image-drag-preview');
      preview.style.opacity = '0.72';
      preview.style.outline = '2px dashed #D97706';
      preview.style.outlineOffset = '3px';
      preview.style.pointerEvents = 'none';
      drag.image.parentNode?.replaceChild(preview, drag.image);
      drag.preview = preview;
      drag.active = true;
      setSelectedImage(preview);
      setSelectionToolbarPosition(null);
    }

    const preview = drag.preview;
    const range = getCaretRangeAtPoint(e.clientX, e.clientY);
    if (
      !preview ||
      !range ||
      !editor.contains(range.startContainer) ||
      preview.contains(range.startContainer) ||
      (range.startContainer instanceof Element &&
        range.startContainer.closest('[contenteditable="false"]'))
    ) {
      return;
    }

    e.preventDefault();
    try {
      range.insertNode(preview);
    } catch {
      return;
    }
  };

  const finishEditorImageDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    cancelled = false,
  ) => {
    const drag = draggedImageRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    draggedImageRef.current = null;

    if (drag.active && drag.preview) {
      suppressImageClickRef.current = true;
      window.setTimeout(() => {
        suppressImageClickRef.current = false;
      }, 0);
      if (cancelled) {
        const originParent = drag.originParent;
        const nextSibling = drag.originNextSibling;
        if (originParent.isConnected) {
          originParent.insertBefore(
            drag.image,
            nextSibling?.parentNode === originParent ? nextSibling : null,
          );
        }
        drag.preview.remove();
      } else {
        drag.preview.replaceWith(drag.image);
      }
      drag.image.draggable = false;
      drag.image.classList.add('story-image-selected');
      setSelectedImage(drag.image);
      const width = getImageWidthPercent(drag.image);
      setSelectedImageWidth(width);
      setSelectedImageWidthInput(String(width));
      handleContentChange();
    }

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    updateSelectionToolbar();
  };

  const handleEditorDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
    }
  };

  useEffect(() => {
    if (editorRef.current && !isInitialized.current) {
      const html = getInitialHtml();
      editorRef.current.innerHTML = html;
      editorRef.current.querySelectorAll('img').forEach((image) => {
        image.draggable = false;
      });
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

  // Search Logic and Highlight Management (RF-12, RF-13)
  const highlightSearchTerm = (
    container: HTMLElement,
    query: string,
    activeIndex: number,
  ): HTMLElement[] => {
    removeHighlights(container);

    if (!query) return [];

    const matches: HTMLElement[] = [];
    const walk = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null,
    );
    const textNodes: Node[] = [];
    let node: Node | null;
    while ((node = walk.nextNode())) {
      if (node.parentElement?.closest('[contenteditable="false"]')) continue;
      textNodes.push(node);
    }

    const queryLower = query.toLowerCase();

    for (const textNode of textNodes) {
      const text = textNode.textContent || '';
      let index = text.toLowerCase().indexOf(queryLower);
      if (index === -1) continue;

      const parent = textNode.parentNode;
      if (!parent) continue;

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;

      while (index !== -1) {
        if (index > lastIndex) {
          fragment.appendChild(
            document.createTextNode(text.substring(lastIndex, index)),
          );
        }

        const mark = document.createElement('mark');
        mark.className =
          'editor-search-match px-0.5 rounded-sm bg-blue-200 dark:bg-blue-500/30 text-inherit transition-all duration-150';
        mark.setAttribute('data-search-term', query);
        mark.textContent = text.substring(index, index + query.length);
        fragment.appendChild(mark);
        matches.push(mark);

        lastIndex = index + query.length;
        index = text.toLowerCase().indexOf(queryLower, lastIndex);
      }

      if (lastIndex < text.length) {
        fragment.appendChild(
          document.createTextNode(text.substring(lastIndex)),
        );
      }

      parent.replaceChild(fragment, textNode);
    }

    if (
      matches.length > 0 &&
      activeIndex >= 0 &&
      activeIndex < matches.length
    ) {
      const activeMark = matches[activeIndex];
      activeMark.classList.remove('bg-blue-200', 'dark:bg-blue-500/30');
      activeMark.classList.add(
        'bg-blue-500',
        'text-white',
        'dark:bg-blue-400',
        'ring-2',
        'ring-blue-600',
        'font-bold',
      );

      activeMark.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }

    return matches;
  };

  const removeHighlights = (container: HTMLElement) => {
    const marks = container.querySelectorAll('mark.editor-search-match');
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        const textNode = document.createTextNode(mark.textContent || '');
        parent.replaceChild(textNode, mark);
      }
    });
    container.normalize();
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentMatchIndex(0);
    if (editorRef.current) {
      const matches = highlightSearchTerm(editorRef.current, query, 0);
      setSearchMatches(matches);
    }
  };

  const handleSearchNext = () => {
    if (searchMatches.length === 0) return;
    const nextIndex = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(nextIndex);
    if (editorRef.current) {
      highlightSearchTerm(editorRef.current, searchQuery, nextIndex);
    }
  };

  const handleSearchPrev = () => {
    if (searchMatches.length === 0) return;
    const prevIndex =
      (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(prevIndex);
    if (editorRef.current) {
      highlightSearchTerm(editorRef.current, searchQuery, prevIndex);
    }
  };

  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchMatches([]);
    setCurrentMatchIndex(0);
    if (editorRef.current) {
      removeHighlights(editorRef.current);
    }
  };

  const handleEditorFocus = () => {
    if (searchQuery) {
      handleCloseSearch();
    }
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressImageClickRef.current) return;
    handleEditorFocus();
    const target = e.target;
    selectedImage?.classList.remove('story-image-selected');
    if (target instanceof HTMLImageElement) {
      target.draggable = false;
      target.classList.add('story-image-selected');
      const width = getImageWidthPercent(target);
      setSelectedImageWidth(width);
      setSelectedImageWidthInput(String(width));
    } else {
      setSelectedImageWidth(55);
      setSelectedImageWidthInput('55');
    }
    setSelectedImage(target instanceof HTMLImageElement ? target : null);
  };

  const getImageWidthPercent = (image: HTMLImageElement) => {
    const inlineWidth = Number.parseFloat(image.style.width);
    if (image.style.width.endsWith('%') && Number.isFinite(inlineWidth)) {
      return Math.max(15, Math.min(100, Math.round(inlineWidth)));
    }

    const editor = editorRef.current;
    if (!editor) return 55;
    const editorStyle = window.getComputedStyle(editor);
    const contentWidth =
      editor.clientWidth -
      Number.parseFloat(editorStyle.paddingLeft) -
      Number.parseFloat(editorStyle.paddingRight);
    if (!contentWidth) return 55;
    return Math.max(
      15,
      Math.min(
        100,
        Math.round((image.getBoundingClientRect().width / contentWidth) * 100),
      ),
    );
  };

  const applySelectedImageWidth = (width: number, save = true) => {
    const image = selectedImage;
    if (!image || !editorRef.current?.contains(image)) return;
    const safeWidth = Math.max(15, Math.min(100, Math.round(width)));
    image.draggable = false;
    image.style.width = `${safeWidth}%`;
    image.style.maxWidth = '100%';
    setSelectedImageWidth(safeWidth);
    setSelectedImageWidthInput(String(safeWidth));
    if (save) handleContentChange();
    updateSelectionToolbar();
  };

  const setSelectedImagePosition = (position: 'left' | 'center' | 'right') => {
    const image = selectedImage;
    if (!image || !editorRef.current?.contains(image)) return;

    image.draggable = false;
    image.style.float = position === 'center' ? 'none' : position;
    image.style.width = `${selectedImageWidth}%`;
    image.style.margin =
      position === 'left'
        ? '0.5rem 1rem 0.75rem 0'
        : position === 'right'
          ? '0.5rem 0 0.75rem 1rem'
          : '1rem auto';

    handleContentChange();
    updateSelectionToolbar();
  };

  // Keyboard shortcut listener (RF-12, RF-13)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => {
          const input = document.getElementById(
            'editor-search-input',
          ) as HTMLInputElement;
          if (input) {
            input.focus();
            input.select();
          }
        }, 100);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Helper to remove any active temporary review highlight mark from the DOM cleanly (RF-18, RF-21, RF-22)
  const clearActiveHighlight = () => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    if (!editorRef.current) return;
    const marks = editorRef.current.querySelectorAll(
      'mark.review-highlight-temp',
    );
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        const textNode = document.createTextNode(mark.textContent || '');
        parent.replaceChild(textNode, mark);
        parent.normalize();
      }
    });
  };

  // Perform atomic text replacement strictly at the target word's DOM range (RF-21, RF-23)
  const applySuggestionToDom = (
    issue: ReviewIssue,
    suggestion: string,
  ): boolean => {
    if (!editorRef.current) return false;

    // 1. Clear any active temporary highlights or search marks to keep text nodes clean
    clearActiveHighlight();
    removeHighlights(editorRef.current);

    // 2. Find all valid text nodes in the editor canvas
    const textNodes: Text[] = [];
    const walk = document.createTreeWalker(
      editorRef.current,
      NodeFilter.SHOW_TEXT,
      null,
    );
    let n: Node | null;
    while ((n = walk.nextNode())) {
      if (n.parentElement?.closest('[contenteditable="false"]')) continue;
      textNodes.push(n as Text);
    }

    let targetNode: Text | null = null;
    let targetStartOffset = -1;

    // Exact word matching in text nodes
    for (const tNode of textNodes) {
      const content = tNode.textContent || '';
      const idx = content.indexOf(issue.word);
      if (idx !== -1) {
        targetNode = tNode;
        targetStartOffset = idx;
        break;
      }
    }

    // Fallback: case-insensitive match
    if (!targetNode) {
      const lowerWord = issue.word.toLowerCase();
      for (const tNode of textNodes) {
        const content = (tNode.textContent || '').toLowerCase();
        const idx = content.indexOf(lowerWord);
        if (idx !== -1) {
          targetNode = tNode;
          targetStartOffset = idx;
          break;
        }
      }
    }

    if (targetNode && targetStartOffset !== -1) {
      try {
        editorRef.current.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.setStart(targetNode, targetStartOffset);
        range.setEnd(targetNode, targetStartOffset + issue.word.length);

        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }

        // Use native execCommand('insertText') to ensure the replacement is atomic
        // and seamlessly registered in the browser's native Undo/Redo stack (Ctrl+Z)
        const commandSucceeded = document.execCommand(
          'insertText',
          false,
          suggestion,
        );
        if (!commandSucceeded) {
          // Fallback in case execCommand is not available
          const text = targetNode.textContent || '';
          targetNode.textContent =
            text.slice(0, targetStartOffset) +
            suggestion +
            text.slice(targetStartOffset + issue.word.length);
          targetNode.parentElement?.normalize();
        }
        return true;
      } catch (err) {
        console.warn('Atomic DOM replacement error:', err);
      }
    }

    return false;
  };

  // Replace misspelled word in editor content atomically (RF-21, RF-22, RF-23)
  const handleApplySuggestion = (issue: ReviewIssue, suggestion: string) => {
    if (!editorRef.current) return;

    // 1. Perform atomic substitution directly in DOM Range
    applySuggestionToDom(issue, suggestion);

    // 2. Track as resolved so it never re-appears in current session or on scroll (RF-22)
    resolvedIssuesRef.current.add(issue.id);
    resolvedIssuesRef.current.add(getIssueSignature(issue));
    resolvedIssuesRef.current.add(issue.word.toLowerCase());

    // 3. Immediately remove from active issues state (RF-22)
    setIssues((prev) =>
      prev.filter(
        (i) =>
          i.id !== issue.id &&
          !resolvedIssuesRef.current.has(i.id) &&
          !resolvedIssuesRef.current.has(getIssueSignature(i)),
      ),
    );

    // 4. Close floating popovers
    setActivePopoverIssue(null);
    setPopoverPosition(null);

    // 5. Trigger content update and user toast
    handleContentChange();
    showToast(t('applySuggestion') + `: ${issue.word} ➔ ${suggestion}`);
  };

  const getCaretCharacterOffsetWithin = (element: HTMLElement): number => {
    let caretOffset = 0;
    const doc = element.ownerDocument || document;
    const win = doc.defaultView || window;
    let sel;
    if (typeof win.getSelection !== 'undefined') {
      sel = win.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(element);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        caretOffset = preCaretRange.toString().length;
      }
    }
    return caretOffset;
  };

  const setCaretPosition = (element: HTMLElement, offset: number) => {
    const range = document.createRange();
    const sel = window.getSelection();
    let currentOffset = 0;
    let found = false;

    const traverse = (node: Node) => {
      if (found) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const len = node.textContent?.length || 0;
        if (currentOffset + len >= offset) {
          try {
            range.setStart(node, offset - currentOffset);
            range.setEnd(node, offset - currentOffset);
            found = true;
          } catch (e) {}
        } else {
          currentOffset += len;
        }
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          traverse(node.childNodes[i]);
          if (found) break;
        }
      }
    };

    traverse(element);
    if (sel && found) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Synchronize Undo/Redo (Ctrl+Z / Ctrl+Y) with editor state (RF-23)
    if (
      (e.ctrlKey || e.metaKey) &&
      (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')
    ) {
      clearActiveHighlight();
      setTimeout(() => {
        handleContentChange();
      }, 10);
      return;
    }

    if (!autoCorrectEnabled) return;

    const triggerKeys = [' ', 'Enter', '.', ',', '!', '?', ';', ':'];
    if (!triggerKeys.includes(e.key)) return;

    try {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const textNode = range.startContainer;

      if (textNode.nodeType === Node.TEXT_NODE) {
        const text = textNode.textContent || '';
        const offset = range.startOffset;

        const beforeCaretText = text.slice(0, offset);

        // RF-14: Dialogue dash auto-substitution (- to —)
        if (e.key === ' ' && beforeCaretText.endsWith('-')) {
          const hasSpaceBefore =
            beforeCaretText.length > 1 &&
            /[ \u00a0\t]/.test(
              beforeCaretText.charAt(beforeCaretText.length - 2),
            );
          if (!hasSpaceBefore) {
            e.preventDefault();
            const startOfHyphenIdx = offset - 1;
            const replacement = '— ';
            const newText =
              text.slice(0, startOfHyphenIdx) +
              replacement +
              text.slice(offset);
            textNode.textContent = newText;

            const newOffset = startOfHyphenIdx + replacement.length;
            const newRange = document.createRange();
            newRange.setStart(textNode, newOffset);
            newRange.setEnd(textNode, newOffset);
            selection.removeAllRanges();
            selection.addRange(newRange);

            handleContentChange();
            return;
          }
        }

        const wordMatch = beforeCaretText.match(/([a-zA-ZÀ-ÿ\-']+)$/);
        if (wordMatch) {
          const lastWord = wordMatch[1];
          const cleanWord = lastWord.toLowerCase();

          const currentTextForLang = editorRef.current?.innerText || '';
          const lang =
            reviewLanguage === 'auto'
              ? detectLanguageFromText(currentTextForLang)
              : reviewLanguage;
          const suggestion = getCorrectionForWord(cleanWord, lang);

          if (suggestion) {
            let finalCorrection = suggestion;
            if (lastWord === lastWord.toUpperCase()) {
              finalCorrection = suggestion.toUpperCase();
            } else if (lastWord[0] === lastWord[0].toUpperCase()) {
              finalCorrection =
                suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
            }

            const startOfWordIdx = offset - lastWord.length;
            const newText =
              text.slice(0, startOfWordIdx) +
              finalCorrection +
              text.slice(offset);

            textNode.textContent = newText;

            const newOffset = startOfWordIdx + finalCorrection.length;
            const newRange = document.createRange();
            newRange.setStart(textNode, newOffset);
            newRange.setEnd(textNode, newOffset);
            selection.removeAllRanges();
            selection.addRange(newRange);

            handleContentChange();
          }
        }
      }
    } catch (err) {
      console.warn('Autocorrect error:', err);
    }
  };

  const handleAutoCorrectAll = () => {
    if (!editorRef.current) return;

    const textContent = editorRef.current.innerText || '';
    const lang =
      reviewLanguage === 'auto'
        ? detectLanguageFromText(textContent)
        : reviewLanguage;

    let correctionCount = 0;

    const traverseAndCorrect = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        let text = node.textContent || '';
        const wordRegex = /\b([a-zA-ZÀ-ÿ\-']+)\b/g;
        let match;
        const replacements: {
          index: number;
          length: number;
          word: string;
          correction: string;
        }[] = [];

        while ((match = wordRegex.exec(text)) !== null) {
          const rawWord = match[1];
          const cleanWord = rawWord.toLowerCase();

          const suggestion = getCorrectionForWord(cleanWord, lang);
          if (suggestion) {
            let finalCorrection = suggestion;
            if (cleanWord !== suggestion) {
              if (rawWord === rawWord.toUpperCase()) {
                finalCorrection = suggestion.toUpperCase();
              } else if (rawWord[0] === rawWord[0].toUpperCase()) {
                finalCorrection =
                  suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
              }
              replacements.push({
                index: match.index,
                length: rawWord.length,
                word: rawWord,
                correction: finalCorrection,
              });
            }
          }
        }

        if (replacements.length > 0) {
          for (let i = replacements.length - 1; i >= 0; i--) {
            const r = replacements[i];
            text =
              text.slice(0, r.index) +
              r.correction +
              text.slice(r.index + r.length);
            correctionCount++;
          }
          node.textContent = text;
        }
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          traverseAndCorrect(node.childNodes[i]);
        }
      }
    };

    let savedOffset = 0;
    try {
      savedOffset = getCaretCharacterOffsetWithin(editorRef.current);
    } catch (e) {}

    traverseAndCorrect(editorRef.current);

    if (correctionCount > 0) {
      handleContentChange();
      showToast(
        `${t('autoCorrectAllSuccess')} (${correctionCount} ${t('reviewButton').toLowerCase() === 'revisão' ? (correctionCount === 1 ? 'correção' : 'correções') : 'corrections'})`,
      );

      try {
        if (editorRef.current) {
          setCaretPosition(editorRef.current, savedOffset);
        }
      } catch (e) {}
    } else {
      showToast(t('noErrorsFound'));
    }
  };

  // Ignore word in session (RF-22)
  const handleIgnoreWord = (issue: ReviewIssue) => {
    clearActiveHighlight();
    ignoreWordInSession(issue.word);
    resolvedIssuesRef.current.add(issue.id);
    resolvedIssuesRef.current.add(getIssueSignature(issue));
    resolvedIssuesRef.current.add(issue.word.toLowerCase());
    setIgnoredCount(getIgnoredWordsCount());
    setIssues((prev) =>
      prev.filter(
        (i) =>
          i.id !== issue.id &&
          i.word.toLowerCase() !== issue.word.toLowerCase(),
      ),
    );
    setActivePopoverIssue(null);
    setPopoverPosition(null);
    showToast(t('ignore') + `: "${issue.word}"`);
  };

  const handleRestoreIgnoredWords = () => {
    clearActiveHighlight();
    clearIgnoredWords();
    resolvedIssuesRef.current.clear();
    setIgnoredCount(0);
    if (editorRef.current) {
      handleContentChange();
    }
    showToast(t('ignoredWordsCleared'));
  };

  // Add word to personal dictionary (RF-22)
  const handleAddToDictionary = (issue: ReviewIssue) => {
    clearActiveHighlight();
    addToPersonalDictionary(issue.word);
    resolvedIssuesRef.current.add(issue.id);
    resolvedIssuesRef.current.add(getIssueSignature(issue));
    resolvedIssuesRef.current.add(issue.word.toLowerCase());
    setDictWords(getPersonalDictionary());
    setIssues((prev) =>
      prev.filter(
        (i) =>
          i.id !== issue.id &&
          i.word.toLowerCase() !== issue.word.toLowerCase(),
      ),
    );
    setActivePopoverIssue(null);
    setPopoverPosition(null);
    showToast(t('wordAddedToDictionary') + `: "${issue.word}"`);
  };

  // Scroll to and highlight issue in Editor (CT-03, CT-06, RF-05, RF-18)
  const handleNavigateToIssue = (issue: ReviewIssue) => {
    setActiveTab('edit');
    if (!editorRef.current) return;

    clearActiveHighlight();

    // Search for element containing issue word
    const textNodes: Text[] = [];
    const walk = document.createTreeWalker(
      editorRef.current,
      NodeFilter.SHOW_TEXT,
      null,
    );
    let node: Node | null;
    while ((node = walk.nextNode())) {
      if (node.parentElement?.closest('[contenteditable="false"]')) continue;
      textNodes.push(node as Text);
    }

    let targetNode: Text | null = null;
    let nodeMatchIndex = -1;

    for (const n of textNodes) {
      const text = n.textContent || '';
      const localMatchIndex = text.indexOf(issue.word);
      if (localMatchIndex !== -1) {
        targetNode = n;
        nodeMatchIndex = localMatchIndex;
        break;
      }
    }

    if (!targetNode) {
      const lowerWord = issue.word.toLowerCase();
      for (const n of textNodes) {
        const text = (n.textContent || '').toLowerCase();
        const localMatchIndex = text.indexOf(lowerWord);
        if (localMatchIndex !== -1) {
          targetNode = n;
          nodeMatchIndex = localMatchIndex;
          break;
        }
      }
    }

    if (
      targetNode &&
      targetNode.parentElement &&
      nodeMatchIndex !== -1 &&
      targetNode.parentNode
    ) {
      const text = targetNode.textContent || '';
      const matchIndex = nodeMatchIndex;

      // Create a temporary highlight element for exact word (RF-18)
      const highlightSpan = document.createElement('mark');
      highlightSpan.textContent = text.slice(
        matchIndex,
        matchIndex + issue.word.length,
      );
      highlightSpan.className =
        'review-highlight-temp bg-red-500/30 text-red-700 dark:text-red-300 rounded-sm ring-2 ring-red-500 ring-offset-1 transition-all duration-300 px-0.5';

      const beforeText = document.createTextNode(text.slice(0, matchIndex));
      const afterText = document.createTextNode(
        text.slice(matchIndex + issue.word.length),
      );

      const pNode = targetNode.parentNode;
      pNode.insertBefore(beforeText, targetNode);
      pNode.insertBefore(highlightSpan, targetNode);
      pNode.insertBefore(afterText, targetNode);
      pNode.removeChild(targetNode);

      highlightSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });

      highlightTimerRef.current = setTimeout(() => {
        clearActiveHighlight();
      }, 2500);

      // Position popover near the highlightSpan
      const rect = highlightSpan.getBoundingClientRect();
      setPopoverPosition({
        top: Math.max(80, rect.top - 120),
        left: Math.min(window.innerWidth - 300, Math.max(20, rect.left)),
      });
      setActivePopoverIssue(issue);
      return;
    }

    // Fallback position
    setPopoverPosition({ top: 150, left: 100 });
    setActivePopoverIssue(issue);
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
      )}{' '}
      {/* Top Toolbar Header */}
      <div className="bg-[#F5F5F0] dark:bg-[#0A0A0A] p-2.5 lg:p-3 rounded-2xl border border-[#1A1A1A]/10 dark:border-white/10 space-y-3 max-w-full relative z-30">
        {!isToolbarCollapsed && (
          <>
            {/* RF-20: Unified Responsive Zero-Scroll Toolbar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[#1A1A1A]/10 dark:border-white/10 pb-3 w-full">
              {/* Undo & Redo (RF-23) */}
              <div className="flex items-center bg-white dark:bg-[#1A1A1A] rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 p-0.5">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    clearActiveHighlight();
                    executeCommand('undo');
                  }}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg text-xs"
                  title={t('undo')}
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    clearActiveHighlight();
                    executeCommand('redo');
                  }}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg text-xs"
                  title={t('redo')}
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>
              <div className="hidden sm:block h-5 w-px bg-[#1A1A1A]/10 dark:bg-white/10 mx-0.5" />

              {/* Imagem */}
              <div className="flex items-center bg-white dark:bg-[#1A1A1A] rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 p-0.5">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    saveSelection();
                    fileInputRef.current?.click();
                  }}
                  disabled={isInsertingImage}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg disabled:opacity-40"
                  title={t('insertImage')}
                >
                  {isInsertingImage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ImagePlus className="w-4 h-4" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []) as File[];
                    e.target.value = '';
                    insertImageFiles(files);
                  }}
                />
              </div>

              <div className="hidden sm:block h-5 w-px bg-[#1A1A1A]/10 dark:bg-white/10 mx-0.5" />

              {/* Format selector */}
              <div className="flex items-center bg-white dark:bg-[#1A1A1A] rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 p-0.5">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleFormatBlock('h1');
                  }}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg text-xs font-bold flex items-center gap-1"
                  title={t('formatTitle')}
                >
                  <Heading1 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleFormatBlock('h2');
                  }}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg text-xs font-bold flex items-center gap-1"
                  title={t('formatSubtitle')}
                >
                  <Heading2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleFormatBlock('p');
                  }}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg text-xs font-bold flex items-center gap-1"
                  title={t('formatParagraph')}
                >
                  <Pilcrow className="w-4 h-4" />
                </button>
              </div>

              <div className="hidden sm:block h-5 w-px bg-[#1A1A1A]/10 dark:bg-white/10 mx-0.5" />

              {/* Inline Styles & Color Picker */}
              <div className="flex flex-wrap items-center bg-white dark:bg-[#1A1A1A] rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 p-0.5">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    executeCommand('bold');
                  }}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                  title={t('bold')}
                >
                  <Bold className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    executeCommand('italic');
                  }}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                  title={t('italic')}
                >
                  <Italic className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    executeCommand('underline');
                  }}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                  title={t('underline')}
                >
                  <Underline className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    executeCommand('strikeThrough');
                  }}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                  title={t('strikethrough')}
                >
                  <Strikethrough className="w-4 h-4" />
                </button>

                {/* Text Color Picker (RF-19) */}
                <div className="relative" ref={colorPickerRef}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setShowColorPicker(!showColorPicker);
                    }}
                    className="px-2.5 py-1.5 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg flex items-center gap-1.5 transition-colors border border-transparent hover:border-[#1A1A1A]/10 dark:hover:border-white/10"
                    title={t('textColor')}
                  >
                    <Palette className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-[11px] font-bold uppercase tracking-wider hidden sm:inline">
                      {t('textColor')}
                    </span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </button>

                  {showColorPicker && (
                    <div className="absolute top-full left-0 mt-2 p-3 bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-2xl border border-[#1A1A1A]/15 dark:border-white/15 z-[100] w-64 max-w-[90vw] flex flex-col gap-2.5">
                      {/* Theme Colors */}
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider opacity-60 px-1 mb-1.5">
                          {t('themeColors')}
                        </div>
                        <div className="grid grid-cols-10 gap-1">
                          {PREDEFINED_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleApplyColor(c);
                                setShowColorPicker(false);
                              }}
                              className="w-[18px] h-[18px] rounded-[3px] border border-black/10 dark:border-white/10 hover:scale-125 transition-transform shadow-xs cursor-pointer"
                              style={{ backgroundColor: c }}
                              title={c}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Recent Colors */}
                      {recentColors.length > 0 && (
                        <>
                          <div className="h-px bg-[#1A1A1A]/10 dark:bg-white/10" />
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-wider opacity-60 px-1 mb-1.5">
                              {t('recentColors')}
                            </div>
                            <div className="flex flex-wrap gap-1 px-1">
                              {recentColors.map((rc, idx) => (
                                <button
                                  key={`${rc}-${idx}`}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleApplyColor(rc);
                                    setShowColorPicker(false);
                                  }}
                                  className="w-[18px] h-[18px] rounded-[3px] border border-black/15 dark:border-white/15 hover:scale-125 transition-transform shadow-xs cursor-pointer"
                                  style={{ backgroundColor: rc }}
                                  title={rc}
                                />
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      <div className="h-px bg-[#1A1A1A]/10 dark:bg-white/10" />

                      {/* Custom Color & Reset */}
                      <div className="flex flex-col gap-1">
                        <label className="flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-xl transition-colors border border-[#1A1A1A]/10 dark:border-white/10">
                          <span className="text-xs font-bold">
                            {t('customColor')}
                          </span>
                          <input
                            type="color"
                            onInput={(e) => {
                              handleApplyColor(
                                (e.target as HTMLInputElement).value,
                              );
                            }}
                            className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                          />
                        </label>

                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleApplyColor('#000000');
                            setShowColorPicker(false);
                          }}
                          className="flex items-center justify-between px-2 py-1.5 text-xs font-bold opacity-80 hover:opacity-100 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-xl transition-colors"
                        >
                          <span>{t('defaultColor')}</span>
                          <div className="w-3 h-3 rounded-full bg-black dark:bg-white border border-black/20" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="hidden sm:block h-5 w-px bg-[#1A1A1A]/10 dark:bg-white/10 mx-0.5" />

              {/* Alignments */}
              <div className="flex items-center bg-white dark:bg-[#1A1A1A] rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 p-0.5">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    executeCommand('justifyLeft');
                  }}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                  title={t('alignLeft')}
                >
                  <AlignLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    executeCommand('justifyCenter');
                  }}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                  title={t('alignCenter')}
                >
                  <AlignCenter className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    executeCommand('justifyRight');
                  }}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                  title={t('alignRight')}
                >
                  <AlignRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    executeCommand('justifyFull');
                  }}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                  title={t('alignJustify')}
                >
                  <AlignJustify className="w-4 h-4" />
                </button>
              </div>

              <div className="hidden sm:block h-5 w-px bg-[#1A1A1A]/10 dark:bg-white/10 mx-0.5" />

              {/* Lists & Quotes */}
              <div className="flex items-center bg-white dark:bg-[#1A1A1A] rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 p-0.5">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    executeCommand('insertUnorderedList');
                  }}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                  title={t('bulletList')}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    executeCommand('insertOrderedList');
                  }}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                  title={t('numberList')}
                >
                  <ListOrdered className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleFormatBlock('blockquote');
                  }}
                  className="p-2 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-lg"
                  title={t('quote')}
                >
                  <Quote className="w-4 h-4" />
                </button>
              </div>

              <div className="hidden sm:block h-5 w-px bg-[#1A1A1A]/10 dark:bg-white/10 mx-0.5" />

              {/* Action Tools */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (searchOpen) {
                      handleCloseSearch();
                    } else {
                      setSearchOpen(true);
                      setTimeout(() => {
                        const input = document.getElementById(
                          'editor-search-input',
                        ) as HTMLInputElement;
                        if (input) {
                          input.focus();
                          input.select();
                        }
                      }, 100);
                    }
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 transition-colors',
                    searchOpen
                      ? 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-500/40'
                      : 'bg-white dark:bg-[#1A1A1A] border-[#1A1A1A]/10 dark:border-white/10',
                  )}
                  title={
                    language === 'pt'
                      ? 'Buscar (Ctrl + F)'
                      : language === 'es'
                        ? 'Buscar (Ctrl + F)'
                        : language === 'zh'
                          ? '搜索 (Ctrl + F)'
                          : 'Search (Ctrl + F)'
                  }
                >
                  <Search className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                  <span className="hidden md:inline">
                    {language === 'pt'
                      ? 'Buscar'
                      : language === 'es'
                        ? 'Buscar'
                        : language === 'zh'
                          ? '搜索'
                          : 'Search'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={insertPageBreak}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-[#1A1A1A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl text-xs font-bold hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 transition-colors"
                  title={t('insertPageBreak')}
                >
                  <Split className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                  <span className="hidden md:inline">
                    {t('insertPageBreak')}
                  </span>
                </button>

                {/* Review Button */}
                <button
                  type="button"
                  onClick={() => setShowReviewPanel(!showReviewPanel)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all relative',
                    showReviewPanel
                      ? 'bg-red-600 text-white shadow-md'
                      : issues.length > 0
                        ? 'bg-blue-500/10 text-blue-800 dark:text-blue-300 border border-blue-500/30 hover:bg-blue-500/20'
                        : 'bg-white dark:bg-[#1A1A1A] border border-[#1A1A1A]/10 dark:border-white/10 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5',
                  )}
                  title={t('reviewButton')}
                >
                  <CheckCheck className="w-4 h-4 text-red-500 dark:text-red-400" />
                  <span className="hidden sm:inline">{t('reviewButton')}</span>
                  {issues.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black animate-pulse">
                      {issues.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      {/* Editor / Preview Mode Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1A1A1A]/10 pb-2 text-xs dark:border-white/10">
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

        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {activeTab === 'edit' && (
            <>
              <label className="flex items-center gap-1.5 whitespace-nowrap font-bold select-none">
                <input
                  type="checkbox"
                  checked={autoPagination}
                  onChange={(e) => setAutoPagination(e.target.checked)}
                  className="rounded border-[#1A1A1A]/20 text-[#1A1A1A] focus:ring-0 dark:border-white/20"
                />
                <span>{t('autoPageBreak')}</span>
              </label>
              {autoPagination && (
                <label className="flex items-center gap-1.5 whitespace-nowrap opacity-80">
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    {t('wordsPerPage')}:
                  </span>
                  <select
                    value={wordsPerPage}
                    onChange={(e) => setWordsPerPage(Number(e.target.value))}
                    className="rounded-lg border border-[#1A1A1A]/20 bg-white px-2 py-1 text-xs font-mono font-bold dark:border-white/20 dark:bg-[#1A1A1A]"
                  >
                    <option value={200}>200</option>
                    <option value={300}>300</option>
                    <option value={400}>400</option>
                    <option value={500}>500</option>
                  </select>
                </label>
              )}
              <div className="flex items-center gap-2 whitespace-nowrap font-mono text-[10px] opacity-70 select-none">
                <span>{t('wordsCount', { count: totalWords })}</span>
                <span>
                  {t('readTimeEstimate', {
                    count: Math.ceil(totalWords / 250),
                  })}
                </span>
                <span className="rounded-full bg-[#1A1A1A]/10 px-2 py-0.5 font-bold dark:bg-white/10">
                  {t('pagesCount', { count: computedPages.length || 1 })}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsToolbarCollapsed(!isToolbarCollapsed)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#1A1A1A]/10 bg-[#1A1A1A]/5 text-[#1A1A1A] transition-all hover:bg-[#1A1A1A]/10 dark:border-white/10 dark:bg-white/5 dark:text-[#F8FAFC] dark:hover:bg-white/10"
                title={
                  isToolbarCollapsed ? t('expandTools') : t('collapseTools')
                }
                aria-label={
                  isToolbarCollapsed ? t('expandTools') : t('collapseTools')
                }
              >
                {isToolbarCollapsed ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                )}
              </button>
            </>
          )}
        </div>

        {activeTab === 'preview' &&
          !renderReaderPreview &&
          computedPages.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={previewPageIdx === 0}
                onClick={() =>
                  setPreviewPageIdx((prev) => Math.max(0, prev - 1))
                }
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
        {/* Local Search Tool Floating Panel (RF-12, RF-13) */}
        {searchOpen && (
          <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 p-1.5 bg-white/95 dark:bg-[#121212]/95 backdrop-blur-md rounded-xl border border-[#1A1A1A]/15 dark:border-white/15 shadow-xl animate-in slide-in-from-top-4 duration-200">
            <div className="flex items-center gap-1 px-1">
              <Search className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <input
                id="editor-search-input"
                type="text"
                placeholder={
                  language === 'pt'
                    ? 'Buscar no texto...'
                    : language === 'es'
                      ? 'Buscar en el texto...'
                      : language === 'zh'
                        ? '在文中搜索...'
                        : 'Search in text...'
                }
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) {
                      handleSearchPrev();
                    } else {
                      handleSearchNext();
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCloseSearch();
                  }
                }}
                className="w-36 sm:w-48 bg-transparent border-none text-xs text-[#1A1A1A] dark:text-[#F8FAFC] focus:outline-none placeholder-[#1A1A1A]/40 dark:placeholder-white/40 font-serif"
              />
            </div>

            {/* Match Counter */}
            <span className="text-[10px] font-mono font-bold bg-[#1A1A1A]/5 dark:bg-white/5 px-2 py-0.5 rounded-md text-[#1A1A1A]/60 dark:text-[#F8FAFC]/60 whitespace-nowrap">
              {searchMatches.length > 0
                ? `${currentMatchIndex + 1} / ${searchMatches.length}`
                : '0 / 0'}
            </span>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-0.5 border-l border-[#1A1A1A]/10 dark:border-white/10 pl-1.5">
              <button
                type="button"
                onClick={handleSearchPrev}
                disabled={searchMatches.length === 0}
                className="p-1 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-md disabled:opacity-40"
                title={
                  language === 'pt'
                    ? 'Anterior (Shift+Enter)'
                    : 'Previous (Shift+Enter)'
                }
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleSearchNext}
                disabled={searchMatches.length === 0}
                className="p-1 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 rounded-md disabled:opacity-40"
                title={language === 'pt' ? 'Próxima (Enter)' : 'Next (Enter)'}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCloseSearch}
                className="p-1 hover:bg-red-500/10 text-red-500 rounded-md"
                title={t('cancel')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <div className="w-full">
          {activeTab === 'edit' ? (
            <div className="relative">
              <div
                ref={editorRef}
                contentEditable
                onInput={handleContentChange}
                onPaste={handleEditorPaste}
                onDrop={handleEditorDrop}
                onDragOver={handleEditorDragOver}
                onPointerDown={handleEditorPointerDown}
                onPointerMove={handleEditorPointerMove}
                onPointerUp={finishEditorImageDrag}
                onPointerCancel={(e) => finishEditorImageDrag(e, true)}
                onKeyDown={handleEditorKeyDown}
                onBlur={(e) => {
                  if (
                    e.relatedTarget &&
                    selectionToolbarRef.current?.contains(
                      e.relatedTarget as Node,
                    )
                  ) {
                    return;
                  }
                  selectedImage?.classList.remove('story-image-selected');
                  setSelectedImage(null);
                  setSelectionToolbarPosition(null);
                }}
                onFocus={handleEditorFocus}
                onClick={handleEditorClick}
                className={cn(
                  'w-full overflow-y-auto p-4 sm:p-8 bg-white dark:bg-[#1A1A1A] border border-[#1A1A1A]/15 dark:border-white/15 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white font-serif text-base sm:text-lg leading-relaxed text-[#1A1A1A] dark:text-[#F5F5F0] shadow-inner prose dark:prose-invert max-w-none transition-all duration-300',
                  '[&>*]:mx-auto [&>*]:max-w-[65ch] [&_img]:mx-auto [&_img]:rounded-lg [&_img]:max-w-full [&_img]:h-auto',
                  '[&_img.story-image-selected]:outline [&_img.story-image-selected]:outline-2 [&_img.story-image-selected]:outline-offset-2 [&_img.story-image-selected]:outline-blue-500',
                  isToolbarCollapsed
                    ? 'min-h-[550px] max-h-[1080px]'
                    : 'min-h-[380px] max-h-[1080px]',
                )}
                style={{
                  height: 'clamp(380px, calc(100dvh - 280px), 1080px)',
                  minHeight: isToolbarCollapsed ? '550px' : '380px',
                }}
              />
              {totalWords === 0 &&
                !computedPages.some((p) => p.includes('<img')) && (
                  <div className="absolute top-4 left-4 sm:top-8 sm:left-8 text-sm sm:text-base font-serif opacity-40 pointer-events-none">
                    {t('typeContentHere')}
                  </div>
                )}
              {imageError && (
                <div className="mt-2 text-xs font-bold text-red-600 dark:text-red-400">
                  {imageError}
                </div>
              )}
              {selectionToolbarPosition &&
                createPortal(
                  <div
                    ref={selectionToolbarRef}
                    role="toolbar"
                    aria-label="Text formatting"
                    className="fixed z-[80] flex max-w-[calc(100vw-24px)] items-center gap-0.5 overflow-x-auto rounded-xl border border-[#1A1A1A]/15 bg-white p-1 text-[#1A1A1A] shadow-xl dark:border-white/15 dark:bg-[#1C1C1E] dark:text-[#F5F5F0]"
                    style={{
                      top: selectionToolbarPosition.top,
                      left: selectionToolbarPosition.left,
                      transform: 'translateX(-50%)',
                    }}
                    onMouseDown={(e) => {
                      if (!(e.target instanceof HTMLInputElement)) {
                        e.preventDefault();
                      }
                    }}
                  >
                    {selectedImage ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setSelectedImagePosition('left')}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-[#1A1A1A]/5 dark:hover:bg-white/10"
                          title={t('alignLeft')}
                          aria-label={t('alignLeft')}
                        >
                          <AlignLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedImagePosition('center')}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-[#1A1A1A]/5 dark:hover:bg-white/10"
                          title={t('alignCenter')}
                          aria-label={t('alignCenter')}
                        >
                          <AlignCenter className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedImagePosition('right')}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-[#1A1A1A]/5 dark:hover:bg-white/10"
                          title={t('alignRight')}
                          aria-label={t('alignRight')}
                        >
                          <AlignRight className="h-4 w-4" />
                        </button>
                        <div className="mx-1 h-5 w-px shrink-0 bg-[#1A1A1A]/10 dark:bg-white/15" />
                        {[
                          { label: t('imageSizeSmall'), width: 25 },
                          { label: t('imageSizeMedium'), width: 40 },
                          { label: t('imageSizeLarge'), width: 65 },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              applySelectedImageWidth(preset.width)
                            }
                            className="flex h-8 shrink-0 items-center justify-center rounded-lg px-2 text-[10px] font-bold tabular-nums hover:bg-[#1A1A1A]/5 dark:hover:bg-white/10"
                            title={`${preset.label} (${preset.width}%)`}
                            aria-label={`${preset.label} (${preset.width}%)`}
                          >
                            {preset.width}%
                          </button>
                        ))}
                        <div className="mx-1 h-5 w-px shrink-0 bg-[#1A1A1A]/10 dark:bg-white/15" />
                        <input
                          type="range"
                          min="15"
                          max="100"
                          step="1"
                          value={selectedImageWidth}
                          onChange={(e) =>
                            applySelectedImageWidth(
                              Number(e.currentTarget.value),
                              false,
                            )
                          }
                          onPointerDown={() => {
                            isResizingImageRef.current = true;
                          }}
                          onPointerUp={() => {
                            isResizingImageRef.current = false;
                            handleContentChange();
                            updateSelectionToolbar();
                          }}
                          onPointerCancel={() => {
                            isResizingImageRef.current = false;
                            handleContentChange();
                            updateSelectionToolbar();
                          }}
                          onKeyDown={() => {
                            isResizingImageRef.current = true;
                          }}
                          onKeyUp={() => {
                            isResizingImageRef.current = false;
                            handleContentChange();
                            updateSelectionToolbar();
                          }}
                          onBlur={() => {
                            if (isResizingImageRef.current) {
                              isResizingImageRef.current = false;
                              handleContentChange();
                              updateSelectionToolbar();
                            }
                          }}
                          className="w-20 shrink-0 accent-[#1A1A1A] dark:accent-white"
                          title={t('imageWidth')}
                          aria-label={t('imageWidth')}
                        />
                        <input
                          type="number"
                          min="15"
                          max="100"
                          step="1"
                          value={selectedImageWidthInput}
                          onFocus={() => {
                            isResizingImageRef.current = true;
                          }}
                          onChange={(e) => {
                            const value = e.currentTarget.value;
                            setSelectedImageWidthInput(value);
                            if (value && Number.isFinite(Number(value))) {
                              applySelectedImageWidth(Number(value), false);
                              setSelectedImageWidthInput(value);
                            }
                          }}
                          onBlur={(e) => {
                            const value = Number(e.currentTarget.value);
                            const safeWidth = Number.isFinite(value)
                              ? Math.max(15, Math.min(100, Math.round(value)))
                              : selectedImageWidth;
                            isResizingImageRef.current = false;
                            applySelectedImageWidth(safeWidth, false);
                            setSelectedImageWidthInput(String(safeWidth));
                            handleContentChange();
                            updateSelectionToolbar();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                          className="h-7 w-12 shrink-0 rounded-md border border-[#1A1A1A]/15 bg-transparent px-1 text-center text-[10px] font-mono tabular-nums outline-none focus:border-blue-500 dark:border-white/15"
                          title={t('imageWidth')}
                          aria-label={t('imageWidth')}
                        />
                        <span className="w-9 shrink-0 text-right text-[10px] font-mono tabular-nums">
                          {selectedImageWidth}%
                        </span>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => executeCommand('bold')}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-[#1A1A1A]/5 dark:hover:bg-white/10"
                          title={t('bold')}
                        >
                          <Bold className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => executeCommand('italic')}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-[#1A1A1A]/5 dark:hover:bg-white/10"
                          title={t('italic')}
                        >
                          <Italic className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => executeCommand('underline')}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-[#1A1A1A]/5 dark:hover:bg-white/10"
                          title={t('underline')}
                        >
                          <Underline className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => executeCommand('strikeThrough')}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-[#1A1A1A]/5 dark:hover:bg-white/10"
                          title={t('strikethrough')}
                        >
                          <Strikethrough className="h-4 w-4" />
                        </button>
                        <div className="mx-1 h-5 w-px shrink-0 bg-[#1A1A1A]/10 dark:bg-white/15" />
                        <button
                          type="button"
                          onClick={() => handleFormatBlock('h1')}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-[#1A1A1A]/5 dark:hover:bg-white/10"
                          title={t('formatTitle')}
                        >
                          <Heading1 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFormatBlock('h2')}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-[#1A1A1A]/5 dark:hover:bg-white/10"
                          title={t('formatSubtitle')}
                        >
                          <Heading2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFormatBlock('p')}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-[#1A1A1A]/5 dark:hover:bg-white/10"
                          title={t('formatParagraph')}
                        >
                          <Pilcrow className="h-4 w-4" />
                        </button>
                        {recentColors.length > 0 && (
                          <>
                            <div className="mx-1 h-5 w-px shrink-0 bg-[#1A1A1A]/10 dark:bg-white/15" />
                            <div
                              role="group"
                              aria-label={t('recentColors')}
                              className="flex shrink-0 items-center gap-1 px-1"
                            >
                              {recentColors.map((color, index) => (
                                <button
                                  key={`${color}-${index}`}
                                  type="button"
                                  onClick={() => handleApplyColor(color)}
                                  className="h-5 w-5 shrink-0 rounded border border-black/20 shadow-sm transition-transform hover:scale-125 dark:border-white/25"
                                  style={{ backgroundColor: color }}
                                  title={`${t('recentColors')}: ${color}`}
                                  aria-label={`${t('recentColors')}: ${color}`}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>,
                  document.body,
                )}
            </div>
          ) : renderReaderPreview ? (
            <div className="w-full">{renderReaderPreview(computedPages)}</div>
          ) : (
            /* Preview Mode Page View */
            <div
              className={cn(
                'relative mx-auto min-h-[50vh] w-full max-w-[800px] overflow-hidden rounded-2xl p-6 shadow-lg transition-all sm:p-10',
                readerMode === 'dark'
                  ? 'paper-card text-[#F5F5F0]'
                  : 'bg-[#FDFCF9] text-[#1A1A1A]',
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
                    <span className="font-bold opacity-70 uppercase tracking-wider text-[10px]">
                      {t('fontFamily')}:
                    </span>
                    <div className="flex gap-1 p-0.5 rounded-lg bg-black/5 dark:bg-white/5">
                      <button
                        type="button"
                        onClick={() => setFontFamily('serif')}
                        className={cn(
                          'px-2.5 py-1 text-[11px] font-serif font-bold rounded-md transition-all',
                          fontFamily === 'serif'
                            ? 'bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] shadow-sm'
                            : 'opacity-60 hover:opacity-100',
                        )}
                      >
                        Serif
                      </button>
                      <button
                        type="button"
                        onClick={() => setFontFamily('sans')}
                        className={cn(
                          'px-2.5 py-1 text-[11px] font-sans font-bold rounded-md transition-all',
                          fontFamily === 'sans'
                            ? 'bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] shadow-sm'
                            : 'opacity-60 hover:opacity-100',
                        )}
                      >
                        Sans
                      </button>
                      <button
                        type="button"
                        onClick={() => setFontFamily('opendyslexic')}
                        className={cn(
                          'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all font-opendyslexic',
                          fontFamily === 'opendyslexic'
                            ? 'bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] shadow-sm'
                            : 'opacity-60 hover:opacity-100',
                        )}
                      >
                        Dyslexic
                      </button>
                    </div>
                  </div>

                  {/* Line Spacing */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold opacity-70 uppercase tracking-wider text-[10px]">
                      {t('lineSpacing')}:
                    </span>
                    <div className="flex gap-1 p-0.5 rounded-lg bg-black/5 dark:bg-white/5">
                      <button
                        type="button"
                        onClick={() => setLineSpacing('compact')}
                        className={cn(
                          'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all',
                          lineSpacing === 'compact'
                            ? 'bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] shadow-sm'
                            : 'opacity-60 hover:opacity-100',
                        )}
                      >
                        1.4
                      </button>
                      <button
                        type="button"
                        onClick={() => setLineSpacing('relaxed')}
                        className={cn(
                          'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all',
                          lineSpacing === 'relaxed'
                            ? 'bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] shadow-sm'
                            : 'opacity-60 hover:opacity-100',
                        )}
                      >
                        1.8
                      </button>
                      <button
                        type="button"
                        onClick={() => setLineSpacing('loose')}
                        className={cn(
                          'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all',
                          lineSpacing === 'loose'
                            ? 'bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] shadow-sm'
                            : 'opacity-60 hover:opacity-100',
                        )}
                      >
                        2.2
                      </button>
                    </div>
                  </div>

                  {/* Theme Mode */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold opacity-70 uppercase tracking-wider text-[10px]">
                      {t('readingTheme')}:
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setReaderMode(readerMode === 'dark' ? 'light' : 'dark')
                      }
                      className="p-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                      title={
                        readerMode === 'dark' ? t('lightTheme') : t('darkTheme')
                      }
                    >
                      {readerMode === 'dark' ? (
                        <Sun className="w-3.5 h-3.5 text-blue-500" />
                      ) : (
                        <Moon className="w-3.5 h-3.5 text-indigo-500" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <StoryContent
                html={
                  computedPages[previewPageIdx] ||
                  `<p class='opacity-40 italic'>${t('emptyPage')}</p>`
                }
                readerMode={readerMode}
                fontFamily={fontFamily}
                lineSpacing={lineSpacing}
              />
            </div>
          )}
        </div>

        {showReviewPanel &&
          createPortal(
            <>
              {/* RF-09: Backdrop overlay on mobile/tablet for sliding drawer feel */}
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden animate-in fade-in duration-200"
                onClick={() => setShowReviewPanel(false)}
              />

              {/* RF-09: Responsive Drawer: bottom-sliding on mobile/tablet, standard sidebar on desktop */}
              <div className="fixed bottom-0 left-0 right-0 lg:bottom-auto lg:left-auto lg:top-20 lg:right-8 z-50 lg:z-40 w-full lg:w-[380px] max-h-[80vh] lg:max-h-[82vh] overflow-y-auto bg-white dark:bg-[#121212] lg:bg-white/95 lg:dark:bg-[#121212]/95 backdrop-blur-md rounded-t-3xl lg:rounded-3xl border-t border-x lg:border border-[#1A1A1A]/20 dark:border-white/20 p-5 lg:p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom lg:slide-in-from-right-6 duration-200 text-[#1A1A1A] dark:text-[#F8FAFC]">
                {/* Mobile/Tablet Drawer visual handle indicator */}
                <div className="w-12 h-1 bg-black/10 dark:bg-white/20 rounded-full mx-auto mb-1.5 lg:hidden shrink-0" />
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

                {/* LanguageTool Status & Mode Badge (RF-15, RF-16) */}
                <div className="flex items-center justify-between text-[10px] font-bold px-1 py-1 rounded-xl bg-[#F5F5F0]/80 dark:bg-[#1A1A1A]/80 border border-[#1A1A1A]/10 dark:border-white/10 px-2.5">
                  <span className="text-[#1A1A1A]/70 dark:text-[#F8FAFC]/70">
                    Motor:
                  </span>
                  {isCheckingLanguageTool ? (
                    <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-extrabold animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                      {t('checkingProgress')}
                    </span>
                  ) : isFallbackMode ? (
                    <span
                      className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-extrabold"
                      title="Fallback ativado devido a limite de cota ou sem conexão"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      {t('fallbackModeActive')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-extrabold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {t('languageToolActive')}
                    </span>
                  )}
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
                    <option
                      value="auto"
                      className="bg-white dark:bg-[#121212] text-[#1A1A1A] dark:text-[#F8FAFC]"
                    >
                      🌐 {t('autoDetectLanguage')} (Auto)
                    </option>
                    <option
                      value="pt"
                      className="bg-white dark:bg-[#121212] text-[#1A1A1A] dark:text-[#F8FAFC]"
                    >
                      🇵🇹 / 🇧🇷 Português
                    </option>
                    <option
                      value="es"
                      className="bg-white dark:bg-[#121212] text-[#1A1A1A] dark:text-[#F8FAFC]"
                    >
                      🇪🇸 Español
                    </option>
                    <option
                      value="en"
                      className="bg-white dark:bg-[#121212] text-[#1A1A1A] dark:text-[#F8FAFC]"
                    >
                      🇺🇸 / 🇬🇧 English
                    </option>
                    <option
                      value="id"
                      className="bg-white dark:bg-[#121212] text-[#1A1A1A] dark:text-[#F8FAFC]"
                    >
                      🇮🇩 Indonesia
                    </option>
                    <option
                      value="zh"
                      className="bg-white dark:bg-[#121212] text-[#1A1A1A] dark:text-[#F8FAFC]"
                    >
                      🇨🇳 中文 (Chinese)
                    </option>
                  </select>
                </div>

                {/* Auto-Correct Controls (RF-01, RF-02) */}
                <div className="bg-[#F5F5F0]/50 dark:bg-[#1A1A1A]/50 border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col space-y-0.5">
                      <span className="text-xs font-bold text-[#1A1A1A] dark:text-[#F8FAFC]">
                        {t('autoCorrectLabel')}
                      </span>
                      <span className="text-[10px] text-[#1A1A1A]/60 dark:text-[#F8FAFC]/60 font-medium leading-tight">
                        {t('autoCorrectDesc')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoCorrectEnabled(!autoCorrectEnabled)}
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                        autoCorrectEnabled
                          ? 'bg-red-500'
                          : 'bg-neutral-300 dark:bg-neutral-700',
                      )}
                    >
                      <span
                        className={cn(
                          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out',
                          autoCorrectEnabled
                            ? 'translate-x-4'
                            : 'translate-x-0',
                        )}
                      />
                    </button>
                  </div>

                  {/* Run Auto-correct all button */}
                  <button
                    type="button"
                    onClick={handleAutoCorrectAll}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-bold text-xs shadow-sm transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t('autoCorrectAll')}</span>
                  </button>
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
                    className="flex items-center gap-1.5 text-blue-500 dark:text-blue-400 hover:underline font-bold"
                  >
                    <BookMarked className="w-3.5 h-3.5" />
                    <span>{t('personalDictionary')}</span>
                  </button>
                  <span className="text-[10px] font-mono text-[#1A1A1A]/65 dark:text-[#F8FAFC]/75 font-bold">
                    {t('wordsInDictionary', { count: dictWords.length })}
                  </span>
                </div>

                {/* Ignored Words Manage Button */}
                {ignoredCount > 0 && (
                  <div className="flex justify-between items-center text-[11px] px-1 pt-1.5 border-t border-[#1A1A1A]/5 dark:border-white/5 text-[#1A1A1A] dark:text-[#F8FAFC] animate-in fade-in slide-in-from-top-1 duration-200">
                    <button
                      type="button"
                      onClick={handleRestoreIgnoredWords}
                      className="flex items-center gap-1.5 text-red-600 dark:text-red-400 hover:underline font-bold"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{t('restoreIgnoredWords')}</span>
                    </button>
                    <span className="text-[10px] font-mono text-[#1A1A1A]/65 dark:text-[#F8FAFC]/75 font-bold">
                      {ignoredCount}{' '}
                      {language === 'pt'
                        ? ignoredCount === 1
                          ? 'ignorada'
                          : 'ignoradas'
                        : 'ignored'}
                    </span>
                  </div>
                )}

                {/* Review Issues List */}
                <div className="space-y-2.5 pr-1">
                  {filteredIssues.length === 0 ? (
                    <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-center space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                      <h4 className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        {t('noErrorsFound')}
                      </h4>
                      <p className="text-[11px] text-[#1A1A1A]/80 dark:text-[#F8FAFC]/90">
                        {t('noErrorsDesc')}
                      </p>
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
                                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
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
                              {t('pageIssueGroup', {
                                page: issue.pageIndex + 1,
                              })}
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
            document.body,
          )}
      </div>
      {/* Floating Suggestions Popover (RF-02, CT-02) */}
      {activePopoverIssue &&
        popoverPosition &&
        createPortal(
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
                className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-800 dark:text-blue-300 font-bold flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>{t('addToDictionary')}</span>
              </button>
            </div>
          </div>,
          document.body,
        )}
      {/* Personal Dictionary Drawer / Modal */}
      {showPersonalDictModal &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#121212] rounded-3xl border border-[#1A1A1A]/20 dark:border-white/20 p-6 max-w-md w-full shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#1A1A1A]/10 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <BookMarked className="w-5 h-5 text-blue-400" />
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
                          const updated = dictWords.filter(
                            (item) => item !== w,
                          );
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
          document.body,
        )}
    </div>
  );
}
