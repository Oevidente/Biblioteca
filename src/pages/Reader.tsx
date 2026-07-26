import { useEffect, useState, useRef, type FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
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
  where 
} from "../lib/firebase";
import { ChevronLeft, ChevronRight, ArrowLeft, Star, MessageSquare, CheckCircle, ShieldAlert, User as UserIcon, ArrowUp, Clock, Eye, Sun, Type, Download, Bookmark, FileText, Check, ListPlus, Plus, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth, ADMIN_EMAIL } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { saveStoryOffline, isStoryDownloaded, removeOfflineStory } from "../lib/offlineStorage";
import { getBookmarksAndNotes, saveBookmarkNote, deleteBookmarkNote, BookmarkNote } from "../lib/bookmarks";
import { fetchPublicPlaylists, ReadingList, toggleStoryInPlaylist, createOrUpdatePlaylist } from "../lib/playlists";
import { unlockAchievement } from "../lib/achievements";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
  status?: "pending" | "approved" | "rejected" | "hidden";
  createdAt: any;
}

export function Reader() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const { t } = useLanguage();

  const [story, setStory] = useState<StoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageContent, setPageContent] = useState<string>("");
  const [loadingPage, setLoadingPage] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [promptProgress, setPromptProgress] = useState<{page: number} | null>(null);
  const isInitialProgressLoaded = useRef(false);
  
  const [approvedComments, setApprovedComments] = useState<CommentData[]>([]);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Advanced Typography & Themes
  const [fontFamily, setFontFamily] = useState<"serif" | "sans" | "opendyslexic">(() => {
    return (localStorage.getItem("inkora_font_family") as any) || "serif";
  });
  const [marginSize, setMarginSize] = useState<"narrow" | "normal" | "wide">(() => {
    return (localStorage.getItem("inkora_margin_size") as any) || "normal";
  });
  const [lineSpacing, setLineSpacing] = useState<"compact" | "relaxed" | "loose">(() => {
    return (localStorage.getItem("inkora_line_spacing") as any) || "relaxed";
  });

  // Offline and Bookmarks
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [notesList, setNotesList] = useState<BookmarkNote[]>([]);
  const [newNoteInput, setNewNoteInput] = useState("");
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);

  // Playlists State
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlists, setPlaylists] = useState<ReadingList[]>([]);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");

  const loadPlaylists = async () => {
    const list = await fetchPublicPlaylists();
    setPlaylists(list);
  };

  // Multi-criteria Ratings
  const [plotRating, setPlotRating] = useState(0);
  const [characterRating, setCharacterRating] = useState(0);
  const [writingRating, setWritingRating] = useState(0);

  // Eye Comfort yellow filter intensity state (0 to 100)
  const [eyeComfortIntensity, setEyeComfortIntensity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("inkora_eye_comfort_intensity");
      return saved !== null ? Math.min(100, Math.max(0, Number(saved))) : 0;
    } catch (e) {
      return 0;
    }
  });

  useEffect(() => {
    localStorage.setItem("inkora_font_family", fontFamily);
    if (fontFamily === "opendyslexic") {
      unlockAchievement("polyglot");
    }
  }, [fontFamily]);

  useEffect(() => {
    localStorage.setItem("inkora_margin_size", marginSize);
  }, [marginSize]);

  useEffect(() => {
    localStorage.setItem("inkora_line_spacing", lineSpacing);
  }, [lineSpacing]);

  useEffect(() => {
    if (id) {
      isStoryDownloaded(id).then(setIsDownloaded);
      setNotesList(getBookmarksAndNotes(id));
      unlockAchievement("first_page");

      // Check night owl achievement
      const currentHour = new Date().getHours();
      if (currentHour >= 0 && currentHour < 5) {
        unlockAchievement("night_owl");
      }
    }
  }, [id]);

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("inkora_eye_comfort_intensity", eyeComfortIntensity.toString());
    } catch (e) {
      console.error("Error saving eye comfort intensity:", e);
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
        const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const currentScrollPercent = docHeight > 0 ? (window.scrollY / docHeight) : 1;
        const overallProgress = ((currentPage + currentScrollPercent) / story.totalPages) * 100;
        setScrollProgress(Math.min(overallProgress, 100));
      }
    };
    window.addEventListener("scroll", handleScroll);
    handleScroll(); // Initial check
    return () => window.removeEventListener("scroll", handleScroll);
  }, [currentPage, story]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Load Story metadata & saved progress
  useEffect(() => {
    async function loadStory() {
      if (!id) return;
      isInitialProgressLoaded.current = false;

      // Check local cached_stories first for immediate render
      let cachedTotalPages = 1;
      try {
        const cachedStories = localStorage.getItem("luminary_cached_stories");
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
        const docRef = doc(db, "stories", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as StoryData;
          setStory(data);
          
          // Check progress in Firestore if user is logged in
          let savedPage = 0;
          if (user) {
            try {
              const progRef = doc(db, `users/${user.uid}/progress`, id);
              const progSnap = await getDoc(progRef);
              if (progSnap.exists()) {
                const pData = progSnap.data();
                if (typeof pData.page === "number") {
                  savedPage = pData.page;
                }
              }
            } catch (e) {
              console.error("Error loading user progress from Firestore:", e);
            }
          }

          if (savedPage === 0) {
            const savedStr = localStorage.getItem(`progress_${id}`);
            if (savedStr) savedPage = parseInt(savedStr, 10) || 0;
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

  // Load Page Content
  useEffect(() => {
    async function loadPage() {
      if (!id || !story) return;

      const cacheKey = `page_cache_${id}_${currentPage}`;
      const cachedPage = sessionStorage.getItem(cacheKey);
      if (cachedPage) {
        setPageContent(cachedPage);
        setLoadingPage(false);
      } else {
        setLoadingPage(true);
      }

      try {
        const pageRef = doc(db, `stories/${id}/pages`, currentPage.toString());
        const pageSnap = await getDoc(pageRef);
        if (pageSnap.exists()) {
          const content = pageSnap.data().content;
          setPageContent(content);
          try {
            sessionStorage.setItem(cacheKey, content);
          } catch (e) {
            console.error(e);
          }
        } else {
          setPageContent("<p>" + t("pageNotFound") + "</p>");
        }
      } catch (err) {
        console.error(err);
        if (!cachedPage) {
          setPageContent("<p>" + t("errorLoadingPage") + "</p>");
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
        const q = query(commentsRef, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        const list: CommentData[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          // Filter ONLY approved comments for public view
          if (data.status === "approved") {
            list.push({
              id: docSnap.id,
              text: data.text,
              rating: data.rating,
              userName: data.userName || t("reader"),
              status: data.status,
              createdAt: data.createdAt
            });
          }
        });
        setApprovedComments(list);
      } catch (err) {
        console.error("Error loading comments:", err);
      }
    }

    loadApprovedComments();
  }, [id, submitted]);

  // Save Progress as user turns pages
  useEffect(() => {
    if (!story || !id || !isInitialProgressLoaded.current) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    
    // 1. Save local progress
    localStorage.setItem(`progress_${id}`, currentPage.toString());
    
    // 2. Save reading history
    try {
      const historyStr = localStorage.getItem('reading_history');
      let history: any[] = historyStr ? JSON.parse(historyStr) : [];
      history = history.filter(h => h.id !== id);
      history.unshift({
        id,
        title: story.title || "Sem título",
        coverImage: story.coverImage || "",
        page: currentPage || 0,
        totalPages: story.totalPages || 0,
        timestamp: new Date().toISOString()
      });
      localStorage.setItem('reading_history', JSON.stringify(history.slice(0, 50)));
    } catch (e) {
      console.error(e);
    }

    // 3. Save progress to Firestore if logged in
    if (user) {
      const progRef = doc(db, `users/${user.uid}/progress`, id);
      setDoc(progRef, {
        storyId: id,
        storyTitle: story.title || "Sem título",
        coverImage: story.coverImage || "",
        page: currentPage || 0,
        totalPages: story.totalPages ?? 0,
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(err => {
        console.error("Error saving progress to Firestore:", err);
      });
    }
  }, [currentPage, story, id, user]);

  const handleReviewSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || rating === 0) return;
    setIsSubmitting(true);
    try {
      const userName = profile?.username ? `@${profile.username}` : (profile?.displayName || user?.email?.split("@")[0] || t("reader"));
      
      // Save comment with pending approval status
      await addDoc(collection(db, `stories/${id}/comments`), {
        text: comment.trim(),
        rating,
        userId: user?.uid || "guest",
        userName,
        userEmail: user?.email || "",
        status: "pending", // MUST BE APPROVED BY ADMIN
        createdAt: Timestamp.now()
      });

      // Update story rating totals
      const storyRef = doc(db, "stories", id);
      await updateDoc(storyRef, {
        rating: increment(rating),
        ratingsCount: increment(1)
      });
      
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      alert(t("errorSubmitReview"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <div className="w-10 h-10 border-4 border-[#1A1A1A] dark:border-[#F5F5F0] border-t-transparent rounded-full animate-spin"></div>
        <div className="font-serif text-sm opacity-60">{t("loadingStory")}</div>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="text-center py-20 font-serif space-y-4">
        <p className="text-xl">{t("storyNotFound")}</p>
        <Link to="/" className="inline-block font-bold text-xs uppercase tracking-widest border-b border-current pb-1">
          {t("backToLibrary")}
        </Link>
      </div>
    );
  }

  // Check scheduled release constraints
  const isScheduledFuture = story.scheduledReleaseAt && new Date(story.scheduledReleaseAt).getTime() > Date.now();
  const isAdmin = profile?.role === "admin" || (user?.email || "").toLowerCase().trim() === ADMIN_EMAIL;
  const isAuthor = story.authorUid === user?.uid;

  if (isScheduledFuture && !isAdmin && !isAuthor) {
    const releaseDate = new Date(story.scheduledReleaseAt!);
    return (
      <div className="max-w-[600px] mx-auto py-20 px-6 text-center font-serif space-y-6 animate-in fade-in duration-500">
        <div className="w-16 h-16 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
          <Clock className="w-8 h-8" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-[#1A1A1A] dark:text-[#F5F5F0]">
          {story.title}
        </h2>
        {story.author && (
          <p className="text-xs uppercase font-bold tracking-widest opacity-60">
            {t("by")} {story.author}
          </p>
        )}
        <div className="h-[1px] w-12 bg-[#1A1A1A]/10 dark:bg-white/10 mx-auto my-4"></div>
        <p className="text-sm text-[#1A1A1A]/70 dark:text-[#F5F5F0]/70 leading-relaxed max-w-md mx-auto">
          Esta obra está agendada e será lançada em breve! Prepare-se para embarcar nesta leitura no dia:
        </p>
        <div className="inline-block px-4 py-2 bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-500/20 rounded-xl font-mono text-sm font-bold">
          {releaseDate.toLocaleString()}
        </div>
        <div className="pt-6">
          <Link to="/" className="inline-flex items-center gap-2 text-xs uppercase font-bold tracking-widest border-b border-current pb-1 hover:opacity-80 transition-opacity">
            <ArrowLeft className="w-3.5 h-3.5" /> {t("backToLibrary")}
          </Link>
        </div>
      </div>
    );
  }

  const hasNext = currentPage < (story?.totalPages || 1) - 1;
  const hasPrev = currentPage > 0;

  return (
    <div className="max-w-[800px] mx-auto pb-20 pt-4">
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
        <ArrowLeft className="w-4 h-4" /> {t("backToLibrary")}
      </Link>
      
      {/* Resume Progress Prompt */}
      {promptProgress && (
        <div className="rounded-2xl p-4 sm:p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in duration-300 paper-card">
          <div className="space-y-1 text-center sm:text-left">
            <p className="text-sm font-bold font-serif">{t("readingResumed")}</p>
            <p className="text-xs opacity-60">{t("readingRestored", { page: promptProgress.page + 1 })}</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <button 
              onClick={() => { setCurrentPage(0); setPromptProgress(null); }} 
              className="text-xs uppercase tracking-wider px-4 py-2 opacity-60 hover:opacity-100 font-bold rounded-full paper-btn-light"
            >
              {t("restartPage1")}
            </button>
            <button 
              onClick={() => setPromptProgress(null)} 
              className="px-5 py-2.5 rounded-full font-bold text-[10px] uppercase tracking-widest paper-btn-dark"
            >
              {t("continueReading")}
            </button>
          </div>
        </div>
      )}

      <header className="mb-10 text-center">
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-serif font-bold mb-3 tracking-tight leading-tight">{story.title}</h1>
        {story.author && (
          <div className="flex flex-col items-center gap-2 mb-6 opacity-60">
            <p className="text-xs sm:text-sm font-bold uppercase tracking-widest">{t("by")} {story.author}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {Math.ceil((story.wordCount || (story.totalPages * 250)) / 250)} {t("readTime")}
            </p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6">
          <div className="flex items-center justify-center gap-4 text-[10px] font-bold uppercase tracking-widest opacity-40">
            <span className="w-12 h-[1px] bg-current"></span>
            <span>{t("pageOf", { page: currentPage + 1, total: story.totalPages })}</span>
            <span className="w-12 h-[1px] bg-current"></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{t("goTo")}</span>
            <select
              value={currentPage}
              onChange={(e) => setCurrentPage(parseInt(e.target.value, 10))}
              className="rounded-xl px-3 py-1 text-xs font-bold focus:outline-none cursor-pointer paper-card"
            >
              {Array.from({ length: story.totalPages }, (_, i) => (
                <option key={i} value={i}>
                  {t("pageOf", { page: i + 1, total: story.totalPages }).split(" de ")[0].split(" of ")[0].split(" dari ")[0]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Customization Toolbar (Typography, Theme, Offline & Bookmarks) */}
      <div className="mb-6 rounded-2xl p-3.5 sm:p-5 space-y-3 sm:space-y-4 paper-card">
        {/* Row 1: Font Family & Tools Grid */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pb-3 border-b border-black/5 dark:border-white/5">
          {/* Font Family Selector */}
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <Type className="w-4 h-4 opacity-60 shrink-0 hidden sm:inline" />
            <span className="text-xs font-bold uppercase tracking-wider opacity-70 hidden sm:inline">{t("fontFamily")}:</span>
            <div className="flex items-center gap-1 p-1 rounded-xl w-full lg:w-auto paper-card">
              <button
                onClick={() => setFontFamily("serif")}
                className={cn(
                  "flex-1 lg:flex-none px-2.5 py-1.5 sm:py-1 rounded-lg text-xs font-serif font-bold transition-all text-center",
                  fontFamily === "serif" ? "paper-btn-dark shadow-sm" : "opacity-60 hover:opacity-100"
                )}
              >
                Serif
              </button>
              <button
                onClick={() => setFontFamily("sans")}
                className={cn(
                  "flex-1 lg:flex-none px-2.5 py-1.5 sm:py-1 rounded-lg text-xs font-sans font-bold transition-all text-center",
                  fontFamily === "sans" ? "paper-btn-dark shadow-sm" : "opacity-60 hover:opacity-100"
                )}
              >
                Sans
              </button>
              <button
                onClick={() => setFontFamily("opendyslexic")}
                className={cn(
                  "flex-1 lg:flex-none px-2 py-1.5 sm:py-1 rounded-lg text-[11px] sm:text-xs font-bold transition-all font-opendyslexic text-center truncate",
                  fontFamily === "opendyslexic" ? "paper-btn-amber font-extrabold shadow-sm" : "opacity-70 hover:opacity-100"
                )}
                title={t("openDyslexic")}
              >
                OpenDyslexic
              </button>
            </div>
          </div>

          {/* Tools Buttons */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full lg:w-auto">
            {/* Offline Download Button */}
            <button
              onClick={async () => {
                if (!id || !story) return;
                if (isDownloaded) {
                  await removeOfflineStory(id);
                  setIsDownloaded(false);
                } else {
                  setIsDownloading(true);
                  // Load all pages into story object
                  const pagesMap: { [pageIndex: number]: string } = {};
                  try {
                     const pSnap = await getDocs(query(collection(db, `stories/${id}/pages`), orderBy("index", "asc")));
                     pSnap.docs.forEach((d) => {
                       const data = d.data();
                       pagesMap[data.index || 0] = data.content || "";
                     });
                     await saveStoryOffline({
                       id,
                       title: story.title,
                       author: story.author,
                       coverImage: story.coverImage,
                       totalPages: story.totalPages,
                       wordCount: story.wordCount,
                       pages: pagesMap,
                       downloadedAt: new Date().toISOString()
                     });
                     setIsDownloaded(true);
                  } catch (e) {
                     console.error("Error saving offline:", e);
                  } finally {
                     setIsDownloading(false);
                  }
                }
              }}
              disabled={isDownloading}
              className={cn(
                "px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5",
                isDownloaded 
                  ? "paper-btn-emerald" 
                  : "paper-btn-light opacity-70 hover:opacity-100"
              )}
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{isDownloading ? "..." : isDownloaded ? t("downloadedOffline") : t("downloadForOffline")}</span>
            </button>

            {/* Private Notes & Bookmarks Drawer Button */}
            <button
              onClick={() => setShowNotesDrawer(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-wider opacity-80 hover:opacity-100 flex items-center justify-center gap-1.5 paper-btn-light"
            >
              <Bookmark className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>{t("bookmarks")} ({notesList.length})</span>
            </button>

            {/* Add to Playlist Button */}
            <button
              onClick={() => {
                loadPlaylists();
                setShowPlaylistModal(true);
              }}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-wider opacity-80 hover:opacity-100 flex items-center justify-center gap-1.5 col-span-2 sm:col-span-1 paper-btn-light"
            >
              <ListPlus className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>{t("addToPlaylist")}</span>
            </button>
          </div>
        </div>

        {/* Row 2: Eye Comfort Yellow Filter */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Label and Info */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className={cn(
              "p-2.5 rounded-xl transition-colors shrink-0 flex items-center justify-center",
              eyeComfortIntensity > 0 
                ? "bg-amber-400/20 text-amber-700 dark:text-amber-300" 
                : "bg-[#1A1A1A]/5 dark:bg-white/5 opacity-60"
            )}>
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold font-serif uppercase tracking-wider">{t("eyeComfort")}</h3>
                {eyeComfortIntensity > 0 ? (
                  <span className="text-[9px] bg-amber-400/25 text-amber-900 dark:text-amber-200 font-mono font-bold px-2 py-0.5 rounded-full">
                    {t("yellowFilter")} {eyeComfortIntensity}%
                  </span>
                ) : (
                  <span className="text-[9px] bg-[#1A1A1A]/5 dark:bg-white/5 opacity-50 font-mono font-bold px-2 py-0.5 rounded-full">
                    {t("off")}
                  </span>
                )}
              </div>
              <p className="text-[10px] opacity-60 font-serif mt-0.5">{t("eyeComfortDescription")}</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            {/* Slider */}
            <div className="flex items-center gap-2.5 w-full sm:w-56 px-3.5 py-2 rounded-xl paper-card">
              <Sun className="w-3.5 h-3.5 opacity-50 shrink-0 text-amber-500" />
              <input 
                type="range" 
                min="0" 
                max="100" 
                step="5"
                value={eyeComfortIntensity} 
                onChange={(e) => setEyeComfortIntensity(Number(e.target.value))}
                className="w-full h-1.5 bg-[#1A1A1A]/10 dark:bg-white/20 rounded-lg appearance-none cursor-pointer accent-amber-500"
                title={t("filterIntensity")}
                aria-label={t("filterIntensity")}
              />
              <span className="text-[10px] font-mono font-bold w-9 text-right shrink-0">
                {eyeComfortIntensity}%
              </span>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
              {[
                { label: t("off"), val: 0 },
                { label: "25%", val: 25 },
                { label: "50%", val: 50 },
                { label: "75%", val: 75 }
              ].map((preset) => (
                <button
                  key={preset.val}
                  onClick={() => setEyeComfortIntensity(preset.val)}
                  className={cn(
                    "text-[9px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all",
                    eyeComfortIntensity === preset.val
                      ? "paper-btn-amber font-extrabold shadow-sm"
                      : "opacity-70 hover:opacity-100 paper-btn-light"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Reader Page Frame */}
      <div className="relative min-h-[50vh] p-6 sm:p-10 rounded-2xl transition-all overflow-hidden paper-card">
        {/* Eye Comfort Warm Yellow Filter Overlay */}
        {eyeComfortIntensity > 0 && (
          <div 
            className="absolute inset-0 rounded-2xl pointer-events-none z-20 transition-colors duration-200"
            style={{
              backgroundColor: isDark 
                ? `rgba(251, 191, 36, ${(eyeComfortIntensity / 100) * 0.22})` 
                : `rgba(245, 180, 0, ${(eyeComfortIntensity / 100) * 0.36})`,
              mixBlendMode: isDark ? 'screen' : 'multiply'
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
              <div className="animate-pulse text-sm font-serif opacity-50">{t("loadingPage")}</div>
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
                "prose prose-lg dark:prose-invert prose-neutral mx-auto prose-p:mb-6 prose-p:text-base sm:prose-p:text-lg prose-headings:tracking-tight",
                fontFamily === "opendyslexic" ? "font-opendyslexic" : fontFamily === "sans" ? "font-sans" : "font-serif",
                lineSpacing === "compact" ? "prose-p:leading-[1.4]" : lineSpacing === "loose" ? "prose-p:leading-[2.2]" : "prose-p:leading-[1.8]"
              )}
              dangerouslySetInnerHTML={{ __html: pageContent }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Reader Controls */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-between border-t border-[#1A1A1A]/10 dark:border-white/10 pt-6 gap-4">
        <button
          onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
          disabled={!hasPrev}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 sm:px-6 py-3 rounded-full font-bold text-[10px] uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed paper-btn-light"
        >
          <ChevronLeft className="w-4 h-4" /> {t("previous")}
        </button>
        
        {(() => {
          const parts = t("pageOf", { total: story.totalPages }).split("{page}");
          const prefix = parts[0]?.trim() || "";
          const suffix = parts[1]?.trim() || "";
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
          onClick={() => setCurrentPage(p => Math.min(story.totalPages - 1, p + 1))}
          disabled={!hasNext}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 sm:px-6 py-3 rounded-full font-bold text-[10px] uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed paper-btn-dark"
        >
          {t("next")} <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* APPROVED COMMENTS SECTION */}
      {approvedComments.length > 0 && (
        <div className="mt-16 pt-12 border-t border-[#1A1A1A]/10 dark:border-white/10 space-y-6">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 opacity-60" />
            <h3 className="font-serif font-bold text-xl">{t("approvedComments")}</h3>
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
                      <Star key={i} className={cn("w-3.5 h-3.5", i < c.rating ? "fill-amber-400 text-amber-400" : "opacity-20")} />
                    ))}
                  </div>
                </div>
                {c.text && <p className="text-xs font-serif leading-relaxed opacity-90 pt-1">{c.text}</p>}
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
          <div className="text-center mb-8">
            <h2 className="text-2xl font-serif font-bold mb-2">{t("endOfStory")}</h2>
            <p className="opacity-60 text-xs sm:text-sm font-serif">{t("enjoyedReading")}</p>
          </div>
          
          {submitted ? (
            <div className="rounded-2xl p-8 text-center space-y-3 paper-card">
              <CheckCircle className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
              <p className="font-bold uppercase tracking-widest text-xs">{t("reviewSent")}</p>
              <p className="opacity-60 text-xs max-w-sm mx-auto">
                {t("reviewSavedPending")}
              </p>
            </div>
          ) : (
            <form onSubmit={handleReviewSubmit} className="rounded-2xl p-6 sm:p-8 max-w-lg mx-auto space-y-6 paper-card">
              <div className="text-center">
                <label className="block text-[10px] font-bold uppercase tracking-widest opacity-60 mb-4">{t("yourRating")}</label>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="focus:outline-none transition-transform hover:scale-125"
                      title={`${star} / 5`}
                    >
                      <Star className={cn("w-8 h-8", rating >= star ? "fill-amber-400 text-amber-400" : "text-black/20 dark:text-white/20")} />
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest opacity-60 mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> {t("commentLabel")}
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full rounded-xl p-4 focus:outline-none resize-none text-xs sm:text-sm paper-card"
                  rows={4}
                  placeholder={t("commentPlaceholder")}
                />
                <p className="text-[10px] opacity-50 mt-1">{t("moderationNotice")}</p>
              </div>
              
              <button 
                type="submit"
                disabled={rating === 0 || isSubmitting}
                className="w-full py-4 rounded-full font-bold text-[10px] uppercase tracking-widest disabled:opacity-50 paper-btn-dark"
              >
                {isSubmitting ? t("sending") : t("submitReview")}
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
                <h3 className="font-serif font-bold text-lg">{t("bookmarks")}</h3>
              </div>
              <button 
                onClick={() => setShowNotesDrawer(false)}
                className="text-xs uppercase font-bold tracking-widest opacity-60 hover:opacity-100"
              >
                {t("close")}
              </button>
            </div>

            {/* Add new Note for current page */}
            <div className="space-y-2 shrink-0">
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60">
                {t("addNoteForPage", { page: currentPage + 1 })}
              </label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newNoteInput}
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
                      createdAt: new Date().toISOString()
                    });
                    setNewNoteInput("");
                    setNotesList(getBookmarksAndNotes(id));
                  }}
                  className="bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest shrink-0"
                >
                  {t("save")}
                </button>
              </div>
            </div>

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto space-y-3 pt-2 pr-1 custom-scrollbar">
              {notesList.length === 0 ? (
                <div className="text-center py-10 opacity-50 font-serif text-xs">
                  Nenhuma anotação criada para esta história.
                </div>
              ) : (
                notesList.map((n) => (
                  <div key={n.id} className="p-3.5 bg-[#F5F5F0] dark:bg-[#0A0A0A] rounded-xl border border-black/5 dark:border-white/5 space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider opacity-60">
                      <span>Página {n.pageIndex + 1}</span>
                      <span>{new Date(n.createdAt).toLocaleDateString()}</span>
                    </div>
                    {n.noteText && <p className="text-xs font-serif leading-relaxed opacity-90">{n.noteText}</p>}
                    <div className="flex justify-end gap-2 pt-1">
                      <button 
                        onClick={() => setCurrentPage(n.pageIndex)}
                        className="text-[9px] bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold uppercase tracking-wider px-2 py-1 rounded-md"
                      >
                        Ir para página
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
                  <span>{t("addToPlaylist")}</span>
                </h3>
                <p className="text-[11px] opacity-60 truncate max-w-[280px]">{story?.title || "História"}</p>
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
                <p className="text-xs opacity-60 italic text-center py-4">{t("emptyPlaylist")}</p>
              ) : (
                playlists.map((pl) => {
                  const inPlaylist = pl.storyIds.includes(id);
                  return (
                    <div 
                      key={pl.id} 
                      className="p-3 bg-[#F5F5F0] dark:bg-[#0A0A0A] rounded-xl flex items-center justify-between border border-black/5 dark:border-white/5"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <h4 className="font-serif font-bold text-xs truncate">{pl.title}</h4>
                        <p className="text-[10px] opacity-50 uppercase font-mono">{pl.storyIds.length} histórias</p>
                      </div>
                      <button
                        onClick={async () => {
                          const updated = await toggleStoryInPlaylist(pl, id);
                          setPlaylists(prev => prev.map(p => p.id === updated.id ? updated : p));
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 shrink-0",
                          inPlaylist 
                            ? "bg-emerald-500 text-white shadow-sm" 
                            : "bg-black/10 dark:bg-white/10 hover:bg-black/20 text-black dark:text-white"
                        )}
                      >
                        {inPlaylist ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Remover</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            <span>Adicionar</span>
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
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60">{t("createPlaylist")}</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newPlaylistTitle}
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
                      description: "Coleção de leituras",
                      userId: user?.uid || "guest",
                      userName: profile?.username ? `@${profile.username}` : (profile?.displayName || "Leitor"),
                      isPublic: true,
                      storyIds: [id],
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    };
                    await createOrUpdatePlaylist(newPl);
                    setNewPlaylistTitle("");
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
