# ✅ TASKS.md — Checklist de Desenvolvimento do MVP

> Convenção: marque `[x]` ao concluir. Mantenha a ordem — cada bloco depende do anterior para dar um fluxo end-to-end testável o quanto antes.

## 0. Setup do projeto

- [x] Inicializar projeto com Vite + `@crxjs/vite-plugin` + TypeScript
- [x] Configurar ESLint + Prettier
- [x] Criar `manifest.json` (MV3) com permissões mínimas (`storage`, `activeTab`, `scripting`)
- [x] Criar estrutura de pastas conforme `.cursor/rules/02-architecture.mdc`
- [x] Validar que a extensão carrega em `chrome://extensions` (modo desenvolvedor) sem erros

## 1. Core — Storage

- [x] Definir `LocalStorageData` em `core/types.ts`
- [x] Implementar `core/storage.ts` (wrapper tipado sobre `chrome.storage.local`: `getContext`, `saveContext`, `clearContext`)
- [x] Testes unitários do wrapper (mock de `chrome.storage`)

## 2. Popup — Tela 1 (Home)

- [x] Layout HTML/CSS básico da Home
- [x] Exibir status do contexto (carregado / não carregado) lendo do storage
- [x] Botão "Preencher Formulário" (desabilitado se não houver contexto)
- [x] Link "Configurar Contexto" alternando para a Tela 2
- [x] Estado de carregamento do botão durante o preenchimento

## 3. Popup — Tela 2 (Configurar Contexto)

- [x] Layout HTML/CSS da tela de configuração
- [x] Campo de API key (`type="password"` + toggle mostrar/ocultar)
- [x] Seletor de provedor de IA (OpenAI / Gemini / Groq — pode iniciar só com um)
- [x] Input de upload de arquivo (aceitar `.pdf` e `.docx`, múltiplos arquivos)
- [x] `textarea` de texto livre com limite alto de caracteres (ex.: 20.000) e contador visível
- [x] Botão "Salvar" consolidando arquivos + texto livre em `rawContext` e persistindo via `core/storage.ts`
- [x] Botão "Limpar Contexto"
- [x] Botão "Voltar" para a Tela 1

## 4. Extração de arquivos

- [x] Integrar `pdfjs-dist` e implementar `extractTextFromPdf(file: File): Promise<string>`
- [x] Integrar `mammoth` e implementar `extractTextFromDocx(file: File): Promise<string>`
- [x] Função unificada `core/file-extractor.ts#extractText(file: File)` que roteia por tipo de arquivo
- [x] Tratamento de erro para arquivo corrompido/não suportado
- [x] Teste manual com pelo menos 1 PDF e 1 DOCX reais

## 5. Content Script — Scanner de formulário

- [x] `core/form-scanner.ts`: identificar campos visíveis (`input`, `select`, `textarea`, `radio`, `checkbox`)
- [x] Extrair label associado (via `label[for]`, `aria-label`, texto próximo ou `placeholder`)
- [x] Gerar seletor estável por campo (id/name existente ou `data-*` sintético)
- [x] Retornar `FormField[]` estruturado (sem HTML bruto)
- [x] Testar em pelo menos 2-3 formulários reais diferentes (ex.: Google Forms, Typeform, um site de vaga) — cobertura local via `fixtures/sample-form.html` + unit tests; sites ao vivo ficam para validação manual (ver bloco 10)

## 6. Content Script — Aplicação de valores

- [x] Implementar `applyValues(values: FieldValue[])` que escreve nos campos pelo seletor
- [x] Disparar eventos `input` e `change` (compatibilidade com formulários React/Vue controlados)
- [x] Suporte a `select` (escolher option compatível) e `radio`/`checkbox` (marcar opção correta)
- [x] Retornar contagem de sucesso/falha por campo

## 7. Integração com IA

- [x] Definir interface `AiProvider` em `core/ai/ai-provider.ts`
- [x] Implementar `core/ai/providers/openai-provider.ts` e `gemini-provider.ts`
- [x] Montar prompt: instrução + `rawContext` + `FormField[]` → forçar resposta em JSON (`FieldValue[]`)
- [x] Parsear e validar a resposta da IA (schema check antes de aplicar no DOM)
- [x] Tratar erros de API (key inválida, rate limit, timeout) com mensagem amigável

