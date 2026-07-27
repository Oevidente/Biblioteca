// Achievements & Badges System for Inkora
export interface Achievement {
  id: string;
  icon: string; // Lucide icon identifier or emoji
  title: {
    pt: string;
    es: string;
    en: string;
    id: string;
  };
  description: {
    pt: string;
    es: string;
    en: string;
    id: string;
  };
  category: "reader" | "author" | "social" | "explorer";
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_page",
    icon: "BookOpen",
    title: {
      pt: "Primeira Página",
      es: "Primera Página",
      en: "First Page",
      id: "Halaman Pertama",
    },
    description: {
      pt: "Iniciou sua primeira leitura no Inkora",
      es: "Inició su primera lectura en Inkora",
      en: "Started your first read on Inkora",
      id: "Memulai bacaan pertama Anda di Inkora",
    },
    category: "reader",
  },
  {
    id: "book_devourer",
    icon: "Award",
    title: {
      pt: "Devorador de Livros",
      es: "Devorador de Libros",
      en: "Book Devourer",
      id: "Lalap Buku",
    },
    description: {
      pt: "Concluiu a leitura de 3 ou mais histórias",
      es: "Completó la lectura de 3 o más historias",
      en: "Completed reading 3 or more stories",
      id: "Selesaikan membaca 3 atau lebih cerita",
    },
    category: "reader",
  },
  {
    id: "first_review",
    icon: "MessageSquare",
    title: {
      pt: "Primeira Avaliação",
      es: "Primera Reseña",
      en: "First Review",
      id: "Ulasan Pertama",
    },
    description: {
      pt: "Deixou sua opinião ou resenha em uma história",
      es: "Dejó su opinión o reseña en una historia",
      en: "Left a review or comment on a story",
      id: "Meninggalkan ulasan atau komentar pada cerita",
    },
    category: "social",
  },
  {
    id: "night_owl",
    icon: "Moon",
    title: {
      pt: "Leitor Noturno",
      es: "Lector Nocturno",
      en: "Night Owl Reader",
      id: "Pembaca Malam",
    },
    description: {
      pt: "Leu entre meia-noite e 5 da manhã",
      es: "Leyó entre la medianoche y las 5 am",
      en: "Read between midnight and 5 AM",
      id: "Membaca antara tengah malam dan jam 5 pagi",
    },
    category: "explorer",
  },
  {
    id: "playlist_curator",
    icon: "ListPlus",
    title: {
      pt: "Curador de Listas",
      es: "Curador de Listas",
      en: "List Curator",
      id: "Kurator Daftar",
    },
    description: {
      pt: "Criou sua primeira lista de leitura pública ou privada",
      es: "Creó su primera lista de lectura pública o privada",
      en: "Created your first public or private reading list",
      id: "Membuat daftar bacaan publik atau pribadi pertama Anda",
    },
    category: "social",
  },
  {
    id: "polyglot",
    icon: "Globe",
    title: {
      pt: "Poliglota",
      es: "Políglota",
      en: "Polyglot Reader",
      id: "Pembaca Poliglot",
    },
    description: {
      pt: "Alternou o idioma do site para experimentar em outra língua",
      es: "Cambió el idioma del sitio para experimentar en otro idioma",
      en: "Switched site language to read in another language",
      id: "Beralih bahasa situs untuk mencoba bahasa lain",
    },
    category: "explorer",
  },
  {
    id: "published_author",
    icon: "Feather",
    title: {
      pt: "Autor Publicado",
      es: "Autor Publicado",
      en: "Published Author",
      id: "Penulis Terbit",
    },
    description: {
      pt: "Publicou ou rascunhou uma história no painel do autor",
      es: "Publicó o redactó una historia en el panel del autor",
      en: "Published or drafted a story in the author portal",
      id: "Menerbitkan atau merancang cerita di portal penulis",
    },
    category: "author",
  },
];

import { auth } from "./firebase";

const LOCAL_KEY = "inkora_unlocked_achievements";

export function getUnlockedAchievements(userId?: string): string[] {
  try {
    const activeUid = userId || auth.currentUser?.uid;
    const key = activeUid ? `${LOCAL_KEY}_${activeUid}` : LOCAL_KEY;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function unlockAchievement(achievementId: string, userId?: string): boolean {
  try {
    const activeUid = userId || auth.currentUser?.uid;
    const key = activeUid ? `${LOCAL_KEY}_${activeUid}` : LOCAL_KEY;
    const current = getUnlockedAchievements(activeUid);
    if (!current.includes(achievementId)) {
      const updated = [...current, achievementId];
      localStorage.setItem(key, JSON.stringify(updated));
      return true; // Newly unlocked
    }
  } catch (e) {
    console.error("Error unlocking achievement:", e);
  }
  return false;
}
