import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { 
  auth, 
  db, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  User 
} from "../lib/firebase";

export const ADMIN_EMAIL = "andreluiz1902@gmail.com";

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  createdAt?: string;
  role?: string;
  favorites?: string[];
  password?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, pass: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  changePassword: (currentPass: string, newPass: string) => Promise<{ success: boolean; error?: string }>;
  checkEmailExists: (email: string) => Promise<{ success: boolean; error?: string }>;
  resetPasswordDirect: (email: string, newPass: string) => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (uid: string, email: string) => {
    try {
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      const isAdminEmail = email?.toLowerCase().trim() === ADMIN_EMAIL;
      const expectedRole = isAdminEmail ? "admin" : "user";

      if (userSnap.exists()) {
        const data = userSnap.data() as UserProfile;
        if (data.role !== expectedRole) {
          data.role = expectedRole;
          await updateDoc(userRef, { role: expectedRole }).catch(() => {});
        }
        setProfile(data);
      } else {
        const newProf: UserProfile = {
          uid,
          email,
          createdAt: new Date().toISOString(),
          role: expectedRole,
          favorites: []
        };
        await setDoc(userRef, newProf);
        setProfile(newProf);
      }
    } catch (e) {
      console.error("Error fetching user profile:", e);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser && currentUser.email) {
        setUser(currentUser);
        localStorage.setItem("luminary_user_uid", currentUser.uid);
        await fetchProfile(currentUser.uid, currentUser.email);
      } else {
        const savedUid = localStorage.getItem("luminary_user_uid");
        if (savedUid) {
          try {
            const userSnap = await getDoc(doc(db, "users", savedUid));
            if (userSnap.exists()) {
              const data = userSnap.data() as UserProfile;
              const mockUser = {
                uid: data.uid,
                email: data.email,
                displayName: data.displayName || data.email.split("@")[0]
              } as User;
              setUser(mockUser);
              setProfile(data);
            } else {
              setUser(null);
              setProfile(null);
            }
          } catch (e) {
            setUser(null);
            setProfile(null);
          }
        } else {
          setUser(null);
          setProfile(null);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const refreshProfile = async () => {
    if (user && user.email) {
      await fetchProfile(user.uid, user.email);
    }
  };

  const login = async (email: string, pass: string) => {
    const cleanEmail = email.trim();
    try {
      const res = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      if (res.user && res.user.email) {
        localStorage.setItem("luminary_user_uid", res.user.uid);
        await fetchProfile(res.user.uid, res.user.email);
      }
      return { success: true };
    } catch (err: any) {
      // Fallback check against Firestore if Auth Provider is disabled (auth/operation-not-allowed) or user/pass in Firestore
      try {
        const q = query(collection(db, "users"), where("email", "==", cleanEmail));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const userDoc = snap.docs[0];
          const data = userDoc.data() as UserProfile;
          if (data.password && data.password === pass) {
            const mockUser = {
              uid: userDoc.id,
              email: data.email,
              displayName: data.displayName || data.email.split("@")[0]
            } as User;
            setUser(mockUser);
            setProfile(data);
            localStorage.setItem("luminary_user_uid", userDoc.id);
            return { success: true };
          }
        }
      } catch (dbErr) {
        console.error("Firestore login check error:", dbErr);
      }

      return { 
        success: false, 
        error: "E-mail ou senha são inválidos. Por favor, verifique suas credenciais." 
      };
    }
  };

  const register = async (email: string, pass: string, name?: string) => {
    try {
      const cleanEmail = email.trim();
      if (!cleanEmail || !cleanEmail.includes("@")) {
        return { success: false, error: "Por favor, insira um e-mail válido." };
      }
      if (!pass || pass.length < 6) {
        return { success: false, error: "A senha deve ter no mínimo 6 caracteres." };
      }

      // First check if email is already taken in Firestore
      try {
        const q = query(collection(db, "users"), where("email", "==", cleanEmail));
        const snap = await getDocs(q);
        if (!snap.empty) {
          return { success: false, error: "Este e-mail já está cadastrado no sistema." };
        }
      } catch (e) {
        console.warn("Check existing email error:", e);
      }

      let uid = "";
      try {
        const res = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
        uid = res.user.uid;
      } catch (authErr: any) {
        if (authErr.code === "auth/email-already-in-use") {
          return { success: false, error: "Este e-mail já está cadastrado no sistema." };
        }
        if (authErr.code === "auth/invalid-email") {
          return { success: false, error: "E-mail inválido." };
        }
        if (authErr.code === "auth/weak-password") {
          return { success: false, error: "A senha informada é fraca. Use no mínimo 6 caracteres." };
        }
        // If auth/operation-not-allowed or provider disabled, generate local uid
        uid = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      }

      const isAdminEmail = cleanEmail.toLowerCase().trim() === ADMIN_EMAIL;
      const userProf: UserProfile = {
        uid,
        email: cleanEmail,
        displayName: name || cleanEmail.split("@")[0],
        createdAt: new Date().toISOString(),
        role: isAdminEmail ? "admin" : "user",
        favorites: [],
        password: pass
      };

      await setDoc(doc(db, "users", uid), userProf);
      
      const mockUser = {
        uid,
        email: cleanEmail,
        displayName: userProf.displayName
      } as User;
      
      setUser(mockUser);
      setProfile(userProf);
      localStorage.setItem("luminary_user_uid", uid);
      return { success: true };
    } catch (err: any) {
      console.error("Register error:", err);
      return { success: false, error: err.message || "Erro ao realizar cadastro." };
    }
  };

  const logout = async () => {
    localStorage.removeItem("luminary_user_uid");
    await signOut(auth).catch(() => {});
    setUser(null);
    setProfile(null);
  };

  const changePassword = async (currentPass: string, newPass: string) => {
    if (!user || !user.email) {
      return { success: false, error: "Usuário não está autenticado." };
    }
    if (!newPass || newPass.length < 6) {
      return { success: false, error: "A nova senha deve ter no mínimo 6 caracteres." };
    }

    try {
      if (auth.currentUser) {
        const credential = EmailAuthProvider.credential(user.email, currentPass);
        await reauthenticateWithCredential(auth.currentUser, credential);
        await updatePassword(auth.currentUser, newPass);
      }
      // Sync in Firestore as well
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { password: newPass, passwordUpdatedAt: new Date().toISOString() });
      if (profile) {
        setProfile({ ...profile, password: newPass });
      }
      return { success: true };
    } catch (err: any) {
      console.error("Change password error:", err);
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        return { success: false, error: "A senha atual informada está incorreta." };
      }
      // If client auth reauth is skipped, still allow Firestore update
      try {
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, { password: newPass, passwordUpdatedAt: new Date().toISOString() });
        if (profile) {
          setProfile({ ...profile, password: newPass });
        }
        return { success: true };
      } catch (e2) {
        return { success: false, error: err.message || "Erro ao alterar senha." };
      }
    }
  };

  const checkEmailExists = async (email: string) => {
    try {
      const cleanEmail = email.trim();
      if (!cleanEmail || !cleanEmail.includes("@")) {
        return { success: false, error: "Por favor, insira um e-mail válido." };
      }
      const q = query(collection(db, "users"), where("email", "==", cleanEmail));
      const snap = await getDocs(q);
      if (snap.empty) {
        return { success: false, error: "Nenhum usuário foi encontrado com este e-mail no sistema." };
      }
      return { success: true };
    } catch (err: any) {
      console.error("Check email error:", err);
      return { success: false, error: "Erro ao verificar e-mail no sistema." };
    }
  };

  const resetPasswordDirect = async (email: string, newPass: string) => {
    try {
      const cleanEmail = email.trim();
      if (!cleanEmail || !cleanEmail.includes("@")) {
        return { success: false, error: "Por favor, insira um e-mail válido." };
      }
      if (!newPass || newPass.length < 6) {
        return { success: false, error: "A nova senha deve ter no mínimo 6 caracteres." };
      }

      const q = query(collection(db, "users"), where("email", "==", cleanEmail));
      const snap = await getDocs(q);
      if (snap.empty) {
        return { success: false, error: "E-mail não encontrado no sistema." };
      }

      const userDoc = snap.docs[0];
      await updateDoc(doc(db, "users", userDoc.id), {
        password: newPass,
        passwordUpdatedAt: new Date().toISOString()
      });

      if (auth.currentUser && auth.currentUser.email === cleanEmail) {
        await updatePassword(auth.currentUser, newPass).catch(() => {});
      }

      return { success: true };
    } catch (err: any) {
      console.error("Direct reset password error:", err);
      return { success: false, error: err.message || "Erro ao redefinir a senha no sistema." };
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      login,
      register,
      logout,
      changePassword,
      checkEmailExists,
      resetPasswordDirect,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

