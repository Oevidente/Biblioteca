# Tradução 3 de 3 — Leitor: avisar quando a tradução ficou incompleta e permitir tentar de novo

> Só executa depois dos **Traduções 1 e 2**.
> Arquivos alterados: `src/pages/Reader.tsx` e `src/contexts/LanguageContext.tsx`.

## O problema
Quando o serviço de tradução falha, a página aparece com trechos em português e o Leitor não avisa nada. Além disso, ao trocar de página com a tradução ligada, a tela fica mostrando o texto da página anterior até a nova terminar de traduzir.

## O que muda
- Se a tradução ficar incompleta, o aviso roxo no topo da página mostra um botão **"Tentar de novo"**.
- Ao começar a traduzir uma página, a área de texto é limpa (em vez de mostrar a página anterior). O aviso "Traduzindo página..." que já existe continua aparecendo.
- O tipo de idioma passa a incluir `zh`, que o projeto já suporta.

## Passo 1 — Import (`Reader.tsx`)

Trocar:

```ts
import { translateStoryPageHtml } from '../lib/storyTranslator';
```

por:

```ts
import { translateStoryPageHtmlDetailed } from '../lib/storyTranslator';
```

## Passo 2 — Estados novos

Logo depois de `const [isTranslating, setIsTranslating] = useState<boolean>(false);`, adicionar:

```ts
  const [translationIncomplete, setTranslationIncomplete] = useState(false);
  const [translationRetryKey, setTranslationRetryKey] = useState(0);
```

## Passo 3 — Substituir o `useEffect` da tradução

O efeito que começa com `let isCancelled = false;` e `async function processPageTranslation()` e termina com `}, [pageContent, isTranslationEnabled, language, id, currentPage]);` passa a ser:

```ts
  useEffect(() => {
    let isCancelled = false;

    async function processPageTranslation() {
      if (language !== 'pt' && isTranslationEnabled && pageContent) {
        // Limpa o texto da página anterior enquanto a nova é traduzida
        setDisplayContent('');
        setTranslationIncomplete(false);
        setIsTranslating(true);
        try {
          const { html, complete } = await translateStoryPageHtmlDetailed(
            pageContent,
            language as 'es' | 'en' | 'id' | 'zh',
            id || 'story',
            currentPage,
          );
          if (!isCancelled) {
            setDisplayContent(cleanStoryHtml(html));
            setTranslationIncomplete(!complete);
          }
        } catch (e) {
          console.error('Translation processing error:', e);
          if (!isCancelled) {
            setDisplayContent(cleanStoryHtml(pageContent));
            setTranslationIncomplete(true);
          }
        } finally {
          if (!isCancelled) {
            setIsTranslating(false);
          }
        }
      } else {
        setDisplayContent(cleanStoryHtml(pageContent));
        setTranslationIncomplete(false);
        setIsTranslating(false);
      }
    }

    processPageTranslation();

    return () => {
      isCancelled = true;
    };
  }, [
    pageContent,
    isTranslationEnabled,
    language,
    id,
    currentPage,
    translationRetryKey,
  ]);
```

## Passo 4 — Botão no aviso de tradução

No bloco `{/* Active Translation Indicator */}`, hoje existe:

```tsx
                {isTranslating ? (
                  <span className="opacity-80 animate-pulse ...">
                    ...
                    {t('translatingStoryPage')}
                  </span>
                ) : (
                  <span className="opacity-70 font-mono text-[9px]">
                    {t('naturalTranslationNotice')}
                  </span>
                )}
```

Trocar a parte final do ternário (o `) : (` do segundo `span`) para ter um ramo do meio, ficando:

```tsx
                {isTranslating ? (
                  <span className="opacity-80 animate-pulse ...">
                    ...
                    {t('translatingStoryPage')}
                  </span>
                ) : translationIncomplete ? (
                  <button
                    type="button"
                    onClick={() => setTranslationRetryKey((k) => k + 1)}
                    className="rounded-lg border border-current px-2.5 py-1 text-[10px] font-bold normal-case tracking-normal"
                  >
                    {t('translationPartialRetry')}
                  </button>
                ) : (
                  <span className="opacity-70 font-mono text-[9px]">
                    {t('naturalTranslationNotice')}
                  </span>
                )}
```

(Os `...` acima são o conteúdo que já existe e **não muda**.)

## Passo 5 — Texto novo em `LanguageContext.tsx`

Adicionar logo depois da linha `translatingStoryPage: ...` de cada idioma abaixo (id e zh caem no pt automaticamente):

- `pt`:
```ts
    translationPartialRetry: 'Parte do texto não foi traduzida. Tentar de novo',
```
- `en`:
```ts
    translationPartialRetry: 'Part of the text was not translated. Try again',
```
- `es`:
```ts
    translationPartialRetry: 'Parte del texto no se tradujo. Intentar de nuevo',
```

## Critério de pronto
1. `npm run lint` sem erro novo.
2. Com a tradução ligada, passar de página: a área de texto fica vazia com "Traduzindo página..." e depois aparece a página nova traduzida (não aparece mais o texto da página anterior).
3. Simular falha (modo avião logo depois de abrir a página): aparece o botão "Parte do texto não foi traduzida. Tentar de novo". Ligar a internet e tocar nele: a página se traduz.
4. Com a tradução completa, aparece o aviso normal de sempre.
5. Desligar a tradução ou voltar pra português: a página aparece normal.
