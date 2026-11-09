import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  db,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
  setDoc,
} from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { StoryEditor } from '../components/StoryEditor';
import {
  ArrowLeft,
  Save,
  Loader2,
  Send,
  CheckCircle2,
  Heart,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { generateTagsLocal } from '../lib/tagger';
import { cleanStoryHtml } from '../lib/cleanStoryHtml';
import { findOversizedPageIndex } from '../lib/storyImages';

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

// Grava as páginas e apaga as que sobraram de uma versão anterior maior
async function savePagesToFirestore(
  storyId: string,
  pages: string[],
  previousTotal: number,
) {
  await Promise.all(
    pages.map((html, idx) =>
      setDoc(doc(db, `stories/${storyId}/pages`, idx.toString()), {
        content: html,
        index: idx,
      }),
    ),
  );

  const leftovers: Promise<void>[] = [];
  for (let idx = pages.length; idx < previousTotal; idx++) {
    leftovers.push(
      deleteDoc(doc(db, `stories/${storyId}/pages`, idx.toString())),
    );
  }
  await Promise.all(leftovers);
}

function isFirestoreDailyWriteQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const firebaseError = error as { code?: unknown; message?: unknown };
  const code = String(firebaseError.code || '').toLowerCase();
  const message = String(firebaseError.message || '').toLowerCase();

  return (
    (code === 'resource-exhausted' || code.endsWith('/resource-exhausted')) &&
    message.includes('free daily write units')
  );
}

function getNextFirestoreQuotaReset(now = new Date()): Date {
  const timeZone = 'America/Los_Angeles';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  });
  const getParts = (date: Date) =>
    Object.fromEntries(
      formatter
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
  const currentParts = getParts(now);
  const nextPacificMidnight = Date.UTC(
    currentParts.year,
    currentParts.month - 1,
    currentParts.day + 1,
  );
  const getOffset = (date: Date) => {
    const parts = getParts(date);
    const wholeSecond = Math.floor(date.getTime() / 1000) * 1000;
    const zonedTimeAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    return zonedTimeAsUtc - wholeSecond;
  };

  let resetAt = nextPacificMidnight - getOffset(now);
  resetAt = nextPacificMidnight - getOffset(new Date(resetAt));
  return new Date(resetAt);
}

function formatQuotaResetTime(language: string): string {
  const locale =
    language === 'pt'
      ? 'pt-BR'
      : language === 'es'
        ? 'es-ES'
        : language === 'zh'
          ? 'zh-CN'
          : language === 'id'
            ? 'id-ID'
            : 'en-US';

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(getNextFirestoreQuotaReset());
}

