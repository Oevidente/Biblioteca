import { useState, useEffect, FormEvent, ChangeEvent } from "react";
import { useParams, Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useAuth, UserProfile } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { formatCoverUrl } from "../utils/imageUtils";
import { getLocalizedActivity } from "../utils/activityTranslator";
import { resizeImage } from "../lib/imageResizer";
import { TranslatedText } from "../components/TranslatedText";
import { 
  Star,
  User as UserIcon, 
  Settings, 
  UserPlus, 
  UserCheck, 
  UserX, 
  Heart, 
  BookOpen, 
  Award, 
  Clock, 
  Search, 
  Bell, 
  Lock, 
  Eye, 
  EyeOff, 
  Upload, 
  Link as LinkIcon, 
  CheckCircle2, 
  AlertCircle, 
  KeyRound, 
  Mail, 
  AtSign, 
  ShieldCheck, 
  Feather, 
  Sparkles, 
  Users, 
  MessageSquare, 
  Moon, 
  ListPlus, 
  Globe, 
  ChevronRight,
  ChevronDown,
  LogOut,
  FolderUp,
  Library
} from "lucide-react";
import { ACHIEVEMENTS, getUnlockedAchievements } from "../lib/achievements";
import { 
  fetchProfileByUsername, 
  fetchProfileByUid, 
  searchUsers, 
  followUser, 
  unfollowUser, 
  checkIsFollowing, 
  sendFriendRequest, 
  respondFriendRequest, 
  getFriendshipStatus, 
  fetchUserActivities, 
  fetchGlobalActivities,
  fetchUserNotifications, 
  markNotificationAsRead, 
  fetchUserReadingProgress, 
  fetchUserPublishedStories, 
  fetchUserFriendsList, 
  fetchUserFollowersList, 
  fetchUserFollowingList,
  fetchUserFriendRequests,
  undoFriendRequest,
  ActivityItem,
  NotificationItem,
  ReadingHistoryItem
} from "../lib/social";

function getAchievementIcon(iconName: string) {
  switch (iconName) {
    case "BookOpen": return BookOpen;
    case "Award": return Award;
    case "MessageSquare": return MessageSquare;
    case "Moon": return Moon;
    case "ListPlus": return ListPlus;
    case "Globe": return Globe;
    case "Feather": return Feather;
    default: return Award;
  }
}

function getBadgeTheme(badgeId: string) {
  switch (badgeId) {
    case "published_author":
      return {
        gradient: "from-amber-400 via-yellow-500 to-amber-600",
        border: "border-amber-400/60 dark:border-amber-400/40",
        ring: "ring-2 ring-amber-400/30",
        shadow: "shadow-amber-500/20",
        bgLight: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
        badgeTag: "Autor"
      };
    case "book_devourer":
      return {
        gradient: "from-emerald-400 via-teal-500 to-emerald-600",
        border: "border-emerald-400/60 dark:border-emerald-400/40",
        ring: "ring-2 ring-emerald-400/30",
        shadow: "shadow-emerald-500/20",
        bgLight: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        badgeTag: "Leitor"
      };
    case "first_page":
      return {
        gradient: "from-sky-400 via-blue-500 to-indigo-600",
        border: "border-sky-400/60 dark:border-sky-400/40",
        ring: "ring-2 ring-sky-400/30",
        shadow: "shadow-sky-500/20",
        bgLight: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
        badgeTag: "Leitor"
      };
    case "first_review":
      return {
        gradient: "from-purple-400 via-fuchsia-500 to-purple-600",
        border: "border-purple-400/60 dark:border-purple-400/40",
        ring: "ring-2 ring-purple-400/30",
        shadow: "shadow-purple-500/20",
        bgLight: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
        badgeTag: "Social"
      };
    case "night_owl":
      return {
        gradient: "from-indigo-500 via-purple-600 to-slate-900",
        border: "border-indigo-400/60 dark:border-indigo-400/40",
        ring: "ring-2 ring-indigo-400/30",
        shadow: "shadow-indigo-500/20",
        bgLight: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
        badgeTag: "Explorador"
      };
    case "playlist_curator":
      return {
        gradient: "from-rose-400 via-pink-500 to-rose-600",
        border: "border-rose-400/60 dark:border-rose-400/40",
        ring: "ring-2 ring-rose-400/30",
        shadow: "shadow-rose-500/20",
        bgLight: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
        badgeTag: "Social"
      };
    case "polyglot":
      return {
        gradient: "from-yellow-400 via-amber-500 to-orange-600",
        border: "border-amber-400/60 dark:border-amber-400/40",
        ring: "ring-2 ring-amber-400/30",
        shadow: "shadow-amber-500/20",
        bgLight: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
        badgeTag: "Explorador"
      };
    default:
      return {
        gradient: "from-amber-400 to-amber-600",
        border: "border-amber-400/40",
        ring: "ring-2 ring-amber-400/20",
        shadow: "shadow-amber-500/20",
        bgLight: "bg-amber-500/10 text-amber-600",
        badgeTag: "Geral"
      };
  }
}

