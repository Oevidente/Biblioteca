# Biblioteca

Biblioteca é uma plataforma digital sofisticada para publicação, catalogação e leitura de obras literárias a partir de arquivos DOCX. Desenvolvido com foco em legibilidade, design minimalista e performance, o sistema oferece um ambiente de leitura imersivo, paginação automatizada e controle robusto de publicações através de um painel administrativo integrado.

## Funcionalidades Principais

* **Processamento de Documentos (DOCX)**: Integração nativa com o motor Mammoth para extrair, converter e estruturar conteúdos de arquivos `.docx` diretamente para HTML sem perdas semânticas de formatação.
* **Paginação Automatizada**: Algoritmo que distribui o conteúdo textual da história em páginas individuais equilibradas, assegurando uma leitura limpa e confortável, sem sobrecarga de rolagem.
* **Leitor Imersivo de Alta Performance**:
  * Navegação fluida entre páginas com controles rápidos de teclado e toque.
  * Seletor direto de páginas para saltos rápidos no conteúdo.
  * Botão flutuante inteligente de retorno ao topo da página para maior usabilidade.
  * Indicador visual de progresso de leitura.
* **Controle de Metadados e Tags**: Catalogação flexível das histórias com suporte a metadados estendidos, incluindo autor, sinopse, data de publicação customizável e até 4 tags visuais por obra no dashboard da biblioteca.
* **Interatividade**: Sistema integrado de avaliação por estrelas (ratings) e seção de comentários com fluxo de moderação.
* **Painel de Controle Administrativo (Admin Area)**:
  * Upload simplificado de capas e arquivos DOCX.
  * Gerenciamento e edição de metadados de histórias existentes (incluindo título, autor, data de publicação e tags).
  * Fila de moderação de comentários em tempo real para controle de qualidade da comunidade.
  * Proteção de rotas com base em credenciais de administrador configuradas via Firebase Authentication.

## Arquitetura e Tecnologias

### Frontend
* **React 19 & TypeScript**: Aplicação de interface reativa, componentizada com tipagem estática e segura.
* **Vite 6**: Ferramenta de build ultra-rápida configurada para geração otimizada de pacotes estáticos.
* **Tailwind CSS v4**: Utilização da nova versão do framework utilitário via plugin Vite nativo, com uma paleta de cores neutra sofisticada e excelente contraste visual (compatível com modo claro e escuro).
* **Motion (Framer Motion)**: Animações sutis e transições de página fluidas para enriquecer a experiência do leitor sem prejudicar a performance.
* **Lucide React**: Biblioteca de ícones vetoriais modernos e limpos.

### Backend & Persistência
* **Firebase Firestore**: Banco de dados não relacional (NoSQL) escalável, responsável pela persistência das histórias, progresso de leitura do usuário, comentários e métricas de avaliações.
* **Firebase Authentication**: Sistema de login seguro com provedores sociais e e-mail/senha, garantindo autenticação para o painel de administração e segurança nas interações de usuário.

## Estrutura do Projeto

O código do projeto está organizado seguindo práticas de modularidade e separação de conceitos:

```text
├── src/
│   ├── components/       # Componentes globais e layout base da aplicação
│   ├── contexts/         # Gerenciamento de estados globais (como autenticação do usuário)
│   ├── lib/              # Inicialização do cliente Firebase e utilitários auxiliares
│   ├── pages/            # Páginas e views estruturadas (Home, Reader, Admin)
│   ├── types.ts          # Definições globais de interfaces TypeScript
│   ├── index.css         # Configurações globais e diretrizes do Tailwind CSS
│   └── main.tsx          # Ponto de entrada do React
├── firebase-blueprint.json # Definição estrutural das coleções do Firestore
├── firestore.rules       # Regras de segurança e segurança de acesso ao banco de dados
├── metadata.json         # Metadados de configuração e permissões do projeto
└── package.json          # Dependências do projeto e scripts de automação
```

## Instalação e Execução Local

### Pré-requisitos
* Node.js (versão 18 ou superior)
* npm, yarn ou bun

### Instalação de Dependências
Para instalar as dependências necessárias, execute o comando correspondente ao gerenciador de pacotes escolhido na pasta raiz do projeto:

```bash
npm install
# ou
yarn install
# ou
bun install
```

### Variáveis de Ambiente
Crie um arquivo `.env` na raiz do projeto contendo as credenciais do seu projeto Firebase (use como referência o arquivo `.env.example` disponível no repositório):

```env
VITE_FIREBASE_API_KEY=seu_api_key_aqui
VITE_FIREBASE_AUTH_DOMAIN=seu_auth_domain_aqui
VITE_FIREBASE_PROJECT_ID=seu_project_id_aqui
VITE_FIREBASE_STORAGE_BUCKET=seu_storage_bucket_aqui
VITE_FIREBASE_MESSAGING_SENDER_ID=seu_messaging_sender_id_aqui
VITE_FIREBASE_APP_ID=seu_app_id_aqui
```

### Inicializando o Servidor de Desenvolvimento
Para iniciar a aplicação em ambiente local de desenvolvimento, execute:

```bash
npm run dev
```

Acesse `http://localhost:3000` em seu navegador para testar a aplicação localmente.

### Compilação de Produção
Para compilar e otimizar a aplicação para o ambiente de produção:

```bash
npm run build
```

Os arquivos de distribuição prontos para hospedagem serão gerados na pasta `/dist`.

## Licença

Este projeto está licenciado sob a MIT License.
