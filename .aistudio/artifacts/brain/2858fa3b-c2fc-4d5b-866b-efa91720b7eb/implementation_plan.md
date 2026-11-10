# Plano de Implementação: Correção de Tamanho de Página do Firestore e Upload de PDF

## 1. Diagnóstico do Erro (2,295,327 bytes > 1,048,576 bytes)
- **Causa Raiz**: O Firestore possui um limite rígido de **1 MB (1.048.576 bytes)** por documento. No upload de documentos Word (.docx), imagens embutidas são extraídas pelo Mammoth como strings Base64 puras e não comprimidas. Uma imagem de 1.5 MB gera ~2.3 MB em Base64.
- Se o documento não tiver quebras explícitas de página (`<hr class="page-break" />`), ou se uma página contiver imagens de alta resolução, o documento `stories/{id}/pages/0` é enviado com tamanho excedente, disparando o erro `invalid-argument`.
- No `Admin.tsx`, a conversão do DOCX não fazia compressão de imagens embutidas quando salvas diretamente no banco, nem garantia um teto máximo de bytes por página.

---

## 2. Ações para Correção Definitiva do Limite do Firestore

### A. Compressão e Redimensionamento Automático de Imagens
- Criar utilitário `src/lib/imageOptimizer.ts`:
  - Recebe Base64 ou Blob de imagem embutida.
  - Redimensiona mantendo proporção (largura/altura máxima de 1080px).
  - Comprime para JPEG com qualidade 0.72 usando o elemento HTML5 `<canvas>` no navegador.
  - Reduz imagens de 2 MB - 8 MB para ~60 KB - 180 KB, garantindo que caibam confortavelmente dentro do documento da página.

### B. Divisão Segura de Páginas (`splitLargePageContent`)
- No arquivo `src/lib/docxParser.ts`, em `src/pages/Admin.tsx` e em `src/pages/Writer.tsx`:
  - Estabelecer um limite de segurança de **500.000 bytes (~500 KB)** por página (margem segura bem abaixo de 1 MB).
  - Se qualquer página (seja por texto longo ou imagens) exceder 500 KB, o algoritmo divide automaticamente pelos nós `<p>` ou sentenças em páginas sequenciais subsequentes.
  - Se um único elemento (ex.: parágrafo gigante) for maior que 500 KB, quebra por tamanho de caracteres de forma limpa.

### C. Paginação Automática para Documentos sem Quebras
- Se o DOCX não contiver marcadores de quebra de página, dividir automaticamente o texto por blocos lógicos (~350-450 palavras por página), evitando que o livro inteiro vire uma única página colossal.

---

## 3. Implementação do Upload de PDF (`src/lib/pdfParser.ts`)

### A. Motor de Extração de PDF no Cliente
- Instalar `pdfjs-dist` (biblioteca oficial da Mozilla, 100% gratuita, executa no navegador sem servidores externos nem IA, totalmente compatível com GitHub Pages).
- Criar `src/lib/pdfParser.ts`:
  - Carrega o arquivo PDF como `ArrayBuffer`.
  - Percorre cada página do PDF:
    - Extrai os itens de texto com suas posições verticais/horizontais (`getTextContent`).
    - Reconstrói linhas e parágrafos organizados em HTML (`<p>texto do parágrafo</p>`).
    - Detecta títulos e subtítulos (`<h1>`, `<h2>`) com base no tamanho relativo da fonte.
    - Se a página possuir excesso de texto (> 500 KB), aplica o particionamento seguro.
  - Retorna um array `string[]`, onde cada índice corresponde ao HTML de uma página.

### B. Integração com o Fluxo de Armazenamento Atual
- Manter **exatamente a mesma arquitetura de dados do Word**:
  - Coleção principal `stories/{storyId}`:
    - Metadados: `title`, `author`, `coverImage`, `totalPages`, `wordCount`, `tags`, etc.
  - Subcoleção `stories/{storyId}/pages/{index}`:
    - Documento indexado com `{ content: html, index }`.
- O leitor (`Reader.tsx`) e o editor (`Writer.tsx` e `StoryEditor.tsx`) já consomem esse formato, garantindo compatibilidade imediata com índice/sumário (TOC), marcadores, tradução, modo noturno e áudio.

---

## 4. Atualizações na Interface (`Admin.tsx`) e Idiomas

### A. Modos de Criação no Painel Admin
- Atualizar a barra de seleção de modo de publicação:
  - **Escrever no Site** (Editor interativo)
  - **Arquivo Word (.docx)**
  - **Arquivo PDF (.pdf)**
- Input de arquivo dedicado para PDF com validação de tipo `.pdf` e indicação visual limpa.
- Feedback de progresso em tempo real durante a extração das páginas do PDF e gravação em lote no Firestore.

### B. Suporte Multilíngue (`LanguageContext.tsx`)
- Adicionar chaves de tradução em Português, Inglês, Espanhol, Chinês e Indonésio:
  - `uploadPdfFile`, `storyPdfFileLabel`, `pdfProcessing`, `errorProcessingPdf`, etc.

### C. Otimização e Economia de Recursos
- Processamento em lote de páginas no Firestore (chunks de 5 páginas com `setDoc`), respeitando cotas gratuitas.
- Navegação mobile fluida com botões acessíveis e feedback claro de progresso.

---

## 5. Validação e Testes
1. Testar upload de DOCX com imagens grandes para confirmar que a compressão reduz para menos de 500 KB e o Firestore grava com sucesso.
2. Testar upload de DOCX longo sem quebras de página para confirmar a paginação automática.
3. Testar upload de PDF com múltiplas páginas e verificar a renderização no `Reader` e no `Writer`.
4. Executar verificação de compilação (`compile_applet`) e linting.
