import {
  useEffect,
  useState,
  useRef,
  useMemo,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
import { StoryEditor, type StoryEditorHandle } from '../components/StoryEditor';
import { Reader } from './Reader';
import {
  ArrowLeft,
  Save,
  Loader2,
  Send,
  CheckCircle2,
  Heart,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  MessagesSquare,
  FileText,
  Search,
  Quote,
  Check,
  RefreshCw,
} from 'lucide-react';
import {
  extractDialoguesFromHtml,
  getDialogueStats,
  type DialogueItem,
} from '../lib/dialogue';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { generateTagsLocal } from '../lib/tagger';
import { cleanStoryHtml } from '../lib/cleanStoryHtml';
import { findOversizedPageIndex } from '../lib/storyImages';
import {
  deleteWriterDraft,
  getWriterDraft,
  saveWriterDraft,
  type WriterDraft,
} from '../lib/offlineStorage';

interface StoryData {
  title: string;
  author?: string;
  coverImage?: string;
  totalPages: number;
  wordCount?: number;
  authorUid?: string;
  isDraft?: boolean;
  scheduledReleaseAt?: string;
  tags?: string[];
  supporters?: string[] | string;
}

function getStoryVersion(story: StoryData, pages: string[]): string {
  const snapshot = JSON.stringify({
    title: story.title || '',
    author: story.author || '',
    storedTotalPages: story.totalPages || 0,
    totalPages: pages.length,
    wordCount: story.wordCount || 0,
    tags: story.tags || [],
    supporters: story.supporters || [],
    scheduledReleaseAt: story.scheduledReleaseAt || '',
    isDraft: story.isDraft ?? true,
    pages,
  });
  let hash = 2166136261;
  for (let index = 0; index < snapshot.length; index++) {
    hash = Math.imul(hash ^ snapshot.charCodeAt(index), 16777619);
  }
  return `${(hash >>> 0).toString(16)}-${snapshot.length}`;
}

function buildWriterDraft(
  storyId: string,
  ownerUid: string,
  baseVersion: string,
  title: string,
  author: string,
  scheduledReleaseAt: string,
  supporters: string,
  pages: string[],
  wordCount: number,
): WriterDraft {
  return {
    id: `${ownerUid}:${storyId}`,
    storyId,
    ownerUid,
    title,
    author,
    scheduledReleaseAt,
    supporters,
    pages: pages.length > 0 ? pages : ['<p></p>'],
    wordCount,
    baseVersion,
    savedAt: Date.now(),
  };
}

async function loadCurrentWriterVersion(storyId: string) {
  const storySnap = await getDoc(doc(db, 'stories', storyId));
  if (!storySnap.exists()) throw new Error('A história não existe mais.');

  const story = storySnap.data() as StoryData;
  const pagesSnapshot = await getDocs(
    query(collection(db, `stories/${storyId}/pages`), orderBy('index', 'asc')),
  );
  const loadedPages: string[] = [];
  pagesSnapshot.forEach((page) => loadedPages.push(page.data().content || ''));
  const pages = loadedPages.length > 0 ? loadedPages : ['<p></p>'];

  return { story, pages, version: getStoryVersion(story, pages) };
}

// Grava as páginas e apaga as que sobraram de uma versão anterior maior
async function savePagesToFirestore(
  storyId: string,
  pages: string[],
  previousTotal: number,
  previousPages: string[],
) {
  await Promise.all(
    pages.flatMap((html, idx) =>
      html === previousPages[idx]
        ? []
        : [
            setDoc(doc(db, `stories/${storyId}/pages`, idx.toString()), {
              content: html,
              index: idx,
            }),
          ],
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
  const isResourceExhausted =
    code === 'resource-exhausted' || code.endsWith('/resource-exhausted');
  const mentionsQuota =
    message.includes('free daily write units') ||
    message.includes('daily write') ||
    message.includes('quota');

  return isResourceExhausted && mentionsQuota;
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
  const basePagesRef = useRef<string[]>([]);

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
  const [lastLocalDraftSaveTime, setLastLocalDraftSaveTime] =
    useState<Date | null>(null);
  const [lastFirestoreSaveTime, setLastFirestoreSaveTime] =
    useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [localDraftSaveFailed, setLocalDraftSaveFailed] = useState(false);
  const [hasDraftConflict, setHasDraftConflict] = useState(false);
  const [localDraft, setLocalDraft] = useState<WriterDraft | null>(null);
  const [serverVersion, setServerVersion] = useState('');
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [isWriterPanelCollapsed, setIsWriterPanelCollapsed] = useState(false);
  const [writerPanelTop, setWriterPanelTop] = useState(96);
  const writerPanelRef = useRef<HTMLElement>(null);
  const storyEditorRef = useRef<StoryEditorHandle>(null);

  const [writerTab, setWriterTab] = useState<'story' | 'dialogues'>('story');
  const [dialogueTargetStyle, setDialogueTargetStyle] = useState<'dash' | 'quotes'>('dash');
  const [dialogueScope, setDialogueScope] = useState<'page' | 'all'>('page');
  const [selectedDialoguePageIndex, setSelectedDialoguePageIndex] = useState<number>(0);
  const [dialogueFilterText, setDialogueFilterText] = useState<string>('');
  const [dialogueActionFeedback, setDialogueActionFeedback] = useState<string>('');

  const allDialogues = useMemo(() => {
    const list: DialogueItem[] = [];
    pages.forEach((pageHtml, idx) => {
      list.push(...extractDialoguesFromHtml(pageHtml, idx));
    });
    return list;
  }, [pages]);

  const dialogueStats = useMemo(() => {
    return getDialogueStats(pages);
  }, [pages]);

  const filteredDialogues = useMemo(() => {
    return allDialogues.filter((diag) => {
      if (dialogueScope === 'page' && diag.pageIndex !== selectedDialoguePageIndex) {
        return false;
      }
      if (dialogueFilterText.trim()) {
        return diag.rawText
          .toLowerCase()
          .includes(dialogueFilterText.toLowerCase().trim());
      }
      return true;
    });
  }, [allDialogues, dialogueScope, selectedDialoguePageIndex, dialogueFilterText]);

  const handleConvertDialogues = () => {
    if (!storyEditorRef.current) return;
    let convertedCount = 0;
    if (dialogueScope === 'all') {
      convertedCount = storyEditorRef.current.convertAllDialogues(dialogueTargetStyle);
    } else {
      convertedCount = storyEditorRef.current.convertPageDialogues(
        dialogueTargetStyle,
        selectedDialoguePageIndex,
      );
    }
    if (convertedCount > 0) {
      setDialogueActionFeedback(
        t('dialogueConvertedSuccess', {
          count: convertedCount,
          style: dialogueTargetStyle === 'dash' ? t('dashStyle') : t('quotesStyle'),
        }),
      );
      setHasUnsavedChanges(true);
    } else {
      setDialogueActionFeedback(t('dialogueConvertedNone'));
    }
    setTimeout(() => {
      setDialogueActionFeedback('');
    }, 3500);
  };

  const handleSelectDialogue = (diag: DialogueItem) => {
    setSelectedDialoguePageIndex(diag.pageIndex);
    storyEditorRef.current?.scrollToDialogue(diag.rawText, diag.pageIndex);
  };
  const panelDragRef = useRef<{
    pointerId: number;
    startY: number;
    startTop: number;
    moved: boolean;
    wasCollapsed: boolean;
  } | null>(null);
  const skipPanelToggleRef = useRef(false);

  useEffect(() => {
    const keepWriterPanelInView = () => {
      const panelHeight =
        writerPanelRef.current?.getBoundingClientRect().height ?? 240;
      const maxTop = Math.max(12, window.innerHeight - panelHeight - 12);
      setWriterPanelTop((top) => Math.min(maxTop, Math.max(12, top)));
    };

    window.addEventListener('resize', keepWriterPanelInView);
    return () => window.removeEventListener('resize', keepWriterPanelInView);
  }, []);

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
          const remotePages =
            loadedPages.length > 0 ? loadedPages : ['<p></p>'];
          basePagesRef.current = remotePages;
          const currentVersion = getStoryVersion(data, remotePages);
          setPages(remotePages);
          setServerVersion(currentVersion);

          try {
            const draft = await getWriterDraft(user.uid, id);
            if (draft) {
              setLocalDraft(draft);
              if (draft.baseVersion === currentVersion) {
                setEditTitle(draft.title);
                setEditAuthor(draft.author);
                setScheduledReleaseAt(draft.scheduledReleaseAt);
                setEditSupporters(draft.supporters);
                setPages(draft.pages);
                setWordCount(draft.wordCount);
                setLastLocalDraftSaveTime(new Date(draft.savedAt));
                setHasUnsavedChanges(true);
              } else {
                setHasDraftConflict(true);
              }
            }
          } catch (draftError) {
            console.warn('Could not load local writer draft:', draftError);
          }
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

  // Debounced local draft save; Firestore is written only by explicit save.
  useEffect(() => {
    if (
      loading ||
      !story ||
      !id ||
      !user?.uid ||
      !hasUnsavedChanges ||
      hasDraftConflict
    ) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsAutoSaving(true);
      try {
        const draft = buildWriterDraft(
          id,
          user.uid,
          serverVersion,
          editTitle,
          editAuthor,
          scheduledReleaseAt,
          editSupporters,
          pages,
          wordCount,
        );
        await saveWriterDraft(draft);
        setLocalDraft(draft);
        setLastLocalDraftSaveTime(new Date(draft.savedAt));
        setLocalDraftSaveFailed(false);
      } catch (err) {
        console.warn('Local draft save failed:', err);
        setLocalDraftSaveFailed(true);
        setMessageIsError(true);
        setMessage(t('localDraftSaveError'));
      } finally {
        setIsAutoSaving(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    loading,
    story,
    id,
    user?.uid,
    hasUnsavedChanges,
    hasDraftConflict,
    editTitle,
    editAuthor,
    scheduledReleaseAt,
    editSupporters,
    pages,
    wordCount,
    serverVersion,
    t,
  ]);

  const handleSave = async (asDraft: boolean) => {
    if (!story || !id || hasDraftConflict) return;
    setIsSaving(true);
    setMessage('');
    setMessageIsError(false);
    let localCopyAvailable = false;
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

      const pendingDraft = buildWriterDraft(
        id,
        user?.uid || '',
        serverVersion,
        editTitle,
        editAuthor,
        scheduledReleaseAt,
        editSupporters,
        cleanPages,
        wordCount,
      );
      if (user?.uid) {
        try {
          await saveWriterDraft(pendingDraft);
          setLocalDraft(pendingDraft);
          setLastLocalDraftSaveTime(new Date(pendingDraft.savedAt));
          setLocalDraftSaveFailed(false);
          localCopyAvailable = true;
        } catch (draftError) {
          console.warn(
            'Could not persist draft before manual save:',
            draftError,
          );
          setLocalDraftSaveFailed(true);
        }
      }

      const currentRemote = await loadCurrentWriterVersion(id);
      if (currentRemote.version !== serverVersion) {
        setLocalDraft(pendingDraft);
        setLastLocalDraftSaveTime(new Date(pendingDraft.savedAt));
        basePagesRef.current = currentRemote.pages;
        setServerVersion(currentRemote.version);
        setStory(currentRemote.story);
        setEditTitle(currentRemote.story.title || '');
        setEditAuthor(currentRemote.story.author || '');
        const remoteSupporters = currentRemote.story.supporters;
        setEditSupporters(
          Array.isArray(remoteSupporters)
            ? remoteSupporters.join(', ')
            : remoteSupporters || '',
        );
        const remoteSchedule = currentRemote.story.scheduledReleaseAt || '';
        setScheduledReleaseAt(
          remoteSchedule.includes('Z')
            ? new Date(remoteSchedule).toISOString().slice(0, 16)
            : remoteSchedule.length > 16
              ? remoteSchedule.slice(0, 16)
              : remoteSchedule,
        );
        setPages(currentRemote.pages);
        setHasDraftConflict(true);
        setMessageIsError(true);
        setMessage(t('writerDraftConflict'));
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

      const currentSupporters = Array.isArray(story.supporters)
        ? story.supporters
        : typeof story.supporters === 'string'
          ? story.supporters
              .split(',')
              .map((supporter) => supporter.trim())
              .filter(Boolean)
          : [];
      const metadataChanged =
        (editTitle || story.title) !== story.title ||
        (editAuthor || story.author) !== story.author ||
        (user?.uid || story.authorUid) !== story.authorUid ||
        cleanPages.length !== story.totalPages ||
        wordCount !== (story.wordCount || 0) ||
        JSON.stringify(tags) !== JSON.stringify(story.tags || []) ||
        JSON.stringify(supportersArray) !== JSON.stringify(currentSupporters) ||
        (scheduledReleaseAt || '') !== (story.scheduledReleaseAt || '') ||
        asDraft !== (story.isDraft ?? true);

      // 1) páginas primeiro
      await savePagesToFirestore(
        id,
        cleanPages,
        story.totalPages ?? 0,
        basePagesRef.current,
      );

      // 2) depois os dados da história
      if (metadataChanged) {
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
      }

      const savedStory: StoryData = {
        ...story,
        title: editTitle || story.title,
        author: editAuthor || story.author,
        totalPages: cleanPages.length,
        wordCount,
        tags,
        supporters: supportersArray,
        scheduledReleaseAt: scheduledReleaseAt || '',
        isDraft: asDraft,
      };
      const savedVersion = getStoryVersion(savedStory, cleanPages);
      basePagesRef.current = cleanPages;
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
      setServerVersion(savedVersion);
      setHasDraftConflict(false);
      setLocalDraft(null);
      setLastLocalDraftSaveTime(null);
      setLocalDraftSaveFailed(false);
      setLastFirestoreSaveTime(new Date());
      if (user?.uid) {
        try {
          await deleteWriterDraft(user.uid, id);
        } catch (draftError) {
          console.warn('Could not clear local writer draft:', draftError);
        }
      }
      setHasUnsavedChanges(false);
      setMessage(asDraft ? t('draftSavedSuccess') : t('draftPublishedSuccess'));
    } catch (err: any) {
      console.error('Error updating story:', err);
      setMessageIsError(true);
      if (isFirestoreDailyWriteQuotaError(err)) {
        const quotaMessage = t('firestoreWriteQuotaExceeded', {
          resetTime: formatQuotaResetTime(language),
        });
        setMessage(
          localCopyAvailable
            ? quotaMessage
            : `${quotaMessage} ${t('localDraftSaveError')}`,
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

  const recoverLocalDraft = () => {
    if (!localDraft) return;
    setEditTitle(localDraft.title);
    setEditAuthor(localDraft.author);
    setScheduledReleaseAt(localDraft.scheduledReleaseAt);
    setEditSupporters(localDraft.supporters);
    setPages(localDraft.pages);
    setWordCount(localDraft.wordCount);
    setHasDraftConflict(false);
    setHasUnsavedChanges(true);
    setMessage('');
    setMessageIsError(false);
  };

  const useServerVersion = async () => {
    if (!localDraft || !user?.uid) return;
    try {
      await deleteWriterDraft(user.uid, localDraft.storyId);
      setLocalDraft(null);
      setHasDraftConflict(false);
      setHasUnsavedChanges(false);
      setLastLocalDraftSaveTime(null);
      setMessage('');
      setMessageIsError(false);
    } catch (err) {
      console.error('Could not discard local writer draft:', err);
      setMessageIsError(true);
      setMessage(t('localDraftSaveError'));
    }
  };

  const startPanelDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    skipPanelToggleRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    panelDragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startTop: writerPanelTop,
      moved: false,
      wasCollapsed: isWriterPanelCollapsed,
    };
  };

  const movePanel = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = panelDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const deltaY = e.clientY - drag.startY;
    if (Math.abs(deltaY) > 3) drag.moved = true;
    if (!drag.moved) return;

    const panelHeight =
      writerPanelRef.current?.getBoundingClientRect().height ?? 240;
    const maxTop = Math.max(12, window.innerHeight - panelHeight - 12);
    setWriterPanelTop(Math.min(maxTop, Math.max(12, drag.startTop + deltaY)));
  };

  const finishPanelDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = panelDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (e.type === 'pointerup' && drag.moved && drag.wasCollapsed) {
      skipPanelToggleRef.current = true;
    }
    panelDragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const toggleWriterPanel = () => {
    if (skipPanelToggleRef.current) {
      skipPanelToggleRef.current = false;
      return;
    }
    setIsWriterPanelCollapsed((collapsed) => !collapsed);
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
    <div
      className={`relative w-full max-w-none mx-auto pt-2 pb-0 px-0 animate-in fade-in duration-500 ${
        !isWriterPanelCollapsed && writerTab === 'dialogues'
          ? 'md:pl-[340px]'
          : 'md:pl-[300px]'
      }`}
    >
      <aside
        ref={writerPanelRef}
        className="fixed top-24 z-[60] transition-[width] duration-200"
        style={{
          width: isWriterPanelCollapsed
            ? 48
            : writerTab === 'dialogues'
              ? 'min(320px, calc(100vw - 24px))'
              : 'min(280px, calc(100vw - 24px))',
          left: 'max(12px, calc((100vw - 1400px) / 2 - 4px))',
          top: writerPanelTop,
          maxHeight: 'calc(100dvh - 112px)',
        }}
      >
        <div
          className={`max-h-full overflow-y-auto rounded-xl border border-white/10 bg-[#090a0d]/95 shadow-2xl backdrop-blur-xl ${
            isWriterPanelCollapsed ? 'p-1.5' : 'p-3'
          }`}
        >
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
              onPointerDown={startPanelDrag}
              onPointerMove={movePanel}
              onPointerUp={finishPanelDrag}
              onPointerCancel={finishPanelDrag}
              onClick={isWriterPanelCollapsed ? toggleWriterPanel : undefined}
              className={`flex h-9 shrink-0 touch-none items-center justify-center rounded-lg hover:bg-black/5 active:cursor-grabbing dark:hover:bg-white/10 ${
                isWriterPanelCollapsed ? 'w-9 cursor-grab' : 'w-8 cursor-grab'
              }`}
              title={t('moveWriterPanel')}
              aria-label={t('moveWriterPanel')}
            >
              <GripVertical className="h-4 w-4" />
              {isWriterPanelCollapsed && (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
            {!isWriterPanelCollapsed && (
              <button
                type="button"
                onClick={toggleWriterPanel}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                title={t('collapseTools')}
                aria-label={t('collapseTools')}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
          </div>

          {isWriterPanelCollapsed && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setWriterTab('story');
                  setIsWriterPanelCollapsed(false);
                }}
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                  writerTab === 'story'
                    ? 'bg-white/20 text-white'
                    : 'hover:bg-white/10 text-white/70 hover:text-white',
                )}
                title={t('storySettings')}
              >
                <FileText className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setWriterTab('dialogues');
                  setIsWriterPanelCollapsed(false);
                }}
                className={cn(
                  'relative w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                  writerTab === 'dialogues'
                    ? 'bg-amber-500/30 text-amber-300'
                    : 'hover:bg-white/10 text-amber-400 hover:text-amber-300',
                )}
                title={t('dialogues')}
              >
                <MessagesSquare className="w-4 h-4" />
                {allDialogues.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-black text-[9px] font-bold flex items-center justify-center">
                    {allDialogues.length > 99 ? '99+' : allDialogues.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={isSaving || isAutoSaving || hasDraftConflict}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 disabled:opacity-40"
                title={t('saveDraft')}
              >
                <Save className="w-4 h-4" />
              </button>
            </div>
          )}

          {!isWriterPanelCollapsed && (
            <>
              {/* Tab Selector */}
              <div className="mt-2.5 flex rounded-lg bg-black/40 p-1 border border-white/10 text-[10px] font-bold uppercase tracking-wider">
                <button
                  type="button"
                  onClick={() => setWriterTab('story')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-all',
                    writerTab === 'story'
                      ? 'bg-white/20 text-white shadow-xs'
                      : 'text-white/60 hover:text-white',
                  )}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>{t('storySettings')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWriterTab('dialogues')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-all',
                    writerTab === 'dialogues'
                      ? 'bg-amber-500/25 text-amber-300 shadow-xs border border-amber-500/40'
                      : 'text-white/60 hover:text-white',
                  )}
                >
                  <MessagesSquare className="h-3.5 w-3.5" />
                  <span>{t('dialogues')}</span>
                  {allDialogues.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500/30 text-amber-200 text-[9px] font-mono">
                      {allDialogues.length}
                    </span>
                  )}
                </button>
              </div>

              {writerTab === 'story' ? (
                <div className="mt-3 space-y-4">
                  <div className="flex min-h-8 items-center gap-2 px-2 text-[10px] font-mono">
                    {isAutoSaving ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                        <span className="text-blue-600 dark:text-blue-400">
                          {t('localDraftSaving')}
                        </span>
                      </>
                    ) : hasUnsavedChanges && lastLocalDraftSaveTime ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
                        <span className="text-blue-700 dark:text-blue-300">
                          {t('localDraftSavedAt', {
                            time: formatTime(lastLocalDraftSaveTime),
                          })}
                        </span>
                      </>
                    ) : hasUnsavedChanges || hasDraftConflict ? (
                      <>
                        <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                        <span>{t('localDraftPending')}</span>
                      </>
                    ) : lastFirestoreSaveTime ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {t('draftSavedAt', {
                            time: formatTime(lastFirestoreSaveTime),
                          })}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span>{t('localDraftReady')}</span>
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
                      disabled={isSaving || isAutoSaving || hasDraftConflict}
                      className="paper-btn-accent flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
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
                      disabled={isSaving || isAutoSaving || hasDraftConflict}
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
              ) : (
                /* Tab de Diálogos */
                <div className="mt-3 space-y-3">
                  {/* Stats Overview */}
                  <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-xs">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-white/70">{t('dialogues')}</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px]">
                        {allDialogues.length} {allDialogues.length === 1 ? 'fala' : 'falas'}
                      </span>
                    </div>
                    {allDialogues.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[10px]">
                        <span className="text-white/60">{t('dominantStyle')}:</span>
                        <span className="font-semibold text-white/90">
                          {dialogueStats.dominantStyle === 'dash'
                            ? `— ${t('dashStyle')} (${dialogueStats.dashCount})`
                            : dialogueStats.dominantStyle === 'quotes'
                              ? `“ ” ${t('quotesStyle')} (${dialogueStats.quotesCount})`
                              : 'Misto / Variado'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Formatação e Conversão */}
                  <div className="space-y-2">
                    <span className="block text-[10px] font-bold uppercase tracking-widest opacity-60">
                      {t('dialogueStyle')}
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDialogueTargetStyle('dash')}
                        className={cn(
                          'flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border text-xs font-bold transition-all',
                          dialogueTargetStyle === 'dash'
                            ? 'bg-amber-500/25 border-amber-500 text-amber-300 shadow-sm'
                            : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                        )}
                      >
                        <span>— Travessão</span>
                        {dialogueTargetStyle === 'dash' && <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDialogueTargetStyle('quotes')}
                        className={cn(
                          'flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border text-xs font-bold transition-all',
                          dialogueTargetStyle === 'quotes'
                            ? 'bg-amber-500/25 border-amber-500 text-amber-300 shadow-sm'
                            : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                        )}
                      >
                        <span>“ ” Aspas</span>
                        {dialogueTargetStyle === 'quotes' && <Check className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {/* Escopo */}
                    <div className="flex rounded-lg bg-black/40 p-1 border border-white/10 text-[10px] font-bold uppercase tracking-wider">
                      <button
                        type="button"
                        onClick={() => setDialogueScope('page')}
                        className={cn(
                          'flex-1 py-1 px-1 rounded-md text-center transition-all',
                          dialogueScope === 'page'
                            ? 'bg-white/20 text-white shadow-xs'
                            : 'text-white/60 hover:text-white'
                        )}
                      >
                        {pages.length > 1 ? `Pág. ${selectedDialoguePageIndex + 1}` : 'Página 1'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDialogueScope('all')}
                        className={cn(
                          'flex-1 py-1 px-1 rounded-md text-center transition-all',
                          dialogueScope === 'all'
                            ? 'bg-white/20 text-white shadow-xs'
                            : 'text-white/60 hover:text-white'
                        )}
                      >
                        {t('allPages')}
                      </button>
                    </div>

                    {dialogueScope === 'page' && pages.length > 1 && (
                      <select
                        value={selectedDialoguePageIndex}
                        onChange={(e) => setSelectedDialoguePageIndex(Number(e.target.value))}
                        className="w-full text-xs font-bold rounded-lg bg-black/40 border border-white/15 px-2.5 py-1.5 text-white/90 cursor-pointer"
                      >
                        {pages.map((_, pIdx) => {
                          const count = allDialogues.filter((d) => d.pageIndex === pIdx).length;
                          return (
                            <option key={pIdx} value={pIdx} className="bg-[#121212] text-white">
                              Página {pIdx + 1} ({count} {count === 1 ? 'fala' : 'falas'})
                            </option>
                          );
                        })}
                      </select>
                    )}

                    {/* Botão de conversão */}
                    <button
                      type="button"
                      onClick={handleConvertDialogues}
                      disabled={allDialogues.length === 0}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-black font-bold text-xs uppercase tracking-wider shadow-md transition-all disabled:opacity-40"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>
                        {dialogueScope === 'all'
                          ? t('convertAllDialogues')
                          : t('convertPageDialogues', { page: selectedDialoguePageIndex + 1 })}
                      </span>
                    </button>

                    {/* Feedback */}
                    {dialogueActionFeedback && (
                      <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold text-center animate-in fade-in">
                        {dialogueActionFeedback}
                      </div>
                    )}
                  </div>

                  {/* Lista de Falas (Navegador) */}
                  <div className="pt-2 border-t border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                        {t('dialogues')} ({filteredDialogues.length})
                      </span>
                    </div>

                    {/* Busca */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
                      <input
                        type="text"
                        value={dialogueFilterText}
                        onChange={(e) => setDialogueFilterText(e.target.value)}
                        placeholder={t('filterDialogues')}
                        className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg bg-black/40 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-amber-500/50"
                      />
                    </div>

                    {/* Lista com scroll */}
                    <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1">
                      {filteredDialogues.length === 0 ? (
                        <div className="p-4 text-center text-xs text-white/50 italic">
                          {allDialogues.length === 0
                            ? t('noDialoguesStory')
                            : t('noDialoguesFound')}
                        </div>
                      ) : (
                        filteredDialogues.map((diag) => (
                          <button
                            key={diag.id}
                            type="button"
                            onClick={() => handleSelectDialogue(diag)}
                            className="w-full text-left p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-500/40 transition-all group"
                          >
                            <div className="flex items-center justify-between text-[9px] font-mono mb-1">
                              <span
                                className={cn(
                                  'px-1.5 py-0.2 rounded font-bold',
                                  diag.style === 'dash'
                                    ? 'bg-violet-500/20 text-violet-300'
                                    : 'bg-emerald-500/20 text-emerald-300'
                                )}
                              >
                                {diag.style === 'dash' ? '— Travessão' : '“ ” Aspas'}
                              </span>
                              <span className="text-white/50">Pág. {diag.pageIndex + 1}</span>
                            </div>
                            <p className="font-serif text-[11px] leading-snug text-white/85 group-hover:text-amber-200 line-clamp-2">
                              {diag.preview}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      <main className="min-w-0 w-full rounded-xl border border-white/10 bg-[#090a0d] p-2 sm:p-4">
        {message && (
          <div
            role={messageIsError ? 'alert' : 'status'}
            aria-live={messageIsError ? 'assertive' : 'polite'}
            className={`mb-3 rounded-xl border p-3 text-center text-sm font-bold animate-in fade-in slide-in-from-top-4 ${
              messageIsError
                ? 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
            }`}
          >
            {message}
          </div>
        )}
        {hasUnsavedChanges && !hasDraftConflict && (
          <div className="sticky top-2 z-30 mb-3 flex flex-col gap-3 rounded-xl border border-blue-500/30 bg-[#211b11]/95 p-3 text-sm text-blue-100 shadow-xl backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-400 animate-pulse" />
              <div className="min-w-0">
                <p className="font-bold">
                  {localDraftSaveFailed
                    ? t('localDraftSaveError')
                    : isAutoSaving
                      ? t('localDraftSaving')
                      : lastLocalDraftSaveTime
                        ? t('localDraftSavedAt', {
                            time: formatTime(lastLocalDraftSaveTime),
                          })
                        : t('localDraftPending')}
                </p>
                <p className="mt-0.5 text-xs opacity-80">
                  {t('localDraftNotSynced')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleSave(story.isDraft ?? true)}
              disabled={isSaving || isAutoSaving}
              className="paper-btn-accent flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {story.isDraft ? t('saveDraft') : t('saveChanges')}
            </button>
          </div>
        )}
        {hasDraftConflict && localDraft && (
          <div className="mb-3 flex flex-col gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-900 dark:text-blue-200 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold">{t('writerDraftConflict')}</p>
              <p className="mt-1 text-xs opacity-80">
                {t('localDraftSavedAt', {
                  time: formatTime(new Date(localDraft.savedAt)),
                })}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={recoverLocalDraft}
                className="rounded-lg px-3 py-2 text-xs font-bold paper-btn-accent"
              >
                {t('recoverWriterDraft')}
              </button>
              <button
                type="button"
                onClick={useServerVersion}
                className="rounded-lg px-3 py-2 text-xs font-bold paper-btn-light"
              >
                {t('useServerVersion')}
              </button>
            </div>
          </div>
        )}
        <div className="min-w-0 rounded-xl p-1.5 paper-card sm:p-2">
          <StoryEditor
            ref={storyEditorRef}
            initialPages={pages}
            supporters={editSupporters}
            renderReaderPreview={(previewPages) => (
              <Reader
                previewData={{
                  id: id || 'writer-preview',
                  story: {
                    title: editTitle || story.title,
                    author: editAuthor || story.author,
                    coverImage: story.coverImage,
                    totalPages: previewPages.length || 1,
                    wordCount,
                    supporters: editSupporters,
                  },
                  pages: previewPages.length > 0 ? previewPages : ['<p></p>'],
                }}
              />
            )}
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
