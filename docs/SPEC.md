# 📌 Especificação Técnica (SPEC) - MVP Extensão Chrome

## 1. Visão Geral do Produto

Extensão para Google Chrome (Manifest V3) que roda de forma **100% local no navegador** (Client-Side). Ela permite ao usuário carregar seus dados e arquivos (currículo) e utiliza a API de uma IA para analisar e preencher formulários web na aba ativa.

## 2. Princípios de Arquitetura e Privacidade

- **Zero Backend / Zero Database:** Sem servidor próprio, sem banco de dados remoto e sem sistema de autenticação/login.
- **Armazenamento Local:** Todos os arquivos processados e textos ficam salvos exclusivamente no `chrome.storage.local` do navegador do usuário.
- **Processamento de Arquivos Local:** A leitura e extração de texto de PDFs/Word ocorrem inteiramente dentro da extensão no navegador.
- **Chave de API Local:** A chave da API de IA é inserida pelo próprio usuário na extensão e salva localmente.

## 3. Fluxo e Interface de Usuário (Popup)

A interface do popup segue uma paleta **earth tone** (cream, espresso, brown, black). Referência completa de tokens e contraste em [`docs/DESIGN.md`](DESIGN.md) e implementação em `src/popup/styles.css`.

### 🖥️ Tela 1: Principal (Home)

- **Status do Contexto:** Indicador visual informando se há contexto carregado (Ex: *"Contexto: 1 arquivo + texto salvo"* ou *"Nenhum contexto configurado"*).
- **Botão Principal:** `[ Preencher Formulário ]`
  - *Ação:* Captura o DOM do formulário visível na aba ativa, envia os dados para a API da IA e preenche os campos.
  - *Estado desabilitado:* se não houver `apiKey` ou `rawContext` salvos, o botão fica desabilitado com uma dica ("Configure o contexto primeiro").
- **Atalho/Link:** `"Configurar Contexto"`
  - *Ação:* Alterna o Popup para a Tela 2.
- **Feedback de execução:** enquanto a IA processa, o botão mostra um estado de carregamento (ex.: "Preenchendo..."). Ao final, exibe quantos campos foram preenchidos com sucesso e quantos não puderam ser identificados.

### ⚙️ Tela 2: Configuração de Contexto

- **Chave de API:** Campo para o usuário inserir sua API Key da IA (ex: OpenAI / Gemini / Groq), com opção de mostrar/ocultar (ver `03-security.mdc`).
- **Upload de Arquivos:** Aceita `.pdf` e `.docx` (extrai o texto localmente). Suporta múltiplos arquivos; cada um vira um bloco de texto identificado (ex.: "Currículo.pdf") dentro do contexto consolidado.
- **Texto Livre:** `textarea` amplo para coladas de texto direto (bio, projetos, respostas prontas).
- **Ação Salvar:** Consolida o texto dos arquivos + texto digitado e salva no `chrome.storage.local`.
- **Ação Limpar Contexto:** apaga o contexto salvo (requisito de privacidade, ver `03-security.mdc`).
- **Navegação:** Botão para voltar à Tela 1.

## 4. Estrutura do Contexto Salvo (Storage Local)

O contexto é mantido de forma aberta e não engessada:

```typescript
interface LocalStorageData {
  apiKey: string;           // Chave da API para chamadas diretas
  aiProvider: 'openai' | 'gemini' | 'groq'; // provedor selecionado
  rawContext: string;       // Consolidação do texto extraído dos arquivos + texto livre
  updatedAt: string;        // Data da última atualização (ISO String)
}
```

## 5. Fluxo Técnico do Preenchimento

1. Usuário clica em **Preencher Formulário** no popup.
2. Popup envia `FILL_REQUEST` para o background (service worker).
3. Background pede ao content script da aba ativa para escanear o formulário (`SCAN_FORM`).
4. Content script identifica os campos preenchíveis visíveis (inputs, selects, textareas, radios, checkboxes) e retorna uma lista estruturada (`FormField[]`), sem enviar o HTML bruto.
5. Background monta um prompt com `rawContext` + `FormField[]` e chama o provedor de IA configurado, pedindo uma resposta estruturada (JSON) do tipo `FieldValue[]` (seletor → valor sugerido).
6. Background envia `APPLY_VALUES` para o content script, que escreve os valores nos campos do DOM (disparando os eventos `input`/`change` necessários para frameworks como React reconhecerem a mudança).
7. Content script retorna o resultado (quantos campos preenchidos, quantos ignorados) para o background, que repassa ao popup.

## 6. Tratamento de Erros e Casos-limite (MVP)

- **Nenhum formulário na página:** informar o usuário de forma clara, sem travar a UI.
- **API key inválida / erro do provedor:** exibir a mensagem de erro retornada pela API de forma resumida (sem stack trace técnico) e sugerir revisar a key em "Configurar Contexto".
- **Arquivo não suportado ou corrompido:** rejeitar o upload com mensagem clara, sem quebrar o restante do contexto já salvo.
- **Contexto vazio:** botão "Preencher Formulário" permanece desabilitado até haver algum `rawContext`.
- **Campos que a IA não conseguiu inferir:** deixados em branco, sem inventar valores; o resumo final informa quantos ficaram sem preenchimento.

## 7. Fora de Escopo do MVP

- Múltiplos perfis de contexto (ex.: "currículo A" vs "currículo B").
- Edição manual campo-a-campo do resultado antes de aplicar no formulário.
- Histórico de preenchimentos.
- Sincronização entre dispositivos.

> **Nota:** formulários em `iframe` (incluindo cross-origin, ex. Pipefy/ATS embeds) **são suportados** via `content_scripts.all_frames` + mensageria por `frameId`. Após instalar/atualizar a extensão, recarregue a aba para o script anexar ao iframe.
