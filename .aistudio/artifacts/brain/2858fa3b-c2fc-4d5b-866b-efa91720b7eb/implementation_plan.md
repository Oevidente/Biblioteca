# Sincronização Definitiva de Paginação entre Leitor e Editor

Sincronização 1:1 das páginas exibidas no Leitor com as páginas geradas e salvas pelo Editor, eliminando re-quebras indesejadas e páginas com parágrafos soltos, tanto para novas histórias quanto para obras já salvas.

### User Review & Critical Decisions

> [!IMPORTANT]
> **Diagnóstico baseado nas respostas fornecidas:**
> 1. **Histórias antigas mantêm as páginas gravadas na versão anterior:** Histórias que já estavam salvas no Firestore antes da atualização continuam com suas páginas antigas no banco até que sejam abertas no editor e salvas novamente.
> 2. **Re-paginação redundante no Leitor (`Reader.tsx`):** O `Reader.tsx` possui a função `normalizeReaderPages` que executava `paginateHtmlByWords(cleanStoryHtml(pages[pageIndex]), 350)`. Ou seja, mesmo quando o autor definia e salvava as páginas certinhas, o Leitor recebia cada página salva e tentava redividi-la aos 350 palavras. Qualquer página com mais de 350 palavras era fatiada em duas, gerando uma página seguinte com apenas 1 ou 2 parágrafos antes da quebra original.

- **Decisão Confirmada 1**: O Leitor (`Reader.tsx`) deve confiar estritamente nas páginas que o autor gerou e salvou no Firestore, sem re-fatiar cada página com `paginateHtmlByWords`.
- **Decisão Confirmada 2**: O `normalizeReaderPages` deve apenas ordenar os índices das páginas e aplicar `cleanStoryHtml`, preservando a divisão exata decidida no Editor.
- **Decisão Confirmada 3**: Para histórias já salvas no Firestore com divisão antiga, ao abrir a história no Writer ela será redistribuída pela nova regra suave (`data-auto-break="1"`) e, ao clicar em Salvar, o banco é atualizado definitivamente.

---

### 1. Overview & Core Concept

- **O que faz**: Garante paridade absoluta entre o que o autor vê na prévia do Editor e o que os leitores visualizam na tela de leitura. Cada página salva é exibida integralmente pelo Leitor sem subdivisões forçadas e sem sobras de parágrafos.
- **Público-Alvo**: Escritores e leitores da plataforma Inkora.
- **Benefício**: Leitura fluida, sem quebras arbitrárias no meio de seções e sem descompasso entre a numeração do editor e a experiência do leitor.

---

### 2. User Experience & Visual Design

- **Fluxo do Leitor**:
  1. O leitor acessa a história (seja antiga ou recente).
  2. As páginas carregadas do Firestore são exibidas exatamente como gravadas (Página 1 = Página 1 do autor, Página 2 = Página 2 do autor).
  3. Não ocorrem fatiamentos artificiais onde 1 ou 2 parágrafos pulam para uma página intermediária.
- **Fluxo do Autor (História Antiga)**:
  1. Autor abre uma história já existente no Writer.
  2. O `StoryEditor` reconhece os marcadores anteriores como suaves (`data-auto-break="1"`).
  3. Com a quebra automática ativada, o texto é redistribuído uniformemente.
  4. O autor clica em "Salvar Alterações". Todas as páginas no Firestore são atualizadas com a paginação correta.

---

### 3. Key Product Decisions & Trade-Offs

- **Decisão: Remover `paginateHtmlByWords` do `normalizeReaderPages` em `Reader.tsx`**:
  - *Abordagem Escolhida*: O Leitor renderiza fielmente o array de páginas que vem do Firestore (ou preview). Ele apenas higieniza o HTML com `cleanStoryHtml` e garante a ordem numérica crescente.
  - *Por quê*: O Editor (`StoryEditor.tsx`) já possui toda a inteligência de paginação por palavras, respeito a quebras manuais e divisão de segurança de imagens pesadas (`splitOversizedPages`). Executar uma segunda paginação no Leitor desfazia o trabalho do editor e criava páginas órfãs com parágrafos curtos.
  - *Alternativa descartada*: Manter o `paginateHtmlByWords` no Reader com limite maior (ex: 500 palavras). Descartada porque ainda causaria discrepâncias se o autor ajustasse o controle de palavras no editor.

- **Decisão: Limpeza de Cache de Sessão do Leitor (`sessionStorage`)**:
  - *Abordagem Escolhida*: Garantir que, ao atualizar ou navegar, caches antigos de páginas (`page_cache_${id}_${currentPage}`) não sirvam páginas velhas fatiadas.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                       FLUXO DE DADOS                        │
└─────────────────────────────────────────────────────────────┘

       [ StoryEditor ]
             │
             │ (1) Paginação única com tolerância e quebras manuais
             ▼
     [ Firestore: stories/{id}/pages/{index} ]
             │
             │ (2) Leitura direta das páginas gravadas
             ▼
        [ Reader.tsx ]
             │
             │ (3) normalizeReaderPages (apenas ordenação + sanitização)
             ▼
      [ Leitor Fiel 1:1 ] (Sem re-fatiamento por palavras)
```

- **Arquitetura de Componentes**:
  - `src/pages/Reader.tsx`: Ajustar `normalizeReaderPages` para não chamar `paginateHtmlByWords`. Apenas ordenar `pages` por índice, limpar com `cleanStoryHtml` e retornar a lista limpa.
  - `src/components/StoryEditor.tsx`: Manter a lógica implementada de quebras suaves (`data-auto-break="1"`), ocultação visual e sincronização de estado com o Writer.
