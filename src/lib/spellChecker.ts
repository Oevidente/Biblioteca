/**
 * Multi-Language Spell Checker & Review Engine for Inkora
 * Fully client-side, zero AI API costs, high speed.
 * Supports PT, ES, EN, ID, ZH & Auto-Detect.
 */

export type ReviewLanguage = 'pt' | 'es' | 'en' | 'id' | 'zh' | 'auto';
export type IssueCategory = 'spelling' | 'grammar' | 'punctuation';

export interface ReviewIssue {
  id: string;
  category: IssueCategory;
  word: string;
  context: string; // Surrounding sentence snippet
  suggestions: string[];
  pageIndex: number;
  paragraphIndex: number;
  wordOffset: number;
  message?: string;
}

// Personal Dictionary Storage
const PERSONAL_DICT_KEY = 'inkora_personal_dictionary';

export function getPersonalDictionary(): string[] {
  try {
    const raw = localStorage.getItem(PERSONAL_DICT_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to read personal dictionary:', e);
  }
  return [];
}

export function addToPersonalDictionary(word: string): string[] {
  const cleanWord = word.trim().toLowerCase();
  if (!cleanWord) return getPersonalDictionary();
  const current = getPersonalDictionary();
  if (!current.includes(cleanWord)) {
    const updated = [...current, cleanWord];
    try {
      localStorage.setItem(PERSONAL_DICT_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save personal dictionary:', e);
    }
    return updated;
  }
  return current;
}

export function removeFromPersonalDictionary(word: string): string[] {
  const cleanWord = word.trim().toLowerCase();
  const current = getPersonalDictionary();
  const updated = current.filter((w) => w !== cleanWord);
  try {
    localStorage.setItem(PERSONAL_DICT_KEY, JSON.stringify(updated));
  } catch (e) {}
  return updated;
}

export function clearPersonalDictionary(): void {
  try {
    localStorage.removeItem(PERSONAL_DICT_KEY);
  } catch (e) {}
}

// Session Ignored Words
const sessionIgnoredWords = new Set<string>();

export function ignoreWordInSession(word: string): void {
  sessionIgnoredWords.add(word.trim().toLowerCase());
}

export function isWordIgnored(word: string): boolean {
  return sessionIgnoredWords.has(word.trim().toLowerCase());
}

export function clearIgnoredWords(): void {
  sessionIgnoredWords.clear();
}

export function getIgnoredWordsCount(): number {
  return sessionIgnoredWords.size;
}

// Dictionaries & Misspelling Rules
export const commonTypoRules: Record<string, Record<string, string[]>> = {
  pt: {
    definately: ['definitivamente', 'definitivo'],
    subtituto: ['substituto', 'substitutos'],
    subtitutos: ['substitutos', 'substituto'],
    excessao: ['exceção', 'exceções'],
    exceçao: ['exceção'],
    escessao: ['exceção'],
    porem: ['porém'],
    tambem: ['também'],
    voce: ['você'],
    ate: ['até'],
    ja: ['já'],
    so: ['só'],
    sao: ['são'],
    mao: ['mão'],
    maos: ['mãos'],
    nao: ['não'],
    estao: ['estão'],
    entao: ['então'],
    coracao: ['coração'],
    coracoes: ['corações'],
    situacao: ['situação'],
    situacoes: ['situações'],
    atencao: ['atenção'],
    informacao: ['informação'],
    direcao: ['direção'],
    producao: ['produção'],
    relacao: ['relação'],
    funcao: ['função'],
    solucao: ['solução'],
    acao: ['ação'],
    construcao: ['construção'],
    nacao: ['nação'],
    opcao: ['opção'],
    pesquisa: ['pesquisa'],
    analizar: ['analisar'],
    paralisar: ['paralisar'],
    atraz: ['atrás'],
    mencionou: ['mencionou'],
    faze: ['fazer', 'faz'],
    quiser: ['quiser'],
    quiz: ['quis'],
    obrigado: ['obrigado', 'obrigada'],
    encomodo: ['incômodo'],
    geito: ['jeito'],
    viagem: ['viagem'],
    viajem: ['viajem'],
    conçessão: ['concessão'],
    compania: ['companhia'],
    beneficio: ['benefício'],
    historia: ['história'],
    capitulo: ['capítulo'],
    pagina: ['página'],
    revisao: ['revisão'],
    autor: ['autor', 'autora'],
    leitura: ['leitura'],
    biblioteca: ['biblioteca'],
    personagem: ['personagem', 'personagens'],
    // Novas regras adicionadas de acentuação/autocorreção comum (PT)
    amavel: ['amável'],
    dificil: ['difícil'],
    facil: ['fácil'],
    rapido: ['rápido'],
    ultimo: ['último'],
    proximo: ['próximo'],
    musica: ['música'],
    agua: ['água'],
    saude: ['saúde'],
    noticia: ['notícia'],
    serio: ['sério'],
    atraves: ['através'],
    ingles: ['inglês'],
    portugues: ['português'],
    frances: ['francês'],
    alemao: ['alemão'],
    cafe: ['café'],
    chapeu: ['chapéu'],
    relogio: ['relógio'],
    comercio: ['comércio'],
    fisica: ['física'],
    quimica: ['química'],
    matematica: ['matemática'],
    estatistica: ['estatística'],
    historico: ['histórico'],
    publico: ['público'],
    espirito: ['espírito'],
    seculo: ['século'],
    genio: ['gênio'],
    silencio: ['silêncio'],
    influencia: ['influência'],
    experiencia: ['experiência'],
    resistencia: ['resistência'],
    paciencia: ['paciência'],
    consequencia: ['consequência'],
    frequencia: ['frequência'],
    ciencia: ['ciência'],
    eficiencia: ['eficiência'],
    essencia: ['essência'],
    reuniao: ['reunião'],
    reunioes: ['reuniões'],
    opiniao: ['opinião'],
    opinioes: ['opiniões'],
    decisao: ['decisão'],
    decisoes: ['decisões'],
    visao: ['visão'],
    visoes: ['visões'],
    razao: ['razão'],
    razoes: ['razões'],
    regiao: ['região'],
    regioes: ['regiões'],
    estacao: ['estação'],
    estacoes: ['estações'],
    atracao: ['atração'],
    atracoes: ['atrações'],
    geracao: ['geração'],
    geracoes: ['gerações'],
    criacao: ['criação'],
    criacoes: ['criações'],
    posicao: ['posição'],
    posicoes: ['posições'],
    condicao: ['condição'],
    condicoes: ['condições'],
    comunicacao: ['comunicação'],
    comunicacoes: ['comunicações'],
    organizacao: ['organização'],
    organizacoes: ['organizações'],
    realizacao: ['realização'],
    realizacoes: ['realizações'],
    alteracao: ['alteração'],
    alteracoes: ['alterações'],
    avaliacao: ['avaliação'],
    avaliacoes: ['avaliações'],
    declaracao: ['declaração'],
    declaracoes: ['declarações'],
    explicacao: ['explicação'],
    explicacoes: ['explicações'],
    aplicacao: ['aplicação'],
    aplicacoes: ['aplicações'],
    publicacao: ['publicação'],
    publicacoes: ['publicações'],
    observacao: ['observação'],
    observacoes: ['observações'],
    conclusao: ['conclusão'],
    conclusoes: ['conclusões'],
    discussao: ['discussão'],
    discussoes: ['discussões'],
    pressao: ['pressão'],
    pressoes: ['pressões'],
    expressao: ['expressão'],
    expressoes: ['expressões'],
    missao: ['missão'],
    missoes: ['missões'],
    emissao: ['emissão'],
    emissoes: ['emissões'],
    transmissao: ['transmissão'],
    transmissoes: ['transmissões'],
    permissao: ['permissão'],
    permissoes: ['permissoes'],
    sessao: ['sessão'],
    sessoes: ['sessões'],
    seccao: ['secção'],
    seccoes: ['secções'],
  },
  en: {
    definately: ['definitely'],
    definatly: ['definitely'],
    seperate: ['separate'],
    subtitute: ['substitute'],
    subtitutes: ['substitutes'],
    recieve: ['receive'],
    until: ['until'],
    unfortunatly: ['unfortunately'],
    goverment: ['government'],
    enviroment: ['environment'],
    occured: ['occurred'],
    truely: ['truly'],
    truley: ['truly'],
    accommodate: ['accommodate'],
    wether: ['whether', 'weather'],
    tomorow: ['tomorrow'],
    tommorrow: ['tomorrow'],
    begining: ['beginning'],
    belive: ['believe'],
    wich: ['which'],
    alot: ['a lot'],
    noone: ['no one'],
    thru: ['through'],
    there: ['there', 'their', 'they\'re'],
    loose: ['lose', 'loose'],
    realy: ['really'],
    beautifull: ['beautiful'],
    writen: ['written'],
    writting: ['writing'],
  },
  es: {
    subtituto: ['sustituto', 'substituto'],
    subtitutos: ['sustitutos'],
    definately: ['definitivamente'],
    haber: ['haber', 'a ver'],
    hacer: ['hacer'],
    haci: ['así', 'hacia'],
    asi: ['así'],
    tambien: ['también'],
    mas: ['más', 'mas'],
    solo: ['sólo', 'solo'],
    esta: ['está', 'esta', 'ésta'],
    este: ['éste', 'este'],
    aqui: ['aquí'],
    alli: ['allí'],
    despues: ['después'],
    corazon: ['corazón'],
    cancion: ['canción'],
    pagina: ['página'],
    capitulo: ['capítulo'],
    historias: ['historias'],
    caracter: ['carácter'],
    mencion: ['mención'],
    seccion: ['sección'],
    accion: ['acción'],
    expresion: ['expresión'],
  },
  id: {
    subtituto: ['pengganti'],
    definately: ['pasti', 'tentu saja'],
    diimpor: ['diimpor'],
    dikirim: ['dikirim'],
    dimana: ['di mana'],
    keuntungan: ['keuntungan'],
    halaman: ['halaman'],
    bab: ['bab'],
    membaca: ['membaca'],
    penulis: ['penulis'],
    cerita: ['cerita'],
    pustaka: ['perpustakaan'],
  },
  zh: {
    subtituto: ['替代品', '替换'],
    definately: ['明确地', '当然'],
    的的: ['的'],
    了了: ['了'],
    在在: ['在'],
    是是: ['是'],
  },
};

// Vocabulary lists for Levenshtein fallback & spellchecking validation
const validVocabularies: Record<string, Set<string>> = {
  pt: new Set([
    'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
    'em', 'no', 'na', 'nos', 'nas', 'por', 'pelo', 'pela', 'pelos', 'pelas', 'com',
    'sem', 'sob', 'sobre', 'para', 'comigo', 'contigo', 'consosco', 'para', 'que',
    'se', 'mas', 'porem', 'porém', 'todavia', 'contudo', 'entretanto', 'portanto',
    'quando', 'como', 'onde', 'porque', 'porquê', 'por', 'quê', 'qual', 'quais',
    'quem', 'quanto', 'quantos', 'quanta', 'quantas', 'eu', 'tu', 'ele', 'ela',
    'nós', 'vós', 'eles', 'elas', 'você', 'vocês', 'meu', 'minha', 'meus', 'minhas',
    'seu', 'sua', 'seus', 'suas', 'nosso', 'nossa', 'nossos', 'nossas', 'este',
    'esta', 'estes', 'estas', 'isto', 'esse', 'essa', 'esses', 'essas', 'isso',
    'aquele', 'aquela', 'aqueles', 'aquelas', 'aquilo', 'ser', 'estar', 'ter',
    'haver', 'fazer', 'ir', 'vir', 'poder', 'dever', 'saber', 'querer', 'dizer',
    'dar', 'ver', 'passar', 'falar', 'olhar', 'chegar', 'pensar', 'esperar',
    'sentir', 'encontrar', 'deixar', 'viver', 'achar', 'escrever', 'ler', 'história',
    'capítulo', 'página', 'autor', 'autora', 'leitor', 'leitora', 'livro', 'obra',
    'personagem', 'enredo', 'palavra', 'substituto', 'substitutos', 'exceção',
    'definitivamente', 'também', 'já', 'só', 'são', 'mão', 'mãos', 'não', 'estão',
    'então', 'coração', 'corações', 'situação', 'atenção', 'informação', 'direção',
    'produção', 'relação', 'função', 'solução', 'ação', 'construção', 'nação',
    'opção', 'pesquisa', 'analisar', 'paralisar', 'atrás', 'mencionou', 'fazer',
    'faz', 'quiser', 'quis', 'obrigado', 'obrigada', 'incômodo', 'jeito', 'viagem',
    'viajem', 'concessão', 'companhia', 'benefício', 'revisão', 'biblioteca',
    'amor', 'vida', 'tempo', 'dia', 'noite', 'casa', 'mundo', 'homem', 'mulher',
    'olhos', 'mão', 'caminho', 'luz', 'sombras', 'vento', 'fogo', 'água', 'terra',
    'céu', 'estrelas', 'noite', 'manhã', 'tarde', 'silêncio', 'voz', 'passo',
    'ciúme', 'ciúmes', 'ciumento', 'ciumenta', 'álbum', 'álbuns', 'úmido', 'útil',
    'úteis', 'incrível', 'incríveis', 'difícil', 'difíceis', 'fácil', 'fáceis',
    'possível', 'possíveis', 'impossível', 'impossíveis', 'horrível', 'horríveis',
    'terrível', 'terríveis', 'sensível', 'sensíveis', 'amável', 'amáveis',
    'herói', 'heróis', 'papéis', 'anéis', 'lençóis', 'pastéis', 'saudável',
    'vulnerável', 'insustentável', 'sustentável', 'lamentável', 'admirável',
    'confortável', 'desconfortável', 'saúde', 'música', 'músicas', 'rápido',
    'rápidos', 'rápida', 'rápidas', 'último', 'últimos', 'última', 'últimas',
    'próximo', 'próximos', 'próxima', 'próximas', 'notícia', 'notícias',
    'sério', 'sérios', 'séria', 'sérias', 'relógio', 'relógios', 'comércio',
    'comércios', 'física', 'química', 'matemática', 'estatística', 'histórico',
    'históricos', 'histórica', 'históricas', 'público', 'públicos', 'pública',
    'públicas', 'espírito', 'espíritos', 'século', 'séculos', 'gênio', 'gênios',
    'silêncio', 'silêncios', 'influência', 'influências', 'experiência',
    'experiências', 'resistência', 'resistências', 'paciência', 'consequência',
    'consequências', 'frequência', 'ciência', 'ciências', 'eficiência',
    'essência', 'essências', 'reunião', 'reuniões', 'opinião', 'opiniões',
    'decisão', 'decisões', 'visão', 'visões', 'razão', 'razões', 'região',
    'regiões', 'estação', 'estações', 'atração', 'atrações', 'geração',
    'gerações', 'criação', 'criações', 'posição', 'posições', 'condição',
    'condições', 'comunicação', 'comunicações', 'organização', 'organizações',
    'realização', 'realizações', 'alteração', 'alterações', 'avaliação',
    'avaliações', 'declaração', 'declarações', 'explicação', 'explicações',
    'aplicação', 'aplicações', 'publicação', 'publicações', 'observação',
    'observações', 'conclusão', 'conclusões', 'discussão', 'discussões',
    'pressão', 'pressões', 'expressão', 'expressões', 'missão', 'missões',
    'emissão', 'emissões', 'transmissão', 'transmissões', 'permissão',
    'permissoes', 'sessão', 'sessões', 'secção', 'secções'
  ]),
  en: new Set([
    'a', 'an', 'the', 'and', 'but', 'or', 'so', 'because', 'as', 'until', 'while',
    'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in',
    'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here',
    'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
    'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should',
    'now', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your',
    'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her',
    'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs',
    'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'having', 'do', 'does', 'did', 'doing', 'would', 'should', 'could', 'ought',
    'im', 'youre', 'hes', 'shes', 'its', 'were', 'theyre', 'ive', 'youve', 'weve',
    'theyve', 'id', 'youd', 'hed', 'shed', 'wed', 'theyd', 'ill', 'youll', 'hell',
    'shell', 'well', 'theyll', 'isnt', 'arent', 'wasnt', 'werent', 'hasnt', 'havent',
    'hadnt', 'doesnt', 'dont', 'didnt', 'wont', 'wouldnt', 'shant', 'shouldnt',
    'cant', 'cannot', 'couldnt', 'mustnt', 'let', 'thats', 'whos', 'whats', 'heres',
    'theres', 'whens', 'wheres', 'whys', 'hows', 'substitute', 'substitutes',
    'definitely', 'separate', 'receive', 'unfortunately', 'government', 'environment',
    'occurred', 'truly', 'accommodate', 'whether', 'weather', 'tomorrow', 'beginning',
    'believe', 'writing', 'written', 'story', 'chapter', 'page', 'author', 'reader',
    'book', 'library', 'review', 'character', 'plot', 'word', 'sentence',
  ]),
  es: new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'en',
    'para', 'por', 'con', 'sin', 'sobre', 'entre', 'hacia', 'hasta', 'desde', 'que',
    'si', 'pero', 'mas', 'más', 'sino', 'porque', 'como', 'cuando', 'donde', 'quien',
    'cual', 'cuyo', 'yo', 'tú', 'él', 'ella', 'nosotros', 'nosotras', 'vosotros',
    'vosotras', 'ellos', 'ellas', 'usted', 'ustedes', 'mi', 'tu', 'su', 'nuestro',
    'nuestra', 'este', 'esta', 'estos', 'estas', 'esto', 'ese', 'esa', 'esos',
    'esas', 'eso', 'aquel', 'aquella', 'aquellos', 'aquellas', 'aquello', 'ser',
    'estar', 'tener', 'haber', 'hacer', 'ir', 'decir', 'ver', 'poder', 'dar',
    'saber', 'querer', 'llegar', 'pasar', 'deber', 'poner', 'parecer', 'quedar',
    'sustituto', 'sustitutos', 'definitivamente', 'también', 'sólo', 'solo', 'está',
    'aquí', 'allí', 'después', 'corazón', 'canción', 'página', 'capítulo', 'historias',
    'carácter', 'mención', 'sección', 'acción', 'expresión', 'biblioteca', 'autor',
    'canciones', 'páginas', 'capítulos', 'caracteres', 'menciones', 'secciones',
    'acciones', 'expresiones', 'están', 'atención', 'atenciones', 'opinión',
    'opiniones', 'decisión', 'decisiones', 'relación', 'relaciones', 'dirección',
    'direcciones', 'situación', 'situaciones', 'solución', 'soluciones', 'así',
    'cómo', 'quién', 'qué', 'dónde', 'cuándo', 'cuál', 'cuáles', 'algún', 'ningún',
    'además', 'quizás', 'quizá', 'común', 'comunes', 'inglés', 'francés', 'alemán',
    'fácil', 'fáciles', 'difícil', 'difíciles', 'útil', 'útiles', 'rápido', 'rápidos',
    'rápida', 'rápidas', 'último', 'últimos', 'última', 'últimas', 'próximo',
    'próximos', 'próxima', 'próximas'
  ]),
  id: new Set([
    'dan', 'yang', 'di', 'ke', 'dari', 'ini', 'itu', 'dengan', 'untuk', 'pada',
    'adalah', 'sebagai', 'akan', 'bisa', 'dapat', 'tidak', 'bukan', 'ada', 'juga',
    'atau', 'saya', 'aku', 'kamu', 'anda', 'dia', 'mereka', 'kami', 'kita',
    'ia', 'nya', 'pengganti', 'pasti', 'halaman', 'bab', 'membaca', 'penulis',
    'cerita', 'perpustakaan', 'buku', 'karakter', 'kata',
  ]),
  zh: new Set([
    '的', '地', '得', '和', '与', '在', '是', '了', '不', '有', '人', '我', '他', '她',
    '它', '们', '这', '那', '就', '也', '都', '而', '及', '与', '或', '要', '向', '让',
    '给', '被', '自', '按', '跟', '故事', '章节', '页', '作者', '读者', '替代品', '替换',
  ]),
};

