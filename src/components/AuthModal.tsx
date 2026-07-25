import { useState, FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { X, Lock, Mail, User as UserIcon, KeyRound, CheckCircle2, AlertCircle, ShieldCheck, Eye, EyeOff } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "login" | "register" | "forgot" | "profile";
}

export function AuthModal({ isOpen, onClose, initialMode = "login" }: AuthModalProps) {
  const { user, profile, login, register, logout, changePassword, checkEmailExists, resetPasswordDirect } = useAuth();
  
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
      setErrorMessage("As senhas informadas não coincidem.");
      return;
    }

    setIsSubmitting(true);
    const res = await register(email, password, name);
    setIsSubmitting(false);

    if (res.success) {
      resetForm();
      onClose();
    } else {
      setErrorMessage(res.error || "Erro ao realizar cadastro.");
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
      setErrorMessage("As senhas informadas não coincidem.");
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }

    setIsSubmitting(true);
    const res = await resetPasswordDirect(email, newPassword);
    setIsSubmitting(false);

    if (res.success) {
      setForgotStep(3);
    } else {
      setErrorMessage(res.error || "Erro ao redefinir a senha no sistema.");
    }
  };

  const handleChangePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!currentPassword || !newPassword) {
      setErrorMessage("Preencha a senha atual e a nova senha.");
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }

    setIsSubmitting(true);
    const res = await changePassword(currentPassword, newPassword);
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMessage("Sua senha foi alterada com sucesso!");
      setCurrentPassword("");
      setNewPassword("");
    } else {
      setErrorMessage(res.error || "Erro ao alterar a senha.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white dark:bg-[#1A1A1A] w-full max-w-md rounded-2xl shadow-2xl border border-[#1A1A1A]/10 dark:border-white/10 p-6 md:p-8 relative my-8">
        
        {/* Close Button */}
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors opacity-60 hover:opacity-100"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* LOGGED IN USER VIEW */}
        {user ? (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] rounded-full mx-auto flex items-center justify-center font-serif font-bold text-2xl mb-3">
                {(profile?.displayName || user.email || "U")[0].toUpperCase()}
              </div>
              <h2 className="font-serif font-bold text-2xl tracking-tight">{profile?.displayName || "Meu Perfil"}</h2>
              <p className="text-xs opacity-60 mt-1 font-mono">{user.email}</p>
            </div>

            <div className="flex border-b border-[#1A1A1A]/10 dark:border-white/10 gap-4 justify-center">
              <button 
                className="pb-2 text-xs font-bold uppercase tracking-widest border-b-2 border-[#1A1A1A] dark:border-[#F5F5F0]"
              >
                Alterar Senha
              </button>
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

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Senha Atual</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-3 text-xs bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white"
                    placeholder="Sua senha atual"
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
                <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Nova Senha</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-3 text-xs bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white"
                    placeholder="Mínimo de 6 caracteres"
                    required
                  />
                </div>
                <p className="text-[10px] opacity-50 mt-1">Dica: Utilize letras, números e no mínimo 6 caracteres para uma senha forte.</p>
              </div>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] py-3.5 rounded-full text-[10px] uppercase font-bold tracking-widest hover:bg-[#5A5A40] dark:hover:bg-[#EAE8E2] transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "Atualizando..." : "Salvar Nova Senha"}
              </button>
            </form>

            <div className="pt-4 border-t border-[#1A1A1A]/10 dark:border-white/10">
              <button 
                onClick={async () => { await logout(); onClose(); }} 
                className="w-full text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 hover:opacity-80 py-2"
              >
                Sair da Conta
              </button>
            </div>
          </div>
        ) : (
          /* NOT LOGGED IN VIEWS */
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="font-serif font-bold text-2xl tracking-tight">
                {mode === "login" && "Entrar na Biblioteca"}
                {mode === "register" && "Criar uma Conta"}
                {mode === "forgot" && "Recuperar Senha"}
              </h2>
              <p className="text-xs opacity-60 mt-1">
                {mode === "login" && "Acesse seus favoritos e acompanhe seu progresso de leitura."}
                {mode === "register" && "Cadastre-se para salvar suas histórias e avaliações."}
                {mode === "forgot" && "Informe seu e-mail para definir uma nova senha."}
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
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">E-mail</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 text-xs bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white"
                      placeholder="seu@email.com"
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] uppercase font-bold tracking-widest opacity-60">Senha</label>
                    <button 
                      type="button" 
                      onClick={() => switchMode("forgot")}
                      className="text-[10px] font-bold uppercase tracking-wider opacity-60 hover:opacity-100"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-3 text-xs bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white"
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
                  className="w-full bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] py-3.5 rounded-full text-[10px] uppercase font-bold tracking-widest hover:bg-[#5A5A40] dark:hover:bg-[#EAE8E2] transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Entrando..." : "Entrar"}
                </button>

                <div className="text-center pt-2">
                  <p className="text-xs opacity-60">
                    Ainda não possui uma conta?{" "}
                    <button 
                      type="button"
                      onClick={() => switchMode("register")}
                      className="font-bold underline text-[#1A1A1A] dark:text-[#F5F5F0] hover:opacity-80"
                    >
                      Cadastre-se
                    </button>
                  </p>
                </div>
              </form>
            )}

            {/* REGISTER FORM */}
            {mode === "register" && (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Nome Completo</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input 
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 text-xs bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white"
                      placeholder="Seu nome"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">E-mail</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 text-xs bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white"
                      placeholder="seu@email.com"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Senha</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-3 text-xs bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white"
                      placeholder="Mínimo de 6 caracteres"
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
                  <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Confirmar Senha</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 text-xs bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white"
                      placeholder="Digite a senha novamente"
                      required
                    />
                  </div>
                  <p className="text-[10px] opacity-50 mt-1">Sua senha deve conter pelo menos 6 caracteres.</p>
                </div>

                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] py-3.5 rounded-full text-[10px] uppercase font-bold tracking-widest hover:bg-[#5A5A40] dark:hover:bg-[#EAE8E2] transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Criando Conta..." : "Criar Conta"}
                </button>

                <div className="text-center pt-2">
                  <p className="text-xs opacity-60">
                    Já tem uma conta?{" "}
                    <button 
                      type="button"
                      onClick={() => switchMode("login")}
                      className="font-bold underline text-[#1A1A1A] dark:text-[#F5F5F0] hover:opacity-80"
                    >
                      Entrar
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
                      <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">E-mail Cadastrado</label>
                      <div className="relative">
                        <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                        <input 
                          type="email" 
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full pl-9 pr-4 py-3 text-xs bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white"
                          placeholder="seu@email.com"
                          required
                        />
                      </div>
                      <p className="text-[10px] opacity-50 mt-1">
                        Informe o e-mail da sua conta para redefinir a senha diretamente na plataforma.
                      </p>
                    </div>

                    <button 
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] py-3.5 rounded-full text-[10px] uppercase font-bold tracking-widest hover:bg-[#5A5A40] dark:hover:bg-[#EAE8E2] transition-colors disabled:opacity-50"
                    >
                      {isSubmitting ? "Verificando..." : "Continuar"}
                    </button>

                    <div className="text-center pt-2">
                      <button 
                        type="button"
                        onClick={() => switchMode("login")}
                        className="text-xs font-bold uppercase tracking-wider opacity-60 hover:opacity-100"
                      >
                        Voltar para o Login
                      </button>
                    </div>
                  </form>
                )}

                {forgotStep === 2 && (
                  <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                    <div className="p-3.5 bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl text-xs space-y-1">
                      <p className="font-bold flex items-center gap-1.5 text-[#1A1A1A] dark:text-[#F5F5F0]">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Orientação para Senha Forte
                      </p>
                      <p className="opacity-70 leading-relaxed text-[11px]">
                        Crie uma senha segura contendo no mínimo 6 caracteres, combinando letras e números.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Nova Senha</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                        <input 
                          type={showPassword ? "text" : "password"} 
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full pl-9 pr-10 py-3 text-xs bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white"
                          placeholder="Mínimo de 6 caracteres"
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
                      <label className="block text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Confirmar Nova Senha</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                        <input 
                          type={showPassword ? "text" : "password"} 
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full pl-9 pr-4 py-3 text-xs bg-[#F5F5F0] dark:bg-[#0A0A0A] border border-[#1A1A1A]/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] dark:focus:ring-white"
                          placeholder="Digite a nova senha novamente"
                          required
                        />
                      </div>
                    </div>

                    <button 
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] py-3.5 rounded-full text-[10px] uppercase font-bold tracking-widest hover:bg-[#5A5A40] dark:hover:bg-[#EAE8E2] transition-colors disabled:opacity-50"
                    >
                      {isSubmitting ? "Salvando..." : "Salvar Nova Senha"}
                    </button>

                    <div className="text-center pt-2">
                      <button 
                        type="button"
                        onClick={() => setForgotStep(1)}
                        className="text-xs font-bold uppercase tracking-wider opacity-60 hover:opacity-100"
                      >
                        Voltar
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
                      <h3 className="font-bold text-base text-[#1A1A1A] dark:text-[#F5F5F0]">Senha Redefinida!</h3>
                      <p className="text-xs opacity-70 mt-1 leading-relaxed">
                        Sua senha foi redefinida com sucesso diretamente no site. Você já pode entrar com suas novas credenciais.
                      </p>
                    </div>

                    <button 
                      type="button"
                      onClick={() => {
                        setMode("login");
                        setPassword("");
                      }}
                      className="w-full bg-[#1A1A1A] dark:bg-[#F5F5F0] text-white dark:text-[#1A1A1A] py-3.5 rounded-full text-[10px] uppercase font-bold tracking-widest hover:bg-[#5A5A40] dark:hover:bg-[#EAE8E2] transition-colors"
                    >
                      Ir para o Login
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
