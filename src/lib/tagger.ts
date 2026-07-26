export const TAG_DICTIONARY: Record<string, { pt: string; en: string; es: string; id: string }> = {
  fantasy: { pt: "Fantasia", en: "Fantasy", es: "Fantasía", id: "Fantasi" },
  romance: { pt: "Romance", en: "Romance", es: "Romance", id: "Romansa" },
  scifi: { pt: "Ficção Científica", en: "Sci-Fi", es: "Ciencia Ficción", id: "Fiksi Ilmiah" },
  mystery: { pt: "Mistério", en: "Mystery", es: "Misterio", id: "Misteri" },
  horror: { pt: "Terror", en: "Horror", es: "Terror", id: "Horor" },
  thriller: { pt: "Suspense", en: "Thriller", es: "Suspenso", id: "Buku Berdebar" },
  historical: { pt: "Histórico", en: "Historical", es: "Histórico", id: "Sejarah" },
  drama: { pt: "Drama", en: "Drama", es: "Drama", id: "Drama" },
  comedy: { pt: "Comédia", en: "Comedy", es: "Comedia", id: "Komedi" },
  action: { pt: "Ação", en: "Action", es: "Acción", id: "Aksi" },
  adventure: { pt: "Aventura", en: "Adventure", es: "Aventura", id: "Petualangan" },
  magic: { pt: "Magia", en: "Magic", es: "Magia", id: "Sihir" },
  space: { pt: "Espacial", en: "Space", es: "Espacial", id: "Luar Angkasa" },
  police: { pt: "Policial", en: "Police", es: "Policial", id: "Polisi" },
  supernatural: { pt: "Sobrenatural", en: "Supernatural", es: "Sobrenatural", id: "Supranatural" },
  shortstory: { pt: "Conto", en: "Short Story", es: "Cuento", id: "Cerpen" },
  erotic: { pt: "Erótico", en: "Erotic", es: "Erótico", id: "Erotis" },
  workout: { pt: "Treino", en: "Workout", es: "Entrenamiento", id: "Latihan" },
  massage: { pt: "Massagem", en: "Massage", es: "Masaje", id: "Pijat" },
  teasing: { pt: "Provocação", en: "Teasing", es: "Provocación", id: "Godaan" },
  nature: { pt: "Natureza", en: "Nature", es: "Naturaleza", id: "Alam" },
  vacation: { pt: "Férias", en: "Vacation", es: "Vacaciones", id: "Liburan" },
  };

export function getCanonicalTag(tag: string): string {
  const lowerTag = tag.trim().toLowerCase();
  for (const [key, translations] of Object.entries(TAG_DICTIONARY)) {
    if (
      translations.pt.toLowerCase() === lowerTag ||
      translations.en.toLowerCase() === lowerTag ||
      translations.es.toLowerCase() === lowerTag ||
      translations.id.toLowerCase() === lowerTag ||
      key === lowerTag
    ) {
      return key;
    }
  }
  return tag; // return as-is if no match found
}

export function getLocalizedTag(tagKey: string, lang: string): string {
  const canon = getCanonicalTag(tagKey);
  const translations = TAG_DICTIONARY[canon];
  if (translations) {
    return translations[lang as keyof typeof translations] || translations.en;
  }
  return tagKey; // Not in dictionary, return original
}

export function generateTagsLocal(text: string): string[] {
  const foundTags: string[] = [];
  const lowerText = text.toLowerCase();
  
  for (const [key, translations] of Object.entries(TAG_DICTIONARY)) {
    // check against all languages in case text contains English words, etc.
    if (
      lowerText.includes(translations.pt.toLowerCase()) ||
      lowerText.includes(translations.en.toLowerCase()) ||
      lowerText.includes(translations.es.toLowerCase()) ||
      lowerText.includes(translations.id.toLowerCase())
    ) {
      foundTags.push(key);
    }
  }
  
  if (foundTags.length === 0) {
    foundTags.push("shortstory");
  }
  
  return foundTags.slice(0, 4);
}