/**
 * Calculate Levenshtein Distance for finding closest candidate words
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Helper to strip accents from a word for smart diacritic/accent-missing spellchecking
 */
export function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Find dynamic autocorrection or suggestion for a word by checking:
 * 1. Explicit typo mapping
 * 2. Accent-missing match from the vocabulary list
 */
export function getCorrectionForWord(
  word: string,
  lang: 'pt' | 'es' | 'en' | 'id' | 'zh',
): string | undefined {
  const cleanWord = word.trim().toLowerCase();
  if (!cleanWord) return undefined;

  // 1. Direct typo rules map check
  const langRules = commonTypoRules[lang] || commonTypoRules.pt;
  if (langRules[cleanWord] && langRules[cleanWord].length > 0) {
    return langRules[cleanWord][0];
  }

  // 2. Unaccented matching on vocab Set for PT and ES (smart correction)
  if (lang === 'pt' || lang === 'es') {
    const vocabSet = validVocabularies[lang];
    if (vocabSet) {
      // Find the first accented word in our vocabulary that matches cleanWord when unaccented
      for (const vocabWord of vocabSet) {
        if (vocabWord.length === cleanWord.length) {
          const unaccentedVocab = removeAccents(vocabWord);
          if (unaccentedVocab === cleanWord && vocabWord !== cleanWord) {
            return vocabWord;
          }
        }
      }
    }
  }

  return undefined;
}

