import { useEffect, useState, useRef, useMemo, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  db,
  doc,
  getDoc,
  collection,
  addDoc,
  query,
  orderBy,
  getDocs,
  Timestamp,
  updateDoc,
  increment,
  setDoc,
  where,
} from '../lib/firebase';
import { updateMetaTags } from '../utils/metaUtils';
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Star,
  MessageSquare,
  CheckCircle,
  ShieldAlert,
  User as UserIcon,
  ArrowUp,
  Clock,
  Eye,
  Sun,
  Moon,
  Type,
  Download,
  Bookmark,
  FileText,
  Check,
  ListPlus,
  Plus,
  X,
  Languages,
  Globe,
  Heart,
  List,
  MoreHorizontal,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, ADMIN_EMAIL } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  saveStoryOffline,
  isStoryDownloaded,
  removeOfflineStory,
  getOfflineStory,
} from '../lib/offlineStorage';
import {
  getBookmarksAndNotes,
  saveBookmarkNote,
  deleteBookmarkNote,
  BookmarkNote,
} from '../lib/bookmarks';
import {
  fetchUserPlaylists,
  ReadingList,
  toggleStoryInPlaylist,
  createOrUpdatePlaylist,
} from '../lib/playlists';
import { unlockAchievement } from '../lib/achievements';
import { logUserActivity } from '../lib/social';
import { translateStoryPageHtml } from '../lib/storyTranslator';
import { cleanStoryHtml } from '../lib/cleanStoryHtml';
import { TranslatedText } from '../components/TranslatedText';
import { extractStoryId } from '../utils/urlUtils';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getOrCreateGuestId(): string {
  let guestId = localStorage.getItem('inkora_guest_id');
  if (!guestId) {
    guestId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    try {
      localStorage.setItem('inkora_guest_id', guestId);
    } catch (e) {
      console.error('Failed to store guest_id in localStorage', e);
    }
  }
  return guestId;
}

interface StoryData {
  title: string;
  author?: string;
  totalPages: number;
  wordCount?: number;
  coverImage?: string;
  scheduledReleaseAt?: string;
  authorUid?: string;
}

interface CommentData {
  id: string;
  text: string;
  rating: number;
  userName?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'hidden';
  createdAt: any;
}