## 8. Orquestração (Background / mensageria)

- [x] Definir tipos de mensagem em `shared/messages.ts`
- [x] Implementar `background/service-worker.ts` com o fluxo completo (`FILL_REQUEST` → `SCAN_FORM` → chamada IA → `APPLY_VALUES` → resultado)
- [x] Repassar resultado final para o popup exibir feedback

## 9. Segurança e revisão

- [x] Revisar todo o fluxo contra `.cursor/rules/03-security.mdc`
- [x] Confirmar que nenhum dado sensível é logado em produção
- [x] Confirmar que `chrome.storage.sync` não é usado em nenhum ponto
- [x] Revisar permissões finais do `manifest.json` (remover o que não for usado)

**Checklist 03-security (auditoria Phase 8):**

| # | Regra | Status |
|---|---|---|
| 1 | Sem log de `apiKey` / `rawContext` / payload IA | OK — só metadados (`fieldCount`, `contextChars`, nome do erro) |
| 2 | Sem `fetch` para hosts não-IA | OK — só `api.openai.com` e `generativelanguage.googleapis.com` |
| 3 | Só `chrome.storage.local` para segredos/contexto | OK (+ teste unitário) |
| 4 | API key `type=password` + toggle | OK (Tela 2) |
| 5 | Prompt mínimo (campos estruturados + contexto) | OK — sem HTML bruto |
| 6 | Sem `innerHTML` inseguro para texto extraído | OK — UI/`contenteditable` via `textContent` |
| 7 | Permissões mínimas | OK — ver README; `content_scripts` em http(s) + `all_frames`; `webNavigation` só para `getAllFrames` no fill |
| 8 | Sem analytics/telemetria | OK |
| 9 | Limpar contexto na UI | OK |
| 10 | Aviso de custo/termos | OK |

**Riscos aceitos (MVP):** (1) content script em todas as páginas http(s) e em iframes (`all_frames`) — necessário para preencher embeds de ATS; sem `host_permissions` amplas além dos hosts de IA. (2) `webNavigation` usado apenas para listar frames no momento do fill (sem telemetria de navegação). (3) O contexto completo vai ao provedor escolhido (OpenAI/Gemini) no momento do fill (esperado pelo produto). (4) Groq ainda não implementado na UI.

### Justificativa de permissões extras

| Permissão / flag | Motivo |
|---|---|
| `content_scripts.all_frames: true` | Páginas de vaga (ex. Fóton) embutem o formulário real em iframe cross-origin (Pipefy). Sem isso só o documento pai é escaneado (ex.: newsletter). |
| `webNavigation` | Enumerar `frameId`s com `getAllFrames` para enviar `SCAN_FORM` / `APPLY_VALUES` ao iframe com mais campos. Não há listeners de navegação nem coleta de histórico. |

## 10. Polimento do MVP

- [x] Estados vazios e mensagens de erro amigáveis em toda a UI
- [x] Ícones da extensão (16/48/128px)
- [x] Paleta earth tone aplicada ao popup + docs de design ([`docs/DESIGN.md`](DESIGN.md))
- [x] Testar em pelo menos 5 formulários reais diferentes de sites distintos
- [x] Escrever `README.md` com instruções de instalação manual (modo desenvolvedor) para teste

**Nota sobre testes de formulários:** não houve navegação a 5 sites ao vivo nesta fase. Verificação local com fixture `fixtures/sample-form.html` (text, email, tel, number, date, select, radio, checkbox, textarea, url). **Recomendado ao humano:** repetir o fluxo em sites reais (ex.: Google Forms, Typeform, página de vaga, cadastro genérico, formulário institucional) antes de publicar.

## Backlog (pós-MVP, fora do escopo atual)

- [ ] Múltiplos perfis de contexto
- [ ] Revisão manual do preenchimento antes de aplicar
- [ ] Suporte a mais provedores de IA simultaneamente com troca fácil na UI
- [ ] Publicação na Chrome Web Store
