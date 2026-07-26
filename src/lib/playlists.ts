import { collection, doc, getDocs, setDoc, deleteDoc, query, where } from "firebase/firestore";
import { db } from "./firebase";

export interface ReadingList {
  id: string;
  title: string;
  description: string;
  userId: string;
  userName: string;
  isPublic: boolean;
  storyIds: string[];
  createdAt: string;
  updatedAt: string;
}

const LOCAL_PLAYLISTS_KEY = "inkora_local_playlists";

export function getLocalPlaylists(): ReadingList[] {
  try {
    const raw = localStorage.getItem(LOCAL_PLAYLISTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalPlaylist(playlist: ReadingList): void {
  const playlists = getLocalPlaylists();
  const index = playlists.findIndex((p) => p.id === playlist.id);
  if (index >= 0) {
    playlists[index] = playlist;
  } else {
    playlists.push(playlist);
  }
  localStorage.setItem(LOCAL_PLAYLISTS_KEY, JSON.stringify(playlists));
}

export function deleteLocalPlaylist(id: string): void {
  const playlists = getLocalPlaylists().filter((p) => p.id !== id);
  localStorage.setItem(LOCAL_PLAYLISTS_KEY, JSON.stringify(playlists));
}

export async function fetchPublicPlaylists(): Promise<ReadingList[]> {
  try {
    const q = query(collection(db, "playlists"), where("isPublic", "==", true));
    const snap = await getDocs(q);
    const firestorePlaylists: ReadingList[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as ReadingList[];
    
    // Merge with local ones if not present
    const local = getLocalPlaylists().filter((p) => p.isPublic);
    const map = new Map<string, ReadingList>();
    firestorePlaylists.forEach((p) => map.set(p.id, p));
    local.forEach((p) => {
      if (!map.has(p.id)) map.set(p.id, p);
    });
    return Array.from(map.values());
  } catch (err) {
    console.warn("Firestore playlists offline, returning local:", err);
    return getLocalPlaylists().filter((p) => p.isPublic);
  }
}

export async function createOrUpdatePlaylist(playlist: ReadingList): Promise<void> {
  saveLocalPlaylist(playlist);
  try {
    const ref = doc(db, "playlists", playlist.id);
    await setDoc(ref, playlist, { merge: true });
  } catch (err) {
    console.warn("Could not save playlist to Firestore, saved locally:", err);
  }
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  deleteLocalPlaylist(playlistId);
  try {
    const ref = doc(db, "playlists", playlistId);
    await deleteDoc(ref);
  } catch (err) {
    console.warn("Could not delete playlist from Firestore:", err);
  }
}

export async function toggleStoryInPlaylist(playlist: ReadingList, storyId: string): Promise<ReadingList> {
  const hasStory = playlist.storyIds.includes(storyId);
  const updatedStoryIds = hasStory
    ? playlist.storyIds.filter((id) => id !== storyId)
    : [...playlist.storyIds, storyId];

  const updatedPlaylist: ReadingList = {
    ...playlist,
    storyIds: updatedStoryIds,
    updatedAt: new Date().toISOString(),
  };

  await createOrUpdatePlaylist(updatedPlaylist);
  return updatedPlaylist;
}
