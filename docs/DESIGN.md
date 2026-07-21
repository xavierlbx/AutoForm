# Identidade visual — autoForm

A interface do popup usa uma paleta **earth tone** de quatro cores:

| Nome | Hex | RGB |
|------|-----|-----|
| Black | `#000000` | rgb(0, 0, 0) |
| Espresso | `#1F150C` | rgb(31, 21, 12) |
| Brown | `#412D15` | rgb(65, 45, 21) |
| Cream | `#E1DCC9` | rgb(225, 220, 201) |

## Uso na extensão

| Cor | Papel na UI |
|-----|-------------|
| Cream | Fundo do popup |
| Espresso | Texto principal e títulos |
| Brown | Ação primária (CTA), sucesso, foco, faixa do cabeçalho, ícones |
| Black | Links, estados de erro/destrutivo, hover ativo |

## Tokens semânticos

Os tokens brutos (`--palette-*`) são mapeados para tokens semânticos em [`src/popup/styles.css`](../src/popup/styles.css):

| Token semântico | Origem | Onde aparece |
|-----------------|--------|--------------|
| `--bg` | Cream | Fundo do `body` |
| `--surface` | Derivado (#f0ede4) | Cards, inputs, botões secundários |
| `--fg` | Espresso | Texto principal |
| `--muted` | Derivado | Subtítulos, labels, hints |
| `--accent` | Brown | Botões primários, focus ring |
| `--link` | Black | Link "Configurar Contexto" |
| `--danger` | Black | Feedback de erro, botão Limpar Contexto |
| `--warn` | Brown | Contador de caracteres próximo do limite |
| `--border` | Derivado | Bordas de inputs e cards |
| `--on-accent` | Cream | Texto sobre botões primários |

## Escopo

- A paleta aplica-se **somente ao popup** (`src/popup/`).
- Content script, service worker e páginas externas não usam estes tokens.
- Ícones da extensão (16/48/128 px) usam Brown (`#412D15`) como cor de fundo, gerados por [`scripts/generate-icons.ps1`](../scripts/generate-icons.ps1).

## Acessibilidade

- Texto principal (`#1F150C`) sobre fundo cream (`#E1DCC9`) mantém contraste confortável para leitura.
- Botões primários usam cream (`#E1DCC9`) sobre Brown (`#412D15`).
- Estados de erro usam Black sobre fundo `#d9d4c8` (tint derivado).
- Todos os controles interativos têm `:focus-visible` com anel em `--accent`.

## Manutenção

Ao alterar cores, edite apenas `:root` em `src/popup/styles.css`. Prefira tokens semânticos (`--accent`) em vez de hex literais nos seletores. Atualize esta tabela se novos tokens forem adicionados.
