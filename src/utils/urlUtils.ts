export function createSlug(text: string): string {
  if (!text) return '';
  return text
    .toString()
    .normalize('NFD') // split an accented letter in the base letter and the accent
    .replace(/[\u0300-\u036f]/g, '') // remove all previously split accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, '') // remove all chars not letters, numbers and spaces (to be replaced)
    .replace(/\s+/g, '-'); // separator
}

export function getStoryLink(id: string, title?: string): string {
  if (!title) return `/story/${id}`;
  const slug = createSlug(title);
  if (!slug) return `/story/${id}`;
  return `/story/${slug}-${id}`;
}

export function extractStoryId(urlParam?: string): string | undefined {
  if (!urlParam) return undefined;
  // If it contains a dash and is likely a slug-id format
  if (urlParam.includes('-')) {
    const parts = urlParam.split('-');
    const potentialId = parts.pop();
    // Firestore IDs are typically 20 chars long.
    if (potentialId && potentialId.length >= 20) {
      return potentialId;
    }
  }
  return urlParam;
}
