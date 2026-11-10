import { initializeApp } from "firebase/app";
import { 
  initializeFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc, 
  query, 
  orderBy, 
  where,
  Timestamp, 
  updateDoc, 
  deleteDoc,
  increment, 
  writeBatch, 
  setDoc,
  onSnapshot,
  collectionGroup
} from "firebase/firestore";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendPasswordResetEmail,
  User 
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";
 
const app = initializeApp(firebaseConfig);
 
// Initialize Firestore with long-polling to prevent WebSocket connection failures in proxied sandboxes
const customDbId = (firebaseConfig as any).firestoreDatabaseId;
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, customDbId || '(default)');

const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');

export function isFirestoreDailyWriteQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const firebaseError = error as { code?: unknown; message?: unknown };
  const code = String(firebaseError.code || '').toLowerCase();
  const message = String(firebaseError.message || '').toLowerCase();
  const isResourceExhausted =
    code === 'resource-exhausted' || code.endsWith('/resource-exhausted');
  const mentionsQuota =
    message.includes('free daily write units') ||
    message.includes('daily write') ||
    message.includes('quota');
  return isResourceExhausted || mentionsQuota;
}

const QUOTA_STORAGE_KEY = 'inkora_firestore_write_quota_exhausted';

export function isFirestoreQuotaExceeded(): boolean {
  try {
    const val = sessionStorage.getItem(QUOTA_STORAGE_KEY);
    if (!val) return false;
    const expiresAt = Number(val);
    if (Date.now() > expiresAt) {
      sessionStorage.removeItem(QUOTA_STORAGE_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function markFirestoreQuotaExceeded(durationMinutes = 60): void {
  try {
    const expiresAt = Date.now() + durationMinutes * 60 * 1000;
    sessionStorage.setItem(QUOTA_STORAGE_KEY, String(expiresAt));
    window.dispatchEvent(new CustomEvent('firestore-quota-status-changed'));
  } catch {}
}

export { 
  db, 
  auth, 
  provider, 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendPasswordResetEmail,
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc, 
  query, 
  orderBy, 
  where,
  Timestamp, 
  updateDoc, 
  deleteDoc, 
  increment, 
  writeBatch, 
  setDoc, 
  onSnapshot,
  collectionGroup 
};
export type { User };