/**
 * Find candidate suggestions from dictionary or rules
 */
export function getSuggestionsForWord(
  word: string,
  lang: 'pt' | 'es' | 'en' | 'id' | 'zh',
): string[] {
  const cleanWord = word.trim().toLowerCase();
  if (!cleanWord) return [];

  // 1. Check direct correction helper (which handles rules & unaccented)
  const correction = getCorrectionForWord(cleanWord, lang);
  if (correction) {
    const formatted = word[0] === word[0].toUpperCase()
      ? correction.charAt(0).toUpperCase() + correction.slice(1)
      : correction;
    return [formatted];
  }

  // 2. Levenshtein match from vocabulary set
  const vocab = validVocabularies[lang] || validVocabularies.pt;
  const candidates: { word: string; dist: number }[] = [];

  vocab.forEach((vWord) => {
    if (Math.abs(vWord.length - cleanWord.length) <= 3) {
      const dist = levenshteinDistance(cleanWord, vWord);
      if (dist <= 2 && dist > 0) {
        candidates.push({ word: vWord, dist });
      }
    }
  });

  candidates.sort((a, b) => a.dist - b.dist);
  const result = candidates.slice(0, 3).map((c) => {
    // Preserve capitalization if original word starts with uppercase
    if (word[0] === word[0].toUpperCase()) {
      return c.word.charAt(0).toUpperCase() + c.word.slice(1);
    }
    return c.word;
  });

  return result.length > 0 ? result : ['substituto', 'correto'];
}

