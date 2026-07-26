import { useEffect, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { BookCoverImage } from "../components/BookCoverImage";
import { db, collection, query, orderBy, onSnapshot, doc, getDoc, setDoc, updateDoc, getDocs } from "../lib/firebase";
import { BookOpen, Search, Heart, Clock, Library, Star, UserCheck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { getCanonicalTag, getLocalizedTag } from "../lib/tagger";
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
      const cached = localStorage.getItem("luminary_cached_stories");
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
  const [activeTab, setActiveTab] = useState<"library" | "history" | "favorites">("library");
  
  // Filters and search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"recent" | "popular">("popular");
  
  const [favorites, setFavorites] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Load stories real-time from Firestore
  useEffect(() => {
    const q = query(collection(db, "stories"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      const loaded: Story[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
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
          publicationDate: data.publicationDate || ""
        });
      });
      setStories(loaded);
      setLoading(false);
      try {
        localStorage.setItem("luminary_cached_stories", JSON.stringify(loaded));
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
    
    return (
      <Link key={story.id} to={`/story/${story.id}`} className="group flex flex-col h-full">
        {/* Cover Image Container */}
        <div className="relative aspect-[2/3] w-full bg-[#EAE8E2] dark:bg-[#2A2A2A] rounded-[22px] overflow-hidden shadow-sm border border-black/5 dark:border-white/5 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-md">
          <BookCoverImage 
            src={story.coverImage} 
            alt={story.title} 
            title={story.title}
            className="w-full h-full object-cover rounded-[22px] transition-transform duration-300 group-hover:scale-105"
          />
          
          <button 
            onClick={(e) => toggleFavorite(e, story.id)}
            className="absolute top-2.5 right-2.5 p-2 bg-black/40 backdrop-blur-md rounded-full hover:bg-black/60 transition-colors z-10"
            title={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          >
            <Heart className={cn("w-3.5 h-3.5 transition-transform hover:scale-110", isFav ? "fill-red-500 text-red-500" : "text-white")} />
          </button>

          <div className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full text-white text-[10px] font-bold">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {avgRating}
          </div>
        </div>

        {/* Appendix Info Below Image */}
        <div className="mt-3 px-1 flex-1 flex flex-col justify-between">
          <div>
            <h3 className="font-serif font-bold text-base sm:text-lg line-clamp-2 leading-tight group-hover:opacity-80 transition-opacity">
              {story.title}
            </h3>
            {story.author && (
              <p className="text-[10px] uppercase font-bold tracking-widest opacity-60 mt-1 truncate flex items-center gap-1.5 flex-wrap">
                <span>{t("by")} {story.author}</span>
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
        
        {/* Navigation Tabs - Desktop Inline / Mobile iOS Bottom Bar */}
        <div className="fixed bottom-3 left-3 right-3 z-40 md:static md:bottom-auto md:left-auto md:right-auto bg-white/90 dark:bg-[#0A0A0A]/90 backdrop-blur-xl border border-[#1A1A1A]/15 dark:border-white/15 p-1.5 rounded-full shadow-lg md:shadow-sm flex justify-around md:justify-start items-center">
          <button 
            onClick={() => setActiveTab("library")}
            className={cn("flex items-center justify-center gap-2 px-5 md:px-5 py-2.5 rounded-full text-[10px] uppercase font-bold tracking-widest whitespace-nowrap transition-all", activeTab === "library" ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] shadow-sm" : "opacity-60 hover:opacity-100")}
            title={t("library")}
            aria-label={t("library")}
          >
            <Library className="w-5 h-5 md:w-4 md:h-4" />
            <span className="hidden md:inline">{t("library")}</span>
          </button>
          <button 
            onClick={() => setActiveTab("history")}
            className={cn("flex items-center justify-center gap-2 px-5 md:px-5 py-2.5 rounded-full text-[10px] uppercase font-bold tracking-widest whitespace-nowrap transition-all", activeTab === "history" ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] shadow-sm" : "opacity-60 hover:opacity-100")}
            title={t("history")}
            aria-label={t("history")}
          >
            <Clock className="w-5 h-5 md:w-4 md:h-4" />
            <span className="hidden md:inline">{t("history")}</span>
          </button>
          <button 
            onClick={() => setActiveTab("favorites")}
            className={cn("flex items-center justify-center gap-2 px-5 md:px-5 py-2.5 rounded-full text-[10px] uppercase font-bold tracking-widest whitespace-nowrap transition-all", activeTab === "favorites" ? "bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] shadow-sm" : "opacity-60 hover:opacity-100")}
            title={t("favorites")}
            aria-label={t("favorites")}
          >
            <Heart className="w-5 h-5 md:w-4 md:h-4" />
            <span className="hidden md:inline">{t("favorites")}</span>
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
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-full focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white text-xs sm:text-sm shadow-sm"
              />
            </div>
            
            <div className="flex gap-3 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <select 
                value={selectedGenre}
                onChange={e => setSelectedGenre(e.target.value)}
                className="bg-white dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-full px-4 py-3 text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] shadow-sm"
              >
                {allGenres.map(g => <option key={g} value={g}>{g === "All" ? t("any") : getLocalizedTag(g, language)}</option>)}
              </select>
              
              <select 
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="bg-white dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-full px-4 py-3 text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] shadow-sm"
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
        <div className="max-w-3xl mx-auto space-y-4">
          {history.length === 0 ? (
            <div className="text-center py-20 opacity-50 font-serif border border-dashed border-[#1A1A1A]/20 dark:border-white/20 rounded-2xl">
              {t("noHistoryFound")}
            </div>
          ) : (
            history.map((item, idx) => {
              const matchedStory = stories.find(s => s.id === item.id);
              const cover = item.coverImage || matchedStory?.coverImage;

              return (
                <Link 
                  key={`${item.id}-${idx}`} 
                  to={`/story/${item.id}`} 
                  className="flex items-center gap-4 sm:gap-6 p-4 bg-white dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-2xl hover:border-[#1A1A1A]/30 transition-all group shadow-sm"
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
                    <h3 className="font-serif font-bold text-base sm:text-lg truncate">{item.title}</h3>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] uppercase font-bold tracking-widest opacity-60">
                        {t("pageOf", { page: item.page + 1, total: item.totalPages })}
                      </span>
                      <span className="text-[10px] uppercase font-bold tracking-widest opacity-40">
                        {new Date(item.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <span className="bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] px-3.5 py-2 rounded-full font-bold text-[9px] sm:text-[10px] uppercase tracking-widest">
                      {t("continueReading")}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
