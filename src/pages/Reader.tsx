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
import { ChevronLeft, ChevronRight, ArrowLeft, Star, MessageSquare, CheckCircle, ShieldAlert, User as UserIcon, ArrowUp, Clock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
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
      const userName = profile?.displayName || user?.email?.split("@")[0] || t("reader");
      
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
        <div className="bg-white dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-2xl p-4 sm:p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-in fade-in duration-300">
          <div className="space-y-1 text-center sm:text-left">
            <p className="text-sm font-bold font-serif">{t("readingResumed")}</p>
            <p className="text-xs opacity-60">{t("readingRestored", { page: promptProgress.page + 1 })}</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <button 
              onClick={() => { setCurrentPage(0); setPromptProgress(null); }} 
              className="text-xs uppercase tracking-wider px-4 py-2 opacity-60 hover:opacity-100 font-bold border border-[#1A1A1A]/10 dark:border-white/10 rounded-full"
            >
              {t("restartPage1")}
            </button>
            <button 
              onClick={() => setPromptProgress(null)} 
              className="bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] px-5 py-2.5 rounded-full font-bold text-[10px] uppercase tracking-widest hover:bg-[#5A5A40] dark:hover:bg-[#EAE8E2] transition-colors shadow-sm"
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
              className="bg-[#F5F5F0] dark:bg-[#1A1A1A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl px-3 py-1 text-xs font-bold text-[#1A1A1A] dark:text-[#F5F5F0] focus:outline-none focus:ring-1 focus:ring-[#1A1A1A] dark:focus:ring-white"
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

      {/* Reader Page Frame */}
      <div className="relative min-h-[50vh] bg-white dark:bg-[#0A0A0A] p-6 sm:p-10 rounded-2xl border border-[#1A1A1A]/10 dark:border-white/10 shadow-sm">
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
              className="prose prose-lg dark:prose-invert prose-neutral mx-auto font-serif prose-p:leading-[1.8] prose-p:mb-6 prose-p:text-base sm:prose-p:text-lg prose-headings:font-serif prose-headings:tracking-tight"
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
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] px-5 sm:px-6 py-3 rounded-full font-bold text-[10px] uppercase tracking-widest hover:bg-[#5A5A40] dark:hover:bg-[#EAE8E2] transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
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
                className="bg-[#F5F5F0] dark:bg-[#1A1A1A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold font-mono text-[#1A1A1A] dark:text-[#F5F5F0] focus:outline-none focus:ring-1 focus:ring-[#1A1A1A] dark:focus:ring-white"
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
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] px-5 sm:px-6 py-3 rounded-full font-bold text-[10px] uppercase tracking-widest hover:bg-[#5A5A40] dark:hover:bg-[#EAE8E2] transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
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
              <div key={c.id} className="p-5 bg-white dark:bg-[#0A0A0A] rounded-2xl border border-[#1A1A1A]/10 dark:border-white/10 space-y-2">
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
            <div className="bg-white dark:bg-[#0A0A0A] rounded-2xl p-8 text-center border border-[#1A1A1A]/10 dark:border-white/10 space-y-3">
              <CheckCircle className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
              <p className="font-bold uppercase tracking-widest text-xs">{t("reviewSent")}</p>
              <p className="opacity-60 text-xs max-w-sm mx-auto">
                {t("reviewSavedPending")}
              </p>
            </div>
          ) : (
            <form onSubmit={handleReviewSubmit} className="bg-white dark:bg-[#0A0A0A] rounded-2xl p-6 sm:p-8 border border-[#1A1A1A]/10 dark:border-white/10 max-w-lg mx-auto space-y-6 shadow-sm">
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
                  className="w-full bg-[#F5F5F0] dark:bg-[#1A1A1A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white resize-none text-xs sm:text-sm"
                  rows={4}
                  placeholder={t("commentPlaceholder")}
                />
                <p className="text-[10px] opacity-50 mt-1">{t("moderationNotice")}</p>
              </div>
              
              <button 
                type="submit"
                disabled={rating === 0 || isSubmitting}
                className="w-full bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] py-4 rounded-full font-bold text-[10px] uppercase tracking-widest hover:bg-[#5A5A40] dark:hover:bg-[#EAE8E2] transition-colors disabled:opacity-50 shadow-sm"
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
            className="fixed bottom-6 right-6 p-3.5 bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] rounded-full shadow-xl hover:opacity-95 transition-all z-50 flex items-center justify-center border border-white/10 dark:border-black/10"
            title="Voltar ao topo"
          >
            <ArrowUp className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