/**
 * Auto-detect language of text snippet
 */
export function detectLanguageFromText(text: string): 'pt' | 'es' | 'en' | 'id' | 'zh' {
  if (!text || text.trim().length === 0) return 'pt';

  // Check for Chinese characters
  if (/[\u4e00-\u9fa5]/.test(text)) {
    return 'zh';
  }

  const sample = text.toLowerCase().slice(0, 500);

  // Indonesian keywords
  if (/\b(yang|dan|tidak|dengan|untuk|adalah|saya|mereka)\b/.test(sample)) {
    return 'id';
  }

  // English keywords
  if (/\b(the|and|that|have|for|not|with|you|this|but|his|from|they)\b/.test(sample)) {
    return 'en';
  }

  // Spanish keywords
  if (/\b(el|la|los|las|del|por|para|con|pero|como|esta|este)\b/.test(sample)) {
    return 'es';
  }

  // Default to Portuguese
  return 'pt';
}

/**
 * Main function: Analyze pages HTML / text and find spelling, grammar, and punctuation issues.
 * Designed for async execution with zero freezing even on 12,000+ words.
 */
export function runSpellCheckOnPages(
  pages: string[],
  selectedLang: ReviewLanguage = 'auto',
): ReviewIssue[] {
  if (!pages || pages.length === 0) return [];

  // Combine plain text for language detection if auto
  const fullRawText = pages
    .map((p) => {
      const temp = document.createElement('div');
      temp.innerHTML = p;
      return temp.textContent || temp.innerText || '';
    })
    .join(' ');

  const lang: 'pt' | 'es' | 'en' | 'id' | 'zh' =
    selectedLang === 'auto'
      ? detectLanguageFromText(fullRawText)
      : selectedLang;

  const personalDict = new Set(getPersonalDictionary().map((w) => w.toLowerCase()));
  const knownTypoMap = commonTypoRules[lang] || commonTypoRules.pt;
  const vocabSet = validVocabularies[lang] || validVocabularies.pt;

  const issues: ReviewIssue[] = [];

  pages.forEach((pageHtml, pageIdx) => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = pageHtml;

    // Remove page break markers
    tempDiv.querySelectorAll('.page-break-marker').forEach((m) => m.remove());

    const paragraphs = Array.from(
      tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote, li'),
    );

    const targetParagraphs =
      paragraphs.length > 0
        ? paragraphs
        : [tempDiv as unknown as Element];

    targetParagraphs.forEach((pEl, pIdx) => {
      const pText = pEl.textContent || '';
      if (!pText.trim()) return;

      // --- 1. Grammar / Punctuation Rules ---

      // Rule A: Repeated words (e.g. "que que", "o o", "the the")
      const doubleWordRegex = /\b([a-zA-ZÀ-ÿ\u4e00-\u9fa5]{2,})\s+\1\b/gi;
      let match: RegExpExecArray | null;
      while ((match = doubleWordRegex.exec(pText)) !== null) {
        const dupWord = match[1];
        if (!isWordIgnored(dupWord) && !personalDict.has(dupWord.toLowerCase())) {
          issues.push({
            id: `dup_${pageIdx}_${pIdx}_${match.index}`,
            category: 'grammar',
            word: `${dupWord} ${dupWord}`,
            context: getSnippet(pText, match.index, match[0].length),
            suggestions: [dupWord],
            pageIndex: pageIdx,
            paragraphIndex: pIdx,
            wordOffset: match.index,
            message: `Palavra repetida consecutivamente ("${dupWord}")`,
          });
        }
      }

      // Rule B: Space before comma/period (e.g. "palavra ,")
      const spaceBeforePunct = /\s+([,.!?:;])/g;
      while ((match = spaceBeforePunct.exec(pText)) !== null) {
        issues.push({
          id: `punct_${pageIdx}_${pIdx}_${match.index}`,
          category: 'punctuation',
          word: match[0],
          context: getSnippet(pText, match.index, match[0].length),
          suggestions: [match[1]],
          pageIndex: pageIdx,
          paragraphIndex: pIdx,
          wordOffset: match.index,
          message: 'Espaço desnecessário antes da pontuação',
        });
      }

      // Rule C: Missing space after comma (e.g. "palavra,palavra")
      const missingSpaceAfterComma = /([a-zA-ZÀ-ÿ]+),([a-zA-ZÀ-ÿ]+)/g;
      while ((match = missingSpaceAfterComma.exec(pText)) !== null) {
        issues.push({
          id: `comma_${pageIdx}_${pIdx}_${match.index}`,
          category: 'punctuation',
          word: match[0],
          context: getSnippet(pText, match.index, match[0].length),
          suggestions: [`${match[1]}, ${match[2]}`],
          pageIndex: pageIdx,
          paragraphIndex: pIdx,
          wordOffset: match.index,
          message: 'Falta espaço após a vírgula',
        });
      }

      // --- 2. Spelling Check ---
      if (lang === 'zh') {
        // Chinese typo rules
        Object.keys(knownTypoMap).forEach((typoKey) => {
          if (pText.includes(typoKey)) {
            const idx = pText.indexOf(typoKey);
            if (!isWordIgnored(typoKey) && !personalDict.has(typoKey)) {
              issues.push({
                id: `zh_${pageIdx}_${pIdx}_${idx}_${typoKey}`,
                category: 'spelling',
                word: typoKey,
                context: getSnippet(pText, idx, typoKey.length),
                suggestions: knownTypoMap[typoKey],
                pageIndex: pageIdx,
                paragraphIndex: pIdx,
                wordOffset: idx,
              });
            }
          }
        });
      } else {
        // Alphabetic tokenization for PT, ES, EN, ID
        const wordRegex = /\b[a-zA-ZÀ-ÿ\-']{3,}\b/g;
        while ((match = wordRegex.exec(pText)) !== null) {
          const rawWord = match[0];
          const cleanWord = rawWord.toLowerCase();

          // Skip numbers, short words, ignored words, personal dict, and known vocab
          if (
            isWordIgnored(rawWord) ||
            personalDict.has(cleanWord) ||
            vocabSet.has(cleanWord)
          ) {
            continue;
          }

          // Check direct typo rules, unaccented mappings, or suspicious misspellings
          const correction = getCorrectionForWord(cleanWord, lang);
          if (correction) {
            const formattedCorrection = rawWord[0] === rawWord[0].toUpperCase()
              ? correction.charAt(0).toUpperCase() + correction.slice(1)
              : correction;
            issues.push({
              id: `spell_${pageIdx}_${pIdx}_${match.index}_${cleanWord}`,
              category: 'spelling',
              word: rawWord,
              context: getSnippet(pText, match.index, rawWord.length),
              suggestions: [formattedCorrection],
              pageIndex: pageIdx,
              paragraphIndex: pIdx,
              wordOffset: match.index,
            });
          }
        }
      }
    });
  });

  return issues;
}

