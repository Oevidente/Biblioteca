import { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { User as UserIcon, Menu, X, LogIn, LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { AuthModal } from "./AuthModal";
import favicon from "../img/favicon.png";

function FlagIcon({ lang, className = "w-5 h-3.5 shadow-sm rounded-sm overflow-hidden shrink-0" }: { lang: string; className?: string }) {
  if (lang === "pt") {
    return (
      <svg className={className} viewBox="0 0 30 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="30" height="20" fill="#009739" />
        <path d="M 15 2 L 27 10 L 15 18 L 3 10 Z" fill="#FEDF00" />
        <circle cx="15" cy="10" r="4.2" fill="#002776" />
        <path d="M 10.8 11.2 Q 15 8.5 19.2 11.2" fill="none" stroke="#FFFFFF" strokeWidth="0.8" />
      </svg>
    );
  }
  if (lang === "en") {
    return (
      <svg className={className} viewBox="0 0 30 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="30" height="20" fill="#FFFFFF" stroke="#CCCCCC" strokeWidth="0.2" />
        <rect x="13" width="4" height="20" fill="#CE1124" />
        <rect y="8" width="30" height="4" fill="#CE1124" />
      </svg>
    );
  }
  if (lang === "es") {
    return (
      <svg className={className} viewBox="0 0 30 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="30" height="5" fill="#AA151B" />
        <rect y="5" width="30" height="10" fill="#F1BF00" />
        <rect y="15" width="30" height="5" fill="#AA151B" />
        <rect x="6" y="7" width="2" height="4" fill="#AA151B" opacity="0.8" rx="0.5" />
      </svg>
    );
  }
  if (lang === "id") {
    return (
      <svg className={className} viewBox="0 0 30 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="30" height="10" fill="#FF0000" />
        <rect y="10" width="30" height="10" fill="#FFFFFF" stroke="#CCCCCC" strokeWidth="0.2" />
      </svg>
    );
  }
  if (lang === "zh") {
    return (
      <svg className={className} viewBox="0 0 30 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="30" height="20" fill="#DE2910" />
        <polygon points="5,2 6.2,5.7 2.5,3.4 7.5,3.4 3.8,5.7" fill="#FFDE00" />
        <polygon points="10,1.5 10.4,2.5 9.5,1.9 10.8,1.9 9.9,2.5" fill="#FFDE00" />
        <polygon points="12,3.5 12.4,4.5 11.5,3.9 12.8,3.9 11.9,4.5" fill="#FFDE00" />
        <polygon points="12,6.5 12.4,7.5 11.5,6.9 12.8,6.9 11.9,7.5" fill="#FFDE00" />
        <polygon points="10,8.5 10.4,9.5 9.5,8.9 10.8,8.9 9.9,9.5" fill="#FFDE00" />
      </svg>
    );
  }
  return null;
}

export function Layout() {
  const { user, profile, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalInitialMode, setAuthModalInitialMode] = useState<"login" | "register" | "forgot" | "profile">("login");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const openAuth = (mode: "login" | "register" | "forgot" | "profile" = "login") => {
    setAuthModalInitialMode(mode);
    setAuthModalOpen(true);
  };

  useEffect(() => {
    const handleOpenAuth = (e: Event) => {
      const customEvent = e as CustomEvent<{ mode?: "login" | "register" | "forgot" | "profile" }>;
      openAuth(customEvent.detail?.mode || "login");
    };
    window.addEventListener("open-auth-modal", handleOpenAuth);
    return () => window.removeEventListener("open-auth-modal", handleOpenAuth);
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F5F0] dark:bg-[#1A1A1A] text-[#1A1A1A] dark:text-[#F5F5F0] font-sans transition-colors duration-300 flex flex-col">
      <header className="flex justify-between items-center px-4 sm:px-6 md:px-16 pt-6 sm:pt-8 md:pt-10 pb-6 w-full max-w-[1400px] mx-auto border-b border-[#1A1A1A]/5 dark:border-white/5">
        <div className="flex items-center space-x-3">
          <Link to="/" className="w-10 h-10 flex items-center justify-center rounded-full overflow-hidden shadow-sm hover:scale-105 transition-transform shrink-0">
            <img src={favicon} alt="INKORA Logo" className="w-full h-full object-cover" />
          </Link>
          <Link to="/" className="flex flex-col">
            <h1 className="font-sans text-xs font-bold tracking-[0.2em] uppercase opacity-90">{t("appBrand")}</h1>
            <span className="text-[9px] font-mono opacity-40 uppercase tracking-widest hidden sm:inline">{t("bthDigital")}</span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-6 md:space-x-8">
          <Link 
            to="/" 
            className={`text-[11px] font-bold tracking-widest uppercase transition-opacity ${
              location.pathname === "/" ? "border-b-2 border-[#1A1A1A] dark:border-[#F5F5F0] pb-1 opacity-100" : "opacity-60 hover:opacity-100"
            }`}
          >
            {t("library")}
          </Link>

          <Link 
            to="/community" 
            className={`text-[11px] font-bold tracking-widest uppercase transition-opacity ${
              location.pathname === "/community" ? "border-b-2 border-[#1A1A1A] dark:border-[#F5F5F0] pb-1 opacity-100" : "opacity-60 hover:opacity-100"
            }`}
          >
            {t("community")}
          </Link>

          {(profile?.role === 'admin' || profile?.role === 'author') && (
            <Link 
              to="/admin" 
              className={`text-[11px] font-bold tracking-widest uppercase transition-opacity ${
                location.pathname === "/admin" ? "border-b-2 border-[#1A1A1A] dark:border-[#F5F5F0] pb-1 opacity-100" : "opacity-60 hover:opacity-100"
              }`}
            >
              {t("admin")}
            </Link>
          )}

          {/* Language Selector */}
          <div className="flex items-center gap-2">
            <FlagIcon lang={language} />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as any)}
              className="rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest focus:outline-none cursor-pointer paper-card"
              aria-label={t("language")}
              title={t("language")}
            >
              <option value="pt" className="bg-white dark:bg-[#1A1A1A]">Português</option>
              <option value="es" className="bg-white dark:bg-[#1A1A1A]">Español</option>
              <option value="en" className="bg-white dark:bg-[#1A1A1A]">English</option>
              <option value="id" className="bg-white dark:bg-[#1A1A1A]">Indonesia</option>
              <option value="zh" className="bg-white dark:bg-[#1A1A1A]">中文 (Chinese)</option>
            </select>
          </div>



          {/* User Auth Button & Profile Nav */}
          {user ? (
            <div className="flex items-center gap-3">
              <Link
                to="/profile"
                className="flex items-center gap-2 px-4 py-2 rounded-full font-bold text-[10px] uppercase tracking-widest transition-all paper-btn-dark shadow-sm hover:scale-105"
                title="Meu Perfil Social"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span className="max-w-[120px] truncate">{profile?.username ? `@${profile.username}` : (profile?.displayName || user.email?.split("@")[0])}</span>
              </Link>
              <button
                onClick={async () => {
                  await logout();
                }}
                className="flex items-center gap-1.5 text-[11px] font-bold tracking-widest uppercase opacity-65 hover:opacity-100 hover:text-red-500 transition-colors px-3 py-1.5"
                title={t("logout")}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">{t("logout")}</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => openAuth("login")}
                className="flex items-center gap-1.5 text-[11px] font-bold tracking-widest uppercase opacity-80 hover:opacity-100 px-3 py-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{t("login")}</span>
              </button>
              <button
                onClick={() => openAuth("register")}
                className="px-4 py-2 rounded-full font-bold text-[10px] uppercase tracking-widest transition-colors paper-btn-dark shadow-sm"
              >
                {t("register")}
              </button>
            </div>
          )}
        </nav>

        {/* Mobile Header Controls */}
        <div className="flex md:hidden items-center gap-2">
          {/* Language Selector Mobile Dropdown */}
          <div className="flex items-center gap-1.5">
            <FlagIcon lang={language} className="w-4 h-2.5 rounded-sm overflow-hidden shrink-0" />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as any)}
              className="bg-transparent dark:bg-[#0A0A0A] border border-[#1A1A1A]/15 dark:border-white/15 rounded-xl px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:ring-1 focus:ring-[#1A1A1A] text-[#1A1A1A] dark:text-[#F5F5F0]"
              aria-label={t("language")}
            >
              <option value="pt" className="bg-white dark:bg-[#1A1A1A]">PT</option>
              <option value="es" className="bg-white dark:bg-[#1A1A1A]">ES</option>
              <option value="en" className="bg-white dark:bg-[#1A1A1A]">EN</option>
              <option value="id" className="bg-white dark:bg-[#1A1A1A]">ID</option>
              <option value="zh" className="bg-white dark:bg-[#1A1A1A]">ZH</option>
            </select>
          </div>



          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl paper-btn-light"
            aria-label="Menu de navegação"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden px-6 py-6 space-y-4 animate-in slide-in-from-top-2 duration-200 paper-card rounded-b-2xl border-t-0 shadow-xl">
          <Link 
            to="/" 
            className="block text-xs font-bold tracking-widest uppercase py-2 border-b border-[#1A1A1A]/5 dark:border-white/5"
          >
            {t("library")}
          </Link>
          <Link 
            to="/community" 
            onClick={() => setMobileMenuOpen(false)}
            className="block text-xs font-bold tracking-widest uppercase py-2 border-b border-[#1A1A1A]/5 dark:border-white/5"
          >
            {t("community")}
          </Link>
          {(profile?.role === 'admin' || profile?.role === 'author') && (
            <Link 
              to="/admin" 
              className="block text-xs font-bold tracking-widest uppercase py-2 border-b border-[#1A1A1A]/5 dark:border-white/5"
            >
              {t("adminPanel")}
            </Link>
          )}

          {user ? (
            <div className="space-y-2 pt-1">
              <Link
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-full font-bold text-xs uppercase tracking-widest paper-btn-dark"
              >
                <UserIcon className="w-4 h-4" />
                <span>{t("profile")} ({profile?.username ? `@${profile.username}` : (profile?.displayName || user.email?.split("@")[0])})</span>
              </Link>
              <button
                onClick={async () => {
                  setMobileMenuOpen(false);
                  await logout();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-full font-bold text-xs uppercase tracking-widest text-center paper-btn-light border border-black/10 dark:border-white/10 text-red-500 hover:bg-red-500/5 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>{t("logout")}</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => { setMobileMenuOpen(false); openAuth("login"); }}
                className="w-full py-3 rounded-full font-bold text-xs uppercase tracking-widest text-center paper-btn-light"
              >
                {t("login")}
              </button>
              <button
                onClick={() => { setMobileMenuOpen(false); openAuth("register"); }}
                className="w-full py-3 rounded-full font-bold text-xs uppercase tracking-widest text-center paper-btn-dark"
              >
                {t("register")}
              </button>
            </div>
          )}
        </div>
      )}
      
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 md:px-16 pt-6 pb-12">
        <Outlet />
      </main>
      
      <footer className="w-full bg-[#1A1A1A] dark:bg-[#0A0A0A] text-[#F5F5F0] flex items-center px-6 md:px-16 justify-between h-16 mt-auto">
        <div className="flex items-center space-x-3 md:space-x-6">
          <span className="text-[9px] uppercase font-bold tracking-widest opacity-80">{t("appBrand")}</span>
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
          <div className="h-3 w-[1px] bg-white/20"></div>
          <span className="text-[9px] uppercase font-bold tracking-widest opacity-60 hidden sm:inline">Firebase {t("online")}</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-[9px] uppercase font-bold tracking-widest opacity-40 italic">{t("version")} 3.1.9-beta</span>
        </div>
      </footer>

      {/* Global Auth Modal */}
      <AuthModal 
        isOpen={authModalOpen} 
        onClose={() => setAuthModalOpen(false)} 
        initialMode={authModalInitialMode} 
      />
    </div>
  );
}
