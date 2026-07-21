# AGENTS.md — Regra Mestre do Projeto

Este arquivo é a referência principal para qualquer agente de IA (Cursor, Copilot, etc.) que for gerar ou modificar código neste repositório. Ele resume o produto e aponta para as regras detalhadas.

## O que é o projeto

Extensão para Google Chrome (Manifest V3) que preenche formulários web automaticamente usando IA, com base em um contexto (currículo/bio/respostas) fornecido pelo próprio usuário. **100% client-side**: sem backend, sem banco de dados, sem login. Tudo roda no navegador e é salvo em `chrome.storage.local`.

Especificação completa do produto: [`docs/SPEC.md`](docs/SPEC.md)
Checklist de desenvolvimento: [`docs/TASKS.md`](docs/TASKS.md)

## Regras detalhadas (leia antes de codar)

| Arquivo | Assunto |
|---|---|
| [`.cursor/rules/01-tech-stack.mdc`](.cursor/rules/01-tech-stack.mdc) | Stack de tecnologias, libs permitidas, build |
| [`.cursor/rules/02-architecture.mdc`](.cursor/rules/02-architecture.mdc) | Estrutura Manifest V3, módulos, mensageria |
| [`.cursor/rules/03-security.mdc`](.cursor/rules/03-security.mdc) | Segurança e privacidade dos dados do usuário |

## Princípios inegociáveis (resumo)

1. **Zero backend.** Nenhuma chamada de rede vai para um servidor próprio. As únicas chamadas externas são diretamente do navegador do usuário para a API de IA escolhida por ele (OpenAI/Gemini/Groq/etc).
2. **Zero coleta de dados.** Nada de analytics, telemetria ou logging remoto. Currículo, textos e API key do usuário nunca saem do `chrome.storage.local`, exceto no payload enviado diretamente ao provedor de IA no momento do preenchimento.
3. **Manifest V3 estrito.** Sem `eval`, sem scripts remotos, sem `unsafe-inline`. Tudo deve rodar dentro da CSP padrão do Chrome Web Store.
4. **Simplicidade de MVP.** Preferir soluções pequenas e diretas a abstrações prematuras. O objetivo é ter um fluxo funcional end-to-end (configurar contexto → preencher formulário) antes de qualquer refinamento.
5. **Português no produto, inglês no código.** Textos de UI em pt-BR. Nomes de variáveis, funções, commits e comentários de código em inglês, para manter consistência técnica.

## Como um agente deve trabalhar aqui

- Antes de criar qualquer arquivo novo, verificar se a estrutura de pastas definida em `02-architecture.mdc` já prevê onde ele deve ficar.
- Antes de adicionar uma lib, verificar se ela está na lista permitida em `01-tech-stack.mdc`. Se não estiver, justificar e propor a atualização da regra.
- Qualquer código que toque em `apiKey`, `rawContext` ou dados extraídos de arquivos deve seguir `03-security.mdc`.
- Ao terminar uma tarefa, marcar o item correspondente em `docs/TASKS.md`.
- Não implementar autenticação, contas de usuário ou sincronização em nuvem — está fora de escopo do MVP por definição de produto.
