import { useState, FormEvent, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { X, Lock, Mail, User as UserIcon, KeyRound, CheckCircle2, AlertCircle, ShieldCheck, Eye, EyeOff, AtSign, Award, BookOpen, MessageSquare, Moon, ListPlus, Globe, Feather } from "lucide-react";
import { ACHIEVEMENTS, getUnlockedAchievements, unlockAchievement } from "../lib/achievements";
import { db, collection, query, where, getDocs, doc, updateDoc } from "../lib/firebase";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "login" | "register" | "forgot" | "profile";
}

export function AuthModal({ isOpen, onClose, initialMode = "login" }: AuthModalProps) {
  const { user, profile, login, register, logout, changePassword, checkEmailExists, resetPasswordDirect } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  
  const [profileTab, setProfileTab] = useState<"security" | "achievements">("achievements");
  const [unlockedBadges, setUnlockedBadges] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen && initialMode === "profile") {
      onClose();
      navigate("/profile");
    }
  }, [isOpen, initialMode, navigate, onClose]);

  useEffect(() => {
    const checkAchievementsAndLoad = async () => {
      if (!user) return;
      
      // Get current achievements
      let unlocked = getUnlockedAchievements(user.uid);
      let changed = false;
      
      try {
        const storiesRef = collection(db, "stories");
        
        // 1. Check if they have a story with their authorUid
        const qUid = query(storiesRef, where("authorUid", "==", user.uid));
        const snapUid = await getDocs(qUid);
        let hasPublished = !snapUid.empty;
        
        // 2. Check if author name matches displayName or username (for manual input cases)
        if (!hasPublished && profile) {
          const namesToCheck: string[] = [];
          if (profile.displayName) namesToCheck.push(profile.displayName.trim());
          if (profile.username) {
            namesToCheck.push(profile.username.trim());
            namesToCheck.push(`@${profile.username.trim()}`);
          }
          
          if (namesToCheck.length > 0) {
            for (const nameToCheck of namesToCheck) {
              const qName = query(storiesRef, where("author", "==", nameToCheck));
              const snapName = await getDocs(qName);
              if (!snapName.empty) {
                hasPublished = true;
                
                // Backfill authorUid so they are permanently recognized in the future
                for (const docSnap of snapName.docs) {
                  try {
                    await updateDoc(doc(db, "stories", docSnap.id), { authorUid: user.uid });
                    console.log(`Successfully linked story ${docSnap.id} to user ${user.uid}`);
                  } catch (updateErr) {
                    console.warn(`Could not update authorUid for story ${docSnap.id}:`, updateErr);
                  }
                }
                break;
              }
            }
          }
        }
        
        // If we found any story, unlock the achievement!
        if (hasPublished) {
          if (!unlocked.includes("published_author")) {
            unlockAchievement("published_author", user.uid);
            changed = true;
          }
        }
      } catch (err) {
        console.error("Error checking achievements:", err);
      }
      
      setUnlockedBadges(getUnlockedAchievements(user.uid));
    };

    if (isOpen && user) {
      checkAchievementsAndLoad();
    }
  }, [isOpen, user, profile]);
  
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "changePassword">(
    user ? "changePassword" : initialMode === "profile" ? "login" : initialMode
  );

  // Forgot password flow steps: 1 = Enter Email, 2 = Enter New Password, 3 = Success
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3>(1);

  // Forms state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [requestedRole, setRequestedRole] = useState<"user" | "author">("user");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  if (!isOpen) return null;

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setName("");
    setUsername("");
    setRequestedRole("user");
    setCurrentPassword("");
    setNewPassword("");
    setErrorMessage("");
    setSuccessMessage("");
    setForgotStep(1);
  };

  const switchMode = (newMode: "login" | "register" | "forgot" | "changePassword") => {
    setMode(newMode);
    resetForm();
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    const res = await login(email, password);
    setIsSubmitting(false);

    if (res.success) {
      resetForm();
      onClose();
    } else {
      setErrorMessage(res.error || "E-mail ou senha são inválidos.");
    }
  };

  const handleRegisterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (password !== confirmPassword) {
      setErrorMessage(t("passwordMismatch"));
      return;
    }

    setIsSubmitting(true);
    const res = await register(email, password, name, username, requestedRole);
    setIsSubmitting(false);

    if (res.success) {
      resetForm();
      onClose();
    } else {
      setErrorMessage(res.error || t("errorLabel"));
    }
  };

  const handleVerifyEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    const res = await checkEmailExists(email);
    setIsSubmitting(false);

    if (res.success) {
      setForgotStep(2);
    } else {
      setErrorMessage(res.error || "E-mail não encontrado no sistema.");
    }
  };

  const handleResetPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (newPassword !== confirmPassword) {
      setErrorMessage(t("passwordMismatch"));
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage(t("passwordMinLength"));
      return;
    }

    setIsSubmitting(true);
    const res = await resetPasswordDirect(email, newPassword);
    setIsSubmitting(false);

    if (res.success) {
      setForgotStep(3);
    } else {
      setErrorMessage(res.error || t("errorLabel"));
    }
  };

  const handleChangePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!currentPassword || !newPassword) {
      setErrorMessage(t("fillAllFields"));
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage(t("passwordMinLength"));
      return;
    }

    setIsSubmitting(true);
    const res = await changePassword(currentPassword, newPassword);
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMessage(t("passwordChangedSuccess"));
      setCurrentPassword("");
      setNewPassword("");
    } else {
      setErrorMessage(res.error || t("errorLabel"));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl p-6 md:p-8 relative my-8 paper-card">
        
        {/* Close Button */}
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 p-2 rounded-full transition-colors opacity-60 hover:opacity-100 paper-btn-light"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* LOGGED IN USER VIEW */}
        {user ? (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center font-serif font-bold text-2xl mb-3 paper-btn-dark">
                {(profile?.username || profile?.displayName || user.email || "U")[0].toUpperCase()}
              </div>
              <h2 className="font-serif font-bold text-2xl tracking-tight">{profile?.username ? `@${profile.username}` : (profile?.displayName || t("myProfile"))}</h2>
              <p className="text-xs opacity-60 mt-1 font-mono">{user.email}</p>
            </div>

            <div className="flex border-b border-[#1A1A1A]/10 dark:border-white/10 gap-4 justify-center text-xs font-bold uppercase tracking-widest mb-4">
              <button 
                type="button"
                onClick={() => setProfileTab("achievements")}
                className={`pb-2 border-b-2 transition-colors ${
                  profileTab === "achievements" ? "border-[#1A1A1A] dark:border-[#F5F5F0] opacity-100" : "border-transparent opacity-50 hover:opacity-100"
                }`}
              >
                {t("achievements")}
              </button>
              <button 
                type="button"
                onClick={() => setProfileTab("security")}
                className={`pb-2 border-b-2 transition-colors ${
                  profileTab === "security" ? "border-[#1A1A1A] dark:border-[#F5F5F0] opacity-100" : "border-transparent opacity-50 hover:opacity-100"
                }`}
              >
                {t("changePassword")}
              </button>
            </div>

            {profileTab === "achievements" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider opacity-70">
                  <span>{t("badges")} ({unlockedBadges.length}/{ACHIEVEMENTS.length})</span>
                  <span>{Math.round((unlockedBadges.length / ACHIEVEMENTS.length) * 100)}%</span>
                </div>
                
                <div className="grid grid-cols-1 gap-2.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                  {ACHIEVEMENTS.map((a) => {
                    const isUnlocked = unlockedBadges.includes(a.id);
                    const renderIcon = () => {
                      if (a.icon === "BookOpen") return <BookOpen className="w-5 h-5" />;
                      if (a.icon === "Award") return <Award className="w-5 h-5" />;
                      if (a.icon === "MessageSquare") return <MessageSquare className="w-5 h-5" />;
                      if (a.icon === "Moon") return <Moon className="w-5 h-5" />;
                      if (a.icon === "ListPlus") return <ListPlus className="w-5 h-5" />;
                      if (a.icon === "Globe") return <Globe className="w-5 h-5" />;
                      if (a.icon === "Feather") return <Feather className="w-5 h-5" />;
                      return <Award className="w-5 h-5" />;
                    };

                    return (
                      <div 
                        key={a.id}
                        className={`p-3 rounded-xl flex items-center gap-3 transition-all paper-card ${
                          isUnlocked 
                            ? "bg-amber-500/10 border-amber-500/30 text-[#1A1A1A] dark:text-[#F5F5F0]" 
                            : "opacity-40 grayscale"
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                          isUnlocked ? "paper-btn-amber" : "paper-btn-light"
                        }`}>
                          {renderIcon()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-xs flex items-center justify-between">
                            <span className="truncate">{a.title[language] || a.title.pt}</span>
                            {isUnlocked && <span className="text-[9px] bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">OK</span>}
                          </h4>
                          <p className="text-[11px] opacity-70 line-clamp-1 leading-tight mt-0.5">
                            {a.description[language] || a.description.pt}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>

            {errorMessage && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("currentPassword")}</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-3 text-xs rounded-xl focus:outline-none paper-card"
                    placeholder={t("currentPasswordPlaceholder")}
                    required
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("newPassword")}</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-3 text-xs rounded-xl focus:outline-none paper-card"
                    placeholder={t("newPasswordPlaceholder")}
                    required
                  />
                </div>
                <p className="text-[10px] opacity-50 mt-1">{t("passwordStrengthTip")}</p>
              </div>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-full text-[10px] uppercase font-bold tracking-widest disabled:opacity-50 paper-btn-dark"
              >
                {isSubmitting ? t("updating") : t("saveNewPassword")}
              </button>
            </form>
          </div>
        )}

            <div className="pt-4 border-t border-[#1A1A1A]/10 dark:border-white/10">
              <button 
                onClick={async () => { await logout(); onClose(); }} 
                className="w-full text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 hover:opacity-80 py-2"
              >
                {t("logout")}
              </button>
            </div>
          </div>
        ) : (
          /* NOT LOGGED IN VIEWS */
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="font-serif font-bold text-2xl tracking-tight">
                {mode === "login" && t("enterLibrary")}
                {mode === "register" && t("createAccount")}
                {mode === "forgot" && t("recoverPassword")}
              </h2>
              <p className="text-xs opacity-60 mt-1">
                {mode === "login" && t("accessFavorites")}
                {mode === "register" && t("signupToSave")}
                {mode === "forgot" && t("forgotPasswordInstructions")}
              </p>
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* LOGIN FORM */}
            {mode === "login" && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("emailOrUsername", "E-mail ou Usuário")}</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input 
                      type="text" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 text-xs rounded-xl focus:outline-none paper-card"
                      placeholder="seu@email.com ou usuario"
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] uppercase font-bold tracking-widest opacity-60">{t("password")}</label>
                    <button 
                      type="button" 
                      onClick={() => switchMode("forgot")}
                      className="text-[10px] font-bold uppercase tracking-wider opacity-60 hover:opacity-100"
                    >
                      {t("forgotPasswordLink")}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-3 text-xs rounded-xl focus:outline-none paper-card"
                      placeholder="Sua senha"
                      required
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 rounded-full text-[10px] uppercase font-bold tracking-widest disabled:opacity-50 paper-btn-dark"
                >
                  {isSubmitting ? t("entering") : t("login")}
                </button>

                <div className="text-center pt-2">
                  <p className="text-xs opacity-60">
                    {t("dontHaveAccount")}{" "}
                    <button 
                      type="button"
                      onClick={() => switchMode("register")}
                      className="font-bold underline text-[#1A1A1A] dark:text-[#F5F5F0] hover:opacity-80"
                    >
                      {t("register")}
                    </button>
                  </p>
                </div>
              </form>
            )}

            {/* REGISTER FORM */}
            {mode === "register" && (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("nameLabel")}</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input 
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 text-xs rounded-xl focus:outline-none paper-card"
                      placeholder={t("namePlaceholder")}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("usernameLabel", "Nome de Usuário (@)")}</label>
                  <div className="relative">
                    <AtSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input 
                      type="text" 
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                      className="w-full pl-9 pr-4 py-3 text-xs rounded-xl focus:outline-none paper-card"
                      placeholder={t("usernamePlaceholder", "seu_usuario")}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("email")}</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 text-xs rounded-xl focus:outline-none paper-card"
                      placeholder="seu@email.com"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-2">{t("accountType")}</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRequestedRole("user")}
                      className={`py-2 px-3 text-[11px] font-bold rounded-xl transition-all ${
                        requestedRole === "user" 
                          ? "paper-btn-dark" 
                          : "opacity-60 hover:opacity-100 paper-btn-light"
                      }`}
                    >
                      {t("readerRole")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequestedRole("author")}
                      className={`py-2 px-3 text-[11px] font-bold rounded-xl transition-all ${
                        requestedRole === "author" 
                          ? "paper-btn-dark" 
                          : "opacity-60 hover:opacity-100 paper-btn-light"
                      }`}
                    >
                      {t("authorRole")}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("password")}</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-3 text-xs rounded-xl focus:outline-none paper-card"
                      placeholder={t("newPasswordPlaceholder")}
                      required
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("confirmPassword")}</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 text-xs rounded-xl focus:outline-none paper-card"
                      placeholder={t("confirmPasswordPlaceholder")}
                      required
                    />
                  </div>
                  <p className="text-[10px] opacity-50 mt-1">{t("passwordGuideline")}</p>
                </div>

                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 rounded-full text-[10px] uppercase font-bold tracking-widest disabled:opacity-50 paper-btn-dark"
                >
                  {isSubmitting ? t("creatingAccount") : t("createAccount")}
                </button>

                <div className="text-center pt-2">
                  <p className="text-xs opacity-60">
                    {t("alreadyHaveAccount")}{" "}
                    <button 
                      type="button"
                      onClick={() => switchMode("login")}
                      className="font-bold underline text-[#1A1A1A] dark:text-[#F5F5F0] hover:opacity-80"
                    >
                      {t("login")}
                    </button>
                  </p>
                </div>
              </form>
            )}

            {/* FORGOT PASSWORD FORM (IN-APP RESET WITHOUT EMAIL) */}
            {mode === "forgot" && (
              <div>
                {forgotStep === 1 && (
                  <form onSubmit={handleVerifyEmailSubmit} className="space-y-4">
                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("email")}</label>
                      <div className="relative">
                        <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                        <input 
                          type="email" 
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full pl-9 pr-4 py-3 text-xs rounded-xl focus:outline-none paper-card"
                          placeholder="seu@email.com"
                          required
                        />
                      </div>
                      <p className="text-[10px] opacity-50 mt-1">
                        {t("forgotPasswordStep1Instructions")}
                      </p>
                    </div>

                    <button 
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3.5 rounded-full text-[10px] uppercase font-bold tracking-widest disabled:opacity-50 paper-btn-dark"
                    >
                      {isSubmitting ? t("checking") : t("continueReading")}
                    </button>

                    <div className="text-center pt-2">
                      <button 
                        type="button"
                        onClick={() => switchMode("login")}
                        className="text-xs font-bold uppercase tracking-wider opacity-60 hover:opacity-100"
                      >
                        {t("forgotStep3Button")}
                      </button>
                    </div>
                  </form>
                )}

                {forgotStep === 2 && (
                  <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                    <div className="p-3.5 rounded-xl text-xs space-y-1 paper-card">
                      <p className="font-bold flex items-center gap-1.5 text-[#1A1A1A] dark:text-[#F5F5F0]">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> {t("passwordGuidelineStrengthTitle")}
                      </p>
                      <p className="opacity-70 leading-relaxed text-[11px]">
                        {t("passwordGuidelineStrength")}
                      </p>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("newPassword")}</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                        <input 
                          type={showPassword ? "text" : "password"} 
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full pl-9 pr-10 py-3 text-xs rounded-xl focus:outline-none paper-card"
                          placeholder={t("newPasswordPlaceholder")}
                          required
                        />
                        <button 
                          type="button" 
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">{t("confirmPassword")}</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                        <input 
                          type={showPassword ? "text" : "password"} 
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full pl-9 pr-4 py-3 text-xs rounded-xl focus:outline-none paper-card"
                          placeholder={t("confirmPasswordPlaceholder")}
                          required
                        />
                      </div>
                    </div>

                    <button 
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3.5 rounded-full text-[10px] uppercase font-bold tracking-widest disabled:opacity-50 paper-btn-dark"
                    >
                      {isSubmitting ? t("saving") : t("saveNewPassword")}
                    </button>

                    <div className="text-center pt-2">
                      <button 
                        type="button"
                        onClick={() => setForgotStep(1)}
                        className="text-xs font-bold uppercase tracking-wider opacity-60 hover:opacity-100"
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  </form>
                )}

                {forgotStep === 3 && (
                  <div className="text-center space-y-4 py-2">
                    <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full mx-auto flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-[#1A1A1A] dark:text-[#F5F5F0]">{t("forgotStep3Title")}</h3>
                      <p className="text-xs opacity-70 mt-1 leading-relaxed">
                        {t("forgotStep3Success")}
                      </p>
                    </div>

                    <button 
                      type="button"
                      onClick={() => {
                        setMode("login");
                        setPassword("");
                      }}
                      className="w-full py-3.5 rounded-full text-[10px] uppercase font-bold tracking-widest paper-btn-dark"
                    >
                      {t("forgotStep3Button")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
