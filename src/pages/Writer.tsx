import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db, doc, getDoc, updateDoc, collection, getDocs, query, orderBy, setDoc } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { StoryEditor } from "../components/StoryEditor";
import { ArrowLeft, Save, Loader2, Send, CheckCircle2, Heart } from "lucide-react";
import { generateTagsLocal } from "../lib/tagger";

interface StoryData {
  title: string;
  author?: string;
  totalPages: number;
  wordCount?: number;
  authorUid?: string;
  isDraft?: boolean;
  scheduledReleaseAt?: string;
  tags?: string[];
  supporters?: string[] | string;
}

export function Writer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { t } = useLanguage();

  const [story, setStory] = useState<StoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<string[]>([]);
  
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [scheduledReleaseAt, setScheduledReleaseAt] = useState("");
  const [editSupporters, setEditSupporters] = useState("");
  const [, setFullText] = useState("");
  const [wordCount, setWordCount] = useState(0);

  const [isSaving, setIsSaving] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [message, setMessage] = useState("");

  const autoSaveRef = useRef({
    id,
    story,
    editTitle,
    editAuthor,
    scheduledReleaseAt,
    editSupporters,
    pages,
    wordCount,
    hasUnsavedChanges,
    isSaving,
    isAutoSaving
  });

  useEffect(() => {
    autoSaveRef.current = {
      id,
      story,
      editTitle,
      editAuthor,
      scheduledReleaseAt,
      editSupporters,
      pages,
      wordCount,
      hasUnsavedChanges,
      isSaving,
      isAutoSaving
    };
  }, [id, story, editTitle, editAuthor, scheduledReleaseAt, editSupporters, pages, wordCount, hasUnsavedChanges, isSaving, isAutoSaving]);

  // Track edits to mark unsaved
  const isFirstLoad = useRef(true);
  useEffect(() => {
    if (loading) return;
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }
    setHasUnsavedChanges(true);
  }, [editTitle, editAuthor, editSupporters, pages, scheduledReleaseAt, loading]);

  useEffect(() => {
    async function loadStory() {
      if (!id || !user) return;
      try {
        const docRef = doc(db, "stories", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as StoryData;
          const isAdmin = profile?.role === "admin" || (user.email || "").toLowerCase().trim() === "andreluiz1902@gmail.com" || (user.email || "").toLowerCase().trim() === "romansanacional2026@gmail.com";
          if (!isAdmin && data.authorUid && data.authorUid !== user.uid) {
            navigate("/admin");
            return;
          }
          setStory(data);
          setEditTitle(data.title || "");
          setEditAuthor(data.author || "");

          const rawSupporters = data.supporters;
          if (Array.isArray(rawSupporters)) {
            setEditSupporters(rawSupporters.join(", "));
          } else if (typeof rawSupporters === "string") {
            setEditSupporters(rawSupporters);
          } else {
            setEditSupporters("");
          }
          
          let rawDate = data.scheduledReleaseAt || "";
          if (rawDate && rawDate.includes("Z")) {
            try {
              rawDate = new Date(rawDate).toISOString().slice(0, 16);
            } catch (e) {}
          } else if (rawDate && rawDate.length > 16) {
            rawDate = rawDate.slice(0, 16);
          }
          setScheduledReleaseAt(rawDate);

          const pagesSnap = await getDocs(query(collection(db, `stories/${id}/pages`), orderBy("index", "asc")));
          const loadedPages: string[] = [];
          pagesSnap.forEach(p => {
            loadedPages.push(p.data().content || "");
          });
          setPages(loadedPages.length > 0 ? loadedPages : ["<p></p>"]);
        } else {
          navigate("/admin");
        }
      } catch (err) {
        console.error("Error loading story:", err);
      } finally {
        setLoading(false);
      }
    }
    loadStory();
  }, [id, user, navigate]);

  // Periodic Auto-Save every 60 seconds (only if unsaved changes exist)
  useEffect(() => {
    const timer = setInterval(async () => {
      const state = autoSaveRef.current;
      if (!state.id || !state.story || !state.hasUnsavedChanges || state.isSaving || state.isAutoSaving) {
        return;
      }

      setHasUnsavedChanges(false);
      setIsAutoSaving(true);
      try {
        const storyRef = doc(db, "stories", state.id);
        const cleanPages = state.pages.length > 0 ? state.pages : ["<p></p>"];
        
        // Preserve existing tags, only generate if they don't exist
        let tags = state.story.tags || [];
        if (tags.length === 0) {
          const textSample = cleanPages[0].replace(/<[^>]*>?/gm, '');
          tags = generateTagsLocal(textSample || state.editTitle);
        }

        const supportersArray = (state.editSupporters || "")
          .split(",")
          .map(s => s.trim())
          .filter(s => s.length > 0);

        await updateDoc(storyRef, {
          title: state.editTitle || state.story.title,
          author: state.editAuthor || state.story.author,
          totalPages: cleanPages.length,
          wordCount: state.wordCount,
          tags,
          supporters: supportersArray,
          scheduledReleaseAt: state.scheduledReleaseAt || "",
          isDraft: state.story.isDraft ?? true
        });

        const promises = cleanPages.map((html, idx) => {
          const pageRef = doc(db, `stories/${state.id}/pages`, idx.toString());
          return setDoc(pageRef, { content: html, index: idx });
        });
        await Promise.all(promises);

        setStory(prev => prev ? { ...prev, title: state.editTitle || state.story.title, author: state.editAuthor || state.story.author, tags, supporters: supportersArray } : prev);

        setLastAutoSaveTime(new Date());
      } catch (err) {
        console.warn("Auto-save failed (network/quota):", err);
      } finally {
        setIsAutoSaving(false);
      }
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const handleSave = async (asDraft: boolean) => {
    if (!story || !id) return;
    setIsSaving(true);
    setMessage("");
    try {
      const storyRef = doc(db, "stories", id);
      const cleanPages = pages.length > 0 ? pages : ["<p></p>"];
      
      // Preserve existing tags, only generate if they don't exist
      let tags = story.tags || [];
      if (tags.length === 0) {
        const textSample = cleanPages[0].replace(/<[^>]*>?/gm, '');
        tags = generateTagsLocal(textSample || editTitle);
      }

      const supportersArray = (editSupporters || "")
        .split(",")
        .map(s => s.trim())
        .filter(s => s.length > 0);

      await updateDoc(storyRef, {
        title: editTitle || story.title,
        author: editAuthor || story.author,
        authorUid: user?.uid || story.authorUid,
        totalPages: cleanPages.length,
        wordCount,
        tags,
        supporters: supportersArray,
        scheduledReleaseAt: scheduledReleaseAt || "",
        isDraft: asDraft
      });

      // Update pages
      const promises = cleanPages.map((html, idx) => {
        const pageRef = doc(db, `stories/${id}/pages`, idx.toString());
        return setDoc(pageRef, { content: html, index: idx });
      });
      await Promise.all(promises);

      setStory(prev => prev ? { ...prev, isDraft: asDraft, title: editTitle, author: editAuthor, tags, supporters: supportersArray } : prev);
      setHasUnsavedChanges(false);
      setLastAutoSaveTime(new Date());
      setMessage(asDraft ? t("draftSavedSuccess") : t("draftPublishedSuccess"));
    } catch (err) {
      console.error("Error updating story:", err);
      setMessage(t("errorUpdatingStory"));
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-[#1A1A1A]/40 dark:text-white/40" />
      </div>
    );
  }

  if (!story) return null;

  return (
    <div className="max-w-5xl mx-auto py-4 sm:py-8 px-3 sm:px-8 animate-in fade-in duration-500 overflow-x-hidden">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 p-4 rounded-2xl paper-card">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <button 
            onClick={() => navigate("/admin")}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity paper-btn-light px-3 py-1.5 rounded-xl"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("backToAdmin")}
          </button>

          {/* Mobile Auto-Save Status Badge */}
          <div className="sm:hidden flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-full paper-card shrink-0">
            {isAutoSaving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                <span className="text-amber-600 dark:text-amber-400 font-bold">{t("autoSaving")}</span>
              </>
            ) : hasUnsavedChanges ? (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="opacity-70">{t("pendingAutoSave")}</span>
              </>
            ) : lastAutoSaveTime ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span className="text-emerald-700 dark:text-emerald-400 font-bold">{t("draftSavedAt", { time: formatTime(lastAutoSaveTime) })}</span>
              </>
            ) : (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="opacity-70">{t("autoSaveIn")}</span>
              </>
            )}
          </div>
        </div>

        {/* Desktop Auto-Save Badge & Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end w-full sm:w-auto gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full shrink-0 paper-card">
            {isAutoSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                <span className="text-amber-600 dark:text-amber-400 font-bold">{t("autoSaving")}</span>
              </>
            ) : hasUnsavedChanges ? (
              <>
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="opacity-70">{t("autoSaveIn")}</span>
              </>
            ) : lastAutoSaveTime ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-700 dark:text-emerald-400 font-bold">{t("draftSavedAt", { time: formatTime(lastAutoSaveTime) })}</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="opacity-70">{t("autoSaveInterval")}</span>
              </>
            )}
          </div>

          <div className="flex gap-2.5 w-full sm:w-auto">
            <button
              onClick={() => handleSave(true)}
              disabled={isSaving || isAutoSaving}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 min-h-[40px] paper-btn-amber"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Save className="w-4 h-4 shrink-0" />}
              <span>{t("saveDraft")}</span>
            </button>
            
            <button
              onClick={() => handleSave(false)}
              disabled={isSaving || isAutoSaving}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 min-h-[40px] paper-btn-dark"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Send className="w-4 h-4 shrink-0" />}
              <span>{story.isDraft ? t("publishNow") : t("saveChanges")}</span>
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-sm font-bold flex items-center justify-center animate-in fade-in slide-in-from-top-4">
          {message}
        </div>
      )}

      {/* Editor Main Card */}
      <div className="rounded-2xl p-4 sm:p-8 max-w-full overflow-hidden paper-card">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6">
          <div>
            <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1.5">{t("editTitle")}</label>
            <input 
              type="text" 
              value={editTitle || ""} 
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 text-base sm:text-lg font-serif font-bold rounded-xl focus:outline-none transition-colors paper-card"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1.5">{t("editAuthor")}</label>
            <input 
              type="text" 
              value={editAuthor || ""} 
              onChange={(e) => setEditAuthor(e.target.value)}
              className="w-full px-3.5 py-2.5 text-base sm:text-lg font-serif rounded-xl focus:outline-none transition-colors paper-card"
            />
            {profile && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {profile.displayName && (
                  <button
                    type="button"
                    onClick={() => setEditAuthor(profile.displayName!)}
                    className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all active:scale-95 paper-btn-amber"
                  >
                    {t("useMyName", { name: profile.displayName })}
                  </button>
                )}
                {profile.username && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditAuthor(`@${profile.username}`)}
                      className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all active:scale-95 paper-btn-amber"
                    >
                      {t("useMyUsername", { username: profile.username })}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditAuthor(profile.username!)}
                      className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all active:scale-95 paper-btn-amber"
                    >
                      {t("useUsernameOnly", { username: profile.username })}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60">{t("scheduledRelease")}</label>
              {scheduledReleaseAt && (
                <button
                  type="button"
                  onClick={() => setScheduledReleaseAt("")}
                  className="text-[9px] text-red-500 hover:text-red-700 dark:hover:text-red-400 font-bold uppercase tracking-wider transition-all"
                >
                  {t("clearSchedule")}
                </button>
              )}
            </div>
            <input 
              type="datetime-local" 
              value={scheduledReleaseAt || ""} 
              onChange={(e) => setScheduledReleaseAt(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl focus:outline-none transition-colors paper-card"
            />
          </div>
        </div>

        {/* Supporters & Contributors Section */}
        <div className="mb-6 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-4 h-4 text-amber-500 shrink-0" />
            <label className="block text-[10px] uppercase font-bold tracking-widest opacity-80">{t("supporters")}</label>
          </div>
          <input 
            type="text" 
            value={editSupporters || ""} 
            onChange={(e) => setEditSupporters(e.target.value)}
            placeholder={t("supportersPlaceholder")}
            className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl focus:outline-none transition-colors paper-card"
          />
          <span className="block text-[9px] opacity-50 mt-1.5 font-mono">{t("supportersHelp")}</span>
        </div>

        <div className="border-t border-black/5 dark:border-white/5 pt-6">
          <StoryEditor
            initialPages={pages}
            onChange={(newPages, text, wc) => {
              setPages(newPages);
              setFullText(text);
              setWordCount(wc);
            }}
          />
        </div>
      </div>
    </div>
  );
}
