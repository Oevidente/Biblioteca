import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  XCircle,
  Heart,
  PenTool,
  Sparkles,
  Layers,
  Send,
  Eye,
  RotateCcw,
  BarChart2,
  TrendingUp,
  Clock,
  Users,
  ChevronDown,
  ChevronUp
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
  deleteDoc,
  collectionGroup
} from "../lib/firebase";
import mammoth from "mammoth";
import { generateTagsLocal } from "../lib/tagger";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function createDefaultCoverUrl(title: string, author: string): string {
  const cleanTitle = (title || "Sem Título").replace(/</g, "&lt;");
  const cleanAuthor = (author || "Autor").toUpperCase().replace(/</g, "&lt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#2a2a24;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#111110;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="400" height="600" fill="url(#grad)" />
    <rect x="20" y="20" width="360" height="560" fill="none" stroke="#d4af37" stroke-width="2" stroke-opacity="0.3" rx="12" />
    <text x="200" y="260" font-family="serif" font-size="28" font-weight="bold" fill="#f5f5f0" text-anchor="middle" width="320">${cleanTitle}</text>
    <text x="200" y="340" font-family="sans-serif" font-size="14" font-weight="bold" fill="#d4af37" text-anchor="middle" letter-spacing="2">${cleanAuthor}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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
  wordCount?: number;
  createdAt?: any;
  publicationDate?: string;
  authorUid?: string;
  isDraft?: boolean;
  supporters?: string[] | string;
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
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isAdmin = profile?.role === "admin" || (user?.email || "").toLowerCase().trim() === ADMIN_EMAIL;

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"publish" | "manage" | "comments" | "superadmin" | "analytics">("publish");

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

  // Publish Creation Mode
  const [creationMode, setCreationMode] = useState<"writer" | "docx">("writer");

  // Manage stories filter & modal states
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "drafts">("all");

  // Comments Moderation State
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentFilter, setCommentFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [commentToDeleteText, setCommentToDeleteText] = useState<CommentData | null>(null);
  const [commentToDeleteAll, setCommentToDeleteAll] = useState<CommentData | null>(null);
  const [commentActionLoading, setCommentActionLoading] = useState(false);
  const [commentsMsg, setCommentsMsg] = useState<string | null>(null);

  // Manage stories state
  const [storiesList, setStoriesList] = useState<StoryItem[]>([]);
  const [loadingStories, setLoadingStories] = useState(false);
  const [searchStoryQuery, setSearchStoryQuery] = useState("");
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editTagsInput, setEditTagsInput] = useState("");
  const [editSupporters, setEditSupporters] = useState("");
  const [editPublicationDate, setEditPublicationDate] = useState("");
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editCoverImage, setEditCoverImage] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState<StoryItem | null>(null);
  const [deletingStoryId, setDeletingStoryId] = useState<string | null>(null);
  const [storyToRevert, setStoryToRevert] = useState<StoryItem | null>(null);
  const [revertingStoryId, setRevertingStoryId] = useState<string | null>(null);
  const [manageMsg, setManageMsg] = useState<string | null>(null);

  // Superadmin State
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [totalFavorites, setTotalFavorites] = useState<number | null>(null);
  const [loadingSuperadmin, setLoadingSuperadmin] = useState(false);
  const [authorRequests, setAuthorRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [superadminUsers, setSuperadminUsers] = useState<any[]>([]);
  const [showUsersList, setShowUsersList] = useState(false);
  const [searchUserQuery, setSearchUserQuery] = useState("");

  // Analytics State
  const [analyticsStories, setAnalyticsStories] = useState<any[]>([]);
  const [progressRecords, setProgressRecords] = useState<any[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [selectedStoryId, setSelectedStoryId] = useState<string>("all");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const loadStoriesList = async () => {
    setLoadingStories(true);
    setManageMsg(null);
    try {
      const q = query(collection(db, "stories"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const loaded: StoryItem[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (!isAdmin && data.authorUid && data.authorUid !== user?.uid) return;
        loaded.push({
          id: d.id,
          title: data.title || "",
          author: data.author || "",
          coverImage: data.coverImage || "",
          tags: data.tags || [],
          totalPages: data.totalPages || 0,
          wordCount: data.wordCount,
          createdAt: data.createdAt,
          publicationDate: data.publicationDate || "",
          authorUid: data.authorUid,
          isDraft: data.isDraft || false,
          supporters: data.supporters || []
        });
      });
      setStoriesList(loaded);
    } catch (err) {
      console.error("Error loading stories:", err);
    } finally {
      setLoadingStories(false);
    }
  };

  const loadSuperadminMetrics = async () => {
    setLoadingSuperadmin(true);
    setLoadingRequests(true);
    try {
      const snap = await getDocs(collection(db, "users"));
      let userCount = 0;
      let favCount = 0;
      const requests: any[] = [];
      const loadedUsers: any[] = [];
      snap.forEach((d) => {
        userCount++;
        const data = d.data();
        loadedUsers.push({ id: d.id, ...data });
        if (data.favorites && Array.isArray(data.favorites)) {
          favCount += data.favorites.length;
        }
        if (data.requestedRole === "author" && data.role !== "author") {
          requests.push({ id: d.id, ...data });
        }
      });
      setTotalUsers(userCount);
      setTotalFavorites(favCount);
      setAuthorRequests(requests);
      setSuperadminUsers(loadedUsers);
    } catch (err) {
      console.error("Error loading superadmin metrics:", err);
    } finally {
      setLoadingSuperadmin(false);
      setLoadingRequests(false);
    }
  };

  const loadAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const snap = await getDocs(collection(db, "stories"));
      const loadedStories: any[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (!isAdmin && data.authorUid !== user?.uid) return;
        loadedStories.push({ id: d.id, ...data });
      });
      setAnalyticsStories(loadedStories);

      const progSnap = await getDocs(collectionGroup(db, "progress"));
      const loadedProgress: any[] = [];
      progSnap.forEach((d) => {
        const data = d.data();
        const uId = d.ref.parent?.parent?.id || "unknown";
        if (!isAdmin) {
          const isAllowedStory = loadedStories.some(s => s.id === data.storyId);
          if (!isAllowedStory) return;
        }
        loadedProgress.push({
          id: d.id,
          userId: uId,
          ...data
        });
      });
      setProgressRecords(loadedProgress);
    } catch (err) {
      console.error("Error loading analytics:", err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const changeUserRole = async (userId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, "users", userId), { role: newRole });
      setSuperadminUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      if (newRole === "author") {
        setAuthorRequests(prev => prev.filter(r => r.id !== userId));
      }
      alert(t("roleUpdatedSuccess"));
    } catch (err) {
      console.error("Erro ao alterar função do usuário:", err);
      alert(t("errorUpdatingRole"));
    }
  };

  const approveAuthor = async (userId: string) => {
    try {
      await updateDoc(doc(db, "users", userId), { role: "author" });
      setAuthorRequests(prev => prev.filter(r => r.id !== userId));
      setSuperadminUsers(prev => prev.map(u => u.id === userId ? { ...u, role: "author" } : u));
      alert(t("authorApprovedSuccess"));
    } catch (err) {
      console.error("Erro ao autorizar autor", err);
      alert(t("errorApprovingAuthor"));
    }
  };

  useEffect(() => {
    if (activeTab === "manage" && user) {
      loadStoriesList();
    } else if (activeTab === "superadmin" && user && (user.email || "").toLowerCase().trim() === ADMIN_EMAIL) {
      loadSuperadminMetrics();
    } else if (activeTab === "analytics" && user) {
      loadAnalytics();
    }
  }, [activeTab, user]);

  const handleStartEdit = (story: StoryItem) => {
    setEditingStoryId(story.id);
    setEditTitle(story.title || "");
    setEditAuthor(story.author || "");
    setEditTagsInput((story.tags || []).join(", "));
    
    const rawSupporters = story.supporters;
    if (Array.isArray(rawSupporters)) {
      setEditSupporters(rawSupporters.join(", "));
    } else if (typeof rawSupporters === "string") {
      setEditSupporters(rawSupporters);
    } else {
      setEditSupporters("");
    }

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
    setEditSupporters("");
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

      const supportersArray = editSupporters
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      let finalCoverUrl = editCoverImage;

      if (editCoverFile) {
        if (accessToken) {
          try {
            const driveLink = await uploadToDrive(editCoverFile, accessToken, "covers", `cover_${editingStoryId}_${Date.now()}.jpg`);
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
        supporters: supportersArray,
        publicationDate: editPublicationDate,
        coverImage: finalCoverUrl
      });

      setStoriesList((prev) =>
        prev.map((s) =>
          s.id === storyId
            ? { ...s, title: editTitle.trim(), author: editAuthor.trim(), tags: tagsArray, supporters: supportersArray, publicationDate: editPublicationDate, coverImage: finalCoverUrl }
            : s
        )
      );

      try {
        const cached = localStorage.getItem("luminary_cached_stories");
        if (cached) {
          const list = JSON.parse(cached);
          const updatedList = list.map((item: any) =>
            item.id === storyId
              ? { ...item, title: editTitle.trim(), author: editAuthor.trim(), tags: tagsArray, supporters: supportersArray, publicationDate: editPublicationDate, coverImage: finalCoverUrl }
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
      setEditSupporters("");
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
        const data = docSnap.data();
        if (!isAdmin && data.authorUid !== user?.uid) return;
        storiesMap[docSnap.id] = data.title;
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
      setCommentsMsg(t("commentUpdatedSuccess") || "Status do comentário atualizado com sucesso.");
    } catch (err: any) {
      console.error("Failed to update comment status:", err);
      setCommentsMsg((t("errorUpdatingCommentStatus") || "Erro ao atualizar comentário.") + " " + (err.message || ""));
    }
  };

  const confirmDeleteCommentText = async (storyId: string, commentId: string) => {
    setCommentActionLoading(true);
    setCommentsMsg(null);
    try {
      const commentRef = doc(db, `stories/${storyId}/comments`, commentId);
      await updateDoc(commentRef, { text: "" });
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, text: "" } : c));
      setCommentsMsg("Texto do comentário excluído com sucesso. A avaliação foi mantida.");
      setCommentToDeleteText(null);
    } catch (err: any) {
      console.error("Failed to delete comment text:", err);
      setCommentsMsg("Erro ao excluir texto do comentário: " + (err.message || err));
    } finally {
      setCommentActionLoading(false);
    }
  };

  const deleteCommentAll = async (storyId: string, commentId: string) => {
    setCommentActionLoading(true);
    setCommentsMsg(null);
    try {
      const commentRef = doc(db, `stories/${storyId}/comments`, commentId);
      await deleteDoc(commentRef);
      setComments(prev => prev.filter(c => c.id !== commentId));
      setCommentsMsg("Avaliação excluída permanentemente com sucesso.");
      setCommentToDeleteAll(null);
    } catch (err: any) {
      console.error("Failed to delete comment:", err);
      setCommentsMsg("Erro ao excluir avaliação: " + (err.message || err));
    } finally {
      setCommentActionLoading(false);
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

  const getOrCreateDriveFolder = async (token: string, folderName: string): Promise<string> => {
    try {
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`)}&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
          return searchData.files[0].id;
        }
      }

      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder'
        })
      });
      if (createRes.ok) {
        const folderData = await createRes.json();
        return folderData.id;
      }
    } catch (e) {
      console.warn(`Drive ${folderName} folder check warning:`, e);
    }
    return 'root';
  };

  const uploadToDrive = async (file: File | Blob, token: string, folderName: string, fileName: string) => {
    const parentFolderId = await getOrCreateDriveFolder(token, folderName);
    const metadata = {
      name: fileName,
      parents: [parentFolderId]
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

  const handleStartWritingOnSite = async () => {
    setErrorDetails(null);
    if (!title || !author) {
      setMessage(t("fillAllFields"));
      return;
    }
    setIsUploading(true);
    setMessage("");
    try {
      const coverUrl = createDefaultCoverUrl(title, author);
      const docRef = await addDoc(collection(db, "stories"), {
        title,
        author,
        authorUid: user?.uid,
        publicationDate,
        createdAt: Timestamp.now(),
        coverImage: coverUrl,
        totalPages: 1,
        wordCount: 0,
        tags: [],
        isDraft: true
      });
      await setDoc(doc(db, `stories/${docRef.id}/pages`, "0"), {
        content: "<p></p>",
        index: 0
      });
      navigate(`/writer/${docRef.id}`);
    } catch (error: any) {
      console.error("Error creating draft:", error);
      setMessage("Erro ao criar rascunho.");
      setIsUploading(false);
    }
  };

  const handleSaveStory = async (asDraft: boolean = false) => {
    setErrorDetails(null);

    if (!title || !author) {
      setMessage(t("fillAllFields"));
      return;
    }

    if (creationMode === "docx") {
      if (!docxFile) {
        setMessage(t("fillAllFields"));
        return;
      }
      if (!asDraft && !coverFile) {
        setMessage("Adicione uma imagem de capa para publicar, ou salve como rascunho sem capa.");
        return;
      }
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

      if (coverFile) {
        if (accessToken) {
          try {
            const driveLink = await uploadToDrive(coverFile, accessToken, "covers", `cover_${Date.now()}.jpg`);
            finalCoverUrl = formatCoverUrl(driveLink);
          } catch (driveErr) {
            console.warn("Upload para o Drive falhou, convertendo imagem localmente...", driveErr);
            finalCoverUrl = await fileToDataUrl(coverFile);
          }
        } else {
          finalCoverUrl = await fileToDataUrl(coverFile);
        }
      } else {
        finalCoverUrl = createDefaultCoverUrl(title, author);
      }

      let pages: string[] = [];
      let tags: string[] = [];
      let wordCount = 0;

      if (creationMode === "docx" && docxFile) {
        stageName = t("docxProcessing");
        setCurrentStage(stageName);
        setProgressPercent(35);

        const imageConverter = async (image: any) => {
          try {
            const base64Data = await image.read("base64");
            const mimeType = image.contentType || "image/png";
            const dataUrl = `data:${mimeType};base64,${base64Data}`;
            const fileName = `story_image_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${mimeType.split('/')[1] || 'png'}`;

            let imageUrl = "";
            if (accessToken) {
              try {
                const res = await fetch(dataUrl);
                const imageBlob = await res.blob();
                imageUrl = await uploadToDrive(imageBlob, accessToken, "storyImages", fileName);
              } catch (driveErr) {
                console.warn("Upload de imagem da história para o Drive falhou, usando data URI como fallback...", driveErr);
                imageUrl = dataUrl;
              }
            } else {
              imageUrl = dataUrl;
            }

            return { src: formatCoverUrl(imageUrl) };
          } catch (err) {
            console.error("Erro ao processar imagem do DOCX:", err);
            return { src: "" };
          }
        };

        const arrayBuffer = await docxFile.arrayBuffer();
        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            convertImage: mammoth.images.imgElement(imageConverter),
            styleMap: ["p[style-name='Page Break'] => hr.page-break:empty"]
          }
        );
        const fullHtml = result.value;

        // Simple pagination logic by splitting content.
        pages = fullHtml.split(/<hr \/>|<hr>|<hr class="page-break" \/>|<!-- pagebreak -->/i).map(p => p.trim()).filter(p => p.length > 0);
        if (pages.length === 0) {
          pages = [fullHtml || "<p></p>"];
        }
      }

      stageName = t("tagGeneration");
      setCurrentStage(stageName);
      setProgressPercent(45);
      const textSample = pages[0].replace(/<[^>]*>?/gm, '');
      tags = generateTagsLocal(textSample);

      const fullText = pages.map(p => p.replace(/<[^>]*>?/gm, ' ')).join(' ');
      wordCount = fullText.split(/\s+/).filter(word => word.length > 0).length;

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
        wordCount: wordCount,
        createdAt: new Date().toISOString(),
        publicationDate: publicationDate,
        authorUid: user?.uid || "admin",
        isDraft: asDraft
      };

      await withTimeout(setDoc(storyRef, {
        title: title || "",
        author: author || "",
        coverImage: finalCoverUrl || "",
        tags: tags || [],
        rating: 0,
        ratingsCount: 0,
        totalPages: pages.length || 1,
        wordCount: wordCount || 0,
        createdAt: Timestamp.now(),
        publicationDate: publicationDate || new Date().toISOString().split('T')[0],
        authorUid: user?.uid || "admin",
        isDraft: !!asDraft
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
      const succMsg = asDraft ? t("draftSavedSuccess") : t("storyPublishedSuccess");
      setCurrentStage(succMsg);
      setMessage(succMsg);
      setTitle("");
      setAuthor("");
      setCoverFile(null);
      setDocxFile(null);
      setPublicationDate(new Date().toISOString().split('T')[0]);

      if (activeTab === "manage") {
        loadStoriesList();
      }
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

  const handleQuickPublishDraft = async (storyId: string) => {
    try {
      await updateDoc(doc(db, "stories", storyId), { isDraft: false });
      setStoriesList(prev => prev.map(s => s.id === storyId ? { ...s, isDraft: false } : s));
      setManageMsg(t("draftPublishedSuccess"));
    } catch (err) {
      console.error("Error publishing draft:", err);
      setManageMsg(t("errorUpdatingStory"));
    }
  };

  const handleRevertToDraft = async (story: StoryItem) => {
    setRevertingStoryId(story.id);
    try {
      await updateDoc(doc(db, "stories", story.id), { isDraft: true });
      setStoriesList(prev => prev.map(s => s.id === story.id ? { ...s, isDraft: true } : s));
      setManageMsg(t("revertToDraftSuccess"));
      setStoryToRevert(null);
    } catch (err) {
      console.error("Error reverting story to draft:", err);
      setManageMsg(t("errorUpdatingStory"));
    } finally {
      setRevertingStoryId(null);
    }
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-16 p-8 rounded-2xl paper-card">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-[#1A1A1A] dark:bg-white rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-white dark:text-[#1A1A1A]" />
          </div>
        </div>
        <h1 className="text-2xl font-serif font-bold text-center mb-8">{t("adminAccess")}</h1>
        <div className="space-y-6">
          <button
            onClick={handleLogin}
            className="w-full font-bold text-[10px] uppercase tracking-widest py-4 rounded-full transition-all paper-btn-dark"
          >
            {t("loginWithGoogle")}
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

  // Analytics calculations
  const filteredProgress = selectedStoryId === "all"
    ? progressRecords
    : progressRecords.filter(p => p.storyId === selectedStoryId);

  const uniqueReadersCount = new Set(filteredProgress.map(p => p.userId)).size;
  const totalStartsCount = filteredProgress.length;

  let avgCompRate = 0;
  if (filteredProgress.length > 0) {
    const totalPercentage = filteredProgress.reduce((acc, curr) => {
      const page = curr.maxPage !== undefined ? curr.maxPage : (curr.page || 0);
      const totalPages = curr.totalPages || 1;
      const pct = Math.min(100, ((page + 1) / totalPages) * 100);
      return acc + pct;
    }, 0);
    avgCompRate = Number((totalPercentage / filteredProgress.length).toFixed(1));
  }

  let finishedCount = 0;
  if (filteredProgress.length > 0) {
    finishedCount = filteredProgress.filter(curr => {
      const page = curr.maxPage !== undefined ? curr.maxPage : (curr.page || 0);
      const totalPages = curr.totalPages || 1;
      return page === totalPages - 1;
    }).length;
  }
  const completionRatePercent = totalStartsCount > 0
    ? Number(((finishedCount / totalStartsCount) * 100).toFixed(1))
    : 0;

  let avgReadingTimeMin = 0;
  if (filteredProgress.length > 0) {
    const totalWordsRead = filteredProgress.reduce((acc, curr) => {
      const storyObj = analyticsStories.find(s => s.id === curr.storyId);
      const totalWords = storyObj?.wordCount || (curr.totalPages * 250);
      const page = curr.maxPage !== undefined ? curr.maxPage : (curr.page || 0);
      const totalPages = curr.totalPages || 1;
      const wordsRead = (Math.min(totalPages, page + 1) / totalPages) * totalWords;
      return acc + wordsRead;
    }, 0);
    const avgWordsRead = totalWordsRead / filteredProgress.length;
    avgReadingTimeMin = Number((avgWordsRead / 200).toFixed(1));
  }

  const selectedStory = analyticsStories.find(s => s.id === selectedStoryId);
  const totalPagesForFunnel = selectedStory?.totalPages || 1;
  const pageFunnelData = Array.from({ length: totalPagesForFunnel }).map((_, idx) => {
    const readersOnOrPastPage = filteredProgress.filter(p => {
      const page = p.maxPage !== undefined ? p.maxPage : (p.page || 0);
      return page >= idx;
    }).length;
    const pct = totalStartsCount > 0 ? (readersOnOrPastPage / totalStartsCount) * 100 : 0;
    return {
      pageIndex: idx,
      readersCount: readersOnOrPastPage,
      percentage: Number(pct.toFixed(1))
    };
  });

  const filteredUsers = superadminUsers.filter((u) => {
    const q = searchUserQuery.toLowerCase().trim();
    if (!q) return true;
    const name = (u.displayName || "").toLowerCase();
    const email = (u.email || "").toLowerCase();
    const username = (u.username || "").toLowerCase();
    return name.includes(q) || email.includes(q) || username.includes(q);
  });

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight">{t("adminPanel")}</h1>
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mt-1">{user.email}</div>
        </div>
        <div className="grid grid-cols-2 sm:flex p-1.5 sm:p-1 rounded-2xl sm:rounded-full w-full sm:w-auto gap-1 sm:gap-0 paper-card">
          <button
            onClick={() => setActiveTab("publish")}
            className={cn(
              "px-3 py-2.5 rounded-xl sm:rounded-full text-[10px] uppercase font-bold tracking-widest transition-all text-center flex items-center justify-center gap-1.5",
              activeTab === "publish"
                ? "paper-btn-dark shadow-sm"
                : "opacity-60 hover:opacity-100 paper-btn-light"
            )}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>{t("publish")}</span>
          </button>

          <button
            onClick={() => setActiveTab("manage")}
            className={cn(
              "px-3 py-2.5 rounded-xl sm:rounded-full text-[10px] uppercase font-bold tracking-widest transition-all text-center flex items-center justify-center gap-1.5",
              activeTab === "manage"
                ? "paper-btn-dark shadow-sm"
                : "opacity-60 hover:opacity-100 paper-btn-light"
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t("manage")}</span>
          </button>

          <button
            onClick={() => setActiveTab("analytics")}
            className={cn(
              "px-3 py-2.5 rounded-xl sm:rounded-full text-[10px] uppercase font-bold tracking-widest transition-all text-center flex items-center justify-center gap-1.5",
              activeTab === "analytics"
                ? "paper-btn-dark shadow-sm"
                : "opacity-60 hover:opacity-100 paper-btn-light"
            )}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>{t("analytics")}</span>
          </button>

          <button
            onClick={() => setActiveTab("comments")}
            className={cn(
              "px-3 py-2.5 rounded-xl sm:rounded-full text-[10px] uppercase font-bold tracking-widest transition-all text-center flex items-center justify-center gap-1.5",
              activeTab === "comments"
                ? "paper-btn-dark shadow-sm"
                : "opacity-60 hover:opacity-100 paper-btn-light"
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="truncate">{t("moderateComments")}</span>
            {comments.filter(c => c.status === "pending").length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0"></span>
            )}
          </button>

          {user && (user.email || "").toLowerCase().trim() === ADMIN_EMAIL && (
            <button
              onClick={() => setActiveTab("superadmin")}
              className={cn(
                "col-span-2 sm:col-span-1 px-3 py-2.5 rounded-xl sm:rounded-full text-[10px] uppercase font-bold tracking-widest transition-all text-center flex items-center justify-center gap-1.5",
                activeTab === "superadmin"
                  ? "paper-btn-dark shadow-sm"
                  : "opacity-60 hover:opacity-100 paper-btn-light"
              )}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{t("superadmin")}</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl space-y-6 paper-card">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#1A1A1A]/10 dark:border-white/10 pb-5">
              <div>
                <h2 className="font-serif font-bold text-2xl flex items-center gap-2">
                  <BarChart2 className="w-6 h-6 text-amber-500" />
                  <span>{t("analyticsDashboard", "Análise e Métricas")}</span>
                </h2>
                <p className="text-xs opacity-60 mt-1">Métricas consolidadas do desempenho de leitura, retenção e capítulos das histórias em tempo real.</p>
              </div>
              <div className="w-full sm:w-64 relative">
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-full px-4 py-2.5 focus:outline-none text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-between gap-2 paper-btn-light"
                >
                  <div className="flex items-center gap-2 truncate">
                    {selectedStoryId === "all" ? (
                      <BarChart2 className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    ) : (
                      <BookOpen className="w-4 h-4 text-[#1A1A1A] dark:text-[#F5F5F0] flex-shrink-0" />
                    )}
                    <span className="truncate">
                      {selectedStoryId === "all"
                        ? t("all", "Todas as Histórias")
                        : (analyticsStories.find(s => s.id === selectedStoryId)?.title || "")}
                    </span>
                  </div>
                  {isDropdownOpen ? (
                    <ChevronUp className="w-4 h-4 opacity-60 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 opacity-60 flex-shrink-0" />
                  )}
                </button>

                {isDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsDropdownOpen(false)}
                    />
                    <div className="absolute right-0 left-0 mt-2 border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto py-1 animate-in fade-in slide-in-from-top-1 duration-100 paper-card">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStoryId("all");
                          setIsDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full px-4 py-2 text-left text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer hover:bg-[#F5F5F0] dark:hover:bg-white/5",
                          selectedStoryId === "all" ? "bg-[#F5F5F0] dark:bg-white/5 text-amber-500" : "text-[#1A1A1A] dark:text-[#F5F5F0]"
                        )}
                      >
                        <BarChart2 className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        <span className="truncate">{t("all", "Todas as Histórias")}</span>
                      </button>
                      {analyticsStories.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSelectedStoryId(s.id);
                            setIsDropdownOpen(false);
                          }}
                          className={cn(
                            "w-full px-4 py-2 text-left text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer hover:bg-[#F5F5F0] dark:hover:bg-white/5",
                            selectedStoryId === s.id ? "bg-[#F5F5F0] dark:bg-white/5 text-amber-500" : "text-[#1A1A1A]/80 dark:text-[#F5F5F0]/80"
                          )}
                        >
                          <BookOpen className="w-4 h-4 text-[#1A1A1A] dark:text-[#F5F5F0] opacity-75 flex-shrink-0" />
                          <span className="truncate">{s.title}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {loadingAnalytics ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                <span className="text-xs opacity-60">Processando e compilando dados de leitura reais...</span>
              </div>
            ) : progressRecords.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-[#1A1A1A]/20 dark:border-white/20 rounded-2xl p-6 space-y-3 paper-card opacity-80">
                <Sparkles className="w-8 h-8 mx-auto opacity-40 text-amber-500" />
                <h4 className="font-serif font-bold text-sm">Sem dados de leitura ainda</h4>
                <p className="text-xs opacity-60 max-w-sm mx-auto">
                  As métricas de retenção e progresso são geradas automaticamente quando os leitores começam a ler as suas obras na biblioteca.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl space-y-1 paper-card">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-60">
                      <Clock className="w-4 h-4 text-amber-500" />
                      <span>{t("avgReadingTime")}</span>
                    </div>
                    <div className="text-2xl font-serif font-bold">
                      {avgReadingTimeMin > 0 ? `${avgReadingTimeMin} min` : "0 min"}
                    </div>
                    <p className="text-[10px] opacity-50">Tempo estimado gasto por sessão de leitura</p>
                  </div>

                  <div className="p-4 rounded-2xl space-y-1 paper-card">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-60">
                      <Users className="w-4 h-4 text-blue-500" />
                      <span>{t("readingMetrics", "Leitores Ativos")}</span>
                    </div>
                    <div className="text-2xl font-serif font-bold">{uniqueReadersCount}</div>
                    <p className="text-[10px] opacity-50">{totalStartsCount} {totalStartsCount === 1 ? 'leitura iniciada' : 'leituras iniciadas'}</p>
                  </div>

                  <div className="p-4 rounded-2xl space-y-1 paper-card">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-60">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      <span>{t("retentionRate")}</span>
                    </div>
                    <div className="text-2xl font-serif font-bold">{completionRatePercent}%</div>
                    <p className="text-[10px] opacity-50">Taxa de conclusão até a página final</p>
                  </div>
                </div>

                {selectedStoryId === "all" ? (
                  <div className="space-y-4 pt-4 border-t border-[#1A1A1A]/10 dark:border-white/10">
                    <h3 className="font-serif font-bold text-sm uppercase tracking-wider opacity-80">Desempenho por História</h3>
                    {/* Desktop View: Styled Data Table */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#1A1A1A]/10 dark:border-white/10 opacity-60">
                            <th className="py-3 font-bold uppercase tracking-wider">História</th>
                            <th className="py-3 font-bold uppercase tracking-wider text-center">Inícios</th>
                            <th className="py-3 font-bold uppercase tracking-wider text-center">Progresso Médio</th>
                            <th className="py-3 font-bold uppercase tracking-wider text-center">Conclusões</th>
                            <th className="py-3 font-bold uppercase tracking-wider text-right">Nota Geral</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1A1A1A]/5 dark:divide-white/5">
                          {analyticsStories.map(s => {
                            const storyProgress = progressRecords.filter(p => p.storyId === s.id);
                            const starts = storyProgress.length;

                            let progressSum = 0;
                            let finished = 0;
                            storyProgress.forEach(p => {
                              const page = p.page || 0;
                              const total = p.totalPages || 1;
                              progressSum += Math.min(100, ((page + 1) / total) * 100);
                              if (page === total - 1) finished++;
                            });

                            const avgProg = starts > 0 ? Math.round(progressSum / starts) : 0;
                            const ratingAvg = s.ratingsCount > 0 ? (s.rating / s.ratingsCount).toFixed(1) : "N/A";

                            return (
                              <tr key={s.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                <td className="py-4 font-bold pr-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-10 rounded overflow-hidden flex-shrink-0 bg-black/10">
                                      <img src={formatCoverUrl(s.coverImage)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    </div>
                                    <div>
                                      <div className="font-serif text-sm">{s.title}</div>
                                      <div className="text-[10px] opacity-60">{t("by")} {s.author} • {s.totalPages} {s.totalPages === 1 ? t("pageSingular") : t("pagePlural")}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-4 text-center font-mono font-bold text-sm">{starts}</td>
                                <td className="py-4 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <div className="w-12 bg-black/10 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                                      <div className="bg-amber-500 h-full" style={{ width: `${avgProg}%` }}></div>
                                    </div>
                                    <span className="font-mono font-bold text-[11px]">{avgProg}%</span>
                                  </div>
                                </td>
                                <td className="py-4 text-center font-mono">{finished}</td>
                                <td className="py-4 text-right">
                                  <div className="flex items-center justify-end gap-1 font-bold text-amber-500">
                                    <Star className="w-3.5 h-3.5 fill-current" />
                                    <span>{ratingAvg}</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile View: High-fidelity, card-based analytics list */}
                    <div className="block sm:hidden space-y-4">
                      {analyticsStories.map(s => {
                        const storyProgress = progressRecords.filter(p => p.storyId === s.id);
                        const starts = storyProgress.length;

                        let progressSum = 0;
                        let finished = 0;
                        storyProgress.forEach(p => {
                          const page = p.page || 0;
                          const total = p.totalPages || 1;
                          progressSum += Math.min(100, ((page + 1) / total) * 100);
                          if (page === total - 1) finished++;
                        });

                        const avgProg = starts > 0 ? Math.round(progressSum / starts) : 0;
                        const ratingAvg = s.ratingsCount > 0 ? (s.rating / s.ratingsCount).toFixed(1) : "N/A";

                        return (
                          <div key={s.id} className="p-4 rounded-2xl space-y-3 paper-card">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-10 rounded overflow-hidden flex-shrink-0 bg-black/10 shadow-sm">
                                  <img src={formatCoverUrl(s.coverImage)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                </div>
                                <div>
                                  <h4 className="font-serif font-bold text-sm leading-tight">{s.title}</h4>
                                  <p className="text-[10px] opacity-60">{t("by")} {s.author} • {s.totalPages} {s.totalPages === 1 ? t("pageSingular") : t("pagePlural")}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-lg">
                                <Star className="w-3.5 h-3.5 fill-current" />
                                <span className="text-[11px]">{ratingAvg}</span>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-center p-2.5 rounded-xl paper-card">
                              <div>
                                <div className="text-[9px] font-bold uppercase tracking-wider opacity-50">{t("startsTableHead")}</div>
                                <div className="text-sm font-mono font-bold mt-0.5">{starts}</div>
                              </div>
                              <div>
                                <div className="text-[9px] font-bold uppercase tracking-wider opacity-50">{t("avgProgressTableHead")}</div>
                                <div className="text-sm font-mono font-bold mt-0.5">{avgProg}%</div>
                              </div>
                              <div>
                                <div className="text-[9px] font-bold uppercase tracking-wider opacity-50">{t("completionsTableHead")}</div>
                                <div className="text-sm font-mono font-bold mt-0.5">{finished}</div>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <div className="flex justify-between text-[9px] opacity-50 font-bold uppercase tracking-wider">
                                <span>{t("avgProgressTableHead")}</span>
                                <span>{avgProg}%</span>
                              </div>
                              <div className="w-full bg-black/10 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${avgProg}%` }}></div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[#1A1A1A]/10 dark:border-white/10">
                    <div className="p-5 rounded-2xl space-y-3 paper-card">
                      <h3 className="font-serif font-bold text-sm uppercase tracking-wider opacity-80 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-amber-500" />
                        <span>{t("retentionByPage")}</span>
                      </h3>
                      <p className="text-xs opacity-60">{t("retentionDescription")}</p>

                      <div className="space-y-3 pt-2 max-h-96 overflow-y-auto pr-1">
                        {pageFunnelData.map((data) => (
                          <div key={data.pageIndex}>
                            <div className="flex justify-between text-[11px] font-bold mb-1">
                              <span>{t("pageSingular").charAt(0).toUpperCase() + t("pageSingular").slice(1)} {data.pageIndex + 1}</span>
                              <span className="opacity-60 font-mono">{data.readersCount} {data.readersCount === 1 ? t("readersSingular") : t("readersPlural")} ({data.percentage}%)</span>
                            </div>
                            <div className="w-full bg-black/10 dark:bg-white/10 h-2 rounded-full overflow-hidden">
                              <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${data.percentage}%` }}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-5 rounded-2xl flex flex-col justify-between space-y-4 paper-card">
                      <div>
                        <h3 className="font-serif font-bold text-sm uppercase tracking-wider opacity-80 flex items-center gap-2">
                          <Star className="w-4 h-4 text-amber-500" />
                          <span>{t("engagementAndReviews")}</span>
                        </h3>
                        <p className="text-xs opacity-60 mt-1">{t("engagementDescription")}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 py-2">
                        <div className="p-4 rounded-xl text-center paper-card">
                          <div className="text-2xl font-serif font-bold text-amber-500">
                            {selectedStory?.ratingsCount > 0 ? (selectedStory.rating / selectedStory.ratingsCount).toFixed(1) : "N/A"}
                          </div>
                          <div className="text-[10px] font-bold uppercase tracking-wider opacity-50 mt-1">{t("avgOverallRating")}</div>
                        </div>

                        <div className="p-4 rounded-xl text-center paper-card">
                          <div className="text-2xl font-serif font-bold">
                            {selectedStory?.ratingsCount || 0}
                          </div>
                          <div className="text-[10px] font-bold uppercase tracking-wider opacity-50 mt-1">{t("totalReviews")}</div>
                        </div>
                      </div>

                      {selectedStory?.criteriaBreakdown && (
                        <div className="space-y-2 text-xs border-t border-black/5 dark:border-white/5 pt-3">
                          <div className="flex justify-between text-[11px] opacity-75">
                            <span>{t("plotRating")}</span>
                            <span className="font-bold">{selectedStory.criteriaBreakdown.plot?.toFixed(1) || "5.0"}</span>
                          </div>
                          <div className="flex justify-between text-[11px] opacity-75">
                            <span>{t("characterRating")}</span>
                            <span className="font-bold">{selectedStory.criteriaBreakdown.character?.toFixed(1) || "5.0"}</span>
                          </div>
                          <div className="flex justify-between text-[11px] opacity-75">
                            <span>{t("writingRating")}</span>
                            <span className="font-bold">{selectedStory.criteriaBreakdown.writing?.toFixed(1) || "5.0"}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "superadmin" && user && (user.email || "").toLowerCase().trim() === ADMIN_EMAIL && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl flex flex-col items-center justify-center text-center paper-card">
              <UserIcon className="w-8 h-8 opacity-40 mb-4" />
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-2">{t("totalRegisteredUsers")}</div>
              {loadingSuperadmin ? (
                <Loader2 className="w-6 h-6 animate-spin opacity-40" />
              ) : (
                <div className="text-4xl font-serif font-bold">{totalUsers ?? 0}</div>
              )}
            </div>

            <div className="p-6 rounded-2xl flex flex-col items-center justify-center text-center paper-card">
              <Heart className="w-8 h-8 opacity-40 mb-4 text-red-500" />
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-2">{t("totalFavoritesInSite")}</div>
              {loadingSuperadmin ? (
                <Loader2 className="w-6 h-6 animate-spin opacity-40" />
              ) : (
                <div className="text-4xl font-serif font-bold">{totalFavorites ?? 0}</div>
              )}
            </div>
          </div>

          <div className="p-6 rounded-2xl space-y-6 paper-card">
            <div>
              <h2 className="text-xl font-serif font-bold mb-2">{t("authorRequests")}</h2>
              <p className="text-xs opacity-60 leading-relaxed mb-4">
                Abaixo estão os usuários que solicitaram conta de Autor no momento do cadastro.
                Você pode autorizá-los diretamente clicando em "Autorizar". Isso atualizará o banco de dados.
                <br /><br />
                <strong>Importante para Autores usando Google Login (App em Teste):</strong><br />
                Se o aplicativo no Google Cloud ainda estiver em modo "Testing", além de autorizar aqui, você precisará adicionar o e-mail do autor à lista de <strong>Usuários de Teste</strong> para que ele consiga fazer login com o Google.
                Acesse o <a href="https://console.cloud.google.com/auth/audience?project=robotic-century-498520-e2" target="_blank" rel="noreferrer" className="underline font-bold text-blue-500 dark:text-blue-400 hover:opacity-80">Google Cloud Console (Tela de Consentimento OAuth)</a>, role até a seção "Test users" (Usuários de teste) e adicione o e-mail do autor lá.
                <br /><br />
                <strong>Configuração Manual no Firebase (Opcional):</strong><br />
                Caso a autorização por aqui falhe, acesse o <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="underline font-bold text-blue-500 dark:text-blue-400 hover:opacity-80">Firebase Console</a>,
                vá em <strong>Firestore Database</strong> &gt; coleção <strong>users</strong>, encontre o documento pelo e-mail e edite o campo <code>role</code> para <code>"author"</code>.
              </p>
            </div>

            {loadingRequests ? (
              <div className="flex justify-center p-4">
                <Loader2 className="w-6 h-6 animate-spin opacity-40" />
              </div>
            ) : authorRequests.length === 0 ? (
              <div className="text-center py-10 opacity-50 font-serif border border-dashed border-[#1A1A1A]/20 dark:border-white/20 rounded-2xl">
                {t("noRequestsPending")}
              </div>
            ) : (
              <div className="space-y-4">
                {authorRequests.map(req => (
                  <div key={req.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 gap-4 transition-all hover:translate-x-1 paper-card">
                    <div>
                      <div className="font-bold text-sm">{req.displayName || t("noName")}</div>
                      <div className="text-xs opacity-60 font-mono mt-1">{req.email}</div>
                    </div>
                    <button
                      onClick={() => approveAuthor(req.id)}
                      className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-full transition-all whitespace-nowrap paper-btn-dark"
                    >
                      {t("authorize")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 rounded-2xl space-y-6 paper-card">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-xl font-serif font-bold mb-1">{t("userManagementTitle")}</h2>
                <p className="text-xs opacity-60 leading-relaxed">
                  {t("userManagementDesc")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUsersList(!showUsersList)}
                className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-full transition-all whitespace-nowrap paper-btn-dark"
              >
                {showUsersList ? t("hideUsers") : t("showUsers")}
              </button>
            </div>

            {showUsersList && (
              <div className="space-y-4 pt-4 border-t border-[#1A1A1A]/10 dark:border-white/10 animate-in fade-in duration-300">
                <div className="relative">
                  <input
                    type="text"
                    value={searchUserQuery}
                    onChange={(e) => setSearchUserQuery(e.target.value)}
                    placeholder={t("searchUsers")}
                    className="w-full px-4 py-2.5 text-xs rounded-xl border border-[#1A1A1A]/10 dark:border-white/10 bg-transparent focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
                  />
                  {searchUserQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchUserQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs opacity-60 hover:opacity-100 font-sans"
                    >
                      {t("clear")}
                    </button>
                  )}
                </div>

                {loadingSuperadmin ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin opacity-40" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-10 opacity-50 font-serif border border-dashed border-[#1A1A1A]/20 dark:border-white/20 rounded-2xl">
                    {t("noUsersFound")}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#1A1A1A]/10 dark:border-white/10 opacity-60 font-bold">
                          <th className="py-3 px-2 font-serif">{t("userLabel")}</th>
                          <th className="py-3 px-2 font-serif">{t("email")}</th>
                          <th className="py-3 px-2 font-serif">{t("roleLabel")}</th>
                          <th className="py-3 px-2 text-center font-serif">{t("favoritesLabel")}</th>
                          <th className="py-3 px-2 text-right font-serif">{t("actionsLabel")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1A1A1A]/5 dark:divide-white/5">
                        {filteredUsers.map((u) => (
                          <tr key={u.id} className="hover:bg-[#1A1A1A]/5 dark:hover:bg-white/5 transition-colors">
                            <td className="py-3 px-2">
                              <div>
                                <span className="font-bold block">{u.displayName || t("noName")}</span>
                                {u.username && (
                                  <span className="block text-[10px] opacity-60 font-mono">@{u.username}</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-2 font-mono opacity-80">{u.email}</td>
                            <td className="py-3 px-2">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide inline-block ${
                                u.role === "admin" 
                                  ? "bg-red-500/10 text-red-600 dark:text-red-400" 
                                  : u.role === "author"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              }`}>
                                {u.role === "admin" ? t("roleAdmin") : u.role === "author" ? t("roleAuthor") : t("roleReader")}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-center font-bold font-mono">
                              {u.favorites?.length || 0}
                            </td>
                            <td className="py-3 px-2 text-right">
                              <select
                                value={u.role || "user"}
                                onChange={(e) => changeUserRole(u.id, e.target.value)}
                                className="text-[10px] bg-transparent border border-[#1A1A1A]/20 dark:border-white/20 rounded-lg px-2 py-1 font-bold uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-amber-500"
                              >
                                <option value="user" className="bg-white dark:bg-[#121212]">{t("roleReader")}</option>
                                <option value="author" className="bg-white dark:bg-[#121212]">{t("roleAuthor")}</option>
                                <option value="admin" className="bg-white dark:bg-[#121212]">{t("roleAdmin")}</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "publish" && (
        <div className="space-y-6 p-6 sm:p-8 rounded-2xl paper-card">
          {/* Creation Mode Toggle */}
          <div className="flex p-1 rounded-xl max-w-md paper-card">
            <button
              type="button"
              onClick={() => setCreationMode("writer")}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all",
                creationMode === "writer"
                  ? "paper-btn-dark shadow-sm"
                  : "opacity-60 hover:opacity-100 paper-btn-light"
              )}
            >
              <PenTool className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              {t("writeOnSite")}
            </button>
            <button
              type="button"
              onClick={() => setCreationMode("docx")}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all",
                creationMode === "docx"
                  ? "paper-btn-dark shadow-sm"
                  : "opacity-60 hover:opacity-100 paper-btn-light"
              )}
            >
              <FileText className="w-4 h-4" />
              {t("uploadDocxFile")}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-2">{t("storyTitle")}</label>
              <input
                type="text"
                value={title || ""}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-xl focus:outline-none text-sm paper-card"
                placeholder={t("storyTitlePlaceholder")}
                required
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-2">{t("editAuthor")}</label>
              <input
                type="text"
                value={author || ""}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full px-4 py-3 rounded-xl focus:outline-none text-sm paper-card"
                placeholder={t("authorPlaceholder")}
                required
              />
              {profile && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {profile.displayName && (
                    <button
                      type="button"
                      onClick={() => setAuthor(profile.displayName!)}
                      className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all active:scale-95 paper-btn-amber"
                    >
                      {t("useMyName", { name: profile.displayName })}
                    </button>
                  )}
                  {profile.username && (
                    <>
                      <button
                        type="button"
                        onClick={() => setAuthor(`@${profile.username}`)}
                        className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all active:scale-95 paper-btn-amber"
                      >
                        {t("useMyUsername", { username: profile.username })}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthor(profile.username!)}
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
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-2">{t("publishDate")}</label>
              <input
                type="date"
                value={publicationDate || ""}
                onChange={(e) => setPublicationDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl focus:outline-none text-sm paper-card"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-2">
                {t("coverImageLabel")} {creationMode === "writer" ? "(Opcional - gerada automaticamente)" : "(Opcional para rascunhos)"}
              </label>
              <label className={cn(
                "flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors",
                coverFile ? "border-[#1A1A1A] dark:border-white bg-[#1A1A1A]/5 dark:bg-white/5" : "border-[#1A1A1A]/20 dark:border-white/20 hover:bg-[#F5F5F0] dark:hover:bg-[#0A0A0A]"
              )}>
                <div className="flex flex-col items-center justify-center pt-3 pb-3">
                  <ImageIcon className={cn("w-6 h-6 mb-1", coverFile ? "text-[#1A1A1A] dark:text-white" : "text-[#1A1A1A]/40 dark:text-white/40")} />
                  <p className="text-xs font-bold opacity-60 truncate max-w-[200px] px-2">
                    {coverFile ? coverFile.name : t("coverImagePlaceholder")}
                  </p>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            {creationMode === "docx" && (
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-2">{t("storyFileLabel")}</label>
                <label className={cn(
                  "flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors",
                  docxFile ? "border-[#1A1A1A] dark:border-white bg-[#1A1A1A]/5 dark:bg-white/5" : "border-[#1A1A1A]/20 dark:border-white/20 hover:bg-[#F5F5F0] dark:hover:bg-[#0A0A0A]"
                )}>
                  <div className="flex flex-col items-center justify-center pt-3 pb-3">
                    <FileText className={cn("w-6 h-6 mb-1", docxFile ? "text-[#1A1A1A] dark:text-white" : "text-[#1A1A1A]/40 dark:text-white/40")} />
                    <p className="text-xs font-bold opacity-60 truncate max-w-[200px] px-2">
                      {docxFile ? docxFile.name : t("storyFilePlaceholder")}
                    </p>
                  </div>
                  <input type="file" accept=".docx" className="hidden" onChange={(e) => setDocxFile(e.target.files?.[0] || null)} required />
                </label>
              </div>
            )}
          </div>

          {/* Interactive Site Rich Text Writer Mode */}
          {creationMode === "writer" && (
            <div className="pt-2 border-t border-[#1A1A1A]/10 dark:border-white/10 space-y-3">
              <label className="block text-xs uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
                <PenTool className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>{t("writerNoticeFullScreen")}</span>
              </label>
            </div>
          )}

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
            <div className="p-4 rounded-xl text-sm font-bold text-center paper-card">
              {message}
            </div>
          )}

          {/* Action Buttons */}
          {creationMode === "docx" ? (
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-[#1A1A1A]/10 dark:border-white/10">
              <button
                type="button"
                disabled={isUploading}
                onClick={() => handleSaveStory(true)}
                className="flex-1 flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest py-4 rounded-xl transition-all disabled:opacity-50 paper-btn-amber"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t("saveDraft")}
              </button>

              <button
                type="button"
                disabled={isUploading}
                onClick={() => handleSaveStory(false)}
                className="flex-1 flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest py-4 rounded-xl transition-all disabled:opacity-50 paper-btn-dark"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {t("publishNow")}
              </button>
            </div>
          ) : (
            <div className="pt-4 border-t border-[#1A1A1A]/10 dark:border-white/10">
              <button
                type="button"
                disabled={isUploading}
                onClick={handleStartWritingOnSite}
                className="w-full flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest py-4 rounded-xl transition-all disabled:opacity-50 paper-btn-dark"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenTool className="w-4 h-4" />}
                {t("writeOnSite")}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "manage" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 rounded-2xl paper-card">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                <input
                  type="text"
                  placeholder={t("searchPlaceholder")}
                  value={searchStoryQuery || ""}
                  onChange={(e) => setSearchStoryQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl focus:outline-none paper-card"
                />
              </div>

              {/* Status Filter Tabs */}
              <div className="flex p-1 rounded-xl text-[10px] font-bold uppercase tracking-wider shrink-0 paper-card">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={cn("px-2.5 py-1 rounded-lg transition-colors", statusFilter === "all" ? "paper-btn-dark" : "opacity-60 paper-btn-light")}
                >
                  {t("all")}
                </button>
                <button
                  onClick={() => setStatusFilter("published")}
                  className={cn("px-2.5 py-1 rounded-lg transition-colors", statusFilter === "published" ? "paper-btn-dark" : "opacity-60 paper-btn-light")}
                >
                  {t("published")}
                </button>
                <button
                  onClick={() => setStatusFilter("drafts")}
                  className={cn("px-2.5 py-1 rounded-lg transition-colors", statusFilter === "drafts" ? "paper-btn-dark" : "opacity-60 paper-btn-light")}
                >
                  {t("drafts")} ({storiesList.filter(s => s.isDraft).length})
                </button>
              </div>
            </div>

            <button
              onClick={loadStoriesList}
              disabled={loadingStories}
              className="text-xs font-bold uppercase tracking-wider opacity-60 hover:opacity-100 transition-opacity paper-btn-light px-3 py-1.5 rounded-xl"
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
                  if (statusFilter === "published" && s.isDraft) return false;
                  if (statusFilter === "drafts" && !s.isDraft) return false;
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
                      className="p-6 rounded-2xl space-y-4 transition-all paper-card"
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
                                value={editTitle || ""}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/20 dark:border-white/20 rounded-xl focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("editAuthor")}</label>
                              <input
                                type="text"
                                value={editAuthor || ""}
                                onChange={(e) => setEditAuthor(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/20 dark:border-white/20 rounded-xl focus:outline-none"
                              />
                              {profile && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {profile.displayName && (
                                    <button
                                      type="button"
                                      onClick={() => setEditAuthor(profile.displayName!)}
                                      className="text-[8px] font-bold uppercase tracking-wider px-2 py-1 bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-500/20 rounded-lg hover:bg-amber-500 hover:text-white transition-all active:scale-95"
                                    >
                                      {t("useShortName", { name: profile.displayName })}
                                    </button>
                                  )}
                                  {profile.username && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setEditAuthor(`@${profile.username}`)}
                                        className="text-[8px] font-bold uppercase tracking-wider px-2 py-1 bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-500/20 rounded-lg hover:bg-amber-500 hover:text-white transition-all active:scale-95"
                                      >
                                        {t("useShortName", { name: `@${profile.username}` })}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditAuthor(profile.username!)}
                                        className="text-[8px] font-bold uppercase tracking-wider px-2 py-1 bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-500/20 rounded-lg hover:bg-amber-500 hover:text-white transition-all active:scale-95"
                                      >
                                        {t("useShortName", { name: profile.username })}
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("publishDate")}</label>
                              <input
                                type="date"
                                value={editPublicationDate || ""}
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
                              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1.5">{t("coverImageLabel")} {t("newCoverOptional")}</label>
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
                              value={editTagsInput || ""}
                              onChange={(e) => setEditTagsInput(e.target.value)}
                              className="w-full px-3 py-2 text-sm bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/20 dark:border-white/20 rounded-xl focus:outline-none"
                              placeholder={t("editTagsPlaceholder")}
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("supporters")}</label>
                            <input
                              type="text"
                              value={editSupporters || ""}
                              onChange={(e) => setEditSupporters(e.target.value)}
                              className="w-full px-3 py-2 text-sm bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/20 dark:border-white/20 rounded-xl focus:outline-none"
                              placeholder={t("supportersPlaceholder")}
                            />
                            <span className="block text-[9px] opacity-50 mt-1 font-mono">{t("supportersHelp")}</span>
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
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-serif font-bold text-lg leading-tight">{story.title}</h3>
                                <span className={cn(
                                  "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                  story.isDraft
                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                                    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                                )}>
                                  {story.isDraft ? t("isDraftBadge") : t("isPublishedBadge")}
                                </span>
                              </div>

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
                                {story.wordCount ? <span>• {t("wordsCount", { count: story.wordCount })}</span> : null}
                                {(() => {
                                  let pubDateStr = story.publicationDate;
                                  if (!pubDateStr && story.createdAt) {
                                    try {
                                      const d = story.createdAt.toDate ? story.createdAt.toDate() : new Date(story.createdAt);
                                      pubDateStr = d.toISOString().split('T')[0];
                                    } catch (e) { }
                                  }
                                  if (pubDateStr) {
                                    return <span>• {t("publishedOn")}: {pubDateStr.split('-').reverse().join('/')}</span>;
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:flex sm:flex-col gap-2 w-full sm:w-auto shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-[#1A1A1A]/10 dark:border-white/10">
                            {/* Write/Edit Content on Site */}
                            <button
                              onClick={() => navigate(`/writer/${story.id}`)}
                              disabled={isDeletingThis}
                              className="px-2.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 min-h-[38px] paper-btn-amber"
                            >
                              <PenTool className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                              <span className="truncate">{t("editInSite")}</span>
                            </button>

                            {/* Quick Publish if Draft */}
                            {story.isDraft && (
                              <button
                                onClick={() => handleQuickPublishDraft(story.id)}
                                disabled={isDeletingThis}
                                className="px-2.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-sm min-h-[38px] paper-btn-dark"
                              >
                                <Send className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{t("publishNow")}</span>
                              </button>
                            )}

                            {/* Revert to Draft if Published */}
                            {!story.isDraft && (
                              <button
                                onClick={() => setStoryToRevert(story)}
                                disabled={isDeletingThis}
                                className="px-2.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-sm min-h-[38px] paper-btn-amber"
                              >
                                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{t("revertToDraft")}</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleStartEdit(story)}
                              disabled={isDeletingThis}
                              className="px-2.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 min-h-[38px] paper-btn-light"
                            >
                              <Pencil className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{t("editLabel")}</span>
                            </button>
                            <button
                              onClick={() => setStoryToDelete(story)}
                              disabled={isDeletingThis}
                              className="px-2.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 min-h-[38px] paper-btn-red"
                            >
                              {isDeletingThis ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Trash2 className="w-3.5 h-3.5 shrink-0" />}
                              <span className="truncate">{t("deleteLabel")}</span>
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
          {commentsMsg && (
            <div className="flex items-center justify-between gap-3 bg-emerald-500/10 border border-emerald-500/25 p-4 rounded-2xl text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{commentsMsg}</span>
              </div>
              <button
                onClick={() => setCommentsMsg(null)}
                className="opacity-60 hover:opacity-100 p-1 rounded-full hover:bg-emerald-500/15 transition-colors"
                title="Fechar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl paper-card">
            <div className="text-xs font-bold uppercase tracking-widest opacity-80">
              {t("commentsApprovalTitle")}
            </div>
            <div className="flex gap-2 p-1 rounded-xl text-[10px] font-bold uppercase tracking-widest overflow-x-auto w-full sm:w-auto scrollbar-none whitespace-nowrap paper-card">
              <button
                onClick={() => setCommentFilter("pending")}
                className={cn("px-3 py-1.5 rounded-lg transition-colors flex-shrink-0", commentFilter === "pending" ? "paper-btn-dark shadow-sm" : "opacity-60 paper-btn-light")}
              >
                {t("commentsPending")} ({comments.filter(c => c.status === "pending").length})
              </button>
              <button
                onClick={() => setCommentFilter("approved")}
                className={cn("px-3 py-1.5 rounded-lg transition-colors flex-shrink-0", commentFilter === "approved" ? "paper-btn-dark shadow-sm" : "opacity-60 paper-btn-light")}
              >
                {t("commentsApproved")} ({comments.filter(c => c.status === "approved").length})
              </button>
              <button
                onClick={() => setCommentFilter("rejected")}
                className={cn("px-3 py-1.5 rounded-lg transition-colors flex-shrink-0", commentFilter === "rejected" ? "paper-btn-dark" : "opacity-60 paper-btn-light")}
              >
                {t("commentsRejected")}
              </button>
              <button
                onClick={() => setCommentFilter("all")}
                className={cn("px-3 py-1.5 rounded-lg transition-colors flex-shrink-0", commentFilter === "all" ? "paper-btn-dark" : "opacity-60 paper-btn-light")}
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
              <div key={c.id} className="p-4 sm:p-6 rounded-2xl space-y-4 paper-card">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="space-y-1 w-full">
                    <span className="text-[9px] uppercase font-bold tracking-widest opacity-60 block">
                      {c.storyTitle}
                    </span>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <span className="font-serif font-bold text-sm text-[#1A1A1A] dark:text-[#F5F5F0]">{c.userName}</span>
                      {c.userEmail && <span className="text-[10px] font-mono opacity-40 truncate block max-w-xs">{c.userEmail}</span>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto border-t sm:border-t-0 border-[#1A1A1A]/5 dark:border-white/5 pt-2 sm:pt-0">
                    <div className="flex items-center gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={cn("w-3.5 h-3.5", i < c.rating ? "fill-amber-400 text-amber-400" : "opacity-15")} />
                      ))}
                    </div>

                    {/* Status Badge */}
                    <span className={cn(
                      "text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border shrink-0",
                      c.status === "approved" && "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
                      c.status === "pending" && "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
                      (c.status === "rejected" || c.status === "hidden") && "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
                    )}>
                      {c.status === "approved" ? t("approved") : c.status === "pending" ? t("pending") : t("rejected")}
                    </span>
                  </div>
                </div>

                {c.text && (
                  <p className="font-serif text-sm leading-relaxed p-4 rounded-xl italic paper-card">
                    "{c.text}"
                  </p>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-[#1A1A1A]/10 dark:border-white/10">
                  <span className="text-[10px] font-mono opacity-45">
                    {c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString() : t("recentDate")}
                  </span>

                  {/* Moderation Actions - Optimized Grid/Flex for high fidelity and zero-overflow */}
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto">
                    {c.status !== "approved" && (
                      <button
                        onClick={() => updateCommentStatus(c.storyId, c.id, "approved")}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 shadow-sm min-h-[44px] paper-btn-dark"
                      >
                        <CheckCircle className="w-4 h-4 shrink-0" />
                        <span>{t("approve")}</span>
                      </button>
                    )}

                    {c.status !== "rejected" && (
                      <button
                        onClick={() => updateCommentStatus(c.storyId, c.id, "rejected")}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 shadow-sm min-h-[44px] paper-btn-red"
                      >
                        <XCircle className="w-4 h-4 shrink-0" />
                        <span>{t("reject")}</span>
                      </button>
                    )}

                    {c.status !== "hidden" && c.status === "approved" && (
                      <button
                        onClick={() => updateCommentStatus(c.storyId, c.id, "hidden")}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 opacity-80 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 min-h-[44px] paper-btn-light"
                      >
                        <EyeOff className="w-4 h-4 shrink-0" />
                        <span>{t("hide")}</span>
                      </button>
                    )}

                    {c.text && (
                      <button
                        onClick={() => setCommentToDeleteText(c)}
                        className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 min-h-[44px] paper-btn-amber"
                        title="Excluir apenas o texto do comentário, mantendo a avaliação e estrelas"
                      >
                        <XCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>Apagar Texto</span>
                      </button>
                    )}

                    <button
                      onClick={() => setCommentToDeleteAll(c)}
                      className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 min-h-[44px] paper-btn-red"
                      title="Excluir a avaliação inteira (comentário e nota)"
                    >
                      <Trash2 className="w-4 h-4 shrink-0" />
                      <span>Excluir Tudo</span>
                    </button>
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
          <div className="max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4 paper-card">
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
                className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all paper-btn-light"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => confirmDeleteStory(storyToDelete)}
                disabled={deletingStoryId === storyToDelete.id}
                className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 disabled:opacity-50 paper-btn-red"
              >
                {deletingStoryId === storyToDelete.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {t("yesDelete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Story Unpublishing */}
      {storyToRevert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4 paper-card">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <div className="p-3 bg-amber-500/10 rounded-full">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-[#1A1A1A] dark:text-white">{t("revertToDraft")}</h3>
                <p className="text-xs opacity-60">{t("draft")}</p>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-[#1A1A1A] dark:text-white/90">
              {t("revertToDraftConfirm")}
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStoryToRevert(null)}
                disabled={revertingStoryId === storyToRevert.id}
                className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all paper-btn-light"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => handleRevertToDraft(storyToRevert)}
                disabled={revertingStoryId === storyToRevert.id}
                className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 disabled:opacity-50 paper-btn-amber"
              >
                {revertingStoryId === storyToRevert.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {t("revertToDraft")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Comment Text Deletion */}
      {commentToDeleteText && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4 paper-card">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <div className="p-3 bg-amber-500/10 rounded-full">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-[#1A1A1A] dark:text-white">Excluir apenas o texto</h3>
                <p className="text-xs opacity-60">A avaliação de estrelas será preservada</p>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-[#1A1A1A] dark:text-white/90">
              Tem certeza que deseja excluir o texto do comentário de <strong>{commentToDeleteText.userName}</strong> na obra <strong>{commentToDeleteText.storyTitle}</strong>?
            </p>

            <div className="p-3 rounded-xl text-xs text-[#1A1A1A]/70 dark:text-white/70 italic max-h-24 overflow-y-auto paper-card">
              "{commentToDeleteText.text}"
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-700 dark:text-amber-300 font-medium leading-normal">
              O texto do comentário será apagado permanentemente. A nota de {commentToDeleteText.rating} estrelas e a contagem geral de avaliações do livro não sofrerão alterações.
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCommentToDeleteText(null)}
                disabled={commentActionLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all paper-btn-light"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => confirmDeleteCommentText(commentToDeleteText.storyId, commentToDeleteText.id)}
                disabled={commentActionLoading}
                className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 disabled:opacity-50 paper-btn-amber"
              >
                {commentActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Apagar Texto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Entire Comment Deletion */}
      {commentToDeleteAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4 paper-card">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="p-3 bg-red-500/10 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-[#1A1A1A] dark:text-white">Excluir avaliação completa</h3>
                <p className="text-xs opacity-60">{t("irreversibleAction")}</p>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-[#1A1A1A] dark:text-white/90">
              Tem certeza que deseja excluir toda a avaliação (texto e a nota de {commentToDeleteAll.rating} estrelas) de <strong>{commentToDeleteAll.userName}</strong> na obra <strong>{commentToDeleteAll.storyTitle}</strong>?
            </p>

            {commentToDeleteAll.text && (
              <div className="p-3 rounded-xl text-xs text-[#1A1A1A]/70 dark:text-white/70 italic max-h-20 overflow-y-auto paper-card">
                "{commentToDeleteAll.text}"
              </div>
            )}

            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-700 dark:text-red-300 font-medium leading-normal">
              Esta ação removerá totalmente o comentário e as estrelas do banco de dados de forma definitiva.
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCommentToDeleteAll(null)}
                disabled={commentActionLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all paper-btn-light"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => deleteCommentAll(commentToDeleteAll.storyId, commentToDeleteAll.id)}
                disabled={commentActionLoading}
                className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 disabled:opacity-50 paper-btn-red"
              >
                {commentActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {t("yesDelete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
