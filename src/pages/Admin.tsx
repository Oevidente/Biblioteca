import { useState, useEffect, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth, ADMIN_EMAIL } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { fileToDataUrl, formatCoverUrl } from "../utils/imageUtils";
import { BookCoverImage } from "../components/BookCoverImage";
import { 
  Lock, 
  Upload, 
  Image as ImageIcon, 
  FileText, 
  Loader2, 
  User as UserIcon, 
  MessageSquare, 
  Star, 
  Pencil, 
  Trash2, 
  Save, 
  X, 
  Search, 
  BookOpen, 
  Check, 
  EyeOff, 
  AlertCircle,
  CheckCircle,
  XCircle
} from "lucide-react";
import { 
  db, 
  collection, 
  addDoc, 
  Timestamp, 
  auth, 
  provider, 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut,
  User, 
  query, 
  orderBy, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc 
} from "../lib/firebase";
import { parseDocx } from "../lib/docxParser";
import { generateTagsLocal } from "../lib/tagger";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CommentData {
  id: string;
  storyId: string;
  storyTitle: string;
  text: string;
  rating: number;
  userName?: string;
  userEmail?: string;
  status?: "pending" | "approved" | "rejected" | "hidden";
  createdAt: any;
}

interface StoryItem {
  id: string;
  title: string;
  author?: string;
  coverImage?: string;
  tags?: string[];
  totalPages?: number;
  createdAt?: any;
  publicationDate?: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = 60000, stageName = "operação"): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Tempo limite excedido (${Math.round(timeoutMs / 1000)}s) ao executar: ${stageName}. Verifique a conexão com o banco de dados.`));
    }, timeoutMs);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export function Admin() {
  const { t } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"publish" | "manage" | "comments">("publish");
  
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [publicationDate, setPublicationDate] = useState(new Date().toISOString().split('T')[0]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentStage, setCurrentStage] = useState("");
  const [errorDetails, setErrorDetails] = useState<{ stage: string; message: string; details?: string } | null>(null);

  // Comments Moderation State
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentFilter, setCommentFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  // Manage stories state
  const [storiesList, setStoriesList] = useState<StoryItem[]>([]);
  const [loadingStories, setLoadingStories] = useState(false);
  const [searchStoryQuery, setSearchStoryQuery] = useState("");
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editTagsInput, setEditTagsInput] = useState("");
  const [editPublicationDate, setEditPublicationDate] = useState("");
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editCoverImage, setEditCoverImage] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState<StoryItem | null>(null);
  const [deletingStoryId, setDeletingStoryId] = useState<string | null>(null);
  const [manageMsg, setManageMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsub();
  }, []);

  const loadStoriesList = async () => {
    setLoadingStories(true);
    setManageMsg(null);
    try {
      const q = query(collection(db, "stories"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const loaded: StoryItem[] = [];
      snap.forEach((d) => {
        const data = d.data();
        loaded.push({
          id: d.id,
          title: data.title || "",
          author: data.author || "",
          coverImage: data.coverImage || "",
          tags: data.tags || [],
          totalPages: data.totalPages || 0,
          createdAt: data.createdAt,
          publicationDate: data.publicationDate || ""
        });
      });
      setStoriesList(loaded);
    } catch (err) {
      console.error("Error loading stories:", err);
    } finally {
      setLoadingStories(false);
    }
  };

  useEffect(() => {
    if (activeTab === "manage" && user) {
      loadStoriesList();
    }
  }, [activeTab, user]);

  const handleStartEdit = (story: StoryItem) => {
    setEditingStoryId(story.id);
    setEditTitle(story.title);
    setEditAuthor(story.author || "");
    setEditTagsInput((story.tags || []).join(", "));
    setEditCoverImage(story.coverImage || "");
    setEditCoverFile(null);
    
    let initialPubDate = story.publicationDate || "";
    if (!initialPubDate && story.createdAt) {
      try {
        const d = story.createdAt.toDate ? story.createdAt.toDate() : new Date(story.createdAt);
        initialPubDate = d.toISOString().split('T')[0];
      } catch (e) {
        initialPubDate = new Date().toISOString().split('T')[0];
      }
    }
    setEditPublicationDate(initialPubDate || new Date().toISOString().split('T')[0]);
    setManageMsg(null);
  };

  const handleCancelEdit = () => {
    setEditingStoryId(null);
    setEditTitle("");
    setEditAuthor("");
    setEditTagsInput("");
    setEditPublicationDate("");
    setEditCoverImage("");
    setEditCoverFile(null);
  };

  const handleEditCoverChange = async (file: File | null) => {
    if (!file) return;
    setEditCoverFile(file);
    try {
      const dataUrl = await fileToDataUrl(file);
      setEditCoverImage(dataUrl);
    } catch (err) {
      console.error("Error generating preview:", err);
    }
  };

  const handleSaveEdit = async (storyId: string) => {
    if (!editTitle.trim() || !editAuthor.trim()) {
      setManageMsg(t("emptyFieldsError"));
      return;
    }
    setIsSavingEdit(true);
    setManageMsg(null);
    try {
      const tagsArray = editTagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      let finalCoverUrl = editCoverImage;

      if (editCoverFile) {
        if (accessToken) {
          try {
            const driveLink = await uploadToDrive(editCoverFile, accessToken);
            finalCoverUrl = formatCoverUrl(driveLink);
          } catch (driveErr) {
            console.warn("Upload para o Drive falhou, convertendo imagem localmente...", driveErr);
            finalCoverUrl = await fileToDataUrl(editCoverFile);
          }
        } else {
          finalCoverUrl = await fileToDataUrl(editCoverFile);
        }
      }

      const storyRef = doc(db, "stories", storyId);
      await updateDoc(storyRef, {
        title: editTitle.trim(),
        author: editAuthor.trim(),
        tags: tagsArray,
        publicationDate: editPublicationDate,
        coverImage: finalCoverUrl
      });

      setStoriesList((prev) =>
        prev.map((s) =>
          s.id === storyId
            ? { ...s, title: editTitle.trim(), author: editAuthor.trim(), tags: tagsArray, publicationDate: editPublicationDate, coverImage: finalCoverUrl }
            : s
        )
      );

      try {
        const cached = localStorage.getItem("luminary_cached_stories");
        if (cached) {
          const list = JSON.parse(cached);
          const updatedList = list.map((item: any) =>
            item.id === storyId
              ? { ...item, title: editTitle.trim(), author: editAuthor.trim(), tags: tagsArray, publicationDate: editPublicationDate, coverImage: finalCoverUrl }
              : item
          );
          localStorage.setItem("luminary_cached_stories", JSON.stringify(updatedList));
        }
      } catch (e) {
        console.error(e);
      }

      setManageMsg(t("storyUpdatedSuccess"));
      setEditingStoryId(null);
      setEditCoverFile(null);
      setEditCoverImage("");
    } catch (err: any) {
      console.error("Error updating story:", err);
      setManageMsg(`${t("errorUpdatingStory")}${err.message || err}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const confirmDeleteStory = async (story: StoryItem) => {
    setDeletingStoryId(story.id);
    setManageMsg(null);

    try {
      const pagesSnap = await getDocs(collection(db, `stories/${story.id}/pages`));
      const deletePagePromises = pagesSnap.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletePagePromises);

      const commentsSnap = await getDocs(collection(db, `stories/${story.id}/comments`));
      const deleteCommentPromises = commentsSnap.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deleteCommentPromises);

      await deleteDoc(doc(db, "stories", story.id));

      setStoriesList((prev) => prev.filter((s) => s.id !== story.id));

      try {
        const cached = localStorage.getItem("luminary_cached_stories");
        if (cached) {
          const list = JSON.parse(cached);
          const filtered = list.filter((item: any) => item.id !== story.id);
          localStorage.setItem("luminary_cached_stories", JSON.stringify(filtered));
        }
      } catch (e) {
        console.error(e);
      }

      setManageMsg(t("storyDeletedSuccess", { title: story.title }));
      setStoryToDelete(null);
    } catch (err: any) {
      console.error("Error deleting story:", err);
      setManageMsg(`${t("errorDeletingStory")}${err.message || err}`);
    } finally {
      setDeletingStoryId(null);
    }
  };

  const loadComments = async () => {
    setLoadingComments(true);
    try {
      const storiesSnap = await getDocs(collection(db, "stories"));
      const storiesMap: Record<string, string> = {};
      storiesSnap.forEach(docSnap => {
        storiesMap[docSnap.id] = docSnap.data().title;
      });

      const loadedComments: CommentData[] = [];
      for (const storyId of Object.keys(storiesMap)) {
        const commentsSnap = await getDocs(query(collection(db, `stories/${storyId}/comments`), orderBy("createdAt", "desc")));
        commentsSnap.forEach(docSnap => {
          const data = docSnap.data();
          loadedComments.push({
            id: docSnap.id,
            storyId,
            storyTitle: storiesMap[storyId],
            text: data.text || "",
            rating: data.rating || 5,
            userName: data.userName || t("reader"),
            userEmail: data.userEmail || "",
            status: data.status || "pending",
            createdAt: data.createdAt
          });
        });
      }
      loadedComments.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setComments(loadedComments);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingComments(false);
    }
  };

  useEffect(() => {
    if (activeTab === "comments" && user) {
      loadComments();
    }
  }, [activeTab, user]);

  const updateCommentStatus = async (storyId: string, commentId: string, newStatus: "approved" | "rejected" | "hidden") => {
    try {
      const commentRef = doc(db, `stories/${storyId}/comments`, commentId);
      await updateDoc(commentRef, { status: newStatus });
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, status: newStatus } : c));
    } catch (err) {
      console.error("Failed to update comment status:", err);
      alert(t("errorUpdatingCommentStatus"));
    }
  };

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const cred = (provider as any).credentialFromResult?.(result);
      if (cred?.accessToken) {
         setAccessToken(cred.accessToken);
      } else {
         setAccessToken((result as any)._tokenResponse?.oauthAccessToken);
      }
    } catch (err) {
      console.error(err);
      alert(t("loginFailed"));
    }
  };

  const uploadToDrive = async (file: File, token: string) => {
    const metadata = {
      name: file.name,
      parents: ['root']
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });
    
    if (!res.ok) {
      const errText = await res.text().catch(() => "Sem resposta do servidor");
      throw new Error(`Google Drive HTTP ${res.status}: ${errText}`);
    }
    const data = await res.json();
    
    const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    if (!permRes.ok) {
      const permErr = await permRes.text().catch(() => "");
      console.warn("Drive permissions warning:", permErr);
    }

    return `https://drive.google.com/uc?id=${data.id}`;
  };

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    setErrorDetails(null);

    if (!title || !author || !coverFile || !docxFile) {
      setMessage(t("fillAllFields"));
      return;
    }
    
    setIsUploading(true);
    setMessage("");
    setProgressPercent(5);
    setCurrentStage(t("startingFiles"));

    let stageName = t("initialPrep");

    try {
      let finalCoverUrl = "";
      stageName = t("coverProcessing");
      setCurrentStage(stageName);
      setProgressPercent(15);

      if (accessToken) {
        try {
          const driveLink = await uploadToDrive(coverFile, accessToken);
          finalCoverUrl = formatCoverUrl(driveLink);
        } catch (driveErr) {
          console.warn("Upload para o Drive falhou, convertendo imagem localmente...", driveErr);
          finalCoverUrl = await fileToDataUrl(coverFile);
        }
      } else {
        finalCoverUrl = await fileToDataUrl(coverFile);
      }

      stageName = t("docxProcessing");
      setCurrentStage(stageName);
      setProgressPercent(35);
      const pages = await parseDocx(docxFile);

      if (!pages || pages.length === 0) {
        throw new Error(t("docxInvalid"));
      }

      stageName = t("tagGeneration");
      setCurrentStage(stageName);
      setProgressPercent(45);
      const textSample = pages[0].replace(/<[^>]*>?/gm, ''); 
      const tags = generateTagsLocal(textSample);

      stageName = t("dbCreation");
      setCurrentStage(stageName);
      setProgressPercent(55);
      
      const storyRef = doc(collection(db, "stories"));
      
      const newStoryObj = {
        id: storyRef.id,
        title,
        author,
        coverImage: finalCoverUrl,
        tags,
        rating: 0,
        ratingsCount: 0,
        totalPages: pages.length,
        createdAt: new Date().toISOString(),
        publicationDate: publicationDate
      };

      await withTimeout(setDoc(storyRef, {
        title,
        author,
        coverImage: finalCoverUrl,
        tags,
        rating: 0,
        ratingsCount: 0,
        totalPages: pages.length,
        createdAt: Timestamp.now(),
        publicationDate: publicationDate
      }), 60000, stageName);

      try {
        const cached = localStorage.getItem("luminary_cached_stories");
        const list = cached ? JSON.parse(cached) : [];
        list.unshift(newStoryObj);
        localStorage.setItem("luminary_cached_stories", JSON.stringify(list));
      } catch (e) {
        console.error("Cache update error:", e);
      }

      const CHUNK_SIZE = 5;
      for (let i = 0; i < pages.length; i += CHUNK_SIZE) {
        const end = Math.min(i + CHUNK_SIZE, pages.length);
        const percent = Math.floor(55 + Math.floor((end / pages.length) * 40));
        setProgressPercent(percent);
        stageName = t("dbPageSending", { end, total: pages.length });
        setCurrentStage(stageName);

        const chunk = pages.slice(i, end);
        const promises = chunk.map((html, idx) => {
          const pageIdx = i + idx;
          const pageRef = doc(db, `stories/${storyRef.id}/pages`, pageIdx.toString());
          return setDoc(pageRef, { content: html, index: pageIdx });
        });

        await withTimeout(Promise.all(promises), 90000, stageName);
      }

      setProgressPercent(100);
      setCurrentStage(t("publishSuccess"));
      setMessage(t("storyPublishedSuccess"));
      setTitle("");
      setAuthor("");
      setCoverFile(null);
      setDocxFile(null);
      setPublicationDate(new Date().toISOString().split('T')[0]);
    } catch (error: any) {
      console.error("Erro na publicação:", error);
      const errMsg = error?.message || "Ocorreu um erro desconhecido";
      const errCode = error?.code ? ` (Código: ${error.code})` : "";
      
      setCurrentStage(t("stageFailed", { stage: stageName }));
      setErrorDetails({
        stage: stageName,
        message: `${errMsg}${errCode}`,
        details: error?.stack || JSON.stringify(error, null, 2)
      });
      setMessage(`${t("errorProcess")}${errMsg}`);
    } finally {
      setIsUploading(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-16 p-8 bg-white dark:bg-[#1A1A1A] rounded-2xl shadow-sm border border-[#1A1A1A]/10 dark:border-white/10">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-[#1A1A1A] dark:bg-white rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-white dark:text-[#1A1A1A]" />
          </div>
        </div>
        <h1 className="text-2xl font-serif font-bold text-center mb-8">{t("adminAccess")}</h1>
        <div className="space-y-6">
          <button 
            onClick={handleLogin}
            className="w-full bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] font-bold text-[10px] uppercase tracking-widest py-4 rounded-full hover:bg-[#5A5A40] dark:hover:bg-[#EAE8E2] transition-colors"
          >
            {t("loginWithGoogle")}
          </button>
        </div>
      </div>
    );
  }

  if ((user.email || "").toLowerCase().trim() !== ADMIN_EMAIL) {
    return (
      <div className="max-w-md mx-auto mt-16 p-8 bg-white dark:bg-[#1A1A1A] rounded-[22px] shadow-sm border border-[#1A1A1A]/10 dark:border-white/10 text-center">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-950/30 rounded-full flex items-center justify-center">
            <EyeOff className="w-8 h-8 text-red-500" />
          </div>
        </div>
        <h1 className="text-2xl font-serif font-bold mb-4">{t("restrictedAccess")}</h1>
        <p className="text-sm opacity-70 mb-2">
          {t("restrictedAccessDesc")}
        </p>
        <p className="text-xs opacity-50 mb-8 font-mono break-all bg-black/5 dark:bg-white/5 py-1 px-2 rounded">
          {user.email}
        </p>
        <div className="space-y-3">
          <Link
            to="/"
            className="block w-full bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] font-bold text-[10px] uppercase tracking-widest py-3.5 rounded-full hover:opacity-90 transition-opacity"
          >
            {t("goToLibrary")}
          </Link>
          <button 
            onClick={() => signOut(auth)}
            className="w-full bg-transparent hover:bg-black/5 dark:hover:bg-white/5 text-[#1A1A1A] dark:text-[#F5F5F0] border border-[#1A1A1A]/10 dark:border-white/10 font-bold text-[10px] uppercase tracking-widest py-3.5 rounded-full transition-colors"
          >
            {t("exitAccount")}
          </button>
        </div>
      </div>
    );
  }

  const filteredComments = comments.filter(c => {
    if (commentFilter === "all") return true;
    if (commentFilter === "pending") return c.status === "pending";
    if (commentFilter === "approved") return c.status === "approved";
    if (commentFilter === "rejected") return c.status === "rejected" || c.status === "hidden";
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight">{t("adminPanel")}</h1>
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mt-1">{user.email}</div>
        </div>
        <div className="flex bg-white dark:bg-[#0A0A0A] p-1 rounded-full border border-[#1A1A1A]/10 dark:border-white/10 shadow-sm overflow-x-auto w-full sm:w-auto">
          <button 
            onClick={() => setActiveTab("publish")}
            className={cn("px-5 py-2.5 rounded-full text-[10px] uppercase font-bold tracking-widest transition-colors whitespace-nowrap", activeTab === "publish" ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A]" : "opacity-60 hover:opacity-100")}
          >
            {t("publish")}
          </button>
          <button 
            onClick={() => setActiveTab("manage")}
            className={cn("px-5 py-2.5 rounded-full text-[10px] uppercase font-bold tracking-widest transition-colors whitespace-nowrap", activeTab === "manage" ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A]" : "opacity-60 hover:opacity-100")}
          >
            {t("manage")}
          </button>
          <button 
            onClick={() => setActiveTab("comments")}
            className={cn("px-5 py-2.5 rounded-full text-[10px] uppercase font-bold tracking-widest transition-colors whitespace-nowrap flex items-center gap-1.5", activeTab === "comments" ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A]" : "opacity-60 hover:opacity-100")}
          >
            {t("moderateComments")}
            {comments.filter(c => c.status === "pending").length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            )}
          </button>
        </div>
      </div>

      {activeTab === "publish" && (
        <form onSubmit={handleUpload} className="space-y-6 bg-white dark:bg-[#1A1A1A] p-6 sm:p-8 rounded-2xl shadow-sm border border-[#1A1A1A]/10 dark:border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-2">{t("storyTitle")}</label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/20 dark:border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white text-sm"
                placeholder={t("storyTitlePlaceholder")}
                required
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-2">{t("editAuthor")}</label>
              <input 
                type="text" 
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full px-4 py-3 bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/20 dark:border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white text-sm"
                placeholder={t("authorPlaceholder")}
                required
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-2">{t("publishDate")}</label>
              <input 
                type="date" 
                value={publicationDate}
                onChange={(e) => setPublicationDate(e.target.value)}
                className="w-full px-4 py-3 bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/20 dark:border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white text-sm"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-2">{t("coverImageLabel")}</label>
              <label className={cn(
                "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors",
                coverFile ? "border-[#1A1A1A] dark:border-white bg-[#1A1A1A]/5 dark:bg-white/5" : "border-[#1A1A1A]/20 dark:border-white/20 hover:bg-[#F5F5F0] dark:hover:bg-[#0A0A0A]"
              )}>
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <ImageIcon className={cn("w-8 h-8 mb-2", coverFile ? "text-[#1A1A1A] dark:text-white" : "text-[#1A1A1A]/40 dark:text-white/40")} />
                  <p className="text-xs font-bold opacity-60 truncate max-w-[200px] px-2">
                    {coverFile ? coverFile.name : t("coverImagePlaceholder")}
                  </p>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} required />
              </label>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-2">{t("storyFileLabel")}</label>
              <label className={cn(
                "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors",
                docxFile ? "border-[#1A1A1A] dark:border-white bg-[#1A1A1A]/5 dark:bg-white/5" : "border-[#1A1A1A]/20 dark:border-white/20 hover:bg-[#F5F5F0] dark:hover:bg-[#0A0A0A]"
              )}>
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <FileText className={cn("w-8 h-8 mb-2", docxFile ? "text-[#1A1A1A] dark:text-white" : "text-[#1A1A1A]/40 dark:text-white/40")} />
                  <p className="text-xs font-bold opacity-60 truncate max-w-[200px] px-2">
                    {docxFile ? docxFile.name : t("storyFilePlaceholder")}
                  </p>
                </div>
                <input type="file" accept=".docx" className="hidden" onChange={(e) => setDocxFile(e.target.files?.[0] || null)} required />
              </label>
            </div>
          </div>

          {(isUploading || progressPercent > 0) && (
            <div className={cn(
              "space-y-3 p-5 rounded-2xl border transition-colors",
              errorDetails 
                ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400" 
                : "bg-[#F5F5F0] dark:bg-[#0A0A0A] border-[#1A1A1A]/10 dark:border-white/10"
            )}>
              <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest">
                <span className="flex items-center gap-2">
                  {isUploading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                  {currentStage}
                </span>
                <span className="font-mono text-sm">{progressPercent}%</span>
              </div>
              <div className="w-full bg-[#1A1A1A]/10 dark:bg-white/10 h-2.5 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all duration-300 rounded-full",
                    errorDetails ? "bg-red-500" : "bg-[#1A1A1A] dark:bg-[#F5F5F0]"
                  )}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {errorDetails && (
            <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-800 dark:text-red-300 space-y-3 text-left">
              <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-red-600 dark:text-red-400">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                {t("realTimeError", { stage: errorDetails.stage })}
              </div>
              <p className="text-sm font-semibold leading-relaxed">
                {errorDetails.message}
              </p>
            </div>
          )}

          {message && !errorDetails && (
            <div className="p-4 rounded-xl bg-[#F5F5F0] dark:bg-[#0A0A0A] text-sm font-bold text-center border border-[#1A1A1A]/20 dark:border-white/20">
              {message}
            </div>
          )}

          {!accessToken ? (
            <button 
              type="button"
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-2 bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] font-bold text-[10px] uppercase tracking-widest py-4 rounded-full hover:bg-[#5A5A40] dark:hover:bg-[#EAE8E2] transition-colors"
            >
              {t("authorizeDrive")}
            </button>
          ) : (
            <button 
              type="submit"
              disabled={isUploading}
              className="w-full flex items-center justify-center gap-2 bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] font-bold text-[10px] uppercase tracking-widest py-4 rounded-full hover:bg-[#5A5A40] dark:hover:bg-[#EAE8E2] transition-colors disabled:opacity-50"
            >
              {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              {isUploading ? t("publishing") : t("publishStory")}
            </button>
          )}
        </form>
      )}

      {activeTab === "manage" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-[#1A1A1A] p-4 rounded-2xl border border-[#1A1A1A]/10 dark:border-white/10">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
              <input 
                type="text"
                placeholder={t("searchPlaceholder")}
                value={searchStoryQuery}
                onChange={(e) => setSearchStoryQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/20 dark:border-white/20 rounded-xl focus:outline-none"
              />
            </div>
            <button 
              onClick={loadStoriesList} 
              disabled={loadingStories}
              className="text-xs font-bold uppercase tracking-wider opacity-60 hover:opacity-100 transition-opacity"
            >
              {loadingStories ? t("loading") : t("updateList")}
            </button>
          </div>

          {manageMsg && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-bold text-center">
              {manageMsg}
            </div>
          )}

          {loadingStories ? (
            <div className="text-center py-20 animate-pulse text-sm">{t("loadingStories")}</div>
          ) : storiesList.length === 0 ? (
            <div className="text-center py-20 opacity-50 font-serif border border-dashed border-[#1A1A1A]/20 dark:border-white/20 rounded-2xl">
              {t("noStoriesAdmin")}
            </div>
          ) : (
            <div className="space-y-4">
              {storiesList
                .filter(s => {
                  if (!searchStoryQuery.trim()) return true;
                  const q = searchStoryQuery.toLowerCase();
                  return (
                    s.title.toLowerCase().includes(q) ||
                    (s.author && s.author.toLowerCase().includes(q)) ||
                    (s.tags && s.tags.some(t => t.toLowerCase().includes(q)))
                  );
                })
                .map((story) => {
                  const isEditing = editingStoryId === story.id;
                  const isDeletingThis = deletingStoryId === story.id;

                  return (
                    <div 
                      key={story.id} 
                      className="bg-white dark:bg-[#1A1A1A] p-6 rounded-2xl border border-[#1A1A1A]/10 dark:border-white/10 space-y-4 transition-all"
                    >
                      {isEditing ? (
                        <div className="space-y-4">
                          <div className="flex justify-between items-center border-b border-[#1A1A1A]/10 dark:border-white/10 pb-3">
                            <span className="text-xs font-bold uppercase tracking-widest opacity-60 flex items-center gap-1.5">
                              <Pencil className="w-3.5 h-3.5" /> {t("editStory")}
                            </span>
                            <button 
                              onClick={handleCancelEdit}
                              className="p-1 rounded-lg hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 opacity-60 hover:opacity-100"
                              title={t("cancel")}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("editTitle")}</label>
                              <input 
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/20 dark:border-white/20 rounded-xl focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("editAuthor")}</label>
                              <input 
                                type="text"
                                value={editAuthor}
                                onChange={(e) => setEditAuthor(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/20 dark:border-white/20 rounded-xl focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("publishDate")}</label>
                              <input 
                                type="date"
                                value={editPublicationDate}
                                onChange={(e) => setEditPublicationDate(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/20 dark:border-white/20 rounded-xl focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <div className="md:col-span-1 flex flex-col">
                              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1.5">{t("coverImageLabel")}</label>
                              <div className="relative w-20 aspect-[2/3] h-auto rounded-xl overflow-hidden border border-[#1A1A1A]/10 dark:border-white/10 shadow-sm shrink-0 bg-[#F5F5F0] dark:bg-[#0A0A0A] flex items-center justify-center">
                                {editCoverImage ? (
                                  <img src={editCoverImage} alt="Cover Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <ImageIcon className="w-6 h-6 opacity-20" />
                                )}
                              </div>
                            </div>
                            
                            <div className="md:col-span-3 flex flex-col">
                              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1.5">{t("coverImageLabel")} (Nova)</label>
                              <label className={cn(
                                "flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors",
                                editCoverFile ? "border-[#1A1A1A] dark:border-white bg-[#1A1A1A]/5 dark:bg-white/5" : "border-[#1A1A1A]/20 dark:border-white/20 hover:bg-[#F5F5F0] dark:hover:bg-[#0A0A0A]"
                              )}>
                                <div className="flex flex-col items-center justify-center pt-2 pb-2">
                                  <Upload className={cn("w-6 h-6 mb-1", editCoverFile ? "text-[#1A1A1A] dark:text-white" : "text-[#1A1A1A]/40 dark:text-white/40")} />
                                  <p className="text-xs font-bold opacity-60 truncate max-w-[200px] px-2 text-center">
                                    {editCoverFile ? editCoverFile.name : t("coverImagePlaceholder")}
                                  </p>
                                </div>
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  className="hidden" 
                                  onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    handleEditCoverChange(file);
                                  }} 
                                />
                              </label>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("editTags")}</label>
                            <input 
                                type="text"
                                value={editTagsInput}
                                onChange={(e) => setEditTagsInput(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/20 dark:border-white/20 rounded-xl focus:outline-none"
                                placeholder={t("editTagsPlaceholder")}
                            />
                          </div>

                          <div className="flex justify-end gap-3 pt-2">
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              disabled={isSavingEdit}
                              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-[#1A1A1A]/20 dark:border-white/20 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5"
                            >
                              {t("cancel")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(story.id)}
                              disabled={isSavingEdit}
                              className="px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50"
                            >
                              {isSavingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                              {t("saveChanges")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row gap-4 items-start justify-between">
                          <div className="flex gap-4 items-start">
                            <BookCoverImage
                              src={story.coverImage}
                              alt={story.title}
                              title={story.title}
                              className="w-16 aspect-[2/3] h-auto object-cover rounded-lg shadow-sm border border-[#1A1A1A]/10 dark:border-white/10 shrink-0"
                            />

                            <div className="space-y-1.5">
                              <h3 className="font-serif font-bold text-lg leading-tight">{story.title}</h3>
                              <div className="text-xs opacity-70 flex items-center gap-1">
                                <UserIcon className="w-3 h-3 opacity-60" /> {story.author || t("unknownAuthor")}
                              </div>

                              {story.tags && story.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {story.tags.map((tag, idx) => (
                                    <span 
                                      key={idx} 
                                      className="px-2 py-0.5 bg-[#F5F5F0] dark:bg-[#0A0A0A] text-[10px] font-bold uppercase tracking-wider rounded-md border border-[#1A1A1A]/10 dark:border-white/10 opacity-80"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="text-[10px] font-mono opacity-40 pt-1 flex flex-wrap gap-x-3 gap-y-1">
                                <span>{story.totalPages} {t("pages")}</span>
                                {(() => {
                                  let pubDateStr = story.publicationDate;
                                  if (!pubDateStr && story.createdAt) {
                                    try {
                                      const d = story.createdAt.toDate ? story.createdAt.toDate() : new Date(story.createdAt);
                                      pubDateStr = d.toISOString().split('T')[0];
                                    } catch (e) {}
                                  }
                                  if (pubDateStr) {
                                    return <span>• {t("publishedOn")}: {pubDateStr.split('-').reverse().join('/')}</span>;
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                          </div>

                          <div className="flex sm:flex-col gap-2 w-full sm:w-auto shrink-0 justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-[#1A1A1A]/10 dark:border-white/10">
                            <button
                              onClick={() => handleStartEdit(story)}
                              disabled={isDeletingThis}
                              className="flex-1 sm:flex-initial px-4 py-2 bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/20 dark:border-white/20 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#1A1A1A] hover:text-white dark:hover:bg-white dark:hover:text-[#1A1A1A] transition-colors flex items-center justify-center gap-1.5"
                            >
                              <Pencil className="w-3.5 h-3.5" /> {t("editLabel")}
                            </button>
                            <button
                              onClick={() => setStoryToDelete(story)}
                              disabled={isDeletingThis}
                              className="flex-1 sm:flex-initial px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {isDeletingThis ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              {t("deleteLabel")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {activeTab === "comments" && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#1A1A1A] p-4 rounded-2xl border border-[#1A1A1A]/10 dark:border-white/10">
            <div className="text-xs font-bold uppercase tracking-widest opacity-80">
              {t("commentsApprovalTitle")}
            </div>
            <div className="flex gap-2 bg-[#F5F5F0] dark:bg-[#0A0A0A] p-1 rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 text-[10px] font-bold uppercase tracking-widest">
              <button 
                onClick={() => setCommentFilter("pending")}
                className={cn("px-3 py-1.5 rounded-lg transition-colors", commentFilter === "pending" ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A]" : "opacity-60")}
              >
                {t("commentsPending")} ({comments.filter(c => c.status === "pending").length})
              </button>
              <button 
                onClick={() => setCommentFilter("approved")}
                className={cn("px-3 py-1.5 rounded-lg transition-colors", commentFilter === "approved" ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A]" : "opacity-60")}
              >
                {t("commentsApproved")} ({comments.filter(c => c.status === "approved").length})
              </button>
              <button 
                onClick={() => setCommentFilter("rejected")}
                className={cn("px-3 py-1.5 rounded-lg transition-colors", commentFilter === "rejected" ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A]" : "opacity-60")}
              >
                {t("commentsRejected")}
              </button>
              <button 
                onClick={() => setCommentFilter("all")}
                className={cn("px-3 py-1.5 rounded-lg transition-colors", commentFilter === "all" ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A]" : "opacity-60")}
              >
                {t("all")} ({comments.length})
              </button>
            </div>
          </div>

          {loadingComments ? (
            <div className="text-center py-20 animate-pulse text-sm font-serif">{t("loadingComments")}</div>
          ) : filteredComments.length === 0 ? (
            <div className="text-center py-20 opacity-50 font-serif border border-dashed border-[#1A1A1A]/20 dark:border-white/20 rounded-2xl">
              {t("noCommentsCategory")}
            </div>
          ) : (
            filteredComments.map(c => (
              <div key={c.id} className="bg-white dark:bg-[#1A1A1A] p-6 rounded-2xl border border-[#1A1A1A]/10 dark:border-white/10 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest opacity-60 block mb-1">
                      {c.storyTitle}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{c.userName}</span>
                      {c.userEmail && <span className="text-xs font-mono opacity-40">({c.userEmail})</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={cn("w-3.5 h-3.5", i < c.rating ? "fill-amber-400 text-amber-400" : "opacity-20")} />
                      ))}
                    </div>

                    {/* Status Badge */}
                    <span className={cn(
                      "text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border",
                      c.status === "approved" && "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
                      c.status === "pending" && "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
                      (c.status === "rejected" || c.status === "hidden") && "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
                    )}>
                      {c.status === "approved" ? t("approved") : c.status === "pending" ? t("pending") : t("rejected")}
                    </span>
                  </div>
                </div>

                {c.text && (
                  <p className="font-serif text-sm leading-relaxed bg-[#F5F5F0] dark:bg-[#0A0A0A] p-4 rounded-xl border border-[#1A1A1A]/5 dark:border-white/5">
                    "{c.text}"
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#1A1A1A]/10 dark:border-white/10">
                  <span className="text-[10px] font-mono opacity-40">
                    {c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString() : t("recentDate")}
                  </span>

                  {/* Moderation Actions */}
                  <div className="flex gap-2">
                    {c.status !== "approved" && (
                      <button
                        onClick={() => updateCommentStatus(c.storyId, c.id, "approved")}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-500 hover:text-white transition-colors"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> {t("approve")}
                      </button>
                    )}

                    {c.status !== "rejected" && (
                      <button
                        onClick={() => updateCommentStatus(c.storyId, c.id, "rejected")}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-red-500 hover:text-white transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" /> {t("reject")}
                      </button>
                    )}

                    {c.status !== "hidden" && c.status === "approved" && (
                      <button
                        onClick={() => updateCommentStatus(c.storyId, c.id, "hidden")}
                        className="flex items-center gap-1 px-3 py-1.5 bg-black/10 dark:bg-white/10 opacity-70 border border-black/20 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:opacity-100 transition-colors"
                      >
                        <EyeOff className="w-3.5 h-3.5" /> {t("hide")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Confirmation Modal for Story Deletion */}
      {storyToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1A1A1A] max-w-md w-full rounded-2xl p-6 shadow-2xl border border-[#1A1A1A]/10 dark:border-white/10 space-y-4">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="p-3 bg-red-500/10 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-[#1A1A1A] dark:text-white">{t("confirmDeleteTitle")}</h3>
                <p className="text-xs opacity-60">{t("irreversibleAction")}</p>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-[#1A1A1A] dark:text-white/90">
              {t("confirmDeletePrompt", { title: storyToDelete.title })}
            </p>

            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-700 dark:text-red-300 font-medium leading-normal">
              {t("confirmDeleteWarning")}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStoryToDelete(null)}
                disabled={deletingStoryId === storyToDelete.id}
                className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border border-[#1A1A1A]/20 dark:border-white/20 hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 transition-colors"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => confirmDeleteStory(storyToDelete)}
                disabled={deletingStoryId === storyToDelete.id}
                className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {deletingStoryId === storyToDelete.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {t("yesDelete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
