# Visualizador de Imagens (Lightbox) para Histórias e Galerias

Implementação de uma experiência imersiva de visualização de imagens (Lightbox) para o leitor, permitindo ampliar ilustrações e fotos de capa ou corpo de texto, navegar entre as fotos de uma mesma galeria, aplicar zoom interativo e fechar com múltiplos métodos naturais (botão, tecla Esc ou clique fora).

### User Review & Critical Decisions

> [!IMPORTANT]
> **Decisões confirmadas pelo usuário:**
> 1. **Fechamento**: Botão de fechar (ícone X), tecla `Esc` no teclado e clique no fundo escuro (fora da imagem).
> 2. **Zoom**: Suporte a duplo clique na imagem (toggle 1x / 2x), botões de controle de zoom (+ / - / reset) e ajuste automático à tela (fit to screen).
> 3. **Contador de Galeria**: Quando a imagem pertencer a uma galeria com múltiplas imagens, exibir contador visual claro (ex.: `1 de 3`) acompanhado das setas de navegação (anterior / próxima) e navegação por teclado (setas esquerda / direita).

---

### 1. Overview & Core Concept

- **O que faz**: Transforma qualquer imagem de história (seja isolada ou em grade/galeria) em um elemento clicável no Leitor. Ao clicar, abre um visualizador com fundo escuro translúcido, renderização nítida, controles de zoom e carrossel para fotos da mesma galeria.
- **Público-Alvo**: Leitores que querem apreciar ilustrações, mapas, fanarts e artes conceituais em detalhes sem sair do fluxo da leitura.
- **Valor**: Enriquece a imersão visual da plataforma Inkora, oferecendo uma experiência moderna similar a plataformas como Medium, Substack e ArtStation.

---

### 2. User Experience & Visual Design

- **Acionamento**:
  - Imagens dentro do texto recebem `cursor-pointer` e sutil transição visual ao passar o mouse (`hover:opacity-90` e efeito suave de expansão).
  - Um toque ou clique rápido abre imediatamente o modal com animação fluida de transição (`fade + scale`).
- **Comportamento da Galeria**:
  - Se a imagem estiver dentro de uma galeria (`.story-image-gallery`), o modal identifica todas as imagens irmãs dessa galeria específica.
  - Exibe setas laterais de navegação elegantes, contador no topo (`1 de 4`) e atalhos de teclado (seta esquerda / seta direita).
- **Controles de Zoom e Movimento**:
  - Duplo clique na imagem alterna entre zoom normal e 2x.
  - Barra de ações superior/inferior discreta com botões de zoom in (`+`), zoom out (`-`), reset e fechar (`✕`).
  - Quando em zoom, permite arrastar suavemente (pan) para inspecionar detalhes.
- **Fechamento Rápido**:
  - Botão `X` no canto superior direito com área de toque acessível (mínimo 44px).
  - Pressionar a tecla `Escape`.
  - Clicar na área escura do backdrop.

---

### 3. Key Product Decisions & Trade-Offs

- **Decisão: Componente dedicado `ImageLightboxModal` integrado em `StoryContent`**:
  - *Abordagem*: Criar o componente `ImageLightboxModal` (via React Portal no `document.body` para evitar problemas de stacking context e overflow) e ativá-lo por delegação de evento em `StoryContent.tsx`.
  - *Por quê*: Centralizar o listener no container de `StoryContent` elimina a necessidade de injetar eventos DOM manualmente em cada tag `<img>` gerada por HTML dinâmico, além de beneficiar automaticamente tanto a tela do Leitor (`Reader.tsx`) quanto a aba de pré-visualização do Editor (`StoryEditor.tsx`).
- **Decisão: Isolamento de Galeria**:
  - *Abordagem*: O carrossel é restrito à galeria específica da imagem clicada (`target.closest('.story-image-gallery')`). Se a imagem for única no parágrafo, ela abre isolada sem setas ou contadores desnecessários.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                   ARQUITETURA DO LIGHTBOX                   │
└─────────────────────────────────────────────────────────────┘

       [ StoryContent.tsx ]  <── Container com HTML renderizado
                │
                │ (1) Clique detectado em <img src="..." />
                ▼
  [ Análise de Contexto DOM ]
    ├── Imagem avulsa ───> [ Imagem única ]
    └── .story-image-gallery ──> [ Array de URLs + Índice Ativo ]
                │
                │ (2) Estado { isOpen, images, activeIndex, zoom }
                ▼
   [ ImageLightboxModal.tsx ] (Renderizado via createPortal)
    ├── Backdrop com blur (click to close)
    ├── Barra superior: Contador ("1 de 3") + Botão Fechar (X)
    ├── Imagem com suporte a Zoom e Duplo Clique
    └── Setas laterais anteriores/próximas (se galeria > 1)
```

- **Arquivos a criar/modificar**:
  - `src/components/ImageLightboxModal.tsx`: Componente de modal com animação, suporte a gestos/toque, teclado (Esc, setas), zoom e carrossel.
  - `src/components/StoryContent.tsx`: Delegação do evento `onClick` para detectar elementos `<img>`, extrair as URLs da galeria correspondente e disparar o lightbox.
  - `src/contexts/LanguageContext.tsx`: Adicionar traduções das ações do lightbox (`close`, `zoomIn`, `zoomOut`, `nextImage`, `previousImage`, `imageOf`).
