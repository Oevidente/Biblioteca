# Imagem 1 de 1 — Um clique na imagem seleciona e abre o menu dela

> Arquivo alterado: `src/components/StoryEditor.tsx`. Só isso.
> Não mexer na barra de imagem (posição esquerda/centro/direita, tamanho), no arraste em si, nem no menu de texto.

## O problema
Clicar uma vez numa imagem do editor não a seleciona: o menu flutuante dela não aparece. Só funciona se arrastar a imagem (segurar e mexer o mouse), e aí ela sai do lugar.

## Causa (reproduzi o comportamento num Chromium com uma réplica dos teus handlers)
A seleção já existe no código: `handleEditorPointerDown` marca a imagem como selecionada. O que desfaz é isto, na mesma função:

```ts
e.currentTarget.setPointerCapture(e.pointerId);
```

Com o ponteiro "capturado" pelo `<div contentEditable>`, o navegador dispara o evento `click` com `e.target` sendo o **próprio div do editor** (não mais a `<img>`). Aí o `handleEditorClick` entra no ramo `target instanceof HTMLImageElement === false` e faz `setSelectedImage(null)`, desmarcando a imagem logo depois de marcar.

No arraste isso não acontece porque a imagem original é trocada pela prévia no meio do gesto e o navegador nem dispara o `click`. Por isso o menu só aparecia depois de arrastar.

Resultado dos testes na réplica:
- Código atual, clique simples: `pointerdown → selecionada`, depois `click target = EDITOR(div) → desmarcada`.
- Com a correção abaixo: `click target = IMG → selecionada`.

## Passo 1 — Só capturar o ponteiro quando o arraste de verdade começar

**1a.** Em `handleEditorPointerDown`, **remover** este bloco (fica logo depois do `e.preventDefault();`):

```ts
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
```

**1b.** Em `handleEditorPointerMove`, dentro do `if (!drag.active) {`, trocar a checagem de distância e colocar a captura **depois dela**, antes de criar a prévia. Hoje está assim:

```ts
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 5) {
        return;
      }

      const preview = drag.image.cloneNode(true) as HTMLImageElement;
```

Fica assim (limite de 5 para 8 pixels, pra uma tremida do mouse num clique não virar arraste):

```ts
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 8) {
        return;
      }

      // O arraste de verdade começou: agora sim captura o ponteiro
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}

      const preview = drag.image.cloneNode(true) as HTMLImageElement;
```

O `releasePointerCapture` que já existe em `finishEditorImageDrag` continua igual.

## Passo 2 — Proteção extra pro `click` que alguns navegadores disparam depois do arraste

**2a.** Perto de `const isResizingImageRef = useRef(false);`, adicionar:

```ts
  const suppressImageClickRef = useRef(false);
```

**2b.** Em `finishEditorImageDrag`, dentro do `if (drag.active && drag.preview) {` (logo na primeira linha do bloco), adicionar:

```ts
      suppressImageClickRef.current = true;
      window.setTimeout(() => {
        suppressImageClickRef.current = false;
      }, 0);
```

**2c.** Em `handleEditorClick`, **antes** de `handleEditorFocus();`, adicionar:

```ts
    if (suppressImageClickRef.current) return;
```

## Passo 3 — Clicar fora do editor também desmarca a imagem

Hoje o desmarcar fica no `onBlur` do editor, mas o `pointerdown` da imagem usa `preventDefault()`, então o editor pode nem ter recebido foco. Resultado: clicar numa área fora do editor deixaria a imagem marcada e o menu aberto.

Logo depois do `useEffect` que registra o `selectionchange` (o que termina em `}, [updateSelectionToolbar]);`), adicionar:

```ts
  // Clicar fora do editor e da barra flutuante desmarca a imagem selecionada
  useEffect(() => {
    if (!selectedImage) return;
    const onDocumentPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        editorRef.current?.contains(target) ||
        selectionToolbarRef.current?.contains(target)
      ) {
        return;
      }
      selectedImage.classList.remove('story-image-selected');
      setSelectedImage(null);
    };
    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () =>
      document.removeEventListener('pointerdown', onDocumentPointerDown);
  }, [selectedImage]);
```

## Critério de pronto (testa na ordem)
1. `npm run lint` sem erro novo.
2. **Um clique** numa imagem: ela ganha o contorno azul e o menu dela aparece. Sem arrastar nada.
3. Clicar na imagem mexendo o mouse um pouquinho (tremida): continua só selecionando, a imagem não sai do lugar.
4. Segurar a imagem e arrastar de verdade: ela se move pro ponto onde soltar, e no fim continua selecionada com o menu aparecendo.
5. Com a imagem selecionada, usar os botões esquerda / centro / direita e o tamanho: funcionam como antes.
6. Clicar no texto do editor: a imagem é desmarcada e o menu some.
7. Clicar numa área fora do editor (fundo da página): a imagem é desmarcada.
8. Selecionar um trecho de texto: o menu de texto continua aparecendo normal.
9. No celular: tocar na imagem seleciona e abre o menu.

## Observação
Testei a correção numa réplica dos teus handlers (pointerdown, pointermove, pointerup e click) no Chromium: clique simples, clique com tremida de 5 px, arraste real, clique no texto e clique fora. Dentro do app completo, o teste é o checklist acima.
