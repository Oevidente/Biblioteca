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

export async function fetchUserPlaylists(userId: string): Promise<ReadingList[]> {
  try {
    const q = query(collection(db, "playlists"), where("userId", "==", userId));
    const snap = await getDocs(q);
    const firestorePlaylists: ReadingList[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as ReadingList[];
    
    return firestorePlaylists;
  } catch (err) {
    console.warn("Firestore playlists offline:", err);
    return [];
  }
}

export async function fetchPublicPlaylists(): Promise<ReadingList[]> {
  try {
    const q = query(collection(db, "playlists"), where("isPublic", "==", true));
    const snap = await getDocs(q);
    const firestorePlaylists: ReadingList[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as ReadingList[];
    
    return firestorePlaylists;
  } catch (err) {
    console.warn("Firestore playlists offline:", err);
    return [];
  }
}

export async function createOrUpdatePlaylist(playlist: ReadingList): Promise<void> {
  try {
    const ref = doc(db, "playlists", playlist.id);
    await setDoc(ref, playlist, { merge: true });
  } catch (err) {
    console.warn("Could not save playlist to Firestore:", err);
    throw err;
  }
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  try {
    const ref = doc(db, "playlists", playlistId);
    await deleteDoc(ref);
  } catch (err) {
    console.warn("Could not delete playlist from Firestore:", err);
    throw err;
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