export function Reader() {
  const { id: urlId } = useParams<{ id: string }>();
  const id = extractStoryId(urlId);
  
  const { user, profile } = useAuth();
  const { language, t } = useLanguage();

  const [story, setStory] = useState<StoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [maxPage, setMaxPage] = useState(0);
  const maxPageRef = useRef<number>(0);
  const [pageContent, setPageContent] = useState<string>('');
  const [loadingPage, setLoadingPage] = useState(false);
  const [showFormattingPanel, setShowFormattingPanel] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Story Translation State
  const [isTranslationEnabled, setIsTranslationEnabled] = useState<boolean>(
    () => {
      return localStorage.getItem('inkora_translate_story') === 'true';
    },
  );
  const [displayContent, setDisplayContent] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem(
      'inkora_translate_story',
      isTranslationEnabled ? 'true' : 'false',
    );
  }, [isTranslationEnabled]);

  useEffect(() => {
    let isCancelled = false;

    async function processPageTranslation() {
      if (language !== 'pt' && isTranslationEnabled && pageContent) {
        setIsTranslating(true);
        try {
          const translated = await translateStoryPageHtml(
            pageContent,
            language as 'es' | 'en' | 'id',
            id || 'story',
            currentPage,
          );
          if (!isCancelled) {
            setDisplayContent(cleanStoryHtml(translated));
          }
        } catch (e) {
          console.error('Translation processing error:', e);
          if (!isCancelled) {
            setDisplayContent(cleanStoryHtml(pageContent));
          }
        } finally {
          if (!isCancelled) {
            setIsTranslating(false);
          }
        }
      } else {
        setDisplayContent(cleanStoryHtml(pageContent));
        setIsTranslating(false);
      }
    }

    processPageTranslation();

    return () => {
      isCancelled = true;
    };
  }, [pageContent, isTranslationEnabled, language, id, currentPage]);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [promptProgress, setPromptProgress] = useState<{ page: number } | null>(
    null,
  );
  const isInitialProgressLoaded = useRef(false);

  const [approvedComments, setApprovedComments] = useState<CommentData[]>([]);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Advanced Typography & Themes
  const [fontFamily, setFontFamily] = useState<
    'serif' | 'sans' | 'opendyslexic'
  >(() => {
    return (localStorage.getItem('inkora_font_family') as any) || 'serif';
  });
  const [marginSize, setMarginSize] = useState<'narrow' | 'normal' | 'wide'>(
    () => {
      return (localStorage.getItem('inkora_margin_size') as any) || 'normal';
    },
  );
  const [lineSpacing, setLineSpacing] = useState<
    'compact' | 'relaxed' | 'loose'
  >(() => {
    return (localStorage.getItem('inkora_line_spacing') as any) || 'relaxed';
  });

  // Offline and Bookmarks
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [notesList, setNotesList] = useState<BookmarkNote[]>([]);
  const [newNoteInput, setNewNoteInput] = useState('');
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);

  // Playlists State
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlists, setPlaylists] = useState<ReadingList[]>([]);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');

  // Table of Contents (Index) State across all pages
  interface TocHeadingItem {
    id: string;
    text: string;
    level: 1 | 2;
    pageIndex: number;
  }
  const [allPagesContent, setAllPagesContent] = useState<{
    [pageIdx: number]: string;
  }>({});
  const [tocHeadings, setTocHeadings] = useState<TocHeadingItem[]>([]);
  const [showTocSidebar, setShowTocSidebar] = useState<boolean>(
    () => window.innerWidth >= 1280,
  );
  const [expandedTocSection, setExpandedTocSection] = useState<number | null>(
    null,
  );
  const pendingTocScrollRef = useRef<string | null>(null);

  const extractTocHeadingsFromPages = (
    pages: { [pageIdx: number]: string },
    totalPages?: number,
  ): TocHeadingItem[] => {
    const list: TocHeadingItem[] = [];
    const tempDiv = document.createElement('div');
    const totalP = totalPages || Object.keys(pages).length || 1;
    const seenTexts = new Set<string>();

    for (let p = 0; p < totalP; p++) {
      const html = pages[p];
      if (!html) continue;

      tempDiv.innerHTML = html;
      const els = tempDiv.querySelectorAll('h1, h2');

      els.forEach((el, hIdx) => {
        const htmlEl = el as HTMLElement;
        const text = htmlEl.innerText || htmlEl.textContent || '';
        const cleanedText = text.replace(/\s+/g, ' ').trim();
        const normalizedText = cleanedText.toLowerCase();

        if (!cleanedText || cleanedText.length < 3) return;
        if (story?.title) {
          const storyTitle = story.title
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          if (normalizedText === storyTitle) return;
        }
        if (seenTexts.has(normalizedText)) return;

        seenTexts.add(normalizedText);
        list.push({
          id: `toc-p${p}-h${hIdx}`,
          text: cleanedText,
          level: htmlEl.tagName === 'H1' ? 1 : 2,
          pageIndex: p,
        });
      });
    }

    return list;
  };

  useEffect(() => {
    if (currentPage !== undefined && pageContent) {
      setAllPagesContent((prev) => ({ ...prev, [currentPage]: pageContent }));
    }
  }, [pageContent, currentPage]);

  useEffect(() => {
    async function loadAllStoryPages() {
      if (!id || !story) return;
      const pagesMap: { [pageIdx: number]: string } = {};
      try {
        const offline = await getOfflineStory(id);
        if (offline && offline.pages) {
          setAllPagesContent(offline.pages);
          setTocHeadings(
            extractTocHeadingsFromPages(
              offline.pages,
              story?.totalPages || Object.keys(offline.pages).length || 1,
            ),
          );
          return;
        }
      } catch (e) {
        // ignore
      }

      try {
        const pSnap = await getDocs(
          query(collection(db, `stories/${id}/pages`), orderBy('index', 'asc')),
        );
        pSnap.forEach((d) => {
          const data = d.data();
          const idx =
            typeof data.index === 'number'
              ? data.index
              : parseInt(d.id, 10) || 0;
          pagesMap[idx] = cleanStoryHtml(data.content || '');
        });
        if (Object.keys(pagesMap).length === 0 && pageContent) {
          pagesMap[0] = cleanStoryHtml(pageContent);
        }
        setAllPagesContent(pagesMap);
        setTocHeadings(
          extractTocHeadingsFromPages(
            pagesMap,
            story?.totalPages || Object.keys(pagesMap).length || 1,
          ),
        );
      } catch (e) {
        console.error('Error loading all pages for TOC:', e);
        if (pageContent) {
          const fallbackPages = { [currentPage]: cleanStoryHtml(pageContent) };
          setAllPagesContent(fallbackPages);
          setTocHeadings(
            extractTocHeadingsFromPages(
              fallbackPages,
              story?.totalPages || Object.keys(fallbackPages).length || 1,
            ),
          );
        }
      }
    }

    loadAllStoryPages();
  }, [id, story?.totalPages]);

  useEffect(() => {
    setTocHeadings(
      extractTocHeadingsFromPages(
        allPagesContent,
        story?.totalPages || Object.keys(allPagesContent).length || 1,
      ),
    );
  }, [allPagesContent, story?.totalPages]);

  const structuredToc = useMemo(() => {
    const result: { h1: TocHeadingItem; h2s: TocHeadingItem[] }[] = [];
    let currentH1: TocHeadingItem | null = null;
    let currentH2s: TocHeadingItem[] = [];

    tocHeadings.forEach((h) => {
      if (h.level === 1) {
        if (currentH1) {
          result.push({ h1: currentH1, h2s: currentH2s });
        }
        currentH1 = h;
        currentH2s = [];
      } else {
        if (currentH1) {
          currentH2s.push(h);
        } else {
          currentH1 = {
            id: `dummy-h1-${h.id}`,
            text: 'Início',
            level: 1,
            pageIndex: h.pageIndex,
          };
          currentH2s.push(h);
        }
      }
    });
    if (currentH1) {
      result.push({ h1: currentH1, h2s: currentH2s });
    }
    return result;
  }, [tocHeadings]);

  const handleTocClick = (h: TocHeadingItem) => {
    setShowTocSidebar(false);
    if (h.pageIndex !== currentPage) {
      pendingTocScrollRef.current = h.text;
      setCurrentPage(h.pageIndex);
    } else {
      setTimeout(() => {
        if (!containerRef.current) return;
        const els = containerRef.current.querySelectorAll('h1, h2');
        for (const el of Array.from(els)) {
          const htmlEl = el as HTMLElement;
          if ((htmlEl.textContent || '').trim() === h.text) {
            htmlEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            break;
          }
        }
      }, 50);
    }
  };

  useEffect(() => {
    if (pendingTocScrollRef.current && !loadingPage && displayContent) {
      const targetText = pendingTocScrollRef.current;
      pendingTocScrollRef.current = null;
      setTimeout(() => {
        if (!containerRef.current) return;
        const els = containerRef.current.querySelectorAll('h1, h2');
        for (const el of Array.from(els)) {
          const htmlEl = el as HTMLElement;
          if ((htmlEl.textContent || '').trim() === targetText) {
            htmlEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            break;
          }
        }
      }, 150);
    }
  }, [displayContent, loadingPage, currentPage]);

  const loadPlaylists = async () => {
    const list = await fetchUserPlaylists(user?.uid || 'guest');
    setPlaylists(list);
  };

  // Multi-criteria Ratings
  const [plotRating, setPlotRating] = useState(0);
  const [characterRating, setCharacterRating] = useState(0);
  const [writingRating, setWritingRating] = useState(0);

  // Reader-specific reading theme mode (light or dark)
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
      localStorage.setItem('inkora_reader_mode', readerMode);
    } catch (e) {
      console.error('Error saving reader mode:', e);
    }
  }, [readerMode]);

  // Eye Comfort yellow filter intensity state (0 to 100)
  const [eyeComfortIntensity, setEyeComfortIntensity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('inkora_eye_comfort_intensity');
      return saved !== null ? Math.min(100, Math.max(0, Number(saved))) : 0;
    } catch (e) {
      return 0;
    }
  });

  useEffect(() => {
    localStorage.setItem('inkora_font_family', fontFamily);
  }, [fontFamily, user]);

  useEffect(() => {
    localStorage.setItem('inkora_margin_size', marginSize);
  }, [marginSize]);

  useEffect(() => {
    localStorage.setItem('inkora_line_spacing', lineSpacing);
  }, [lineSpacing]);

  useEffect(() => {
    if (id) {
      isStoryDownloaded(id).then(setIsDownloaded);
      setNotesList(getBookmarksAndNotes(id));
      unlockAchievement('first_page', user?.uid);

      // Check night owl achievement
      const currentHour = new Date().getHours();
      if (currentHour >= 0 && currentHour < 5) {
        unlockAchievement('night_owl', user?.uid);
      }
    }
  }, [id, user]);

  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'inkora_eye_comfort_intensity',
        eyeComfortIntensity.toString(),
      );
    } catch (e) {
      console.error('Error saving eye comfort intensity:', e);
    }
  }, [eyeComfortIntensity]);

  // Monitor scroll height to show/hide "return to top" button and update progress
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 400) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }

      // Read progress logic
      if (story && story.totalPages > 0) {
        const docHeight =
          document.documentElement.scrollHeight -
          document.documentElement.clientHeight;
        const currentScrollPercent =
          docHeight > 0 ? window.scrollY / docHeight : 1;
        const overallProgress =
          ((currentPage + currentScrollPercent) / story.totalPages) * 100;
        setScrollProgress(Math.min(overallProgress, 100));
      }
    };
    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check
    return () => window.removeEventListener('scroll', handleScroll);
  }, [currentPage, story]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Load Story metadata & saved progress
  useEffect(() => {
    async function loadStory() {
      if (!id) return;
      isInitialProgressLoaded.current = false;

      // Check local inkora_cached_stories first for immediate render
      let cachedTotalPages = 1;
      try {
        const cachedStories = localStorage.getItem('inkora_cached_stories');
        if (cachedStories) {
          const list = JSON.parse(cachedStories);
          const found = list.find((s: any) => s.id === id);
          if (found) {
            setStory(found);
            cachedTotalPages = found.totalPages || 1;
            setLoading(false);
          }
        }
      } catch (e) {
        console.error(e);
      }

      try {
        const docRef = doc(db, 'stories', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as StoryData;
          setStory(data);

          // Check progress in Firestore if user is logged in or is a visitor
          let savedPage = 0;
          let savedMaxPage = 0;
          const targetUid = user ? user.uid : getOrCreateGuestId();
          if (targetUid) {
            try {
              const progRef = doc(db, `users/${targetUid}/progress`, id);
              const progSnap = await getDoc(progRef);
              if (progSnap.exists()) {
                const pData = progSnap.data();
                if (typeof pData.page === 'number') {
                  savedPage = pData.page;
                }
                if (typeof pData.maxPage === 'number') {
                  savedMaxPage = pData.maxPage;
                } else {
                  savedMaxPage = savedPage;
                }
              }
            } catch (e) {
              console.error('Error loading progress from Firestore:', e);
            }
          }

          // Fallback to localStorage for guests if Firestore load yielded nothing
          if (!user && savedPage === 0) {
            try {
              const localMaxStr = localStorage.getItem(`max_page_${id}`);
              if (localMaxStr) {
                savedMaxPage = parseInt(localMaxStr, 10) || 0;
              }
            } catch (e) {
              console.error(e);
            }
          }

          if (savedPage > savedMaxPage) {
            savedMaxPage = savedPage;
          }

          if (savedMaxPage > 0) {
            setMaxPage(savedMaxPage);
            maxPageRef.current = savedMaxPage;
          }

          if (savedPage === 0) {
            const savedStr = localStorage.getItem(`progress_${id}`);
            if (savedStr) {
              savedPage = parseInt(savedStr, 10) || 0;
              if (savedPage > maxPageRef.current) {
                maxPageRef.current = savedPage;
                setMaxPage(savedPage);
              }
            }
          }

          const totalP = data.totalPages || cachedTotalPages || 1;
          if (savedPage > 0 && savedPage < totalP) {
            setCurrentPage(savedPage);
            setPromptProgress({ page: savedPage });
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        isInitialProgressLoaded.current = true;
        setLoading(false);
      }
    }

    loadStory();
  }, [id, user]);

  // Update Document & Social Meta Tags when Story loads
  useEffect(() => {
    if (story) {
      updateMetaTags({
        title: story.title,
        description: `Leia "${story.title}" ${story.author ? `por ${story.author}` : ''} no INKORA.`,
        image: story.coverImage || 'https://oevidente.github.io/Biblioteca/favicon.png',
        url: window.location.href,
      });
    } else {
      updateMetaTags({});
    }
    return () => {
      updateMetaTags({});
    };
  }, [story]);

  // Load Page Content
  useEffect(() => {
    async function loadPage() {
      if (!id || !story) return;

      const cacheKey = `page_cache_${id}_${currentPage}`;
      const cachedPage = sessionStorage.getItem(cacheKey);
      if (cachedPage) {
        const cleanCached = cleanStoryHtml(cachedPage);
        setPageContent(cleanCached);
        setLoadingPage(false);
      } else {
        setPageContent('');
        setDisplayContent('');
        setLoadingPage(true);
      }

      try {
        const pageRef = doc(db, `stories/${id}/pages`, currentPage.toString());
        const pageSnap = await getDoc(pageRef);
        if (pageSnap.exists()) {
          const content = cleanStoryHtml(pageSnap.data().content || '');
          setPageContent(content);
          try {
            sessionStorage.setItem(cacheKey, content);
          } catch (e) {
            console.error(e);
          }
        } else {
          setPageContent('<p>' + t('pageNotFound') + '</p>');
        }
      } catch (err) {
        console.error(err);
        if (!cachedPage) {
          setPageContent('<p>' + t('errorLoadingPage') + '</p>');
        }
      } finally {
        setLoadingPage(false);
      }
    }

    loadPage();
  }, [id, currentPage, story]);

  // Load Approved Comments ONLY
  useEffect(() => {
    async function loadApprovedComments() {
      if (!id) return;
      try {
        const commentsRef = collection(db, `stories/${id}/comments`);
        const q = query(commentsRef, orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const list: CommentData[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          // Filter ONLY approved comments for public view
          if (data.status === 'approved') {
            list.push({
              id: docSnap.id,
              text: data.text,
              rating: data.rating,
              userName: data.userName || t('reader'),
              status: data.status,
              createdAt: data.createdAt,
            });
          }
        });
        setApprovedComments(list);
      } catch (err) {
        console.error('Error loading comments:', err);
      }
    }

    loadApprovedComments();
  }, [id, submitted]);

  // Save Progress as user turns pages
  useEffect(() => {
    const currentMax = Math.max(maxPageRef.current, currentPage);
    maxPageRef.current = currentMax;
    setMaxPage(currentMax);
    
    if (!story || !id || !isInitialProgressLoaded.current) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 1. Save local progress
    localStorage.setItem(`progress_${id}`, currentPage.toString());
    localStorage.setItem(`max_page_${id}`, currentMax.toString());

    // 2. Save reading history
    try {
      const historyStr = localStorage.getItem('reading_history');
      let history: any[] = historyStr ? JSON.parse(historyStr) : [];
      history = history.filter((h) => h.id !== id);
      history.unshift({
        id,
        title: story.title || 'Sem título',
        coverImage: story.coverImage || '',
        page: currentPage || 0,
        totalPages: story.totalPages || 0,
        timestamp: new Date().toISOString(),
      });
      localStorage.setItem(
        'reading_history',
        JSON.stringify(history.slice(0, 50)),
      );
    } catch (e) {
      console.error(e);
    }

    // 3. Save progress to Firestore with 1.5s debounce to save on database writes (to avoid quota exhaustion)
    const targetUid = user ? user.uid : getOrCreateGuestId();
    const timer = setTimeout(() => {
      if (targetUid && story) {
        const progRef = doc(db, `users/${targetUid}/progress`, id);
        setDoc(
          progRef,
          {
            storyId: id,
            storyTitle: story.title || 'Sem título',
            coverImage: story.coverImage || '',
            page: currentPage || 0,
            maxPage: currentMax,
            totalPages: story.totalPages ?? 0,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        )
          .then(() => {
            // Log start of reading activity once per story session for logged in user
            if (user) {
              const localReadLogKey = `has_logged_read_${user.uid}_${id}`;
              if (!localStorage.getItem(localReadLogKey) && profile) {
                logUserActivity({
                  uid: user.uid,
                  userName: profile.displayName || profile.email.split('@')[0],
                  userUsername: profile.username || '',
                  userPhoto: profile.photoURL || '',
                  type: 'read',
                  title: `Começou a ler a história "${story.title}"`,
                  targetId: id,
                  targetTitle: story.title,
                  createdAt: new Date().toISOString(),
                });
                localStorage.setItem(localReadLogKey, 'true');
              }
            }
          })
          .catch((err) => {
            console.error('Error saving progress to Firestore:', err);
          });
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [currentPage, story, id, user, profile]);

  const handleReviewSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'login' } }));
      return;
    }
    if (!id || rating === 0) return;
    setIsSubmitting(true);
    try {
      const userName = profile?.username
        ? `@${profile.username}`
        : profile?.displayName || user?.email?.split('@')[0] || t('reader');

      // Save comment with pending approval status
      await addDoc(collection(db, `stories/${id}/comments`), {
        text: comment.trim(),
        rating,
        userId: user.uid,
        userName,
        userEmail: user?.email || '',
        status: 'pending', // MUST BE APPROVED BY ADMIN
        createdAt: Timestamp.now(),
      });

      // Update story rating totals
      const storyRef = doc(db, 'stories', id);
      await updateDoc(storyRef, {
        rating: increment(rating),
        ratingsCount: increment(1),
      });

      if (user && profile && story) {
        await logUserActivity({
          uid: user.uid,
          userName: profile.displayName || profile.email.split('@')[0],
          userUsername: profile.username || '',
          userPhoto: profile.photoURL || '',
          type: 'comment',
          title: `Avaliou a história "${story.title}" com ${rating} estrelas`,
          targetId: id,
          targetTitle: story.title,
          details: comment.trim() || undefined,
          createdAt: new Date().toISOString(),
        });
      }

      unlockAchievement('first_review', user?.uid);

      setSubmitted(true);
    } catch (err) {
      console.error(err);
      alert(t('errorSubmitReview'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <div className="w-10 h-10 border-4 border-[#1A1A1A] dark:border-[#F5F5F0] border-t-transparent rounded-full animate-spin"></div>
        <div className="font-serif text-sm opacity-60">{t('loadingStory')}</div>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="text-center py-20 font-serif space-y-4">
        <p className="text-xl">{t('storyNotFound')}</p>
        <Link
          to="/"
          className="inline-block font-bold text-xs uppercase tracking-widest border-b border-current pb-1"
        >
          {t('backToLibrary')}
        </Link>
      </div>
    );
  }

  // Check scheduled release constraints
  const isScheduledFuture =
    story.scheduledReleaseAt &&
    new Date(story.scheduledReleaseAt).getTime() > Date.now();
  const isAdmin =
    profile?.role === 'admin' ||
    (user?.email || '').toLowerCase().trim() === ADMIN_EMAIL;
  const isAuthor = story.authorUid === user?.uid;

  if (isScheduledFuture && !isAdmin && !isAuthor) {
    const releaseDate = new Date(story.scheduledReleaseAt!);
    return (
      <div className="max-w-[600px] mx-auto py-20 px-6 text-center font-serif space-y-6 animate-in fade-in duration-500">
        <div className="w-16 h-16 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
          <Clock className="w-8 h-8" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-[#1A1A1A] dark:text-[#F5F5F0]">
          <TranslatedText text={story.title} />
        </h2>
        {story.author && (
          <p className="text-xs uppercase font-bold tracking-widest opacity-60">
            {t('by')} {story.author}
          </p>
        )}
        <div className="h-[1px] w-12 bg-[#1A1A1A]/10 dark:bg-white/10 mx-auto my-4"></div>
        <p className="text-sm text-[#1A1A1A]/70 dark:text-[#F5F5F0]/70 leading-relaxed max-w-md mx-auto">
          Esta obra está agendada e será lançada em breve! Prepare-se para
          embarcar nesta leitura no dia:
        </p>
        <div className="inline-block px-4 py-2 bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-500/20 rounded-xl font-mono text-sm font-bold">
          {releaseDate.toLocaleString()}
        </div>
        <div className="pt-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs uppercase font-bold tracking-widest border-b border-current pb-1 hover:opacity-80 transition-opacity"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {t('backToLibrary')}
          </Link>
        </div>
      </div>
    );
  }

  const hasNext = currentPage < (story?.totalPages || 1) - 1;
  const hasPrev = currentPage > 0;

  return (
    <div className="max-w-[800px] mx-auto pb-20 pt-4 relative">
      {/* Floating TOC Sidebar Trigger Button (when closed on desktop) */}
      {!showTocSidebar && (
        <button
          onClick={() => setShowTocSidebar(true)}
          className="fixed left-4 top-32 z-40 hidden xl:flex items-center gap-2 px-3.5 py-2.5 rounded-2xl paper-card shadow-lg hover:scale-105 transition-all text-xs font-bold uppercase tracking-wider"
          title={t('tableOfContents')}
        >
          <List className="w-4 h-4 text-amber-500" />
          <span>{t('tableOfContents')}</span>
        </button>
      )}

      {/* Floating Side Index Menu (Table of Contents) */}
      <AnimatePresence>
        {showTocSidebar && (
          <motion.aside
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="fixed left-4 xl:left-8 top-28 w-72 max-h-[72vh] overflow-y-auto z-40 p-5 rounded-2xl paper-card shadow-2xl hidden md:block custom-scrollbar"
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2">
                <List className="w-4 h-4 text-amber-500 shrink-0" />
                <h3 className="font-serif font-bold text-xs uppercase tracking-wider">
                  {t('tableOfContents')}
                </h3>
              </div>
              <button
                onClick={() => setShowTocSidebar(false)}
                className="p-1 rounded-lg opacity-60 hover:opacity-100"
                title={t('close')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {structuredToc.length === 0 ? (
                <p className="text-[11px] opacity-50 font-serif italic text-center py-6">
                  {t('noHeadings')}
                </p>
              ) : (
                structuredToc.map((section, sIdx) => (
                  <div
                    key={sIdx}
                    className="space-y-1.5"
                    onMouseEnter={() => setExpandedTocSection(sIdx)}
                    onMouseLeave={() => setExpandedTocSection(null)}
                  >
                    {/* H1 Title */}
                    <button
                      onClick={() => {
                        setExpandedTocSection(sIdx);
                        handleTocClick(section.h1);
                      }}
                      onFocus={() => setExpandedTocSection(sIdx)}
                      onBlur={() => setExpandedTocSection(null)}
                      className="w-full text-left font-serif font-bold text-xs hover:text-amber-600 dark:hover:text-amber-400 transition-colors flex items-start gap-1.5 py-1 px-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <span className="flex-1 leading-snug">
                        {section.h1.text}
                      </span>
                      <span className="text-[9px] font-mono opacity-50 px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 shrink-0">
                        Pág. {section.h1.pageIndex + 1}
                      </span>
                    </button>

                    {/* H2 Subtitles indented underneath */}
                    {section.h2s.length > 0 && (
                      <div
                        className={cn(
                          'mt-1 ml-3 flex flex-col gap-1 border-l border-amber-500/50 pl-3 overflow-hidden transition-all duration-200',
                          expandedTocSection === sIdx
                            ? 'max-h-[20rem] opacity-100'
                            : 'max-h-0 opacity-0',
                        )}
                      >
                        {section.h2s.map((h2, h2Idx) => (
                          <button
                            key={h2Idx}
                            onClick={() => handleTocClick(h2)}
                            className="block w-full text-left font-serif text-[11px] opacity-80 hover:opacity-100 hover:text-amber-600 dark:hover:text-amber-400 transition-colors flex items-start gap-1.5 py-0.5 pr-2 rounded-md hover:bg-black/5 dark:hover:bg-white/5 break-words"
                          >
                            <span className="flex-1 leading-snug">
                              {h2.text}
                            </span>
                            <span className="text-[8px] font-mono opacity-40 px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 shrink-0">
                              Pág. {h2.pageIndex + 1}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile / Tablet Floating Index Drawer / Modal */}
      <AnimatePresence>
        {showTocSidebar && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm md:hidden animate-fade-in">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="bg-white dark:bg-[#1A1A1A] w-full max-w-lg rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl border border-black/10 dark:border-white/10 space-y-4 max-h-[80vh] flex flex-col"
            >
              <div className="flex justify-between items-center pb-3 border-b border-black/5 dark:border-white/5 shrink-0">
                <div className="flex items-center gap-2">
                  <List className="w-5 h-5 text-amber-500" />
                  <h3 className="font-serif font-bold text-base">
                    {t('tableOfContents')}
                  </h3>
                </div>
                <button
                  onClick={() => setShowTocSidebar(false)}
                  className="p-1.5 rounded-full opacity-60 hover:opacity-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                {structuredToc.length === 0 ? (
                  <p className="text-xs opacity-50 font-serif italic text-center py-10">
                    {t('noHeadings')}
                  </p>
                ) : (
                  structuredToc.map((section, sIdx) => (
                    <div key={sIdx} className="space-y-2">
                      <button
                        onClick={() => handleTocClick(section.h1)}
                        className="w-full text-left font-serif font-bold text-sm hover:text-amber-500 transition-colors flex items-start gap-2 py-1.5 px-3 rounded-xl bg-black/5 dark:bg-white/5"
                      >
                        <span className="flex-1">{section.h1.text}</span>
                        <span className="text-[10px] font-mono opacity-50 px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 shrink-0">
                          Pág. {section.h1.pageIndex + 1}
                        </span>
                      </button>

                      {section.h2s.length > 0 && (
                        <div className="mt-1 ml-3 flex flex-col gap-1.5 border-l border-amber-500/50 pl-3">
                          {section.h2s.map((h2, h2Idx) => (
                            <button
                              key={h2Idx}
                              onClick={() => handleTocClick(h2)}
                              className="block w-full text-left font-serif text-xs opacity-80 hover:opacity-100 hover:text-amber-500 transition-colors flex items-start gap-2 py-1 pr-2 rounded-lg break-words"
                            >
                              <span className="flex-1">{h2.text}</span>
                              <span className="text-[9px] font-mono opacity-40 px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 shrink-0">
                                Pág. {h2.pageIndex + 1}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Sticky Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1.5 bg-[#1A1A1A]/10 dark:bg-white/10 z-50">
        <div
          className="h-full bg-[#1A1A1A] dark:bg-[#F5F5F0] transition-all duration-150 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      <Link
        to="/"
        className="inline-flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest opacity-60 hover:opacity-100 mb-8 transition-opacity"
      >
        <ArrowLeft className="w-4 h-4" /> {t('backToLibrary')}
      </Link>

      {/* Resume Progress Prompt */}
      {promptProgress && (
        <div className="rounded-2xl p-4 sm:p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in duration-300 paper-card">
          <div className="space-y-1 text-center sm:text-left">
            <p className="text-sm font-bold font-serif">
              {t('readingResumed')}
            </p>
            <p className="text-xs opacity-60">
              {t('readingRestored', { page: promptProgress.page + 1 })}
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => {
                setCurrentPage(0);
                setPromptProgress(null);
              }}
              className="text-xs uppercase tracking-wider px-4 py-2 opacity-60 hover:opacity-100 font-bold rounded-full paper-btn-light"
            >
              {t('restartPage1')}
            </button>
            <button
              onClick={() => setPromptProgress(null)}
              className="px-5 py-2.5 rounded-full font-bold text-[10px] uppercase tracking-widest paper-btn-dark"
            >
              {t('continueReading')}
            </button>
          </div>
        </div>
      )}

      <header className="mb-10 text-center">
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-serif font-bold mb-3 tracking-tight leading-tight">
          <TranslatedText text={story.title} />
        </h1>
        {story.author && (
          <div className="flex flex-col items-center gap-2 mb-6 opacity-60">
            <Link
              to={
                story.authorUid
                  ? `/profile/${story.authorUid}`
                  : `/user/${story.author}`
              }
              className="text-xs sm:text-sm font-bold uppercase tracking-widest hover:underline hover:opacity-100 transition-opacity"
            >
              {t('by')} {story.author}
            </Link>
            <p className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {Math.ceil(
                (story.wordCount || story.totalPages * 250) / 250,
              )}{' '}
              {t('readTime')}
            </p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6">
          <div className="flex items-center justify-center gap-4 text-[10px] font-bold uppercase tracking-widest opacity-40">
            <span className="w-12 h-[1px] bg-current"></span>
            <span>
              {t('pageOf', { page: currentPage + 1, total: story.totalPages })}
            </span>
            <span className="w-12 h-[1px] bg-current"></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
              {t('goTo')}
            </span>
            <select
              value={currentPage}
              onChange={(e) => setCurrentPage(parseInt(e.target.value, 10))}
              className="rounded-xl px-3 py-1 text-xs font-bold focus:outline-none cursor-pointer paper-card"
            >
              {Array.from({ length: story.totalPages }, (_, i) => (
                <option key={i} value={i}>
                  {
                    t('pageOf', { page: i + 1, total: story.totalPages })
                      .split(' de ')[0]
                      .split(' of ')[0]
                      .split(' dari ')[0]
                  }
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Compact Apple-style Customization Toolbar */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded-2xl paper-card shadow-sm select-none gap-2 relative z-30">
        {/* Left: Reading stats / progress status badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 opacity-80">
          <FileText className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider font-mono">
            {t('pageOf', { page: currentPage + 1, total: story.totalPages })}
          </span>
        </div>

        {/* Right: Compact control buttons */}
        <div className="flex items-center gap-1.5 justify-end w-full sm:w-auto">
          {/* Table of Contents Button */}
          <button
            onClick={() => {
              setShowTocSidebar(!showTocSidebar);
              setShowFormattingPanel(false);
              setShowMoreMenu(false);
            }}
            className={cn(
              "w-11 h-11 flex items-center justify-center rounded-xl transition-all relative group shadow-sm border border-black/5 dark:border-white/5",
              showTocSidebar 
                ? "paper-btn-dark font-extrabold" 
                : "paper-btn-light opacity-80 hover:opacity-100"
            )}
            title={t('tableOfContents')}
            aria-label={t('tableOfContents')}
          >
            <List className="w-5 h-5" />
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-[#1a1a1a] dark:bg-[#f5f5f0] text-white dark:text-[#1a1a1a] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 shadow-md whitespace-nowrap z-50 font-sans">
              {t('tableOfContents')}
            </span>
          </button>

          {/* Typography & Design Formatting Panel Button (AA) */}
          <button
            onClick={() => {
              setShowFormattingPanel(!showFormattingPanel);
              setShowMoreMenu(false);
            }}
            className={cn(
              "w-11 h-11 flex items-center justify-center rounded-xl transition-all relative group shadow-sm border border-black/5 dark:border-white/5",
              showFormattingPanel 
                ? "paper-btn-dark font-extrabold" 
                : "paper-btn-light opacity-80 hover:opacity-100"
            )}
            title={t('fontFamily')}
            aria-label={t('fontFamily')}
          >
            <Type className="w-5 h-5" />
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-[#1a1a1a] dark:bg-[#f5f5f0] text-white dark:text-[#1a1a1a] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 shadow-md whitespace-nowrap z-50 font-sans">
              {t('fontFamily')}
            </span>
          </button>

          {/* Bookmarks & Private Notes Button */}
          <button
            onClick={() => {
              setShowNotesDrawer(true);
              setShowFormattingPanel(false);
              setShowMoreMenu(false);
            }}
            className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all relative group shadow-sm border border-black/5 dark:border-white/5 paper-btn-light opacity-80 hover:opacity-100"
            title={t('bookmarks')}
            aria-label={t('bookmarks')}
          >
            <div className="relative">
              <Bookmark className="w-5 h-5 text-amber-500" />
              {notesList.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white dark:text-black font-mono text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white dark:border-[#1A1A1A]">
                  {notesList.length}
                </span>
              )}
            </div>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-[#1a1a1a] dark:bg-[#f5f5f0] text-white dark:text-[#1a1a1a] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 shadow-md whitespace-nowrap z-50 font-sans">
              {t('bookmarks')} ({notesList.length})
            </span>
          </button>

          {/* More Actions Context Menu (Three Dots) */}
          <div className="relative">
            <button
              onClick={() => {
                setShowMoreMenu(!showMoreMenu);
                setShowFormattingPanel(false);
              }}
              className={cn(
                "w-11 h-11 flex items-center justify-center rounded-xl transition-all relative group shadow-sm border border-black/5 dark:border-white/5",
                showMoreMenu 
                  ? "paper-btn-dark font-extrabold" 
                  : "paper-btn-light opacity-80 hover:opacity-100"
              )}
              title="Mais Opções"
              aria-label="Mais opções"
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-[#1a1a1a] dark:bg-[#f5f5f0] text-white dark:text-[#1a1a1a] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 shadow-md whitespace-nowrap z-50 font-sans">
                Mais Opções
              </span>
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
              {showMoreMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-56 p-1.5 rounded-2xl paper-card shadow-2xl border border-black/10 dark:border-white/10 z-50 flex flex-col gap-1"
                  >
                    {/* Offline Download Option */}
                    <button
                      onClick={async () => {
                        setShowMoreMenu(false);
                        if (!user) {
                          window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'login' } }));
                          return;
                        }
                        if (!id || !story) return;
                        if (isDownloaded) {
                          await removeOfflineStory(id);
                          setIsDownloaded(false);
                        } else {
                          setIsDownloading(true);
                          const pagesMap: { [pageIndex: number]: string } = {};
                          try {
                            const pSnap = await getDocs(
                              query(
                                collection(db, `stories/${id}/pages`),
                                orderBy('index', 'asc'),
                              ),
                            );
                            pSnap.docs.forEach((d) => {
                              const data = d.data();
                              pagesMap[data.index || 0] = cleanStoryHtml(data.content || '');
                            });
                            await saveStoryOffline({
                              id,
                              title: story.title,
                              author: story.author,
                              coverImage: story.coverImage,
                              totalPages: story.totalPages,
                              wordCount: story.wordCount,
                              pages: pagesMap,
                              downloadedAt: new Date().toISOString(),
                            });
                            setIsDownloaded(true);
                          } catch (e) {
                            console.error('Error saving offline:', e);
                          } finally {
                            setIsDownloading(false);
                          }
                        }
                      }}
                      disabled={isDownloading}
                      className={cn(
                        "w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-3 text-left",
                        isDownloaded
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "hover:bg-black/5 dark:hover:bg-white/5 opacity-85 hover:opacity-100 text-[#1A1A1A] dark:text-[#F5F5F0]"
                      )}
                    >
                      <Download className="w-4 h-4 shrink-0 text-emerald-500" />
                      <span className="truncate">
                        {isDownloading
                          ? '...'
                          : isDownloaded
                            ? t('downloadedOffline')
                            : t('downloadForOffline')}
                      </span>
                    </button>

                    {/* Add to Playlist Option */}
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        if (!user) {
                          window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'login' } }));
                          return;
                        }
                        loadPlaylists();
                        setShowPlaylistModal(true);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl text-xs font-bold hover:bg-black/5 dark:hover:bg-white/5 opacity-85 hover:opacity-100 transition-all flex items-center gap-3 text-left text-[#1A1A1A] dark:text-[#F5F5F0]"
                    >
                      <ListPlus className="w-4 h-4 text-blue-500 shrink-0" />
                      <span>{t('addToPlaylist')}</span>
                    </button>

                    {/* Translation Toggle Option */}
                    {language !== 'pt' && (
                      <button
                        onClick={() => {
                          setShowMoreMenu(false);
                          setIsTranslationEnabled(!isTranslationEnabled);
                        }}
                        className={cn(
                          "w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-3 text-left",
                          isTranslationEnabled
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold"
                            : "hover:bg-black/5 dark:hover:bg-white/5 opacity-85 hover:opacity-100 text-[#1A1A1A] dark:text-[#F5F5F0]"
                        )}
                      >
                        <Languages className="w-4 h-4 shrink-0 text-amber-500" />
                        <span className="truncate">
                          {isTranslationEnabled
                            ? t('showOriginalText')
                            : t('translateStory')}
                        </span>
                      </button>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Collapsible Apple-style Formatting Panel (AA) */}
      <AnimatePresence>
        {showFormattingPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mb-6 rounded-2xl p-4 sm:p-5 space-y-4 paper-card overflow-hidden shadow-md"
          >
            {/* 1. Font Family */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2 shrink-0">
                <Type className="w-4 h-4 opacity-60 text-amber-500" />
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">
                  {t('fontFamily')}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl w-full sm:w-auto paper-card">
                <button
                  onClick={() => setFontFamily('serif')}
                  className={cn(
                    'flex-1 min-w-[80px] sm:flex-none px-3 py-1.5 rounded-lg text-xs font-serif font-bold transition-all text-center',
                    fontFamily === 'serif'
                      ? 'paper-btn-dark shadow-sm'
                      : 'opacity-60 hover:opacity-100 text-[#1A1A1A] dark:text-[#F5F5F0]',
                  )}
                >
                  Serif
                </button>
                <button
                  onClick={() => setFontFamily('sans')}
                  className={cn(
                    'flex-1 min-w-[80px] sm:flex-none px-3 py-1.5 rounded-lg text-xs font-sans font-bold transition-all text-center',
                    fontFamily === 'sans'
                      ? 'paper-btn-dark shadow-sm'
                      : 'opacity-60 hover:opacity-100 text-[#1A1A1A] dark:text-[#F5F5F0]',
                  )}
                >
                  Sans
                </button>
                <button
                  onClick={() => setFontFamily('opendyslexic')}
                  className={cn(
                    'flex-1 min-w-[100px] sm:flex-none px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all font-opendyslexic text-center truncate',
                    fontFamily === 'opendyslexic'
                      ? 'paper-btn-amber font-extrabold shadow-sm'
                      : 'opacity-70 hover:opacity-100 text-[#1A1A1A] dark:text-[#F5F5F0]',
                  )}
                  title={t('openDyslexic')}
                >
                  Dyslexic
                </button>
              </div>
            </div>

            {/* 2. Reading Theme */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2 shrink-0">
                {readerMode === 'dark' ? <Moon className="w-4 h-4 opacity-60 text-indigo-400" /> : <Sun className="w-4 h-4 opacity-60 text-amber-500" />}
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">
                  {t('readingTheme')}
                </span>
              </div>
              <div className="flex items-center gap-1.5 p-1 rounded-xl w-full sm:w-auto paper-card">
                <button
                  onClick={() => setReaderMode('light')}
                  className={cn(
                    'flex-1 min-w-[100px] sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5',
                    readerMode === 'light'
                      ? 'bg-amber-100 text-amber-900 border border-amber-200 shadow-sm'
                      : 'opacity-60 hover:opacity-100 text-[#1A1A1A] dark:text-[#F5F5F0]',
                  )}
                >
                  <Sun className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
                  <span>{t('lightTheme').split(' ')[0]}</span>
                </button>
                <button
                  onClick={() => setReaderMode('dark')}
                  className={cn(
                    'flex-1 min-w-[100px] sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5',
                    readerMode === 'dark'
                      ? 'paper-btn-dark shadow-sm'
                      : 'opacity-60 hover:opacity-100 text-[#1A1A1A] dark:text-[#F5F5F0]',
                  )}
                >
                  <Moon className="w-3.5 h-3.5 text-indigo-300 fill-indigo-300/20" />
                  <span>{t('darkTheme').split(' ')[0]}</span>
                </button>
              </div>
            </div>

            {/* 3. Margins & Line Spacing */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-black/5 dark:border-white/5 font-sans">
              {/* Margins */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 flex-1">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">
                  {t('marginSize')}
                </span>
                <div className="flex items-center gap-1 p-1 rounded-xl paper-card w-full sm:w-auto">
                  {[
                    { label: t('narrowMargin'), val: 'narrow' },
                    { label: t('normalMargin'), val: 'normal' },
                    { label: t('wideMargin'), val: 'wide' }
                  ].map((m) => (
                    <button
                      key={m.val}
                      onClick={() => setMarginSize(m.val as any)}
                      className={cn(
                        'flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded-lg transition-all',
                        marginSize === m.val
                          ? 'paper-btn-dark shadow-sm'
                          : 'opacity-60 hover:opacity-100 text-[#1A1A1A] dark:text-[#F5F5F0]',
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Spacing */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 flex-1 font-sans">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">
                  {t('lineSpacing')}
                </span>
                <div className="flex items-center gap-1 p-1 rounded-xl paper-card w-full sm:w-auto">
                  {[
                    { label: '1.4', val: 'compact' },
                    { label: '1.8', val: 'relaxed' },
                    { label: '2.2', val: 'loose' }
                  ].map((ls) => (
                    <button
                      key={ls.val}
                      onClick={() => setLineSpacing(ls.val as any)}
                      className={cn(
                        'flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded-lg transition-all',
                        lineSpacing === ls.val
                          ? 'paper-btn-dark shadow-sm'
                          : 'opacity-60 hover:opacity-100 text-[#1A1A1A] dark:text-[#F5F5F0]',
                      )}
                    >
                      {ls.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 4. Eye Comfort */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 font-sans">
              <div className="flex items-center gap-2.5 w-full md:w-auto min-w-0">
                <div
                  className={cn(
                    'p-2 rounded-xl transition-colors shrink-0 flex items-center justify-center',
                    eyeComfortIntensity > 0
                      ? 'bg-amber-400/20 text-amber-700 dark:text-amber-300'
                      : 'bg-[#1A1A1A]/5 dark:bg-white/5 opacity-60',
                  )}
                >
                  <Eye className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold font-serif uppercase tracking-wider">
                      {t('eyeComfort')}
                    </h3>
                    {eyeComfortIntensity > 0 && (
                      <span className="text-[9px] bg-amber-400/25 text-amber-900 dark:text-amber-200 font-mono font-bold px-2 py-0.5 rounded-full">
                        {eyeComfortIntensity}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto min-w-0">
                {/* Slider */}
                <div className="flex items-center gap-2.5 w-full sm:flex-1 sm:min-w-[180px] px-3 py-1.5 rounded-xl paper-card">
                  <Sun className="w-3.5 h-3.5 opacity-50 shrink-0 text-amber-500" />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={eyeComfortIntensity}
                    onChange={(e) => setEyeComfortIntensity(Number(e.target.value))}
                    className="w-full h-1.5 bg-[#1A1A1A]/10 dark:bg-white/20 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    title={t('filterIntensity')}
                    aria-label={t('filterIntensity')}
                  />
                  <span className="text-[10px] font-mono font-bold w-9 text-right shrink-0">
                    {eyeComfortIntensity}%
                  </span>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1 w-full sm:w-auto justify-start sm:justify-end">
                  {[
                    { label: t('off'), val: 0 },
                    { label: '25%', val: 25 },
                    { label: '50%', val: 50 },
                    { label: '75%', val: 75 },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      onClick={() => setEyeComfortIntensity(preset.val)}
                      className={cn(
                        'text-[9px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all',
                        eyeComfortIntensity === preset.val
                          ? 'paper-btn-amber font-extrabold shadow-sm'
                          : 'opacity-70 hover:opacity-100 paper-btn-light text-[#1A1A1A] dark:text-[#F5F5F0]',
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reader Page Frame */}
      <div 
        className={cn(
          "relative min-h-[50vh] p-6 sm:p-10 rounded-2xl transition-all overflow-hidden w-full break-words shadow-lg border border-black/5",
          readerMode === "dark" 
            ? "paper-card text-[#F5F5F0]" 
            : "bg-[#FDFCF9] text-[#1A1A1A]"
        )}
      >
        {/* Active Translation Indicator */}
        {language !== 'pt' && isTranslationEnabled && (
          <div 
            className={cn(
              "mb-6 px-3.5 py-2 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider",
              readerMode === "dark"
                ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                : "bg-amber-500/5 text-amber-800 border-amber-500/15"
            )}
          >
            <div className="flex items-center gap-2">
              <Languages className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                {t('storyTranslationActive', { lang: language.toUpperCase() })}
              </span>
            </div>
            {isTranslating ? (
              <span className="opacity-80 animate-pulse flex items-center gap-1.5 font-mono text-amber-600 dark:text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block" />
                {t('translatingStoryPage')}
              </span>
            ) : (
              <span className="opacity-70 font-mono text-[9px]">
                {t('naturalTranslationNotice')}
              </span>
            )}
          </div>
        )}

        {/* Eye Comfort Warm Yellow Filter Overlay */}
        {eyeComfortIntensity > 0 && (
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none z-20 transition-colors duration-200"
            style={{
              backgroundColor: readerMode === 'dark'
                ? `rgba(251, 191, 36, ${(eyeComfortIntensity / 100) * 0.22})`
                : `rgba(245, 180, 0, ${(eyeComfortIntensity / 100) * 0.36})`,
              mixBlendMode: readerMode === 'dark' ? 'screen' : 'multiply',
            }}
          />
        )}
        <AnimatePresence mode="wait">
          {loadingPage ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex justify-center py-20"
            >
              <div className="animate-pulse text-sm font-serif opacity-50">
                {t('loadingPage')}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              ref={containerRef}
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
              dangerouslySetInnerHTML={{ __html: displayContent }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Reader Controls */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-between border-t border-[#1A1A1A]/10 dark:border-white/10 pt-6 gap-4">
        <button
          onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
          disabled={!hasPrev}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 sm:px-6 py-3 rounded-full font-bold text-[10px] uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed paper-btn-light"
        >
          <ChevronLeft className="w-4 h-4" /> {t('previous')}
        </button>

        {(() => {
          const parts = t('pageOf', { total: story.totalPages }).split(
            '{page}',
          );
          const prefix = parts[0]?.trim() || '';
          const suffix = parts[1]?.trim() || '';
          return (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                {prefix}
              </span>
              <select
                value={currentPage}
                onChange={(e) => setCurrentPage(parseInt(e.target.value, 10))}
                className="rounded-xl px-3 py-1.5 text-xs font-bold font-mono focus:outline-none paper-card cursor-pointer"
              >
                {Array.from({ length: story.totalPages }, (_, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                {suffix}
              </span>
            </div>
          );
        })()}

        <button
          onClick={() =>
            setCurrentPage((p) => Math.min(story.totalPages - 1, p + 1))
          }
          disabled={!hasNext}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 sm:px-6 py-3 rounded-full font-bold text-[10px] uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed paper-btn-dark"
        >
          {t('next')} <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* APPROVED COMMENTS SECTION */}
      {approvedComments.length > 0 && (
        <div className="mt-16 pt-12 border-t border-[#1A1A1A]/10 dark:border-white/10 space-y-6">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 opacity-60" />
            <h3 className="font-serif font-bold text-xl">
              {t('approvedComments')}
            </h3>
          </div>

          <div className="space-y-4">
            {approvedComments.map((c) => (
              <div key={c.id} className="p-5 rounded-2xl space-y-2 paper-card">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-[#1A1A1A]/10 dark:bg-white/10 rounded-full flex items-center justify-center font-bold text-xs">
                      <UserIcon className="w-3.5 h-3.5 opacity-60" />
                    </div>
                    <span className="font-bold text-xs">{c.userName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          'w-3.5 h-3.5',
                          i < c.rating
                            ? 'fill-amber-400 text-amber-400'
                            : 'opacity-20',
                        )}
                      />
                    ))}
                  </div>
                </div>
                {c.text && (
                  <p className="text-xs font-serif leading-relaxed opacity-90 pt-1">
                    {c.text}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RATING & COMMENT FORM AT THE END */}
      {!hasNext && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-16 border-t border-[#1A1A1A]/10 dark:border-white/10 pt-12"
        >
          {/* Supporters and Contributors Area */}
          {(() => {
            if (!story.supporters) return null;
            const supportersList = (
              Array.isArray(story.supporters)
                ? story.supporters
                : (story.supporters as string).split(',').map((s) => s.trim())
            ).filter(Boolean);

            if (supportersList.length === 0) return null;

            return (
              <div className="mb-12 max-w-lg mx-auto text-center p-6 sm:p-8 rounded-2xl bg-amber-500/5 border border-amber-500/10 space-y-4">
                <div className="flex items-center justify-center gap-2">
                  <Heart className="w-5 h-5 text-amber-500 fill-amber-500/20 animate-pulse" />
                  <h3 className="font-serif font-bold text-lg sm:text-xl text-[#1A1A1A] dark:text-white">
                    {t('storySupporters')}
                  </h3>
                </div>
                <p className="text-xs opacity-70 font-serif italic max-w-md mx-auto">
                  {t('specialThanks')}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  {supportersList.map((supporter, idx) => (
                    <span
                      key={idx}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#1A1A1A]/5 dark:bg-white/5 border border-black/5 dark:border-white/5 tracking-wide text-[#1A1A1A] dark:text-white/90"
                    >
                      {supporter}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="text-center mb-8">
            <h2 className="text-2xl font-serif font-bold mb-2">
              {t('endOfStory')}
            </h2>
            <p className="opacity-60 text-xs sm:text-sm font-serif">
              {t('enjoyedReading')}
            </p>
          </div>

          {submitted ? (
            <div className="rounded-2xl p-8 text-center space-y-3 paper-card">
              <CheckCircle className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
              <p className="font-bold uppercase tracking-widest text-xs">
                {t('reviewSent')}
              </p>
              <p className="opacity-60 text-xs max-w-sm mx-auto">
                {t('reviewSavedPending')}
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleReviewSubmit}
              className="rounded-2xl p-6 sm:p-8 max-w-lg mx-auto space-y-6 paper-card"
            >
              <div className="text-center">
                <label className="block text-[10px] font-bold uppercase tracking-widest opacity-60 mb-4">
                  {t('yourRating')}
                </label>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="focus:outline-none transition-transform hover:scale-125"
                      title={`${star} / 5`}
                    >
                      <Star
                        className={cn(
                          'w-8 h-8',
                          rating >= star
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-black/20 dark:text-white/20',
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest opacity-60 mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> {t('commentLabel')}
                </label>
                <textarea
                  value={comment || ''}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full rounded-xl p-4 focus:outline-none resize-none text-xs sm:text-sm paper-card"
                  rows={4}
                  placeholder={t('commentPlaceholder')}
                />
                <p className="text-[10px] opacity-50 mt-1">
                  {t('moderationNotice')}
                </p>
              </div>

              <button
                type="submit"
                disabled={rating === 0 || isSubmitting}
                className="w-full py-4 rounded-full font-bold text-[10px] uppercase tracking-widest disabled:opacity-50 paper-btn-dark"
              >
                {isSubmitting ? t('sending') : t('submitReview')}
              </button>
            </form>
          )}
        </motion.div>
      )}

      {/* Scroll to Top Floating Button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToTop}
            className="fixed bottom-6 right-6 p-3.5 rounded-full z-50 flex items-center justify-center paper-btn-dark shadow-2xl transition-all"
            title="Voltar ao topo"
          >
            <ArrowUp className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Bookmarks & Private Notes Drawer Modal */}
      {showNotesDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#1A1A1A] w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-black/10 dark:border-white/10 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-black/5 dark:border-white/5 shrink-0">
              <div className="flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-amber-500" />
                <h3 className="font-serif font-bold text-lg">
                  {t('bookmarks')}
                </h3>
              </div>
              <button
                onClick={() => setShowNotesDrawer(false)}
                className="text-xs uppercase font-bold tracking-widest opacity-60 hover:opacity-100"
              >
                {t('close')}
              </button>
            </div>

            {/* Add new Note for current page */}
            <div className="space-y-2 shrink-0">
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60">
                {t('addNoteForPage', { page: currentPage + 1 })}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newNoteInput || ''}
                  onChange={(e) => setNewNoteInput(e.target.value)}
                  placeholder="Anotação ou citação privada..."
                  className="flex-1 p-2.5 text-xs bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-black/10 dark:border-white/10 rounded-xl focus:outline-none"
                />
                <button
                  onClick={() => {
                    if (!id) return;
                    saveBookmarkNote({
                      id: `note_${Date.now()}`,
                      storyId: id,
                      pageIndex: currentPage,
                      noteText: newNoteInput,
                      createdAt: new Date().toISOString(),
                    });
                    setNewNoteInput('');
                    setNotesList(getBookmarksAndNotes(id));
                  }}
                  className="bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest shrink-0"
                >
                  {t('save')}
                </button>
              </div>
            </div>

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto space-y-3 pt-2 pr-1 custom-scrollbar">
              {notesList.length === 0 ? (
                <div className="text-center py-10 opacity-50 font-serif text-xs">
                  {t('noNotesFound')}
                </div>
              ) : (
                notesList.map((n) => (
                  <div
                    key={n.id}
                    className="p-3.5 bg-[#F5F5F0] dark:bg-[#0A0A0A] rounded-xl border border-black/5 dark:border-white/5 space-y-2"
                  >
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider opacity-60">
                      <span>
                        {t('pageSingular').charAt(0).toUpperCase() +
                          t('pageSingular').slice(1)}{' '}
                        {n.pageIndex + 1}
                      </span>
                      <span>{new Date(n.createdAt).toLocaleDateString()}</span>
                    </div>
                    {n.noteText && (
                      <p className="text-xs font-serif leading-relaxed opacity-90">
                        {n.noteText}
                      </p>
                    )}
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setCurrentPage(n.pageIndex)}
                        className="text-[9px] bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold uppercase tracking-wider px-2 py-1 rounded-md"
                      >
                        {t('goToPage')}
                      </button>
                      <button
                        onClick={() => {
                          if (!id) return;
                          deleteBookmarkNote(id, n.id);
                          setNotesList(getBookmarksAndNotes(id));
                        }}
                        className="text-[9px] text-red-500 font-bold uppercase tracking-wider px-2 py-1 rounded-md hover:bg-red-500/10"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* Playlist Selector Modal */}
      {showPlaylistModal && id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-[#1A1A1A] w-full max-w-md rounded-2xl p-6 shadow-2xl border border-black/10 dark:border-white/10 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-black/5 dark:border-white/5">
              <div>
                <h3 className="font-serif font-bold text-lg flex items-center gap-2">
                  <ListPlus className="w-5 h-5 text-blue-500" />
                  <span>{t('addToPlaylist')}</span>
                </h3>
                <p className="text-[11px] opacity-60 truncate max-w-[280px]">
                  {story?.title || t('storyTableHead')}
                </p>
              </div>
              <button
                onClick={() => setShowPlaylistModal(false)}
                className="p-1.5 rounded-full opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List of Playlists */}
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {playlists.length === 0 ? (
                <p className="text-xs opacity-60 italic text-center py-4">
                  {t('emptyPlaylist')}
                </p>
              ) : (
                playlists.map((pl) => {
                  const inPlaylist = pl.storyIds.includes(id);
                  return (
                    <div
                      key={pl.id}
                      className="p-3 bg-[#F5F5F0] dark:bg-[#0A0A0A] rounded-xl flex items-center justify-between border border-black/5 dark:border-white/5"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <h4 className="font-serif font-bold text-xs truncate">
                          {pl.title}
                        </h4>
                        <p className="text-[10px] opacity-50 uppercase font-mono">
                          {t('storiesCount', { count: pl.storyIds.length })}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          const updated = await toggleStoryInPlaylist(pl, id);
                          setPlaylists((prev) =>
                            prev.map((p) =>
                              p.id === updated.id ? updated : p,
                            ),
                          );
                        }}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 shrink-0',
                          inPlaylist
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : 'bg-black/10 dark:bg-white/10 hover:bg-black/20 text-black dark:text-white',
                        )}
                      >
                        {inPlaylist ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>{t('remove')}</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            <span>{t('add')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Inline Quick Create Playlist */}
            <div className="pt-2 border-t border-black/5 dark:border-white/5 space-y-2">
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60">
                {t('createPlaylist')}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPlaylistTitle || ''}
                  onChange={(e) => setNewPlaylistTitle(e.target.value)}
                  placeholder="Nome da nova playlist..."
                  className="flex-1 p-2 text-xs bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-black/10 dark:border-white/10 rounded-xl focus:outline-none"
                />
                <button
                  onClick={async () => {
                    if (!newPlaylistTitle.trim()) return;
                    const newPl: ReadingList = {
                      id: `pl_${Date.now()}`,
                      title: newPlaylistTitle,
                      description: 'Coleção de leituras',
                      userId: user?.uid || 'guest',
                      userName: profile?.username
                        ? `@${profile.username}`
                        : profile?.displayName || 'Leitor',
                      isPublic: true,
                      storyIds: [id],
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    };
                    await createOrUpdatePlaylist(newPl);
                    if (user && profile) {
                      await logUserActivity({
                        uid: user.uid,
                        userName:
                          profile.displayName || profile.email.split('@')[0],
                        userUsername: profile.username || '',
                        userPhoto: profile.photoURL || '',
                        type: 'published',
                        title: `Criou a playlist pública "${newPl.title}"`,
                        targetId: newPl.id,
                        targetTitle: newPl.title,
                        createdAt: new Date().toISOString(),
                      });
                    }
                    setNewPlaylistTitle('');
                    await loadPlaylists();
                  }}
                  className="bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider shrink-0"
                >
                  Criar & Incluir
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowPlaylistModal(false)}
                className="bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest"
              >
                Concluído
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
