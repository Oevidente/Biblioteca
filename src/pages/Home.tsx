import { useEffect, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { BookCoverImage } from "../components/BookCoverImage";
import { db, collection, query, orderBy, onSnapshot, doc, getDoc, setDoc, updateDoc, getDocs, deleteDoc, writeBatch } from "../lib/firebase";
import { BookOpen, Search, Heart, Clock, Library, Star, UserCheck, ListPlus, Download, Calendar, Plus, Trash2 } from "lucide-react";
import { useAuth, ADMIN_EMAIL } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { getCanonicalTag, getLocalizedTag } from "../lib/tagger";
import { getAllOfflineStories, OfflineStory, removeOfflineStory } from "../lib/offlineStorage";
import { fetchPublicPlaylists, ReadingList, createOrUpdatePlaylist, getLocalPlaylists, deleteLocalPlaylist, deletePlaylist, toggleStoryInPlaylist } from "../lib/playlists";
import { Check, Edit3, FolderPlus, X, ExternalLink } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Story {
  id: string;
  title: string;
  author?: string;
  coverImage: string;
  tags: string[];
  rating?: number;
  ratingsCount?: number;
  wordCount?: number;
  totalPages?: number;
  createdAt?: any;
  publicationDate?: string;
  scheduledReleaseAt?: string;
  authorUid?: string;
  isDraft?: boolean;
}

interface HistoryItem {
  id: string;
  title: string;
  coverImage?: string;
  page: number;
  totalPages: number;
  timestamp: string;
}

export function Home() {
  const { user, profile } = useAuth();
  const { t, language } = useLanguage();
  
  const [stories, setStories] = useState<Story[]>(() => {
    try {
      const cached = localStorage.getItem("inkora_cached_stories");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const [loading, setLoading] = useState(() => stories.length === 0);
  const [activeTab, setActiveTab] = useState<"library" | "history" | "favorites" | "playlists" | "offline">("library");
  
  // Filters and search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"recent" | "popular">("popular");
  
  const [favorites, setFavorites] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [offlineStories, setOfflineStories] = useState<OfflineStory[]>([]);
  const [playlists, setPlaylists] = useState<ReadingList[]>([]);
  
  // Playlist Modal State
  const [showCreatePlaylistModal, setShowCreatePlaylistModal] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");
  const [newPlaylistPublic, setNewPlaylistPublic] = useState(true);

  // Detailed Playlist View/Edit Modal State
  const [selectedPlaylistForDetail, setSelectedPlaylistForDetail] = useState<ReadingList | null>(null);
  const [showAddStoriesToPlaylistModal, setShowAddStoriesToPlaylistModal] = useState(false);
  const [playlistPickerSearch, setPlaylistPickerSearch] = useState("");

  // Story Card -> Playlist Selector Modal State
  const [storyForPlaylistModal, setStoryForPlaylistModal] = useState<Story | null>(null);

  // Load offline stories
  const loadOfflineData = async () => {
    try {
      const list = await getAllOfflineStories();
      setOfflineStories(list);
    } catch (e) {
      console.error("Error loading offline stories:", e);
    }
  };

  // Load playlists
  const loadPlaylistsData = async () => {
    try {
      const publicLists = await fetchPublicPlaylists();
      setPlaylists(publicLists);
    } catch (e) {
      console.error("Error loading playlists:", e);
    }
  };

  useEffect(() => {
    loadOfflineData();
    loadPlaylistsData();
  }, []);

  // Load stories real-time from Firestore
  useEffect(() => {
    const q = query(collection(db, "stories"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      const loaded: Story[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.isDraft) {
          // Do not display draft stories on public home catalog
          return;
        }
        loaded.push({
          id: docSnap.id,
          title: data.title,
          author: data.author,
          coverImage: data.coverImage,
          tags: data.tags || [],
          rating: data.rating || 0,
          ratingsCount: data.ratingsCount || 0,
          wordCount: data.wordCount,
          totalPages: data.totalPages,
          createdAt: data.createdAt,
          publicationDate: data.publicationDate || "",
          scheduledReleaseAt: data.scheduledReleaseAt || "",
          authorUid: data.authorUid,
          isDraft: data.isDraft || false
        });
      });
      setStories(loaded);
      setLoading(false);
      try {
        localStorage.setItem("inkora_cached_stories", JSON.stringify(loaded));
      } catch (e) {
        console.error("Cache save error", e);
      }
    }, (err) => {
      console.error("Failed to load stories", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Load user specific favorites and history
  useEffect(() => {
    async function loadUserData() {
      if (user) {
        // Load favorites from user profile in Firestore
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            if (Array.isArray(data.favorites)) {
              setFavorites(data.favorites);
              localStorage.setItem("favorites", JSON.stringify(data.favorites));
            }
          }
        } catch (e) {
          console.error("Error loading user favorites from Firestore:", e);
        }

        // Load progress history from Firestore
        try {
          const progSnap = await getDocs(collection(db, `users/${user.uid}/progress`));
          const firestoreHistory: HistoryItem[] = [];
          progSnap.forEach((docSnap) => {
            const data = docSnap.data();
            firestoreHistory.push({
              id: docSnap.id,
              title: data.storyTitle || "História",
              coverImage: data.coverImage || "",
              page: data.page || 0,
              totalPages: data.totalPages || 1,
              timestamp: data.updatedAt || new Date().toISOString()
            });
          });

          if (firestoreHistory.length > 0) {
            firestoreHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setHistory(firestoreHistory);
            localStorage.setItem("reading_history", JSON.stringify(firestoreHistory));
            return;
          }
        } catch (e) {
          console.error("Error loading user reading history from Firestore:", e);
        }
      }

      // Fallback to local storage if guest or no Firestore progress found
      try {
        const favs = localStorage.getItem("favorites");
        if (favs) setFavorites(JSON.parse(favs));
        
        const hist = localStorage.getItem("reading_history");
        if (hist) setHistory(JSON.parse(hist));
      } catch (e) {
        console.error(e);
      }
    }

    loadUserData();
  }, [user]);

  const toggleFavorite = async (e: MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    let newFavs: string[];
    if (favorites.includes(id)) {
      newFavs = favorites.filter(f => f !== id);
    } else {
      newFavs = [...favorites, id];
    }

    setFavorites(newFavs);
    localStorage.setItem("favorites", JSON.stringify(newFavs));

    // Sync to Firestore if user is logged in
    if (user) {
      try {
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, { favorites: newFavs }).catch(async () => {
          await setDoc(userRef, { favorites: newFavs }, { merge: true });
        });
      } catch (err) {
        console.error("Failed to update user favorites in Firestore:", err);
      }
    }
  };

  const handleRemoveFromHistory = async (storyId: string, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const updated = history.filter(item => item.id !== storyId);
    setHistory(updated);
    try {
      localStorage.setItem("reading_history", JSON.stringify(updated));
    } catch (err) {
      console.error("Error updating local reading history:", err);
    }

    if (user) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/progress`, storyId));
      } catch (err) {
        console.error("Error deleting reading progress from Firestore:", err);
      }
    }
  };

  const handleClearAllHistory = async () => {
    if (!confirm(t("confirmClearHistory"))) return;

    setHistory([]);
    try {
      localStorage.setItem("reading_history", JSON.stringify([]));
    } catch (err) {
      console.error("Error clearing local reading history:", err);
    }

    if (user) {
      try {
        const progSnap = await getDocs(collection(db, `users/${user.uid}/progress`));
        const batch = writeBatch(db);
        progSnap.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      } catch (err) {
        console.error("Error clearing reading history from Firestore:", err);
      }
    }
  };

  // Derive genres
  const canonicalGenres = new Set<string>();
  stories.forEach(s => {
    if (s.tags) {
      s.tags.forEach(t => canonicalGenres.add(getCanonicalTag(t)));
    }
  });
  const allGenres = ["All", ...Array.from(canonicalGenres).sort((a, b) => getLocalizedTag(a, language).localeCompare(getLocalizedTag(b, language)))].slice(0, 16);

  // Filter & Sort stories
  const filteredStories = stories.filter(story => {
    const isScheduledFuture = story.scheduledReleaseAt && new Date(story.scheduledReleaseAt).getTime() > Date.now();
    const isAdmin = profile?.role === "admin" || (user?.email || "").toLowerCase().trim() === ADMIN_EMAIL;
    const isAuthor = story.authorUid === user?.uid;
    
    if (isScheduledFuture && !isAdmin && !isAuthor) {
      return false; // Hide future-scheduled stories from general reader catalog
    }

    const matchSearch = story.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        (story.author && story.author.toLowerCase().includes(searchQuery.toLowerCase())) ||
                        story.tags.some(t => {
                          const canonical = getCanonicalTag(t);
                          const localized = getLocalizedTag(canonical, language);
                          return localized.toLowerCase().includes(searchQuery.toLowerCase()) || canonical.toLowerCase().includes(searchQuery.toLowerCase());
                        });
    const matchGenre = selectedGenre === "All" || story.tags.some(t => getCanonicalTag(t) === selectedGenre);
    return matchSearch && matchGenre;
  }).sort((a, b) => {
    if (sortBy === "popular") {
      const aAvg = a.ratingsCount ? a.rating! / a.ratingsCount : 0;
      const bAvg = b.ratingsCount ? b.rating! / b.ratingsCount : 0;
      return bAvg - aAvg;
    }
    return 0; // Default is already sorted by recent via Firestore
  });

  const renderSkeletonCard = (i: number) => (
    <div key={i} className="flex flex-col h-full animate-pulse">
      <div className="aspect-[2/3] w-full bg-[#EAE8E2] dark:bg-[#2A2A2A] rounded-[22px]"></div>
      <div className="mt-3 px-1 space-y-2">
        <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-3/4"></div>
        <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/2"></div>
      </div>
    </div>
  );

  const renderStoryCard = (story: Story) => {
    const isFav = favorites.includes(story.id);
    const avgRating = story.ratingsCount && story.ratingsCount > 0 
      ? (story.rating! / story.ratingsCount).toFixed(1) 
      : "0";
    
    const isScheduledFuture = story.scheduledReleaseAt && new Date(story.scheduledReleaseAt).getTime() > Date.now();
    
    return (
      <Link key={story.id} to={`/story/${story.id}`} className="group flex flex-col h-full">
        {/* Cover Image Container */}
        <div className="relative aspect-[2/3] w-full rounded-[22px] overflow-hidden transition-all duration-300 group-hover:-translate-y-1 paper-card">
          <BookCoverImage 
            src={story.coverImage} 
            alt={story.title} 
            title={story.title}
            className="w-full h-full object-cover rounded-[22px] transition-transform duration-300 group-hover:scale-105"
          />
          
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setStoryForPlaylistModal(story);
              }}
              className="p-2 rounded-full text-white paper-glass"
              title={t("addToPlaylist")}
            >
              <ListPlus className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={(e) => toggleFavorite(e, story.id)}
              className="p-2 rounded-full paper-glass"
              title={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            >
              <Heart className={cn("w-3.5 h-3.5 transition-transform hover:scale-110", isFav ? "fill-red-500 text-red-500" : "text-white")} />
            </button>
          </div>

          <div className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[10px] font-bold paper-glass">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {avgRating}
          </div>

          {isScheduledFuture && (
            <div className="absolute bottom-2.5 left-2.5 right-2.5 text-black px-2.5 py-1 rounded-xl text-[9px] font-bold uppercase tracking-widest flex items-center justify-center gap-1 paper-btn-amber opacity-90 backdrop-blur-md">
              <Calendar className="w-3 h-3" />
              <span>{t("isScheduledBadge")} ({new Date(story.scheduledReleaseAt!).toLocaleDateString()})</span>
            </div>
          )}
        </div>

        {/* Appendix Info Below Image */}
        <div className="mt-3 px-1 flex-1 flex flex-col justify-between">
          <div>
            <h3 className="font-serif font-bold text-base sm:text-lg line-clamp-2 leading-tight group-hover:opacity-80 transition-opacity">
              {story.title}
            </h3>
            {story.author && (
              <p className="text-[10px] uppercase font-bold tracking-widest opacity-60 mt-1 truncate flex items-center gap-1.5 flex-wrap">
                <Link 
                  to={story.authorUid ? `/profile/${story.authorUid}` : `/user/${story.author}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:underline hover:opacity-100 transition-opacity inline-flex items-center gap-1"
                >
                  {t("by")} {story.author}
                </Link>
                <span className="w-1 h-1 rounded-full bg-current opacity-40"></span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> 
                  {Math.ceil((story.wordCount || ((story.totalPages || 1) * 250)) / 250)} {t("readTime")}
                </span>
              </p>
            )}
            {(() => {
              let pubDateStr = story.publicationDate;
              if (!pubDateStr && story.createdAt) {
                try {
                  const d = story.createdAt.toDate ? story.createdAt.toDate() : new Date(story.createdAt);
                  pubDateStr = d.toISOString().split('T')[0];
                } catch (e) {}
              }
              if (pubDateStr) {
                return (
                  <p className="text-[8px] font-mono opacity-40 mt-1 uppercase tracking-wider">
                    {t("publishedOn")} {pubDateStr.split('-').reverse().join('/')}
                  </p>
                );
              }
              return null;
            })()}
          </div>
          {story.tags && story.tags.length > 0 && (() => {
            const displayTags = Array.from(new Set(story.tags.map(t => getCanonicalTag(t))))
                                     .map(c => getLocalizedTag(c, language))
                                     .slice(0, 4);
            return (
              <div className="flex flex-wrap gap-1 mt-2">
                {displayTags.map(tag => (
                  <span key={tag} className="text-[8px] bg-[#1A1A1A]/5 dark:bg-white/10 text-[#1A1A1A] dark:text-[#F5F5F0] px-2 py-0.5 rounded-md uppercase font-bold tracking-wider">
                    {tag}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
      </Link>
    );
  };

  return (
    <div className="pb-28 md:pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold tracking-tight">{t("archive")}</h1>
          <p className="opacity-60 text-xs sm:text-sm mt-1.5 font-serif">
            {user ? t("welcomeUser", { name: profile?.username ? `@${profile.username}` : (profile?.displayName || user.email?.split("@")[0] || "") }) : t("exploreStories")}
          </p>
        </div>
        
        {/* Navigation Tabs - Desktop Inline / Mobile iOS Floating Bottom Bar */}
        <div className="fixed bottom-3 left-3 right-3 z-40 md:static md:bottom-auto md:left-auto md:right-auto paper-card p-1 sm:p-1.5 rounded-2xl md:rounded-full shadow-2xl md:shadow-sm grid grid-cols-5 md:flex md:justify-start items-center gap-1">
          <button 
            onClick={() => setActiveTab("library")}
            className={cn(
              "flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-2 md:px-5 py-2 md:py-2.5 rounded-xl md:rounded-full text-[9px] md:text-[10px] uppercase font-bold tracking-wider md:tracking-widest transition-all", 
              activeTab === "library" ? "paper-btn-dark" : "paper-btn-light opacity-60 hover:opacity-100"
            )}
            title={t("library")}
            aria-label={t("library")}
          >
            <Library className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-[55px] md:max-w-none text-[8px] md:text-[10px]">{t("library")}</span>
          </button>
          <button 
            onClick={() => setActiveTab("history")}
            className={cn(
              "flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-2 md:px-5 py-2 md:py-2.5 rounded-xl md:rounded-full text-[9px] md:text-[10px] uppercase font-bold tracking-wider md:tracking-widest transition-all", 
              activeTab === "history" ? "paper-btn-dark" : "paper-btn-light opacity-60 hover:opacity-100"
            )}
            title={t("history")}
            aria-label={t("history")}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-[55px] md:max-w-none text-[8px] md:text-[10px]">{t("history")}</span>
          </button>
          <button 
            onClick={() => setActiveTab("favorites")}
            className={cn(
              "flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-2 md:px-5 py-2 md:py-2.5 rounded-xl md:rounded-full text-[9px] md:text-[10px] uppercase font-bold tracking-wider md:tracking-widest transition-all", 
              activeTab === "favorites" ? "paper-btn-dark" : "paper-btn-light opacity-60 hover:opacity-100"
            )}
            title={t("favorites")}
            aria-label={t("favorites")}
          >
            <Heart className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-[55px] md:max-w-none text-[8px] md:text-[10px]">{t("favorites")}</span>
          </button>
          <button 
            onClick={() => setActiveTab("playlists")}
            className={cn(
              "flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-2 md:px-5 py-2 md:py-2.5 rounded-xl md:rounded-full text-[9px] md:text-[10px] uppercase font-bold tracking-wider md:tracking-widest transition-all", 
              activeTab === "playlists" ? "paper-btn-dark" : "paper-btn-light opacity-60 hover:opacity-100"
            )}
            title={t("playlists")}
            aria-label={t("playlists")}
          >
            <ListPlus className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-[55px] md:max-w-none text-[8px] md:text-[10px]">{t("playlists")}</span>
          </button>
          <button 
            onClick={() => setActiveTab("offline")}
            className={cn(
              "flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-2 md:px-5 py-2 md:py-2.5 rounded-xl md:rounded-full text-[9px] md:text-[10px] uppercase font-bold tracking-wider md:tracking-widest transition-all", 
              activeTab === "offline" ? "paper-btn-dark" : "paper-btn-light opacity-60 hover:opacity-100"
            )}
            title={t("offlineMode")}
            aria-label={t("offlineMode")}
          >
            <Download className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-[55px] md:max-w-none text-[8px] md:text-[10px]">{t("offlineMode")}</span>
          </button>
        </div>
      </div>

      {activeTab === "library" && (
        <>
          <div className="mb-8 flex flex-col sm:flex-row gap-4 items-center">
            <div className="relative w-full sm:flex-1 md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
              <input 
                type="text" 
                placeholder={t("searchPlaceholder")} 
                value={searchQuery || ""}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-full focus:outline-none text-xs sm:text-sm paper-card"
              />
            </div>
            
            <div className="flex gap-3 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <select 
                value={selectedGenre}
                onChange={e => setSelectedGenre(e.target.value)}
                className="rounded-full px-4 py-3 text-[10px] font-bold uppercase tracking-widest focus:outline-none cursor-pointer paper-card"
              >
                {allGenres.map(g => <option key={g} value={g}>{g === "All" ? t("any") : getLocalizedTag(g, language)}</option>)}
              </select>
              
              <select 
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="rounded-full px-4 py-3 text-[10px] font-bold uppercase tracking-widest focus:outline-none cursor-pointer paper-card"
              >
                <option value="recent">{t("mostRecent")}</option>
                <option value="popular">{t("mostPopular")}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
            {loading && stories.length === 0 ? (
              [0, 1, 2, 3, 4].map(renderSkeletonCard)
            ) : (
              <>
                {filteredStories.map(renderStoryCard)}
                {filteredStories.length === 0 && (
                  <div className="col-span-full text-center py-20 opacity-50 font-serif border border-dashed border-[#1A1A1A]/20 dark:border-white/20 rounded-2xl">
                    {t("noStoriesFound")}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {activeTab === "favorites" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
          {stories.filter(s => favorites.includes(s.id)).map(renderStoryCard)}
          {favorites.length === 0 && (
            <div className="col-span-full text-center py-20 opacity-50 font-serif border border-dashed border-[#1A1A1A]/20 dark:border-white/20 rounded-2xl">
              {t("noFavoritesFound")}
            </div>
          )}
        </div>
      )}

      {activeTab === "history" && (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex justify-between items-center pb-2 border-b border-black/5 dark:border-white/5">
            <div>
              <h2 className="font-serif font-bold text-2xl">{t("history")}</h2>
              <p className="text-xs opacity-60 mt-0.5">{t("exploreArchive")}</p>
            </div>
            {history.length > 0 && (
              <button
                onClick={handleClearAllHistory}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all paper-btn-red"
                title={t("clearHistory")}
                aria-label={t("clearHistory")}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t("clearHistory")}</span>
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="text-center py-20 opacity-50 font-serif border border-dashed border-[#1A1A1A]/20 dark:border-white/20 rounded-2xl">
              {t("noHistoryFound")}
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((item, idx) => {
                const matchedStory = stories.find(s => s.id === item.id);
                const cover = item.coverImage || matchedStory?.coverImage;

                return (
                  <div 
                    key={`${item.id}-${idx}`} 
                    className="flex items-center justify-between gap-3 sm:gap-6 p-4 rounded-2xl hover:-translate-y-0.5 transition-all group paper-card"
                  >
                    <Link 
                      to={`/story/${item.id}`} 
                      className="flex items-center gap-3 sm:gap-5 flex-1 min-w-0"
                    >
                      <div className="w-14 sm:w-16 aspect-[2/3] h-auto bg-[#EAE8E2] dark:bg-[#2A2A2A] rounded-lg overflow-hidden shrink-0">
                        <BookCoverImage 
                          src={cover} 
                          alt={item.title} 
                          title={item.title} 
                          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" 
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-serif font-bold text-base sm:text-lg truncate group-hover:opacity-80 transition-opacity">{item.title}</h3>
                        <div className="flex items-center gap-2 sm:gap-3 mt-1.5 flex-wrap">
                          <span className="text-[10px] uppercase font-bold tracking-widest opacity-60">
                            {t("pageOf", { page: item.page + 1, total: item.totalPages })}
                          </span>
                          <span className="text-[10px] uppercase font-bold tracking-widest opacity-40">
                            {new Date(item.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </Link>

                    <div className="flex items-center gap-2 shrink-0">
                      <Link 
                        to={`/story/${item.id}`}
                        className="px-3 sm:px-4 py-2 rounded-full font-bold text-[9px] sm:text-[10px] uppercase tracking-widest paper-btn-dark shrink-0"
                      >
                        {t("continueReading")}
                      </Link>
                      <button
                        onClick={(e) => handleRemoveFromHistory(item.id, e)}
                        className="p-2 sm:p-2.5 rounded-full transition-all paper-btn-red shrink-0"
                        title={t("removeFromHistory")}
                        aria-label={t("removeFromHistory")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* PLAYLISTS TAB */}
      {activeTab === "playlists" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-serif font-bold text-2xl">{t("playlists")}</h2>
              <p className="text-xs opacity-60 mt-0.5">{t("publicPlaylists")}</p>
            </div>
            <button
              onClick={() => setShowCreatePlaylistModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest paper-btn-dark"
            >
              <Plus className="w-4 h-4" />
              <span>{t("createPlaylist")}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {playlists.length === 0 ? (
              <div className="col-span-full text-center py-16 opacity-50 font-serif border border-dashed border-[#1A1A1A]/20 dark:border-white/20 rounded-2xl">
                {t("emptyPlaylist")}
              </div>
            ) : (
              playlists.map((pl) => {
                const plStories = stories.filter(s => pl.storyIds.includes(s.id));
                return (
                  <div key={pl.id} className="p-5 rounded-2xl space-y-4 flex flex-col justify-between hover:-translate-y-0.5 transition-all paper-card">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h3 className="font-serif font-bold text-lg leading-tight">{pl.title}</h3>
                          <p className="text-xs opacity-60 line-clamp-2 mt-1">{pl.description || "Coleção de histórias selecionadas."}</p>
                        </div>
                        <span className="text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 paper-btn-light">
                          {t("storiesCount").replace("{count}", String(pl.storyIds.length))}
                        </span>
                      </div>

                      {/* Stacked Covers Preview */}
                      {plStories.length > 0 ? (
                        <div className="flex items-center gap-2 pt-1 overflow-x-auto py-1">
                          {plStories.slice(0, 4).map((s) => (
                            <div key={s.id} className="w-12 aspect-[2/3] rounded-lg overflow-hidden shrink-0 shadow-sm paper-card">
                              <BookCoverImage src={s.coverImage} alt={s.title} title={s.title} className="w-full h-full object-cover" />
                            </div>
                          ))}
                          {plStories.length > 4 && (
                          <div className="w-12 aspect-[2/3] rounded-lg flex items-center justify-center text-[10px] font-bold opacity-60 shrink-0 paper-card">
                            +{plStories.length - 4}
                          </div>
                          )}
                        </div>
                      ) : (
                        <div className="py-3 px-4 rounded-xl text-[11px] opacity-50 italic paper-card">
                          {t("emptyPlaylist")}
                        </div>
                      )}
                    </div>
                    
                    <div className="pt-3 border-t border-black/5 dark:border-white/5 space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider opacity-60">
                        <span>{t("by")} {pl.userName || "Leitor"}</span>
                        <span>{new Date(pl.createdAt).toLocaleDateString()}</span>
                      </div>
                      
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setSelectedPlaylistForDetail(pl)}
                          className="flex-1 py-2 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 paper-btn-dark"
                        >
                          <FolderPlus className="w-3.5 h-3.5" />
                          <span>{t("managePlaylist")}</span>
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`Deseja excluir a playlist "${pl.title}"?`)) {
                              await deletePlaylist(pl.id);
                              await loadPlaylistsData();
                            }
                          }}
                          className="p-2 rounded-xl transition-colors paper-btn-red"
                          title={t("deletePlaylist")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* OFFLINE MODE TAB */}
      {activeTab === "offline" && (
        <div className="space-y-6">
          <div>
            <h2 className="font-serif font-bold text-2xl">{t("savedOfflineStories")}</h2>
            <p className="text-xs opacity-60 mt-0.5">{t("offlineAvailable")}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {offlineStories.length === 0 ? (
              <div className="col-span-full text-center py-16 opacity-50 font-serif border border-dashed border-[#1A1A1A]/20 dark:border-white/20 rounded-2xl">
                Nenhuma história salva offline. Abra qualquer história no leitor e clique em "Baixar para Ler Offline".
              </div>
            ) : (
              offlineStories.map((item) => (
                <div key={item.id} className="p-4 rounded-2xl flex items-center gap-4 paper-card">
                  <div className="w-16 aspect-[2/3] bg-[#EAE8E2] dark:bg-[#2A2A2A] rounded-xl overflow-hidden shrink-0">
                    <BookCoverImage src={item.coverImage} alt={item.title} title={item.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif font-bold text-base truncate">{item.title}</h3>
                    <p className="text-[10px] opacity-60 uppercase font-bold tracking-widest mt-1">{item.totalPages} páginas salvas</p>
                    <div className="flex items-center gap-2 mt-3">
                      <Link 
                        to={`/story/${item.id}`} 
                        className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest paper-btn-dark"
                      >
                        Ler Offline
                      </Link>
                      <button 
                        onClick={async () => {
                          await removeOfflineStory(item.id);
                          await loadOfflineData();
                        }}
                        className="p-1.5 rounded-full transition-all paper-btn-red"
                        title={t("removeOffline")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* CREATE PLAYLIST MODAL */}
      {showCreatePlaylistModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4 paper-card">
            <h3 className="font-serif font-bold text-xl">{t("createPlaylist")}</h3>
            
            <div>
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("playlistTitle")}</label>
              <input 
                type="text" 
                value={newPlaylistTitle || ""} 
                onChange={(e) => setNewPlaylistTitle(e.target.value)}
                className="w-full p-3 text-xs rounded-xl focus:outline-none paper-card"
                placeholder="Ex: Melhores Romances de Fantasia"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("playlistDescription")}</label>
              <textarea 
                value={newPlaylistDesc || ""} 
                onChange={(e) => setNewPlaylistDesc(e.target.value)}
                className="w-full p-3 text-xs rounded-xl focus:outline-none h-20 paper-card"
                placeholder="Descrição opcional..."
              />
            </div>

            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="publicCheck"
                checked={newPlaylistPublic} 
                onChange={(e) => setNewPlaylistPublic(e.target.checked)}
                className="rounded border-black/20"
              />
              <label htmlFor="publicCheck" className="text-xs font-bold uppercase tracking-wider opacity-80 cursor-pointer">
                {t("isPublicList")}
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setShowCreatePlaylistModal(false)}
                className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest paper-btn-light"
              >
                {t("cancel")}
              </button>
              <button 
                onClick={async () => {
                  if (!newPlaylistTitle.trim()) return;
                  const newPl: ReadingList = {
                    id: `pl_${Date.now()}`,
                    title: newPlaylistTitle,
                    description: newPlaylistDesc,
                    userId: user?.uid || "guest",
                    userName: profile?.username ? `@${profile.username}` : (profile?.displayName || "Leitor"),
                    isPublic: newPlaylistPublic,
                    storyIds: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                  };
                  await createOrUpdatePlaylist(newPl);
                  setNewPlaylistTitle("");
                  setNewPlaylistDesc("");
                  setShowCreatePlaylistModal(false);
                  await loadPlaylistsData();
                }}
                className="px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest paper-btn-dark"
              >
                {t("saveChanges")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PLAYLIST DETAIL / MANAGE MODAL */}
      {selectedPlaylistForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-[#1A1A1A] w-full max-w-2xl rounded-2xl p-6 shadow-2xl border border-black/10 dark:border-white/10 space-y-6 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-start pb-4 border-b border-black/10 dark:border-white/10">
              <div>
                <span className="text-[9px] bg-blue-500/10 text-blue-600 dark:text-blue-300 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Playlist
                </span>
                <h2 className="font-serif font-bold text-2xl mt-1">{selectedPlaylistForDetail.title}</h2>
                <p className="text-xs opacity-60 mt-0.5">{selectedPlaylistForDetail.description || "Sem descrição."}</p>
                <p className="text-[10px] font-mono opacity-50 mt-1 uppercase">
                  {t("by")} {selectedPlaylistForDetail.userName} • {t("storiesCount").replace("{count}", String(selectedPlaylistForDetail.storyIds.length))}
                </p>
              </div>
              <button 
                onClick={() => setSelectedPlaylistForDetail(null)}
                className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Action Bar */}
            <div className="flex justify-between items-center gap-3">
              <h3 className="font-serif font-bold text-sm uppercase tracking-wider opacity-80">
                Histórias Incluídas ({selectedPlaylistForDetail.storyIds.length})
              </h3>
              <button
                onClick={() => {
                  setPlaylistPickerSearch("");
                  setShowAddStoriesToPlaylistModal(true);
                }}
                className="bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>{t("addStories")}</span>
              </button>
            </div>

            {/* Stories List inside Playlist */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar min-h-[200px]">
              {selectedPlaylistForDetail.storyIds.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-black/10 dark:border-white/10 rounded-xl space-y-3">
                  <p className="text-sm opacity-60 font-serif">{t("emptyPlaylist")}</p>
                  <button
                    onClick={() => {
                      setPlaylistPickerSearch("");
                      setShowAddStoriesToPlaylistModal(true);
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Adicionar Histórias Agora</span>
                  </button>
                </div>
              ) : (
                stories
                  .filter(s => selectedPlaylistForDetail.storyIds.includes(s.id))
                  .map(s => (
                    <div key={s.id} className="p-3 bg-[#F5F5F0] dark:bg-[#0A0A0A] rounded-xl border border-black/5 dark:border-white/5 flex items-center gap-3">
                      <div className="w-12 aspect-[2/3] bg-black/10 rounded-md overflow-hidden shrink-0">
                        <BookCoverImage src={s.coverImage} alt={s.title} title={s.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-serif font-bold text-sm truncate">{s.title}</h4>
                        <p className="text-[10px] opacity-60 uppercase font-bold tracking-wider mt-0.5 truncate">
                          {s.author ? `Por ${s.author}` : ""} {s.totalPages ? `• ${s.totalPages} págs` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link 
                          to={`/story/${s.id}`} 
                          className="p-2 bg-black/10 dark:bg-white/10 hover:bg-black/20 rounded-lg text-xs font-bold flex items-center gap-1"
                          title="Ler História"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          onClick={async () => {
                            const updated = await toggleStoryInPlaylist(selectedPlaylistForDetail, s.id);
                            setSelectedPlaylistForDetail(updated);
                            await loadPlaylistsData();
                          }}
                          className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg text-xs font-bold"
                          title="Remover desta playlist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-black/10 dark:border-white/10 flex justify-between items-center">
              <button
                onClick={async () => {
                  if (confirm(`Excluir a playlist "${selectedPlaylistForDetail.title}"?`)) {
                    await deletePlaylist(selectedPlaylistForDetail.id);
                    setSelectedPlaylistForDetail(null);
                    await loadPlaylistsData();
                  }
                }}
                className="text-xs text-red-500 font-bold uppercase tracking-wider flex items-center gap-1 hover:underline"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Playlist</span>
              </button>
              <button
                onClick={() => setSelectedPlaylistForDetail(null)}
                className="bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest"
              >
                Concluído
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STORY PICKER MODAL (Inside Playlist Detail) */}
      {showAddStoriesToPlaylistModal && selectedPlaylistForDetail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-[#1A1A1A] w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-black/10 dark:border-white/10 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center pb-2 border-b border-black/10 dark:border-white/10">
              <div>
                <h3 className="font-serif font-bold text-lg">{t("selectStoriesToAdd")}</h3>
                <p className="text-[11px] opacity-60">{selectedPlaylistForDetail.title}</p>
              </div>
              <button 
                onClick={() => setShowAddStoriesToPlaylistModal(false)}
                className="p-1.5 rounded-full opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 opacity-40" />
              <input 
                type="text" 
                value={playlistPickerSearch || ""}
                onChange={(e) => setPlaylistPickerSearch(e.target.value)}
                placeholder="Buscar histórias por título ou autor..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-black/10 dark:border-white/10 rounded-xl focus:outline-none"
              />
            </div>

            {/* List of Library Stories */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-[220px]">
              {stories
                .filter(s => {
                  if (!playlistPickerSearch.trim()) return true;
                  const q = playlistPickerSearch.toLowerCase();
                  return s.title.toLowerCase().includes(q) || (s.author && s.author.toLowerCase().includes(q));
                })
                .map(s => {
                  const isIncluded = selectedPlaylistForDetail.storyIds.includes(s.id);
                  return (
                    <div key={s.id} className="p-2.5 bg-[#F5F5F0] dark:bg-[#0A0A0A] rounded-xl border border-black/5 dark:border-white/5 flex items-center gap-3">
                      <div className="w-10 aspect-[2/3] bg-black/10 rounded-md overflow-hidden shrink-0">
                        <BookCoverImage src={s.coverImage} alt={s.title} title={s.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-serif font-bold text-xs truncate">{s.title}</h4>
                        <p className="text-[10px] opacity-50 truncate">{s.author || "Autor desconhecido"}</p>
                      </div>
                      <button
                        onClick={async () => {
                          const updated = await toggleStoryInPlaylist(selectedPlaylistForDetail, s.id);
                          setSelectedPlaylistForDetail(updated);
                          await loadPlaylistsData();
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 shrink-0",
                          isIncluded 
                            ? "bg-emerald-500 text-white shadow-sm" 
                            : "bg-black/10 dark:bg-white/10 hover:bg-black/20 text-black dark:text-white"
                        )}
                      >
                        {isIncluded ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Incluída</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            <span>Incluir</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
            </div>

            <div className="pt-2 border-t border-black/10 dark:border-white/10 flex justify-end">
              <button 
                onClick={() => setShowAddStoriesToPlaylistModal(false)}
                className="bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest"
              >
                Concluído
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STORY CARD -> PLAYLIST SELECTOR MODAL */}
      {storyForPlaylistModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-[#1A1A1A] w-full max-w-md rounded-2xl p-6 shadow-2xl border border-black/10 dark:border-white/10 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-black/5 dark:border-white/5">
              <div>
                <h3 className="font-serif font-bold text-lg flex items-center gap-2">
                  <ListPlus className="w-5 h-5 text-blue-500" />
                  <span>{t("addToPlaylist")}</span>
                </h3>
                <p className="text-[11px] opacity-60 truncate max-w-[280px]">{storyForPlaylistModal.title}</p>
              </div>
              <button 
                onClick={() => setStoryForPlaylistModal(null)}
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
                  const inPlaylist = pl.storyIds.includes(storyForPlaylistModal.id);
                  return (
                    <div 
                      key={pl.id} 
                      className="p-3 bg-[#F5F5F0] dark:bg-[#0A0A0A] rounded-xl flex items-center justify-between border border-black/5 dark:border-white/5"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <h4 className="font-serif font-bold text-xs truncate">{pl.title}</h4>
                        <p className="text-[10px] opacity-50 font-mono">{t("storiesCount").replace("{count}", String(pl.storyIds.length))}</p>
                      </div>
                      <button
                        onClick={async () => {
                          const updated = await toggleStoryInPlaylist(pl, storyForPlaylistModal.id);
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

            {/* Quick Inline New Playlist */}
            <div className="pt-2 border-t border-black/5 dark:border-white/5 space-y-2">
              <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60">{t("createPlaylist")}</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newPlaylistTitle || ""}
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
                      storyIds: [storyForPlaylistModal.id],
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    };
                    await createOrUpdatePlaylist(newPl);
                    setNewPlaylistTitle("");
                    await loadPlaylistsData();
                  }}
                  className="bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider shrink-0"
                >
                  Criar & Incluir
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button 
                onClick={() => setStoryForPlaylistModal(null)}
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
