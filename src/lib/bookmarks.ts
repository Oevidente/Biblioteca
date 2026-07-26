export interface BookmarkNote {
  id: string;
  storyId: string;
  pageIndex: number;
  selectedText?: string;
  noteText?: string;
  createdAt: string;
}

const STORAGE_KEY = "inkora_story_bookmarks_notes";

export function getBookmarksAndNotes(storyId: string): BookmarkNote[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${storyId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveBookmarkNote(item: BookmarkNote): void {
  const list = getBookmarksAndNotes(item.storyId);
  const existingIdx = list.findIndex((x) => x.id === item.id);
  if (existingIdx >= 0) {
    list[existingIdx] = item;
  } else {
    list.push(item);
  }
  localStorage.setItem(`${STORAGE_KEY}_${item.storyId}`, JSON.stringify(list));
}

export function deleteBookmarkNote(storyId: string, itemId: string): void {
  const list = getBookmarksAndNotes(storyId).filter((x) => x.id !== itemId);
  localStorage.setItem(`${STORAGE_KEY}_${storyId}`, JSON.stringify(list));
}