export function Writer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { t, language } = useLanguage();

  const [story, setStory] = useState<StoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<string[]>([]);

  const [editTitle, setEditTitle] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [scheduledReleaseAt, setScheduledReleaseAt] = useState('');
  const [editSupporters, setEditSupporters] = useState('');
  const [, setFullText] = useState('');
  const [wordCount, setWordCount] = useState(0);

  const [isSaving, setIsSaving] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [isWriterPanelCollapsed, setIsWriterPanelCollapsed] = useState(false);

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
    isAutoSaving,
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
      isAutoSaving,
    };
  }, [
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
    isAutoSaving,
  ]);

  // Track edits to mark unsaved
  const isFirstLoad = useRef(true);
  useEffect(() => {
    if (loading) return;
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }
    setHasUnsavedChanges(true);
  }, [
    editTitle,
    editAuthor,
    editSupporters,
    pages,
    scheduledReleaseAt,
    loading,
  ]);

  useEffect(() => {
    async function loadStory() {
      if (!id || !user) return;
      try {
        const docRef = doc(db, 'stories', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as StoryData;
          const isAdmin =
            profile?.role === 'admin' ||
            (user.email || '').toLowerCase().trim() ===
              'andreluiz1902@gmail.com' ||
            (user.email || '').toLowerCase().trim() ===
              'romansanacional2026@gmail.com';
          if (!isAdmin && data.authorUid && data.authorUid !== user.uid) {
            navigate('/admin');
            return;
          }
          setStory(data);
          setEditTitle(data.title || '');
          setEditAuthor(data.author || '');

          const rawSupporters = data.supporters;
          if (Array.isArray(rawSupporters)) {
            setEditSupporters(rawSupporters.join(', '));
          } else if (typeof rawSupporters === 'string') {
            setEditSupporters(rawSupporters);
          } else {
            setEditSupporters('');
          }

          let rawDate = data.scheduledReleaseAt || '';
          if (rawDate && rawDate.includes('Z')) {
            try {
              rawDate = new Date(rawDate).toISOString().slice(0, 16);
            } catch (e) {}
          } else if (rawDate && rawDate.length > 16) {
            rawDate = rawDate.slice(0, 16);
          }
          setScheduledReleaseAt(rawDate);

          const pagesSnap = await getDocs(
            query(
              collection(db, `stories/${id}/pages`),
              orderBy('index', 'asc'),
            ),
          );
          const loadedPages: string[] = [];
          pagesSnap.forEach((p) => {
            loadedPages.push(p.data().content || '');
          });
          setPages(loadedPages.length > 0 ? loadedPages : ['<p></p>']);
        } else {
          navigate('/admin');
        }
      } catch (err) {
        console.error('Error loading story:', err);
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
      if (
        !state.id ||
        !state.story ||
        !state.hasUnsavedChanges ||
        state.isSaving ||
        state.isAutoSaving
      ) {
        return;
      }

      setHasUnsavedChanges(false);
      setIsAutoSaving(true);
      try {
        const storyRef = doc(db, 'stories', state.id);
        const rawPages = state.pages.length > 0 ? state.pages : ['<p></p>'];
        const cleanPages = rawPages.map((p) => cleanStoryHtml(p));

        if (findOversizedPageIndex(cleanPages) !== -1) {
          console.warn(
            'Auto-save ignorado: alguma página passou do limite do Firestore.',
          );
          setHasUnsavedChanges(true);
          return;
        }

        // Preserve existing tags, only generate if they don't exist
        let tags = state.story.tags || [];
        if (tags.length === 0) {
          const textSample = cleanPages[0].replace(/<[^>]*>?/gm, '');
          tags = generateTagsLocal(textSample || state.editTitle);
        }

        const supportersArray = (state.editSupporters || '')
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        await savePagesToFirestore(
          state.id,
          cleanPages,
          state.story.totalPages ?? 0,
        );

        await updateDoc(storyRef, {
          title: state.editTitle || state.story.title,
          author: state.editAuthor || state.story.author,
          totalPages: cleanPages.length,
          wordCount: state.wordCount,
          tags,
          supporters: supportersArray,
          scheduledReleaseAt: state.scheduledReleaseAt || '',
          isDraft: state.story.isDraft ?? true,
        });

        setStory((prev) =>
          prev
            ? {
                ...prev,
                totalPages: cleanPages.length,
                title: state.editTitle || state.story.title,
                author: state.editAuthor || state.story.author,
                tags,
                supporters: supportersArray,
              }
            : prev,
        );

        setLastAutoSaveTime(new Date());
      } catch (err) {
        console.warn('Auto-save failed (network/quota):', err);
        setHasUnsavedChanges(true);
        if (isFirestoreDailyWriteQuotaError(err)) {
          setMessageIsError(true);
          setMessage(
            t('firestoreWriteQuotaExceeded', {
              resetTime: formatQuotaResetTime(language),
            }),
          );
        }
      } finally {
        setIsAutoSaving(false);
      }
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const handleSave = async (asDraft: boolean) => {
    if (!story || !id) return;
    setIsSaving(true);
    setMessage('');
    setMessageIsError(false);
    try {
      const storyRef = doc(db, 'stories', id);
      const rawPages = pages.length > 0 ? pages : ['<p></p>'];
      const cleanPages = rawPages.map((p) => cleanStoryHtml(p));

      const oversizedIdx = findOversizedPageIndex(cleanPages);
      if (oversizedIdx !== -1) {
        setMessageIsError(true);
        setMessage(t('storyTooLargeError', { page: oversizedIdx + 1 }));
        return;
      }

      // Preserve existing tags, only generate if they don't exist
      let tags = story.tags || [];
      if (tags.length === 0) {
        const textSample = cleanPages[0].replace(/<[^>]*>?/gm, '');
        tags = generateTagsLocal(textSample || editTitle);
      }

      const supportersArray = (editSupporters || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      // 1) páginas primeiro
      await savePagesToFirestore(id, cleanPages, story.totalPages ?? 0);

      // 2) depois os dados da história
      await updateDoc(storyRef, {
        title: editTitle || story.title,
        author: editAuthor || story.author,
        authorUid: user?.uid || story.authorUid,
        totalPages: cleanPages.length,
        wordCount,
        tags,
        supporters: supportersArray,
        scheduledReleaseAt: scheduledReleaseAt || '',
        isDraft: asDraft,
      });

      setStory((prev) =>
        prev
          ? {
              ...prev,
              totalPages: cleanPages.length,
              isDraft: asDraft,
              title: editTitle,
              author: editAuthor,
              tags,
              supporters: supportersArray,
            }
          : prev,
      );
      setHasUnsavedChanges(false);
      setLastAutoSaveTime(new Date());
      setMessage(asDraft ? t('draftSavedSuccess') : t('draftPublishedSuccess'));
    } catch (err: any) {
      console.error('Error updating story:', err);
      setMessageIsError(true);
      if (isFirestoreDailyWriteQuotaError(err)) {
        setMessage(
          t('firestoreWriteQuotaExceeded', {
            resetTime: formatQuotaResetTime(language),
          }),
        );
      } else {
        setMessage(t('errorUpdatingStory') + (err?.message || err?.code || ''));
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Allow Ctrl+S/Cmd+S to save draft
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

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
    <div className="relative w-full max-w-none mx-auto pt-2 pb-0 px-0 animate-in fade-in duration-500">
      <aside
        className="fixed left-3 top-24 z-[60] transition-[width] duration-200"
        style={{
          width: isWriterPanelCollapsed ? 48 : 'min(280px, calc(100vw - 24px))',
          maxHeight: 'calc(100dvh - 112px)',
        }}
      >
        <div className="max-h-full overflow-y-auto rounded-xl p-3 paper-card shadow-2xl">
          <div
            className={`flex items-center ${
              isWriterPanelCollapsed ? 'justify-center' : 'justify-between'
            }`}
          >
            {!isWriterPanelCollapsed && (
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold uppercase tracking-wider opacity-70 transition-opacity hover:opacity-100"
                title={t('backToAdmin')}
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                <span className="truncate">{t('backToAdmin')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                setIsWriterPanelCollapsed((collapsed) => !collapsed)
              }
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
              title={
                isWriterPanelCollapsed ? t('expandTools') : t('collapseTools')
              }
              aria-label={
                isWriterPanelCollapsed ? t('expandTools') : t('collapseTools')
              }
            >
              {isWriterPanelCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          {!isWriterPanelCollapsed && (
            <div className="mt-3 space-y-4">
              <div className="flex min-h-8 items-center gap-2 px-2 text-[10px] font-mono">
                {isAutoSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                    <span className="text-amber-600 dark:text-amber-400">
                      {t('autoSaving')}
                    </span>
                  </>
                ) : hasUnsavedChanges ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>{t('autoSaveIn')}</span>
                  </>
                ) : lastAutoSaveTime ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {t('draftSavedAt', {
                        time: formatTime(lastAutoSaveTime),
                      })}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>{t('autoSaveInterval')}</span>
                  </>
                )}
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest opacity-60">
                  {t('editTitle')}
                </span>
                <input
                  type="text"
                  value={editTitle || ''}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="paper-card w-full rounded-lg px-3 py-2.5 font-serif text-base font-bold focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                    {t('editAuthor')}
                  </span>
                  {profile && (
                    <select
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'name' && profile.displayName) {
                          setEditAuthor(profile.displayName);
                        } else if (val === 'user' && profile.username) {
                          setEditAuthor(profile.username);
                        }
                      }}
                      className="max-w-28 cursor-pointer rounded-md border border-[#1A1A1A]/10 bg-white px-1.5 py-1 text-[9px] font-bold uppercase dark:border-white/10 dark:bg-[#1A1A1A]"
                    >
                      <option value="" disabled>
                        {language === 'pt'
                          ? 'Identificação'
                          : language === 'es'
                            ? 'Identificación'
                            : language === 'zh'
                              ? '预设作者'
                              : language === 'id'
                                ? 'Identitas'
                                : 'Identity'}
                      </option>
                      <option value="name">
                        {language === 'pt'
                          ? 'Nome'
                          : language === 'es'
                            ? 'Nombre'
                            : language === 'zh'
                              ? '姓名'
                              : language === 'id'
                                ? 'Nama'
                                : 'Name'}
                      </option>
                      <option value="user">
                        {language === 'pt'
                          ? 'Usuário'
                          : language === 'es'
                            ? 'Usuario'
                            : language === 'zh'
                              ? '用户名'
                              : language === 'id'
                                ? 'Pengguna'
                                : 'Username'}
                      </option>
                    </select>
                  )}
                </span>
                <input
                  type="text"
                  value={editAuthor || ''}
                  onChange={(e) => setEditAuthor(e.target.value)}
                  className="paper-card w-full rounded-lg px-3 py-2.5 font-serif text-base focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-widest opacity-60">
                  <span>{t('scheduledRelease')}</span>
                  {scheduledReleaseAt && (
                    <button
                      type="button"
                      onClick={() => setScheduledReleaseAt('')}
                      className="text-red-500 hover:text-red-700 dark:hover:text-red-400"
                    >
                      {t('clearSchedule')}
                    </button>
                  )}
                </span>
                <input
                  type="datetime-local"
                  value={scheduledReleaseAt || ''}
                  onChange={(e) => setScheduledReleaseAt(e.target.value)}
                  className="paper-card w-full rounded-lg px-3 py-2.5 font-mono text-xs focus:outline-none"
                />
              </label>

              <div className="grid grid-cols-1 gap-2 border-t border-black/10 pt-3 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={isSaving || isAutoSaving}
                  className="paper-btn-amber flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                  title={t('saveDraft')}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>{t('saveDraft')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(false)}
                  disabled={isSaving || isAutoSaving}
                  className="paper-btn-dark flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                  title={story.isDraft ? t('publishNow') : t('saveChanges')}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span>
                    {story.isDraft ? t('publishNow') : t('saveChanges')}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="min-w-0 w-full">
        {message && (
          <div
            className={`mb-3 rounded-xl border p-3 text-center text-sm font-bold animate-in fade-in slide-in-from-top-4 ${
              messageIsError
                ? 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
            }`}
          >
            {message}
          </div>
        )}
        <div className="min-w-0 rounded-xl p-1.5 paper-card sm:p-2">
          <StoryEditor
            initialPages={pages}
            supporters={editSupporters}
            onChange={(newPages, text, wc) => {
              setPages(newPages);
              setFullText(text);
              setWordCount(wc);
            }}
          />
        </div>
      </main>
    </div>
  );
}
