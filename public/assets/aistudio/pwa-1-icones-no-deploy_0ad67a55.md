# PWA 1 de 2 — Ícones gerados no deploy (sem criar imagem nenhuma)

> Executa este plano sozinho. O **PWA 2** (manifest, service worker e tags) vem depois.
> Arquivos alterados: `.github/workflows/deploy.yml` e `.gitignore`. **Mais nada.**

## Regras (leia antes de qualquer coisa)
- **NÃO criar, editar nem "regenerar" nenhum arquivo de imagem (`.png`, `.jpg`...).** O AI Studio grava arquivo binário como texto e corrompe. Prova: o `public/favicon.png` que já está no repositório está inválido (o primeiro byte do PNG foi trocado por `EF BF BD`) e nenhum programa consegue abrir. Por isso os ícones do PWA são gerados **durante o deploy**, a partir de `src/img/favicon.png` (4096×4096, esse está íntegro).
- **NÃO instalar dependência nova** (nada de `sharp`, `vite-plugin-pwa`, `workbox`).
- **NÃO mexer** em `vite.config.ts`, `package.json`, `src/` nem no `HashRouter`.

## Por que isso é necessário
Um PWA instalável precisa de ícone PNG de 192 e 512 pixels (e um "maskable" pro Android recortar no formato do launcher). O site hoje não tem nenhum ícone válido: `public/favicon.png` está corrompido. O workflow de deploy (`Deploy to GitHub Pages`) roda `npm run build`, que copia `public/` pra `dist/`; então basta gerar os arquivos em `public/icons/` **antes** do build.

## Passo 1 — Gerar os ícones no `deploy.yml`

No job `build`, entre o passo `Install dependencies` e o passo `Build`, adicionar exatamente este passo (cuidado com a indentação do YAML: 6 espaços antes do `-`):

```yaml
      - name: Gerar icones do PWA a partir da logo
        run: |
          set -e
          sudo apt-get update -qq
          sudo apt-get install -y -qq imagemagick
          mkdir -p public/icons
          SRC=src/img/favicon.png
          convert "$SRC" -resize 192x192 public/icons/icon-192.png
          convert "$SRC" -resize 512x512 public/icons/icon-512.png
          convert "$SRC" -gravity center -crop 3300x3300+0+0 +repage -resize 360x360 -background "#000000" -gravity center -extent 512x512 public/icons/maskable-512.png
          convert "$SRC" -gravity center -crop 3300x3300+0+0 +repage -resize 180x180 public/icons/apple-touch-icon.png
          # o public/favicon.png do repositorio esta corrompido (1o byte trocado): recria valido
          convert "$SRC" -resize 512x512 public/favicon.png
          identify public/icons/*.png public/favicon.png
```

O que ele gera (todos a partir da logo de 4096 px):

| Arquivo | Tamanho | Uso |
|---|---|---|
| `public/icons/icon-192.png` | 192×192 | ícone padrão do app |
| `public/icons/icon-512.png` | 512×512 | ícone padrão / tela de abertura |
| `public/icons/maskable-512.png` | 512×512 | ícone "maskable" (logo menor, no centro, fundo preto até a borda, pra não ser cortada no recorte circular) |
| `public/icons/apple-touch-icon.png` | 180×180 | ícone do iPhone |
| `public/favicon.png` | 512×512 | **substitui o favicon corrompido** (também é usado na imagem de pré-visualização do link) |

## Passo 2 — `.gitignore`

Adicionar no fim do arquivo `.gitignore`:

```
# ícones do PWA são gerados no deploy
public/icons/
```

## Critério de pronto
1. O `deploy.yml` continua válido (o GitHub não mostra erro de sintaxe na aba Actions).
2. Dar push e abrir a execução **Deploy to GitHub Pages**: o passo "Gerar icones do PWA a partir da logo" fica verde e o log termina listando 5 arquivos PNG (`identify`) com os tamanhos da tabela acima.
3. Depois do deploy, abrir `https://oevidente.github.io/Biblioteca/icons/icon-512.png` e `https://oevidente.github.io/Biblioteca/favicon.png`: as duas imagens aparecem (a logo do livro).

## Observações
- Se algum dia trocar a logo `src/img/favicon.png`, os cortes do ícone maskable (`-crop 3300x3300`, `-resize 360x360`) foram calculados pra essa arte: dar uma olhada no resultado.
- No AI Studio (pré-visualização) os ícones não existem, porque só o deploy os gera. Isso não atrapalha: o app instalável é o do site publicado.