export function ProfilePage() {
  const { usernameParam, uidParam } = useParams<{ usernameParam?: string; uidParam?: string }>();
  const { user, profile: currentUserProfile, logout, updateProfileInfo, changePassword } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  // Profile being viewed
  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isSelf, setIsSelf] = useState(false);

  // Social Relationship Status
  const [isFollowing, setIsFollowing] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState<"friends" | "pending_sent" | "pending_received" | "none">("none");
  const [actionLoading, setActionLoading] = useState(false);

  // Profile Content Data
  const [activeTab, setActiveTab] = useState<"activities" | "stories" | "history" | "badges" | "network" | "notifications">("activities");
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [publishedStories, setPublishedStories] = useState<any[]>([]);
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [friendRequestsMap, setFriendRequestsMap] = useState<Record<string, "pending" | "accepted" | "rejected">>({});
  const [friendsList, setFriendsList] = useState<UserProfile[]>([]);
  const [followersList, setFollowersList] = useState<UserProfile[]>([]);
  const [followingList, setFollowingList] = useState<UserProfile[]>([]);
  const [networkSubTab, setNetworkSubTab] = useState<"friends" | "followers" | "following">("friends");
  const [badgeCategory, setBadgeCategory] = useState<"all" | "reader" | "author" | "social" | "explorer">("all");

  const unlockedAchievementIds = (() => {
    if (!targetProfile) return [];
    const set = new Set<string>();

    if (isSelf) {
      getUnlockedAchievements(targetProfile.uid).forEach((id) => set.add(id));
    }

    if (Array.isArray(targetProfile.achievements)) {
      targetProfile.achievements.forEach((id) => set.add(id));
    }

    if (targetProfile.role === "author" || targetProfile.role === "admin" || publishedStories.length > 0) {
      set.add("published_author");
    }
    if (readingHistory.length > 0) {
      set.add("first_page");
    }
    if (readingHistory.length >= 3) {
      set.add("book_devourer");
    }

    return Array.from(set);
  })();



  // Edit Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"profile" | "security">("profile");

  // Settings Form Inputs
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editPhotoURL, setEditPhotoURL] = useState("");
  const [editIsHistoryPublic, setEditIsHistoryPublic] = useState(true);

  // Drive Modal / Upload helper
  const [uploadMethod, setUploadMethod] = useState<"link" | "file">("link");

  // Security Form Inputs
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmNewPass, setConfirmNewPass] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Messages
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");
  const [isSubmittingSettings, setIsSubmittingSettings] = useState(false);

  // 1. Load Profile
  useEffect(() => {
    let isMounted = true;
    const loadProfileData = async () => {
      setLoadingProfile(true);

      let p: UserProfile | null = null;
      if (usernameParam) {
        p = await fetchProfileByUsername(usernameParam);
      } else if (uidParam) {
        p = await fetchProfileByUid(uidParam);
      } else if (currentUserProfile) {
        p = currentUserProfile;
      }

      if (!isMounted) return;

      if (!p && currentUserProfile) {
        p = currentUserProfile;
      }

      setTargetProfile(p);

      const checkSelf = Boolean(currentUserProfile && p && currentUserProfile.uid === p.uid);
      setIsSelf(checkSelf);

      if (p) {
        // Init settings inputs if self
        if (checkSelf) {
          setEditDisplayName(p.displayName || "");
          setEditUsername(p.username || "");
          setEditEmail(p.email || "");
          setEditBio(p.bio || "");
          setEditPhotoURL(p.photoURL || "");
          setEditIsHistoryPublic(p.isHistoryPublic !== false);
        }

        // Check social status if logged in and not self
        if (currentUserProfile && !checkSelf) {
          const following = await checkIsFollowing(currentUserProfile.uid, p.uid);
          const fStatus = await getFriendshipStatus(currentUserProfile.uid, p.uid);
          if (isMounted) {
            setIsFollowing(following);
            setFriendshipStatus(fStatus);
          }
        }

        // Fetch user data in parallel
        const [acts, stories, history, notifs, friends, followers, following, receivedRequests] = await Promise.all([
          fetchUserActivities(p.uid),
          fetchUserPublishedStories(p.uid, { displayName: p.displayName, username: p.username, email: p.email }),
          fetchUserReadingProgress(p.uid),
          checkSelf && currentUserProfile ? fetchUserNotifications(p.uid) : Promise.resolve([]),
          fetchUserFriendsList(p.uid),
          fetchUserFollowersList(p.uid),
          fetchUserFollowingList(p.uid),
          checkSelf && currentUserProfile ? fetchUserFriendRequests(p.uid) : Promise.resolve([])
        ]);

        if (isMounted) {
          setActivities(acts);
          setPublishedStories(stories);
          setReadingHistory(history);
          setNotifications(notifs);
          setFriendsList(friends);
          setFollowersList(followers);
          setFollowingList(following);
          
          const reqMap: Record<string, "pending" | "accepted" | "rejected"> = {};
          if (Array.isArray(receivedRequests)) {
            receivedRequests.forEach((req) => {
              if (req.id) reqMap[req.id] = req.status;
            });
          }
          setFriendRequestsMap(reqMap);
        }
      }

      setLoadingProfile(false);
    };

    loadProfileData();
    return () => { isMounted = false; };
  }, [usernameParam, uidParam, currentUserProfile]);

  // Mark notifications as read when entering the notifications tab
  useEffect(() => {
    if (activeTab === "notifications" && isSelf && notifications.length > 0) {
      const unread = notifications.filter((n) => n.status === "unread");
      if (unread.length > 0) {
        unread.forEach((n) => {
          if (n.id) {
            markNotificationAsRead(n.id);
          }
        });
        setNotifications((prev) =>
          prev.map((n) => (n.status === "unread" ? { ...n, status: "read" } : n))
        );
      }
    }
  }, [activeTab, notifications.length, isSelf]);



  // Social Actions
  const handleToggleFollow = async () => {
    if (!currentUserProfile || !targetProfile || actionLoading) return;
    setActionLoading(true);

    if (isFollowing) {
      const ok = await unfollowUser(currentUserProfile.uid, targetProfile.uid);
      if (ok) {
        setIsFollowing(false);
        setTargetProfile(prev => prev ? { ...prev, followersCount: Math.max(0, (prev.followersCount || 1) - 1) } : null);
      }
    } else {
      const ok = await followUser(currentUserProfile.uid, targetProfile.uid, currentUserProfile);
      if (ok) {
        setIsFollowing(true);
        setTargetProfile(prev => prev ? { ...prev, followersCount: (prev.followersCount || 0) + 1 } : null);
      }
    }
    setActionLoading(false);
  };

  const handleSendFriendRequest = async () => {
    if (!currentUserProfile || !targetProfile || actionLoading) return;
    setActionLoading(true);

    const res = await sendFriendRequest(currentUserProfile, targetProfile.uid);
    if (res.success) {
      setFriendshipStatus("pending_sent");
    }
    setActionLoading(false);
  };

  const handleRespondFriendRequest = async (requestId: string, status: "accepted" | "rejected") => {
    if (!currentUserProfile || actionLoading) return;
    setActionLoading(true);

    const ok = await respondFriendRequest(requestId, status, currentUserProfile);
    if (ok) {
      // Refresh notifications & friends & requests map
      const updatedNotifs = await fetchUserNotifications(currentUserProfile.uid);
      const updatedFriends = await fetchUserFriendsList(currentUserProfile.uid);
      const updatedRequests = await fetchUserFriendRequests(currentUserProfile.uid);
      
      const reqMap: Record<string, "pending" | "accepted" | "rejected"> = {};
      if (Array.isArray(updatedRequests)) {
        updatedRequests.forEach((req) => {
          if (req.id) reqMap[req.id] = req.status;
        });
      }

      setNotifications(updatedNotifs);
      setFriendsList(updatedFriends);
      setFriendRequestsMap(reqMap);

      if (targetProfile && friendshipStatus === "pending_received") {
        setFriendshipStatus(status === "accepted" ? "friends" : "none");
      }
    }
    setActionLoading(false);
  };

  const handleUndoFriendRequest = async (requestId: string) => {
    if (!currentUserProfile || actionLoading) return;
    setActionLoading(true);

    const ok = await undoFriendRequest(requestId, currentUserProfile);
    if (ok) {
      // Refresh notifications & friends & requests map
      const updatedNotifs = await fetchUserNotifications(currentUserProfile.uid);
      const updatedFriends = await fetchUserFriendsList(currentUserProfile.uid);
      const updatedRequests = await fetchUserFriendRequests(currentUserProfile.uid);
      
      const reqMap: Record<string, "pending" | "accepted" | "rejected"> = {};
      if (Array.isArray(updatedRequests)) {
        updatedRequests.forEach((req) => {
          if (req.id) reqMap[req.id] = req.status;
        });
      }

      setNotifications(updatedNotifs);
      setFriendsList(updatedFriends);
      setFriendRequestsMap(reqMap);

      if (targetProfile) {
        // Since we unfriended, set status to none or check status again
        const fStatus = await getFriendshipStatus(currentUserProfile.uid, targetProfile.uid);
        setFriendshipStatus(fStatus);
      }
    }
    setActionLoading(false);
  };

  // Image Upload File Handler
  const handlePhotoFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resizedDataUrl = await resizeImage(file, 400, 400);
      setEditPhotoURL(resizedDataUrl);
    } catch (err) {
      console.error("Error resizing avatar photo:", err);
    }
  };

  // Update Profile Info
  const handleSaveProfileSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSettingsError("");
    setSettingsSuccess("");
    setIsSubmittingSettings(true);

    const res = await updateProfileInfo({
      displayName: editDisplayName,
      username: editUsername,
      email: editEmail,
      bio: editBio,
      photoURL: editPhotoURL,
      isHistoryPublic: editIsHistoryPublic
    });

    setIsSubmittingSettings(false);

    if (res.success) {
      setSettingsSuccess("Perfil atualizado com sucesso!");
      if (targetProfile) {
        setTargetProfile(prev => prev ? {
          ...prev,
          displayName: editDisplayName,
          username: editUsername,
          email: editEmail,
          bio: editBio,
          photoURL: editPhotoURL,
          isHistoryPublic: editIsHistoryPublic
        } : null);
      }
      setTimeout(() => {
        setIsSettingsOpen(false);
        setSettingsSuccess("");
      }, 1200);
    } else {
      setSettingsError(res.error || "Erro ao salvar alterações no perfil.");
    }
  };

  // Change Password Handler
  const handleChangePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSettingsError("");
    setSettingsSuccess("");

    if (!currentPass || !newPass) {
      setSettingsError(t("fillAllFields"));
      return;
    }

    if (newPass !== confirmNewPass) {
      setSettingsError(t("passwordMismatch"));
      return;
    }

    if (newPass.length < 6) {
      setSettingsError(t("passwordMinLength"));
      return;
    }

    setIsSubmittingSettings(true);
    const res = await changePassword(currentPass, newPass);
    setIsSubmittingSettings(false);

    if (res.success) {
      setSettingsSuccess("Senha alterada com sucesso!");
      setCurrentPass("");
      setNewPass("");
      setConfirmNewPass("");
    } else {
      setSettingsError(res.error || t("errorLabel"));
    }
  };

  if (loadingProfile) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
        <div className="w-10 h-10 border-3 border-[#1A1A1A] dark:border-white border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-bold uppercase tracking-widest opacity-60">{t("loadingProfile") || "Carregando perfil..."}</p>
      </div>
    );
  }

  if (!targetProfile) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center mb-4">
          <UserX className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-serif font-bold tracking-tight mb-2">{t("profileNotFound") || "Perfil não encontrado"}</h2>
        <p className="text-xs opacity-70 leading-relaxed mb-6">
          O usuário procurado não existe ou pode ter alterado o nome de usuário.
        </p>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-3 rounded-full font-bold text-xs uppercase tracking-widest paper-btn-dark"
        >
          {t("backToLibrary")}
        </button>
      </div>
    );
  }

  const avatarUrl = formatCoverUrl(targetProfile.photoURL);
  const unreadCount = notifications.filter(n => n.status === "unread").length;
  const isAuthorRole = targetProfile.role === "author" || targetProfile.role === "admin" || publishedStories.length > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-12">
      {/* 1. HERO PROFILE CARD */}
      <div className="relative rounded-3xl overflow-hidden paper-card p-6 sm:p-8 md:p-10 shadow-lg">
        {/* Cover Graphic Accent */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-r from-amber-500/20 via-indigo-500/20 to-purple-500/20 dark:from-amber-500/10 dark:via-indigo-500/10 dark:to-purple-500/10 border-b border-[#1A1A1A]/5 dark:border-white/5" />

        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-end gap-6 pt-8">
          {/* Avatar Picture */}
          <div className="relative group shrink-0">
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-white dark:border-[#1A1A1A] shadow-xl bg-amber-500/10 flex items-center justify-center font-serif font-bold text-4xl text-[#1A1A1A] dark:text-[#F5F5F0]">
              {avatarUrl ? (
                <img src={avatarUrl} alt={targetProfile.displayName || targetProfile.username} className="w-full h-full object-cover" />
              ) : (
                <span>{(targetProfile.displayName || targetProfile.username || targetProfile.email || "U")[0].toUpperCase()}</span>
              )}
            </div>

            {isSelf && (
              <button
                onClick={() => { setIsSettingsOpen(true); setSettingsTab("profile"); }}
                className="absolute bottom-1 right-1 p-2 rounded-full shadow-md paper-btn-dark transition-transform hover:scale-110"
                title="Editar Foto de Perfil"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* User Details */}
          <div className="flex-1 text-center sm:text-left space-y-2">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h1 className="font-serif font-bold text-2xl sm:text-3xl tracking-tight">
                {targetProfile.displayName || `@${targetProfile.username}`}
              </h1>
              {targetProfile.username && (
                <span className="text-xs font-mono opacity-60">@{targetProfile.username}</span>
              )}
              {/* Role Badge */}
              <span className={`px-2.5 py-0.5 rounded-full text-[9px] uppercase font-bold tracking-widest ${
                targetProfile.role === "admin" 
                  ? "bg-purple-500/20 text-purple-700 dark:text-purple-300"
                  : targetProfile.role === "author"
                  ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                  : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
              }`}>
                {targetProfile.role === "admin" ? "Admin Master" : targetProfile.role === "author" ? "Autor" : "Leitor"}
              </span>
            </div>

            {/* Bio */}
            <p className="text-xs sm:text-sm opacity-80 max-w-2xl leading-relaxed">
              {targetProfile.bio || (isSelf ? "Adicione uma bibliografia pessoal no seu perfil para outros leitores te conhecerem melhor." : "Este usuário ainda não adicionou uma biografia.")}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 shrink-0">
            {isSelf ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-sm paper-btn-dark"
                >
                  <Settings className="w-4 h-4" />
                  <span>{t("settings")}</span>
                </button>
                <button
                  onClick={async () => {
                    await logout();
                    navigate("/");
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-sm paper-btn-light border border-black/10 dark:border-white/10 text-red-500 hover:bg-red-500/5 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t("logout")}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {/* Follow Button */}
                <button
                  onClick={handleToggleFollow}
                  disabled={actionLoading}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all shadow-sm ${
                    isFollowing ? "paper-btn-light border border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : "paper-btn-dark"
                  }`}
                >
                  {isFollowing ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                  <span>{isFollowing ? t("following") : t("follow")}</span>
                </button>

                {/* Friend Request Button */}
                {friendshipStatus === "friends" ? (
                  <span className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t("friends")}</span>
                  </span>
                ) : friendshipStatus === "pending_sent" ? (
                  <span className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <Clock className="w-4 h-4" />
                    <span>Solicitada</span>
                  </span>
                ) : friendshipStatus === "pending_received" ? (
                  <button
                    onClick={() => setActiveTab("notifications")}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 hover:scale-105 transition-transform"
                  >
                    <Bell className="w-4 h-4 animate-bounce" />
                    <span>Responder Solicitação</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSendFriendRequest}
                    disabled={actionLoading}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest paper-btn-light"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Adicionar Amigo</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* METRICS ROW */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-6 mt-6 border-t border-[#1A1A1A]/10 dark:border-white/10 text-center">
          <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 flex flex-col items-center justify-center min-h-[72px]">
            <p className="text-xl font-bold font-serif">{friendsList.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">{t("friends")}</p>
          </div>
          <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 flex flex-col items-center justify-center min-h-[72px]">
            <p className="text-xl font-bold font-serif">{targetProfile.followersCount || followersList.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">{t("followers")}</p>
          </div>
          <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 flex flex-col items-center justify-center min-h-[72px]">
            <p className="text-xl font-bold font-serif">{targetProfile.followingCount || followingList.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">{t("following")}</p>
          </div>
          {isAuthorRole && (
            <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 flex flex-col items-center justify-center min-h-[72px]">
              <p className="text-xl font-bold font-serif">{publishedStories.length}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">{t("stories") || "Histórias"}</p>
            </div>
          )}
          <div 
            onClick={() => setActiveTab("badges")}
            className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 col-span-2 sm:col-span-1 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-all border border-transparent hover:border-amber-500/30 group text-left flex flex-col justify-center min-h-[72px]"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{t("badges")}</span>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                {unlockedAchievementIds.length}/{ACHIEVEMENTS.length}
              </span>
            </div>

            {/* Row of visual shiny emblem badges */}
            <div className="flex items-center gap-1.5 mt-2 overflow-x-auto custom-scrollbar pb-0.5">
              {ACHIEVEMENTS.map((a) => {
                const isUnlocked = unlockedAchievementIds.includes(a.id);
                const IconComponent = getAchievementIcon(a.icon);
                const theme = getBadgeTheme(a.id);
                return (
                  <div
                    key={a.id}
                    title={`${a.title[language] || a.title.pt} (${isUnlocked ? "Conquistado" : "Bloqueado"})`}
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border transition-transform group-hover:scale-105 ${
                      isUnlocked 
                        ? `bg-gradient-to-br ${theme.gradient} text-white shadow-md ${theme.border} ${theme.shadow}` 
                        : "bg-black/10 dark:bg-white/10 text-black/30 dark:text-white/30 border-black/5 dark:border-white/5 grayscale opacity-40"
                    }`}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 2. NAVIGATION TABS */}
      {/* Mobile Navigation Selector (no horizontal scroll) */}
      <div className="sm:hidden space-y-3 mb-4">
        <div className="relative">
          <div className="flex items-center justify-between p-3.5 rounded-2xl paper-card border border-black/10 dark:border-white/10 shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shrink-0">
                {activeTab === "activities" && <Sparkles className="w-4 h-4" />}
                {activeTab === "stories" && <Feather className="w-4 h-4" />}
                {activeTab === "history" && <BookOpen className="w-4 h-4" />}
                {activeTab === "badges" && <Award className="w-4 h-4" />}
                {activeTab === "network" && <Users className="w-4 h-4" />}
                {activeTab === "search" && <Search className="w-4 h-4" />}
                {activeTab === "notifications" && <Bell className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <p className="text-[9px] uppercase font-bold tracking-widest opacity-50">Seção Ativa</p>
                <p className="text-xs font-bold uppercase tracking-wider truncate">
                  {activeTab === "activities" && t("recentActivities")}
                  {activeTab === "stories" && `${t("stories")} (${publishedStories.length})`}
                  {activeTab === "history" && t("readingHistory")}
                  {activeTab === "badges" && `${t("badges")} (${unlockedAchievementIds.length}/${ACHIEVEMENTS.length})`}
                  {activeTab === "network" && t("network")}
                  {activeTab === "search" && t("community")}
                  {activeTab === "notifications" && `${t("notifications")} ${unreadCount > 0 ? `(${unreadCount})` : ""}`}
                </p>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 opacity-60 shrink-0 ml-2" />
          </div>
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as any)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            <option value="activities">{t("recentActivities")}</option>
            {isAuthorRole && <option value="stories">{t("stories")} ({publishedStories.length})</option>}
            <option value="history">{t("readingHistory")}</option>
            <option value="badges">{t("badges")} ({unlockedAchievementIds.length}/{ACHIEVEMENTS.length})</option>
            <option value="network">{t("network")}</option>
            <option value="search">{t("community")}</option>
            {isSelf && <option value="notifications">{t("notifications")} {unreadCount > 0 ? `(${unreadCount})` : ""}</option>}
          </select>
        </div>

        {/* Mobile Quick Tap Pills */}
        <div className="grid grid-cols-4 gap-1.5">
          <button
            onClick={() => setActiveTab("activities")}
            className={`py-2 px-1 rounded-xl text-[10px] font-bold uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "activities" ? "paper-btn-dark shadow-sm" : "paper-card opacity-70 hover:opacity-100"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="truncate text-[8px]">Atividade</span>
          </button>

          {isAuthorRole && (
            <button
              onClick={() => setActiveTab("stories")}
              className={`py-2 px-1 rounded-xl text-[10px] font-bold uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all ${
                activeTab === "stories" ? "paper-btn-dark shadow-sm" : "paper-card opacity-70 hover:opacity-100"
              }`}
            >
              <Feather className="w-3.5 h-3.5" />
              <span className="truncate text-[8px]">Obras</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab("history")}
            className={`py-2 px-1 rounded-xl text-[10px] font-bold uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "history" ? "paper-btn-dark shadow-sm" : "paper-card opacity-70 hover:opacity-100"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="truncate text-[8px]">Leitura</span>
          </button>

          <button
            onClick={() => setActiveTab("badges")}
            className={`py-2 px-1 rounded-xl text-[10px] font-bold uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "badges" ? "paper-btn-dark shadow-sm" : "paper-card opacity-70 hover:opacity-100"
            }`}
          >
            <Award className="w-3.5 h-3.5 text-amber-500" />
            <span className="truncate text-[8px]">{t("badges")}</span>
          </button>

          <button
            onClick={() => setActiveTab("network")}
            className={`py-2 px-1 rounded-xl text-[10px] font-bold uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === "network" ? "paper-btn-dark shadow-sm" : "paper-card opacity-70 hover:opacity-100"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="truncate text-[8px]">Rede</span>
          </button>



          {isSelf && (
            <button
              onClick={() => setActiveTab("notifications")}
              className={`py-2 px-1 rounded-xl text-[10px] font-bold uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all relative ${
                activeTab === "notifications" ? "paper-btn-dark shadow-sm" : "paper-card opacity-70 hover:opacity-100"
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span className="truncate text-[8px]">Avisos</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white font-mono text-[8px] flex items-center justify-center font-bold">
                  {unreadCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Desktop Navigation Tabs */}
      <div className="hidden sm:flex border-b border-[#1A1A1A]/10 dark:border-white/10 gap-6 text-xs font-bold uppercase tracking-widest">
        <button
          onClick={() => setActiveTab("activities")}
          className={`pb-3 border-b-2 transition-colors shrink-0 flex items-center gap-2 ${
            activeTab === "activities" ? "border-[#1A1A1A] dark:border-[#F5F5F0] opacity-100" : "border-transparent opacity-50 hover:opacity-100"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>{t("recentActivities")}</span>
        </button>

        {isAuthorRole && (
          <button
            onClick={() => setActiveTab("stories")}
            className={`pb-3 border-b-2 transition-colors shrink-0 flex items-center gap-2 ${
              activeTab === "stories" ? "border-[#1A1A1A] dark:border-[#F5F5F0] opacity-100" : "border-transparent opacity-50 hover:opacity-100"
            }`}
          >
            <Feather className="w-4 h-4" />
            <span>{t("stories")} ({publishedStories.length})</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab("history")}
          className={`pb-3 border-b-2 transition-colors shrink-0 flex items-center gap-2 ${
            activeTab === "history" ? "border-[#1A1A1A] dark:border-[#F5F5F0] opacity-100" : "border-transparent opacity-50 hover:opacity-100"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>{t("readingHistory")}</span>
        </button>

        <button
          onClick={() => setActiveTab("badges")}
          className={`pb-3 border-b-2 transition-colors shrink-0 flex items-center gap-2 ${
            activeTab === "badges" ? "border-[#1A1A1A] dark:border-[#F5F5F0] opacity-100" : "border-transparent opacity-50 hover:opacity-100"
          }`}
        >
          <Award className="w-4 h-4 text-amber-500" />
          <span>{t("badges")} ({unlockedAchievementIds.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("network")}
          className={`pb-3 border-b-2 transition-colors shrink-0 flex items-center gap-2 ${
            activeTab === "network" ? "border-[#1A1A1A] dark:border-[#F5F5F0] opacity-100" : "border-transparent opacity-50 hover:opacity-100"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{t("network")}</span>
        </button>



        {isSelf && (
          <button
            onClick={() => setActiveTab("notifications")}
            className={`pb-3 border-b-2 transition-colors shrink-0 flex items-center gap-2 relative ${
              activeTab === "notifications" ? "border-[#1A1A1A] dark:border-[#F5F5F0] opacity-100" : "border-transparent opacity-50 hover:opacity-100"
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>{t("notifications")}</span>
            {unreadCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-red-500 text-white font-mono text-[9px] flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* 3. TAB CONTENTS */}
      
      {/* TAB: ACTIVIDADES */}
      {activeTab === "activities" && (
        <div className="space-y-4">
          {activities.length === 0 ? (
            <div className="paper-card rounded-2xl p-8 text-center text-xs opacity-60">
              Nenhuma atividade recente registrada até o momento.
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((act, i) => (
                <div key={act.id || i} className="paper-card rounded-2xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    {act.type === "published" ? <Feather className="w-5 h-5" /> : act.type === "follow" ? <UserPlus className="w-5 h-5" /> : act.type === "friend" ? <Users className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold leading-snug">{getLocalizedActivity(act, t)}</p>
                    {act.details && <p className="text-[11px] opacity-70 mt-0.5 line-clamp-1">{act.details}</p>}
                    <p className="text-[10px] opacity-50 font-mono mt-1">
                      {new Date(act.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: HISTÓRIAS PUBLICADAS */}
      {activeTab === "stories" && (
        <div>
          {publishedStories.length === 0 ? (
            <div className="paper-card rounded-2xl p-8 text-center text-xs opacity-60">
              Nenhuma história publicada ainda.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {publishedStories.map((story) => (
                <Link
                  key={story.id}
                  to={`/story/${story.id}`}
                  className="paper-card rounded-2xl p-4 flex gap-4 group hover:scale-[1.02] transition-all"
                >
                  <img
                    src={formatCoverUrl(story.coverImage)}
                    alt={story.title}
                    className="w-20 h-28 object-cover rounded-xl shadow-md shrink-0"
                  />
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <h3 className="font-serif font-bold text-sm line-clamp-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        <TranslatedText text={story.title} />
                      </h3>
                      <p className="text-xs opacity-60 mt-1">Por {story.author}</p>
                    </div>
                    <div className="flex items-center justify-between text-[10px] opacity-70 font-mono pt-2 border-t border-[#1A1A1A]/5 dark:border-white/5">
                      <span>{story.pages ? story.pages.length : 0} pág(s)</span>
                      <span className="flex items-center gap-1 font-bold text-amber-500">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> {story.rating ? story.rating.toFixed(1) : "N/A"}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: HISTÓRICO DE LEITURA (PÚBLICO/PRIVADO) */}
      {activeTab === "history" && (
        <div>
          {!isSelf && targetProfile.isHistoryPublic === false ? (
            <div className="paper-card rounded-2xl p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="font-serif font-bold text-lg">Histórico de Leitura Privado</h3>
              <p className="text-xs opacity-70 max-w-sm mx-auto leading-relaxed">
                Este usuário optou por manter suas leituras e progresso privados.
              </p>
            </div>
          ) : readingHistory.length === 0 ? (
            <div className="paper-card rounded-2xl p-8 text-center text-xs opacity-60">
              Nenhum livro no histórico de leitura.
            </div>
          ) : (
            <div className="space-y-3">
              {readingHistory.map((item) => {
                const percent = Math.min(100, Math.round((item.page / Math.max(1, item.totalPages)) * 100));
                return (
                  <div key={item.id} className="paper-card rounded-2xl p-4 flex items-center gap-4">
                    {item.coverImage && (
                      <img src={formatCoverUrl(item.coverImage)} alt={item.storyTitle} className="w-12 h-16 object-cover rounded-lg shrink-0 shadow-sm" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-serif font-bold text-sm truncate">
                        <TranslatedText text={item.storyTitle} />
                      </h4>
                      <p className="text-xs opacity-60">{item.author}</p>
                      
                      {/* Progress Bar */}
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between text-[10px] font-mono opacity-70">
                          <span>Pág. {item.page} de {item.totalPages}</span>
                          <span>{percent}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    </div>

                    <Link
                      to={`/story/${item.storyId}`}
                      className="px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 paper-btn-dark"
                    >
                      Continuar
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB: MEDALHAS & CONQUISTAS */}
      {activeTab === "badges" && (
        <div className="space-y-6">
          {/* Progress Header Card */}
          <div className="paper-card rounded-2xl p-5 border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="font-serif font-bold text-base flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-500" />
                  <span>Progresso de Conquistas</span>
                </h3>
                <p className="text-xs opacity-70 mt-0.5">
                  Complete desafios de leitura, escrita e interação na comunidade para desbloquear novas medalhas.
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                  {unlockedAchievementIds.length} <span className="text-xs font-normal opacity-60">/ {ACHIEVEMENTS.length}</span>
                </span>
                <p className="text-[10px] uppercase font-bold tracking-widest opacity-60">
                  {Math.round((unlockedAchievementIds.length / ACHIEVEMENTS.length) * 100)}% Desbloqueado
                </p>
              </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="w-full h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 transition-all duration-500 shadow-sm"
                style={{ width: `${Math.round((unlockedAchievementIds.length / ACHIEVEMENTS.length) * 100)}%` }}
              />
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-bold uppercase tracking-wider custom-scrollbar">
            <button
              onClick={() => setBadgeCategory("all")}
              className={`px-3.5 py-1.5 rounded-full transition-all shrink-0 ${
                badgeCategory === "all" ? "paper-btn-dark shadow-sm" : "paper-card opacity-60 hover:opacity-100"
              }`}
            >
              Todas ({ACHIEVEMENTS.length})
            </button>
            <button
              onClick={() => setBadgeCategory("reader")}
              className={`px-3.5 py-1.5 rounded-full transition-all shrink-0 ${
                badgeCategory === "reader" ? "paper-btn-dark shadow-sm" : "paper-card opacity-60 hover:opacity-100"
              }`}
            >
              Leitura
            </button>
            <button
              onClick={() => setBadgeCategory("author")}
              className={`px-3.5 py-1.5 rounded-full transition-all shrink-0 ${
                badgeCategory === "author" ? "paper-btn-dark shadow-sm" : "paper-card opacity-60 hover:opacity-100"
              }`}
            >
              Autor
            </button>
            <button
              onClick={() => setBadgeCategory("social")}
              className={`px-3.5 py-1.5 rounded-full transition-all shrink-0 ${
                badgeCategory === "social" ? "paper-btn-dark shadow-sm" : "paper-card opacity-60 hover:opacity-100"
              }`}
            >
              Social
            </button>
            <button
              onClick={() => setBadgeCategory("explorer")}
              className={`px-3.5 py-1.5 rounded-full transition-all shrink-0 ${
                badgeCategory === "explorer" ? "paper-btn-dark shadow-sm" : "paper-card opacity-60 hover:opacity-100"
              }`}
            >
              Explorador
            </button>
          </div>

          {/* Grid of Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ACHIEVEMENTS.filter((a) => {
              if (badgeCategory === "all") return true;
              const theme = getBadgeTheme(a.id);
              if (badgeCategory === "reader") return theme.badgeTag === "Leitor";
              if (badgeCategory === "author") return theme.badgeTag === "Autor";
              if (badgeCategory === "social") return theme.badgeTag === "Social";
              if (badgeCategory === "explorer") return theme.badgeTag === "Explorador";
              return true;
            }).map((a) => {
              const unlocked = unlockedAchievementIds.includes(a.id);
              const theme = getBadgeTheme(a.id);
              const IconComponent = getAchievementIcon(a.icon);

              return (
                <div
                  key={a.id}
                  className={`p-4 rounded-2xl flex items-center gap-4 paper-card border transition-all duration-300 relative overflow-hidden group ${
                    unlocked
                      ? `bg-black/[0.02] dark:bg-white/[0.02] ${theme.border} shadow-sm hover:scale-[1.01]`
                      : "opacity-50 grayscale bg-black/5 dark:bg-white/5 border-transparent"
                  }`}
                >
                  {/* Emblem Icon Circle */}
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border transition-transform group-hover:rotate-6 ${
                    unlocked 
                      ? `bg-gradient-to-br ${theme.gradient} text-white shadow-md ${theme.border} ${theme.ring}` 
                      : "bg-black/10 dark:bg-white/10 text-black/40 dark:text-white/40 border-black/10 dark:border-white/10"
                  }`}>
                    <IconComponent className="w-6 h-6" />
                  </div>

                  {/* Medal Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="font-serif font-bold text-sm truncate">{a.title[language] || a.title.pt}</h4>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-bold tracking-widest shrink-0 ${
                        unlocked 
                          ? theme.bgLight 
                          : "bg-black/10 dark:bg-white/10 text-black/40 dark:text-white/40"
                      }`}>
                        {unlocked ? "Desbloqueado" : "Bloqueado"}
                      </span>
                    </div>

                    <p className="text-xs opacity-70 leading-snug line-clamp-2">{a.description[language] || a.description.pt}</p>

                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/5 opacity-60">
                        {theme.badgeTag}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: REDE SOCIAL (AMIGOS & SEGUIDORES) */}
      {activeTab === "network" && (
        <div className="space-y-4">
          <div className="flex gap-2 text-xs font-bold uppercase tracking-wider border-b border-[#1A1A1A]/10 dark:border-white/10 pb-2">
            <button
              onClick={() => setNetworkSubTab("friends")}
              className={`px-3 py-1.5 rounded-full transition-colors ${networkSubTab === "friends" ? "paper-btn-dark" : "opacity-60"}`}
            >
              {t("friends")} ({friendsList.length})
            </button>
            <button
              onClick={() => setNetworkSubTab("followers")}
              className={`px-3 py-1.5 rounded-full transition-colors ${networkSubTab === "followers" ? "paper-btn-dark" : "opacity-60"}`}
            >
              {t("followers")} ({followersList.length})
            </button>
            <button
              onClick={() => setNetworkSubTab("following")}
              className={`px-3 py-1.5 rounded-full transition-colors ${networkSubTab === "following" ? "paper-btn-dark" : "opacity-60"}`}
            >
              {t("following")} ({followingList.length})
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(networkSubTab === "friends" ? friendsList : networkSubTab === "followers" ? followersList : followingList).map((u) => (
              <div key={u.uid} className="paper-card rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center font-serif font-bold overflow-hidden shrink-0">
                    {u.photoURL ? (
                      <img src={formatCoverUrl(u.photoURL)} alt={u.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span>{(u.displayName || u.username || u.email)[0].toUpperCase()}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-xs truncate">{u.displayName || `@${u.username}`}</p>
                    {u.username && <p className="text-[10px] opacity-60 font-mono">@{u.username}</p>}
                  </div>
                </div>

                <button
                  onClick={() => navigate(`/user/${u.username || u.uid}`)}
                  className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 paper-btn-light"
                >
                  Ver Perfil
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: NOTIFICAÇÕES (APENAS PERFIL PRÓPRIO) */}
      {activeTab === "notifications" && isSelf && (
        <div className="space-y-3">
          {notifications.length === 0 ? (
            <div className="paper-card rounded-2xl p-8 text-center text-xs opacity-60">
              Você não possui novas notificações.
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className={`paper-card rounded-2xl p-4 flex items-center gap-4 ${n.status === "unread" ? "border-l-4 border-amber-500" : ""}`}>
                <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                  {n.type === "friend_request" ? <UserPlus className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold leading-snug">
                    <span className="text-amber-600 dark:text-amber-400">{n.senderName}</span> {n.message}
                  </p>
                  <p className="text-[10px] opacity-50 font-mono mt-1">
                    {new Date(n.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>

                {n.type === "friend_request" && n.requestId && (
                  <div className="flex items-center gap-2 shrink-0">
                    {(() => {
                      const requestStatus = friendRequestsMap[n.requestId] || "pending";
                      if (requestStatus === "accepted") {
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                              Aceita
                            </span>
                            <button
                              onClick={() => handleUndoFriendRequest(n.requestId!)}
                              className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-red-500 hover:bg-red-500/5 border border-red-500/10 transition-colors"
                            >
                              Desfazer
                            </button>
                          </div>
                        );
                      } else if (requestStatus === "rejected") {
                        return (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-red-500/70">
                            Recusada
                          </span>
                        );
                      } else {
                        return (
                          <>
                            <button
                              onClick={() => handleRespondFriendRequest(n.requestId!, "accepted")}
                              className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                            >
                              Aceitar
                            </button>
                            <button
                              onClick={() => handleRespondFriendRequest(n.requestId!, "rejected")}
                              className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider paper-btn-light"
                            >
                              Recusar
                            </button>
                          </>
                        );
                      }
                    })()}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* 4. SETTINGS MODAL */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl p-6 sm:p-8 relative my-8 paper-card">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-full paper-btn-light opacity-60 hover:opacity-100"
            >
              ✕
            </button>

            <h2 className="font-serif font-bold text-2xl mb-4">Configurações do Perfil</h2>

            {/* Modal Tabs */}
            <div className="flex border-b border-[#1A1A1A]/10 dark:border-white/10 gap-4 text-xs font-bold uppercase tracking-widest mb-6">
              <button
                onClick={() => setSettingsTab("profile")}
                className={`pb-2 border-b-2 transition-colors ${settingsTab === "profile" ? "border-[#1A1A1A] dark:border-[#F5F5F0]" : "border-transparent opacity-50"}`}
              >
                Dados Gerais
              </button>
              <button
                onClick={() => setSettingsTab("security")}
                className={`pb-2 border-b-2 transition-colors ${settingsTab === "security" ? "border-[#1A1A1A] dark:border-[#F5F5F0]" : "border-transparent opacity-50"}`}
              >
                Segurança & Senha
              </button>
            </div>

            {settingsError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-xs flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{settingsError}</span>
              </div>
            )}

            {settingsSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{settingsSuccess}</span>
              </div>
            )}

            {settingsTab === "profile" ? (
              <form onSubmit={handleSaveProfileSettings} className="space-y-4">
                {/* Profile Photo / Drive Upload Option */}
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">
                    Foto de Perfil (Drive ou Envio)
                  </label>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setUploadMethod("link")}
                      className={`px-3 py-1.5 text-[10px] font-bold rounded-lg ${uploadMethod === "link" ? "paper-btn-dark" : "paper-btn-light"}`}
                    >
                      <LinkIcon className="w-3 h-3 inline mr-1" /> Link do Google Drive / URL
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMethod("file")}
                      className={`px-3 py-1.5 text-[10px] font-bold rounded-lg ${uploadMethod === "file" ? "paper-btn-dark" : "paper-btn-light"}`}
                    >
                      <Upload className="w-3 h-3 inline mr-1" /> Enviar Arquivo
                    </button>
                  </div>

                  {uploadMethod === "link" ? (
                    <input
                      type="text"
                      value={editPhotoURL ?? ""}
                      onChange={(e) => setEditPhotoURL(e.target.value)}
                      placeholder="Cole o link compartilhado da foto no Google Drive ou URL de imagem..."
                      className="w-full px-4 py-2.5 text-xs rounded-xl focus:outline-none paper-card"
                    />
                  ) : (
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoFileUpload}
                      className="w-full text-xs text-opacity-70 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:paper-btn-dark"
                    />
                  )}
                  <p className="text-[10px] opacity-50 mt-1 flex items-center gap-1">
                    <FolderUp className="w-3 h-3" /> Para enviar via Google Drive, coloque o arquivo na sua pasta e compartilhe o link direto.
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Nome de Exibição</label>
                  <input
                    type="text"
                    value={editDisplayName ?? ""}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="w-full px-4 py-2.5 text-xs rounded-xl focus:outline-none paper-card"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Nome de Usuário (@)</label>
                  <input
                    type="text"
                    value={editUsername ?? ""}
                    onChange={(e) => setEditUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                    className="w-full px-4 py-2.5 text-xs rounded-xl focus:outline-none paper-card font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">E-mail Cadastrado</label>
                  <input
                    type="email"
                    value={editEmail ?? ""}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-4 py-2.5 text-xs rounded-xl focus:outline-none paper-card"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Biografia (Bio)</label>
                  <textarea
                    rows={3}
                    value={editBio ?? ""}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Escreva um pouco sobre seus gostos de leitura..."
                    className="w-full px-4 py-2.5 text-xs rounded-xl focus:outline-none paper-card"
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl paper-card">
                  <div>
                    <p className="text-xs font-bold">Histórico de Leitura Público</p>
                    <p className="text-[10px] opacity-60">Permite que visitantes vejam seu progresso no perfil.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={editIsHistoryPublic}
                    onChange={(e) => setEditIsHistoryPublic(e.target.checked)}
                    className="w-5 h-5 rounded accent-amber-500 cursor-pointer"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingSettings}
                  className="w-full py-3.5 rounded-full text-xs uppercase font-bold tracking-widest paper-btn-dark"
                >
                  {isSubmittingSettings ? "Salvando..." : "Salvar Alterações"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Senha Atual</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={currentPass || ""}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    className="w-full px-4 py-2.5 text-xs rounded-xl focus:outline-none paper-card"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Nova Senha</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPass || ""}
                    onChange={(e) => setNewPass(e.target.value)}
                    className="w-full px-4 py-2.5 text-xs rounded-xl focus:outline-none paper-card"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Confirmar Nova Senha</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmNewPass || ""}
                    onChange={(e) => setConfirmNewPass(e.target.value)}
                    className="w-full px-4 py-2.5 text-xs rounded-xl focus:outline-none paper-card"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingSettings}
                  className="w-full py-3.5 rounded-full text-xs uppercase font-bold tracking-widest paper-btn-dark"
                >
                  {isSubmittingSettings ? "Atualizando..." : "Alterar Senha"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
