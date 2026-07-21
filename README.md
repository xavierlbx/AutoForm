# autoForm

Extensão Chrome (Manifest V3) que preenche formulários web com IA a partir de um contexto local (currículo, bio, respostas). **100% client-side**: sem backend, sem login e sem telemetria. Arquitetura: popup → service worker → content script; detalhes em [`docs/SPEC.md`](docs/SPEC.md).

## Requisitos

- [Google Chrome](https://www.google.com/chrome/) (ou Chromium) recente
- [Node.js](https://nodejs.org/) 20+ (para build e testes)
- Uma API key da [OpenAI](https://platform.openai.com/) ou do [Google Gemini](https://aistudio.google.com/apikey)

## Scripts

| Comando | Descrição |
|---|---|
| `npm install` | Instala dependências |
| `npm run dev` | Build em watch (Vite + CRX) |
| `npm run build` | Typecheck + build de produção em `dist/` |
| `npm test` | Testes unitários (Vitest) |
| `npm run lint` | ESLint |
| `npm run smoke:extract` | Smoke de extração PDF/DOCX |

## Instalação (modo desenvolvedor)

1. Clone o repositório e instale dependências:
   ```bash
   npm install
   npm run build
   ```
2. Abra `chrome://extensions`, ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta `dist/` do projeto.
4. O ícone **autoForm** aparece na barra de extensões.

Para iterar no código, use `npm run dev` e recarregue a extensão em `chrome://extensions` quando o build atualizar.

## Configurar e usar

1. Abra o popup → **Configurar Contexto**.
2. Escolha o provedor (OpenAI ou Gemini) e cole a API key (campo senha; use Mostrar/Ocultar se precisar conferir).
3. Envie PDFs/DOCX e/ou cole texto (currículo, bio). Salve.
4. Abra a página com o formulário (aba ativa).
5. No popup, clique em **Preencher Formulário**.

Para testar localmente sem sites externos, abra `fixtures/sample-form.html` no Chrome (`Arquivo → Abrir arquivo…` ou arraste o HTML para a aba) e rode o fluxo de preenchimento.

## Privacidade

- Contexto e API key ficam só em `chrome.storage.local` no seu navegador.
- Extração de PDF/DOCX roda no cliente (`pdfjs-dist` / `mammoth`).
- A única chamada de rede é para a API do provedor que você escolheu (OpenAI ou Gemini), com a **sua** chave — sujeita aos termos e custos desse provedor.
- Sem analytics, sem servidor próprio da extensão.
- Use **Limpar Contexto** na tela de configuração para apagar os dados salvos.

## Permissões (manifest)

| Permissão | Motivo |
|---|---|
| `storage` | Salvar API key e contexto localmente |
| `activeTab` | Acessar a aba ativa no momento do preenchimento |
| `scripting` | Injetar o content script se a aba ainda não o tiver |
| `webNavigation` | Listar frames/iframes no momento do fill (sem histórico de navegação) |
| `host_permissions`: `https://api.openai.com/*` | Chamar a API OpenAI |
| `host_permissions`: `https://generativelanguage.googleapis.com/*` | Chamar a API Gemini |

O content script é registrado em `http://*/*` e `https://*/*` com `all_frames: true` (formulários embutidos em iframe, ex. Pipefy) — não há `host_permissions` amplas além dos hosts de IA. Após atualizar a extensão, **recarregue a aba** para o script anexar aos iframes.

## Documentação

- [`docs/SPEC.md`](docs/SPEC.md) — especificação do produto
- [`docs/TASKS.md`](docs/TASKS.md) — checklist do MVP
- [`docs/DESIGN.md`](docs/DESIGN.md) — identidade visual (paleta earth tone)
- [`.cursor/rules/`](.cursor/rules/) — stack, arquitetura e segurança

## Identidade visual

O popup usa uma paleta **earth tone** em quatro cores: cream (`#E1DCC9`), espresso (`#1F150C`), brown (`#412D15`) e black (`#000000`). Detalhes dos tokens e mapeamento semântico estão em [`docs/DESIGN.md`](docs/DESIGN.md).

## Licença / aviso

Uso por conta própria. Cobranças da API de IA são responsabilidade da conta do usuário no provedor.
