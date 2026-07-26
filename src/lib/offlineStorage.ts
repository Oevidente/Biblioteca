// IndexedDB helper for Offline Reading
const DB_NAME = "InkoraOfflineDB";
const DB_VERSION = 1;
const STORE_STORIES = "offline_stories";

export interface OfflineStory {
  id: string;
  title: string;
  author?: string;
  coverImage?: string;
  totalPages: number;
  wordCount?: number;
  pages: { [pageIndex: number]: string };
  downloadedAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_STORIES)) {
        db.createObjectStore(STORE_STORIES, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveStoryOffline(story: OfflineStory): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STORIES, "readwrite");
    const store = tx.objectStore(STORE_STORIES);
    const req = store.put(story);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflineStory(id: string): Promise<OfflineStory | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STORIES, "readonly");
    const store = tx.objectStore(STORE_STORIES);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function removeOfflineStory(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STORIES, "readwrite");
    const store = tx.objectStore(STORE_STORIES);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllOfflineStories(): Promise<OfflineStory[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STORIES, "readonly");
    const store = tx.objectStore(STORE_STORIES);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function isStoryDownloaded(id: string): Promise<boolean> {
  const story = await getOfflineStory(id);
  return story !== null;
}
