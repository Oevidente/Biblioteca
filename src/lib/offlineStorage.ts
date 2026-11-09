// IndexedDB helper for Offline Reading
const DB_NAME = "InkoraOfflineDB";
const DB_VERSION = 2;
const STORE_STORIES = "offline_stories";
const STORE_WRITER_DRAFTS = "writer_drafts";

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

export interface WriterDraft {
  id: string;
  storyId: string;
  ownerUid: string;
  title: string;
  author: string;
  scheduledReleaseAt: string;
  supporters: string;
  pages: string[];
  wordCount: number;
  baseVersion: string;
  savedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_STORIES)) {
        db.createObjectStore(STORE_STORIES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_WRITER_DRAFTS)) {
        db.createObjectStore(STORE_WRITER_DRAFTS, { keyPath: "id" });
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

export async function saveWriterDraft(draft: WriterDraft): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WRITER_DRAFTS, "readwrite");
    tx.objectStore(STORE_WRITER_DRAFTS).put(draft);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getWriterDraft(
  ownerUid: string,
  storyId: string,
): Promise<WriterDraft | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WRITER_DRAFTS, "readonly");
    const request = tx.objectStore(STORE_WRITER_DRAFTS).get(
      `${ownerUid}:${storyId}`,
    );
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function deleteWriterDraft(
  ownerUid: string,
  storyId: string,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WRITER_DRAFTS, "readwrite");
    tx.objectStore(STORE_WRITER_DRAFTS).delete(`${ownerUid}:${storyId}`);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
