export function generateTagsLocal(text: string): string[] {
  const genres = [
    "Fantasia", "Romance", "Ficção Científica", "Mistério", "Terror", 
    "Suspense", "Histórico", "Drama", "Comédia", "Ação", 
    "Aventura", "Magia", "Espacial", "Policial", "Sobrenatural"
  ];
  const foundTags: string[] = [];
  const lowerText = text.toLowerCase();
  
  for (const genre of genres) {
    if (lowerText.includes(genre.toLowerCase())) {
      foundTags.push(genre);
    }
  }
  
  // If no tags found, add some defaults based on length or just "Geral"
  if (foundTags.length === 0) {
    foundTags.push("Conto");
  }
  
  return foundTags.slice(0, 4);
}
