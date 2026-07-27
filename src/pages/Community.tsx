/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, UserProfile } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { formatCoverUrl } from "../utils/imageUtils";
import { 
  searchUsers, 
  fetchGlobalActivities, 
  ActivityItem 
} from "../lib/social";
import { 
  Search, 
  Users, 
  Sparkles, 
  Clock, 
  BookOpen, 
  Feather, 
  Library, 
  User as UserIcon,
  RefreshCw
} from "lucide-react";

export function Community() {
  const { profile: currentUserProfile } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Search States
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Global Activities Feed States
  const [globalActivities, setGlobalActivities] = useState<ActivityItem[]>([]);
  const [loadingGlobalActivities, setLoadingGlobalActivities] = useState(false);

  // Sync searchQuery from URL parameters on mount/change
  useEffect(() => {
    const qFromUrl = searchParams.get("q");
    if (qFromUrl !== null && qFromUrl !== searchQuery) {
      setSearchQuery(qFromUrl);
    }
  }, [searchParams]);

  // Load global activity mural data
  const loadGlobalActivitiesData = async () => {
    setLoadingGlobalActivities(true);
    const activitiesData = await fetchGlobalActivities();
    setGlobalActivities(activitiesData);
    setLoadingGlobalActivities(false);
  };

  // Perform search / Load initial activities
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      loadGlobalActivitiesData();
      // Remove 'q' param if empty
      const params = new URLSearchParams(searchParams);
      params.delete("q");
      setSearchParams(params, { replace: true });
    } else {
      let isCancelled = false;
      setIsSearching(true);
      searchUsers(searchQuery, currentUserProfile?.uid).then((results) => {
        if (!isCancelled) {
          setSearchResults(results);
          setIsSearching(false);
        }
      });
      return () => { isCancelled = true; };
    }
  }, [searchQuery, currentUserProfile?.uid]);

  const handleUserSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    // Update URL query parameters
    const params = new URLSearchParams(searchParams);
    params.set("q", searchQuery.trim());
    setSearchParams(params);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    const params = new URLSearchParams(searchParams);
    params.delete("q");
    setSearchParams(params);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-12">
      {/* 1. COMMUNITY HERO HEADER */}
      <div className="relative rounded-3xl overflow-hidden paper-card p-6 sm:p-8 md:p-10 shadow-lg">
        {/* Decorative Cover Accent */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-r from-amber-500/20 via-indigo-500/20 to-purple-500/20 dark:from-amber-500/10 dark:via-indigo-500/10 dark:to-purple-500/10 border-b border-[#1A1A1A]/5 dark:border-white/5" />
        
        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-end gap-6 pt-8">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shadow-md shrink-0 border border-amber-500/10">
            <Users className="w-8 h-8" />
          </div>
          <div className="flex-1 text-center sm:text-left space-y-1">
            <h1 className="font-serif font-bold text-2xl sm:text-3xl tracking-tight">Comunidade Inkora</h1>
            <p className="text-xs sm:text-sm opacity-80 max-w-2xl leading-relaxed">
              Descubra o que outros leitores estão lendo, explore novas playlists literárias, acompanhe as avaliações e conecte-se com a comunidade.
            </p>
          </div>
        </div>
      </div>

      {/* 2. SEARCH BAR CONTAINER */}
      <div className="paper-card rounded-2xl p-4 sm:p-6 shadow-sm border border-black/5 dark:border-white/5">
        <form onSubmit={handleUserSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 opacity-40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar leitores por nome ou @usuario..."
              className="w-full pl-11 pr-4 py-3 rounded-2xl text-xs focus:outline-none paper-card border border-black/5 dark:border-white/5 bg-[#1A1A1A]/5 dark:bg-white/5"
            />
          </div>
          <div className="flex gap-2 shrink-0">
            {searchQuery.trim() && (
              <button 
                type="button" 
                onClick={handleClearSearch} 
                className="flex-1 sm:flex-none px-4 py-3 rounded-2xl text-xs font-bold paper-btn-light border border-black/10 dark:border-white/10"
              >
                Limpar
              </button>
            )}
            <button 
              type="submit" 
              disabled={isSearching} 
              className="flex-1 sm:flex-none px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest paper-btn-dark shadow-sm"
            >
              {isSearching ? "Buscando..." : "Buscar"}
            </button>
          </div>
        </form>
      </div>

      {/* 3. MAIN SECTION: SEARCH RESULTS vs MURAL FEED */}
      {searchQuery.trim() ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-serif font-bold text-lg">Leitores Encontrados</h3>
            <button 
              onClick={handleClearSearch} 
              className="text-xs opacity-60 hover:opacity-100 font-bold uppercase tracking-widest border-b border-current pb-0.5"
            >
              Voltar ao Mural
            </button>
          </div>

          {isSearching ? (
            <div className="text-center py-16 paper-card rounded-2xl border border-black/5 dark:border-white/5">
              <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-xs uppercase font-bold tracking-widest opacity-60">Buscando leitores na comunidade...</p>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {searchResults.map((u) => (
                <div 
                  key={u.uid} 
                  className="paper-card rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm hover:border-amber-500/40 dark:hover:border-amber-400/40 transition-all duration-300"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div 
                      onClick={() => navigate(u.username ? `/user/${u.username}` : `/profile/${u.uid}`)}
                      className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center font-serif font-bold overflow-hidden shrink-0 border border-black/10 dark:border-white/10 cursor-pointer hover:scale-105 transition-transform"
                    >
                      {u.photoURL ? (
                        <img 
                          src={formatCoverUrl(u.photoURL)} 
                          alt={u.displayName || u.username} 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <span className="text-sm">
                          {(u.displayName || u.username || u.email || "U")[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button 
                          onClick={() => navigate(u.username ? `/user/${u.username}` : `/profile/${u.uid}`)}
                          className="font-bold text-xs truncate text-left hover:underline"
                        >
                          {u.displayName || `@${u.username}`}
                        </button>
                        <span className={`px-2 py-0.5 rounded-full text-[8px] uppercase font-bold tracking-widest shrink-0 ${
                          u.role === "admin" 
                            ? "bg-purple-500/20 text-purple-700 dark:text-purple-300"
                            : u.role === "author"
                            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                            : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                        }`}>
                          {u.role === "admin" ? "Admin" : u.role === "author" ? "Autor" : "Leitor"}
                        </span>
                      </div>
                      {u.username && <p className="text-[10px] opacity-60 font-mono">@{u.username}</p>}
                      {u.bio && <p className="text-[10px] opacity-70 line-clamp-1 mt-0.5">{u.bio}</p>}
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(u.username ? `/user/${u.username}` : `/profile/${u.uid}`)}
                    className="px-3.5 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 paper-btn-dark flex items-center gap-1.5 hover:scale-105 transition-transform"
                  >
                    <UserIcon className="w-3 h-3" />
                    <span>Ver Perfil</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 paper-card rounded-2xl space-y-3 border border-black/5 dark:border-white/5 animate-in fade-in">
              <Users className="w-8 h-8 mx-auto opacity-40 text-amber-500/60" />
              <p className="text-xs uppercase font-bold tracking-widest opacity-60">Nenhum leitor encontrado com essa busca.</p>
              <button 
                onClick={handleClearSearch}
                className="text-xs font-bold uppercase tracking-widest border-b border-current pt-2 hover:opacity-80"
              >
                Voltar ao Mural de Novidades
              </button>
            </div>
          )}
        </div>
      ) : (
        /* MURAL FEED / GLOBAL ACTIVITIES */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif font-bold text-lg">Mural de Atividades</h3>
              <p className="text-[11px] opacity-65">Acompanhe as últimas atualizações de outros leitores no Inkora</p>
            </div>
            <button 
              onClick={loadGlobalActivitiesData}
              disabled={loadingGlobalActivities}
              className="text-[10px] font-bold uppercase tracking-widest paper-btn-light px-3.5 py-2 rounded-full border border-black/10 dark:border-white/10 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3 h-3 ${loadingGlobalActivities ? "animate-spin" : ""}`} />
              <span>{loadingGlobalActivities ? "Atualizando..." : "Atualizar"}</span>
            </button>
          </div>

          {loadingGlobalActivities && globalActivities.length === 0 ? (
            <div className="text-center py-20 paper-card rounded-2xl space-y-4 border border-black/5 dark:border-white/5">
              <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs font-serif opacity-60">Carregando novidades da comunidade...</p>
            </div>
          ) : globalActivities.length === 0 ? (
            <div className="text-center py-16 paper-card rounded-2xl space-y-3 border border-black/5 dark:border-white/5">
              <Sparkles className="w-8 h-8 mx-auto text-amber-500/60 animate-pulse" />
              <p className="text-xs uppercase font-bold tracking-widest opacity-65">Tudo silencioso no mural.</p>
              <p className="text-[11px] opacity-55 max-w-xs mx-auto">
                Seja o primeiro a favoritar uma história, criar uma playlist ou avaliar para iniciar o mural!
              </p>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in duration-300">
              {globalActivities.map((act, i) => (
                <div 
                  key={act.id || i} 
                  className="paper-card rounded-2xl p-5 flex gap-4 items-start border-l-4 border-amber-500/30 dark:border-amber-400/30 hover:border-amber-500 dark:hover:border-amber-400 transition-all duration-300 shadow-sm"
                >
                  {/* USER AVATAR */}
                  <button 
                    onClick={() => navigate(act.userUsername ? `/user/${act.userUsername}` : `/profile/${act.uid}`)}
                    className="w-11 h-11 rounded-full bg-amber-500/10 flex items-center justify-center font-serif font-bold overflow-hidden shrink-0 border border-black/5 dark:border-white/5 hover:scale-105 transition-transform"
                  >
                    {act.userPhoto ? (
                      <img 
                        src={formatCoverUrl(act.userPhoto)} 
                        alt={act.userName} 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer" 
                      />
                    ) : (
                      <span className="text-sm">{(act.userName || "U")[0].toUpperCase()}</span>
                    )}
                  </button>

                  {/* POST BODY */}
                  <div className="flex-1 min-w-0">
                    {/* USERNAME HEADER */}
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <button 
                        onClick={() => navigate(act.userUsername ? `/user/${act.userUsername}` : `/profile/${act.uid}`)}
                        className="font-bold text-xs hover:underline text-left"
                      >
                        {act.userName}
                      </button>
                      {act.userUsername && (
                        <span className="text-[10px] opacity-50 font-mono">@{act.userUsername}</span>
                      )}
                    </div>

                    {/* ACTIVITY DESCRIPTION */}
                    <p className="text-xs font-medium text-[#1A1A1A] dark:text-[#F5F5F0] mt-1.5 leading-relaxed">
                      {act.title}
                    </p>

                    {/* DETAILS BLOCK FOR COMMENTS / SAVES */}
                    {act.details && (
                      <div className="mt-2.5 text-[11px] italic opacity-80 pl-3 border-l-2 border-amber-500/30 dark:border-amber-400/30 py-0.5 bg-[#1A1A1A]/5 dark:bg-white/5 rounded-r-lg pr-2 max-w-prose">
                        "{act.details}"
                      </div>
                    )}

                    {/* RELEVANT CALL-TO-ACTIONS */}
                    {act.targetId && (
                      <div className="mt-3 flex gap-2 flex-wrap">
                        {act.type === "published" && act.targetId.startsWith("pl_") ? (
                          <button 
                            onClick={() => { navigate("/"); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                          >
                            <Library className="w-3.5 h-3.5" />
                            <span>Ver Playlists</span>
                          </button>
                        ) : (
                          <button 
                            onClick={() => { navigate(`/story/${act.targetId}`); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Ler História</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* DATE FOOTER */}
                    <div className="flex items-center gap-1 mt-3.5 text-[9px] opacity-40 font-mono">
                      <Clock className="w-3 h-3" />
                      <span>
                        {new Date(act.createdAt).toLocaleDateString("pt-BR", { 
                          day: "2-digit", 
                          month: "short", 
                          hour: "2-digit", 
                          minute: "2-digit" 
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
