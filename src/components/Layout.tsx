import { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Moon, Sun, User as UserIcon, Menu, X, LogIn } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { AuthModal } from "./AuthModal";

export function Layout() {
  const { user, profile } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();

  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : true;
  });

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalInitialMode, setAuthModalInitialMode] = useState<"login" | "register" | "forgot" | "profile">("login");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const openAuth = (mode: "login" | "register" | "forgot" | "profile" = "login") => {
    setAuthModalInitialMode(mode);
    setAuthModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] dark:bg-[#1A1A1A] text-[#1A1A1A] dark:text-[#F5F5F0] font-sans transition-colors duration-300 flex flex-col">
      <header className="flex justify-between items-center px-4 sm:px-6 md:px-16 pt-6 sm:pt-8 md:pt-10 pb-6 w-full max-w-[1400px] mx-auto border-b border-[#1A1A1A]/5 dark:border-white/5">
        <div className="flex items-center space-x-3">
          <Link to="/" className="w-10 h-10 bg-[#1A1A1A] dark:bg-[#F5F5F0] flex items-center justify-center rounded-full shadow-sm hover:scale-105 transition-transform">
            <span className="text-white dark:text-[#1A1A1A] text-xs font-bold tracking-tighter">BTH</span>
          </Link>
          <Link to="/" className="flex flex-col">
            <h1 className="font-sans text-xs font-bold tracking-[0.2em] uppercase opacity-90">{t("library")}</h1>
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
            to="/admin" 
            className={`text-[11px] font-bold tracking-widest uppercase transition-opacity ${
              location.pathname === "/admin" ? "border-b-2 border-[#1A1A1A] dark:border-[#F5F5F0] pb-1 opacity-100" : "opacity-60 hover:opacity-100"
            }`}
          >
            {t("admin")}
          </Link>

          {/* Language Selector */}
          <div className="flex items-center">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as any)}
              className="bg-transparent dark:bg-[#1A1A1A] border border-[#1A1A1A]/15 dark:border-white/15 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:ring-1 focus:ring-[#1A1A1A] text-[#1A1A1A] dark:text-[#F5F5F0]"
              aria-label={t("language")}
              title={t("language")}
            >
              <option value="pt" className="bg-white dark:bg-[#1A1A1A]">Português</option>
              <option value="es" className="bg-white dark:bg-[#1A1A1A]">Español</option>
              <option value="en" className="bg-white dark:bg-[#1A1A1A]">English</option>
              <option value="id" className="bg-white dark:bg-[#1A1A1A]">Indonesia</option>
            </select>
          </div>

          {/* Theme Toggle Switch */}
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className={`relative inline-flex items-center h-7 w-14 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border shadow-inner ${
              darkMode 
                ? "bg-[#0A0A0A] border-white/20 justify-end" 
                : "bg-amber-100/90 border-amber-300 justify-start"
            }`}
            aria-label={t("toggleTheme")}
            title={t("toggleTheme")}
          >
            <span
              className={`flex items-center justify-center w-6 h-6 rounded-full shadow-md transition-all duration-300 ${
                darkMode ? "bg-[#1A1A1A] text-indigo-300" : "bg-white text-amber-500"
              }`}
            >
              {darkMode ? (
                <Moon className="w-3.5 h-3.5 fill-indigo-300/30 text-indigo-300" />
              ) : (
                <Sun className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
              )}
            </span>
          </button>

          {/* User Auth Button */}
          {user ? (
            <button
              onClick={() => openAuth("profile")}
              className="flex items-center gap-2 bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] px-4 py-2 rounded-full font-bold text-[10px] uppercase tracking-widest hover:bg-[#5A5A40] dark:hover:bg-[#EAE8E2] transition-colors shadow-sm"
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span className="max-w-[120px] truncate">{profile?.displayName || user.email?.split("@")[0]}</span>
            </button>
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
                className="bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] px-4 py-2 rounded-full font-bold text-[10px] uppercase tracking-widest hover:bg-[#5A5A40] dark:hover:bg-[#EAE8E2] transition-colors shadow-sm"
              >
                {t("register")}
              </button>
            </div>
          )}
        </nav>

        {/* Mobile Header Controls */}
        <div className="flex md:hidden items-center gap-2">
          {/* Language Selector Mobile Dropdown */}
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
          </select>

          <button 
            onClick={() => setDarkMode(!darkMode)}
            className={`relative inline-flex items-center h-7 w-14 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border shadow-inner ${
              darkMode 
                ? "bg-[#0A0A0A] border-white/20 justify-end" 
                : "bg-amber-100/90 border-amber-300 justify-start"
            }`}
            aria-label={t("toggleTheme")}
            title={t("toggleTheme")}
          >
            <span
              className={`flex items-center justify-center w-6 h-6 rounded-full shadow-md transition-all duration-300 ${
                darkMode ? "bg-[#1A1A1A] text-indigo-300" : "bg-white text-amber-500"
              }`}
            >
              {darkMode ? (
                <Moon className="w-3.5 h-3.5 fill-indigo-300/30 text-indigo-300" />
              ) : (
                <Sun className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
              )}
            </span>
          </button>

          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 bg-white dark:bg-[#0A0A0A] rounded-xl border border-[#1A1A1A]/10 dark:border-white/10"
            aria-label="Menu de navegação"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white dark:bg-[#0A0A0A] border-b border-[#1A1A1A]/10 dark:border-white/10 px-6 py-6 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <Link 
            to="/" 
            className="block text-xs font-bold tracking-widest uppercase py-2 border-b border-[#1A1A1A]/5 dark:border-white/5"
          >
            {t("library")}
          </Link>
          <Link 
            to="/admin" 
            className="block text-xs font-bold tracking-widest uppercase py-2 border-b border-[#1A1A1A]/5 dark:border-white/5"
          >
            {t("adminPanel")}
          </Link>

          {user ? (
            <button
              onClick={() => { setMobileMenuOpen(false); openAuth("profile"); }}
              className="w-full flex items-center justify-center gap-2 bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] py-3 rounded-full font-bold text-xs uppercase tracking-widest mt-2"
            >
              <UserIcon className="w-4 h-4" />
              <span>{t("profile")} ({profile?.displayName || user.email?.split("@")[0]})</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => { setMobileMenuOpen(false); openAuth("login"); }}
                className="w-full border border-[#1A1A1A]/20 dark:border-white/20 py-3 rounded-full font-bold text-xs uppercase tracking-widest text-center"
              >
                {t("login")}
              </button>
              <button
                onClick={() => { setMobileMenuOpen(false); openAuth("register"); }}
                className="w-full bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] py-3 rounded-full font-bold text-xs uppercase tracking-widest text-center"
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
          <span className="text-[9px] uppercase font-bold tracking-widest opacity-80">{t("bthLibrary")}</span>
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
          <div className="h-3 w-[1px] bg-white/20"></div>
          <span className="text-[9px] uppercase font-bold tracking-widest opacity-60 hidden sm:inline">Firebase {t("online")}</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-[9px] uppercase font-bold tracking-widest opacity-40 italic">{t("version")} 2.2.9-beta</span>
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
