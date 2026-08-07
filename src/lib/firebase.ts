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