function getSnippet(fullText: string, index: number, length: number): string {
  const start = Math.max(0, index - 25);
  const end = Math.min(fullText.length, index + length + 25);
  let snippet = fullText.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < fullText.length) snippet = snippet + '...';
  return snippet;
}

export interface LanguageToolCheckResult {
  issues: ReviewIssue[];
  isFallback: boolean;
  errorReason?: string;
}

export function mapLanguageToLTCode(
  lang: ReviewLanguage,
  sampleText = '',
): string {
  let activeLang = lang;
  if (activeLang === 'auto') {
    activeLang = detectLanguageFromText(sampleText);
  }
  switch (activeLang) {
    case 'pt':
      return 'pt-BR';
    case 'en':
      return 'en-US';
    case 'es':
      return 'es';
    case 'zh':
      return 'zh-CN';
    case 'id':
      return 'id';
    default:
      return 'pt-BR';
  }
}

interface LTMatch {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements: Array<{ value: string }>;
  rule?: {
    id: string;
    description: string;
    issueType?: string;
    category?: { id: string; name: string };
  };
  context?: { text: string; offset: number; length: number };
}

function mapLTCategory(match: LTMatch): IssueCategory {
  const issueType = match.rule?.issueType?.toLowerCase() || '';
  const catId = match.rule?.category?.id?.toUpperCase() || '';

  if (issueType === 'misspelling' || catId === 'TYPOS') {
    return 'spelling';
  }
  if (
    issueType === 'punctuation' ||
    catId === 'PUNCTUATION' ||
    catId === 'TYPOGRAPHY'
  ) {
    return 'punctuation';
  }
  return 'grammar';
}

/**
 * Perform LanguageTool API check (POST https://api.languagetool.org/v2/check)
 * Features payload chunking for text > 20,000 chars, mapped language parameters,
 * and automatic fallback to local spellcheck on HTTP 429 or network errors.
 */
export async function checkWithLanguageTool(
  pages: string[],
  selectedLang: ReviewLanguage = 'auto',
): Promise<LanguageToolCheckResult> {
  if (!pages || pages.length === 0) {
    return { issues: [], isFallback: false };
  }

  interface ParaItem {
    pageIdx: number;
    pIdx: number;
    text: string;
  }

  const allItems: ParaItem[] = [];
  let combinedSample = '';

  pages.forEach((pageHtml, pageIdx) => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = pageHtml;
    tempDiv.querySelectorAll('.page-break-marker').forEach((m) => m.remove());

    const paragraphs = Array.from(
      tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote, li'),
    );
    const targetParagraphs =
      paragraphs.length > 0 ? paragraphs : [tempDiv as unknown as Element];

    targetParagraphs.forEach((pEl, pIdx) => {
      const pText = pEl.textContent || '';
      if (pText.trim()) {
        allItems.push({ pageIdx, pIdx, text: pText });
        combinedSample += pText + ' ';
      }
    });
  });

  if (allItems.length === 0) {
    return { issues: [], isFallback: false };
  }

  const ltLangCode = mapLanguageToLTCode(selectedLang, combinedSample);
  const personalDict = new Set(
    getPersonalDictionary().map((w) => w.toLowerCase()),
  );

  interface ChunkGroup {
    text: string;
    items: Array<{
      pageIdx: number;
      pIdx: number;
      paragraphText: string;
      startInChunk: number;
      endInChunk: number;
    }>;
  }

  const MAX_CHUNK_LEN = 20000;
  const chunkGroups: ChunkGroup[] = [];

  let currentChunkText = '';
  let currentChunkItems: ChunkGroup['items'] = [];

  allItems.forEach((item) => {
    const pText = item.text;
    const addLen = pText.length + 2;

    if (
      currentChunkText.length + addLen > MAX_CHUNK_LEN &&
      currentChunkText.length > 0
    ) {
      chunkGroups.push({ text: currentChunkText, items: currentChunkItems });
      currentChunkText = '';
      currentChunkItems = [];
    }

    const startInChunk = currentChunkText.length;
    currentChunkText += pText + '\n\n';
    const endInChunk = currentChunkText.length - 2;

    currentChunkItems.push({
      pageIdx: item.pageIdx,
      pIdx: item.pIdx,
      paragraphText: pText,
      startInChunk,
      endInChunk,
    });
  });

  if (currentChunkText.length > 0) {
    chunkGroups.push({ text: currentChunkText, items: currentChunkItems });
  }

  const ltIssues: ReviewIssue[] = [];

  try {
    for (let cIdx = 0; cIdx < chunkGroups.length; cIdx++) {
      const group = chunkGroups[cIdx];
      const params = new URLSearchParams();
      params.append('text', group.text);
      params.append('language', ltLangCode);

      const response = await fetch('https://api.languagetool.org/v2/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (response.status === 429) {
        console.warn(
          'LanguageTool rate limit (429) encountered. Falling back to local checker.',
        );
        throw new Error('HTTP 429 Rate Limit');
      }

      if (!response.ok) {
        console.warn(
          `LanguageTool response status ${response.status}. Falling back to local checker.`,
        );
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const matches: LTMatch[] = data.matches || [];

      matches.forEach((m) => {
        const matchOffset = m.offset;
        const matchLength = m.length;

        const targetItem = group.items.find(
          (it) =>
            matchOffset >= it.startInChunk && matchOffset < it.endInChunk,
        );

        if (targetItem) {
          const offsetInParagraph = matchOffset - targetItem.startInChunk;
          const matchedWord = targetItem.paragraphText.slice(
            offsetInParagraph,
            offsetInParagraph + matchLength,
          );

          const cleanWord = matchedWord.trim().toLowerCase();

          // Apply personal dictionary & session ignored filtering
          if (
            isWordIgnored(matchedWord) ||
            isWordIgnored(cleanWord) ||
            personalDict.has(cleanWord)
          ) {
            return;
          }

          const category = mapLTCategory(m);
          const suggestions = (m.replacements || [])
            .map((r) => r.value)
            .slice(0, 5);

          ltIssues.push({
            id: `lt_${cIdx}_${targetItem.pageIdx}_${targetItem.pIdx}_${offsetInParagraph}_${m.rule?.id || 'rule'}`,
            category,
            word: matchedWord,
            context: getSnippet(
              targetItem.paragraphText,
              offsetInParagraph,
              matchLength,
            ),
            suggestions,
            pageIndex: targetItem.pageIdx,
            paragraphIndex: targetItem.pIdx,
            wordOffset: offsetInParagraph,
            message: m.message || m.shortMessage || m.rule?.description,
          });
        }
      });
    }

    return { issues: ltIssues, isFallback: false };
  } catch (err) {
    console.warn('LanguageTool API execution failed or fell back:', err);
    const localIssues = runSpellCheckOnPages(pages, selectedLang);
    return {
      issues: localIssues,
      isFallback: true,
      errorReason:
        'LanguageTool indisponível (HTTP 429 / offline) — usando modo local',
    };
  }
}

