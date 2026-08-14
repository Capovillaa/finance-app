# Prompt para o Claude Code — Redesign visual do `apps/web`

> Como usar: cole este arquivo inteiro como instrução para o Claude Code, rodando
> a partir da raiz de `D:\finance_app`. Ele já tem contexto do `CLAUDE.md`, então
> pode referenciar os arquivos abaixo diretamente.

---

## Contexto e objetivo

O backend e a arquitetura de dados do cliente web (`apps/web`) estão prontos e
corretos — RTK Query, RBAC client-side, formulários com React Hook Form + Zod,
tudo funcionando. O problema é **puramente visual**: a interface está usando o
tema padrão do Material-UI (paleta azul default, sombras de elevação genéricas,
Roboto sem hierarquia), então parece um admin template qualquer, sem identidade
própria.

Este é um trabalho de **camada de apresentação**, não uma reescrita. Não mexer em:
- lógica de data-fetching (RTK Query, `api/endpoints/*`)
- schemas Zod, validação, `lib/permissions.ts`
- estrutura de rotas, contratos com a API
- nomes de props ou comportamento funcional dos componentes

O que muda: `theme.ts`, `lib/chartTokens.ts`, os componentes visuais
compartilhados, e o CSS/estilo de cada tela, nessa ordem.

---

## Por que a decisão de stack não muda

`docs/decisions.md` registra que **Material-UI + Redux Toolkit + Recharts**
foi escolhido deliberadamente no lugar de uma alternativa mais leve em
Tailwind + Zustand. Não vamos reabrir essa discussão nem migrar para
shadcn/Tailwind — seria jogar fora trabalho funcional já validado e
contradizer uma decisão registrada. "Tecnologia nova" aqui significa usar
recursos mais recentes **dentro** desse ecossistema (ver seção de stack visual
abaixo), não trocar de framework.

---

## Direção visual

**Conceito:** em vez de um dashboard SaaS genérico, a interface deve parecer
um **extrato financeiro bem tipografado** — o objeto que esse produto
realmente manipula. Números monetários ganham peso visual real (são o
conteúdo, não um detalhe), linhas de transação se comportam como linhas de
extrato (regra fina embaixo, valor alinhado à direita, monoespaçado), e cor é
usada com significado (receita/despesa/status), nunca como decoração.

Tom: sóbrio e confiável primeiro, com personalidade vindo da tipografia e do
motivo do "extrato" — não de gradientes, ilustrações ou elementos decorativos.
É dinheiro; a interface não deveria parecer um app de gamificação.

### Paleta

| Token | Hex | Uso |
|---|---|---|
| `paper` | `#F7F8F4` | fundo base — modo claro |
| `grafite` | `#14171C` | fundo base — modo escuro |
| `ink` | `#1A1C20` | texto primário — modo claro |
| `ink-inverse` | `#ECEAE3` | texto primário — modo escuro |
| `verde-cedula` | `#0F6E4E` | marca, ações primárias, foco, links |
| `verde-claro` | `#1E9E63` | receitas, status `on_track`, valores positivos |
| `vermelho-tijolo` | `#B23A2E` | despesas, status `exceeded`, valores negativos |
| `ouro-velho` | `#C68A2E` | status `warning`, contas `scheduled`/`pending` |
| hairline | `rgba(26,28,32,.12)` claro / `rgba(236,234,227,.14)` escuro | divisórias de linha de extrato |

Evitar explicitamente: o par bege-quente + terracota (`#F4F1EA` / `#D97757`) e
o par quase-preto + verde-ácido/vermelho-vivo — são os dois clichês mais
comuns em UI gerada por IA no momento, e nenhum dos dois tem relação com o
domínio financeiro do produto.

### Tipografia

Três papéis, cada um com um trabalho específico:

- **Display** — `Fraunces` (variable font). Só para números grandes de saldo
  e títulos de página (H1). Um serifado editorial dá peso e confiança a um
  saldo de R$ 12.847,30 de um jeito que Roboto Bold nunca vai dar.
- **UI** — `Instrument Sans`. Tudo o mais: labels, botões, navegação, corpo
  de texto, formulários.
- **Dados/tabular** — `IBM Plex Mono`, com `font-variant-numeric: tabular-nums`.
  **Todo valor monetário em lista ou tabela** (linhas de transação, linhas de
  orçamento, extrato) usa essa fonte, alinhado à direita. É a escolha mais
  específica do domínio: dinheiro é dado tabular, e o app já trata `amount`
  como string decimal de precisão fixa no backend — a fonte deveria refletir
  isso visualmente.

Instalar via Fontsource (self-hosted, sem depender do Google Fonts CDN):

```bash
npm install @fontsource-variable/fraunces @fontsource-variable/instrument-sans @fontsource/ibm-plex-mono --workspace=@finance/web
```

### Layout — o motivo assinatura: "linha de extrato"

Cada transação, linha de orçamento ou item recorrente renderiza como uma
linha de extrato real, não como um card com sombra:

```
  8 fev · Supermercado Extra          Alimentação      R$ -284,90
  ────────────────────────────────────────────────────────────────
  7 fev · Salário                     Renda            R$ 6.200,00
  ────────────────────────────────────────────────────────────────
```

- Regra fina (`hairline`) entre linhas, não sombra de card entre cada item.
- Valor sempre monoespaçado, alinhado à direita, cor semântica
  (`verde-claro`/`vermelho-tijolo`), nunca um fundo colorido no valor inteiro.
- Estado (`cleared`/`pending`/`scheduled`, ou `on_track`/`warning`/`exceeded`)
  vira um traço vertical de 2–3px à esquerda da linha, não um chip colorido
  grande — informação no lugar certo, sem gritar.
- Cards com sombra ficam reservados para modais/diálogos e para os
  `StatTile` do dashboard — o resto da interface é plano, com hierarquia dada
  por tipografia e espaçamento, não por elevação do MUI.

No dashboard, o saldo principal e os `StatTile` usam a fonte Display grande —
esse é o único lugar com escala tipográfica dramática. O resto da interface é
discreto por design; o saldo é o "herói" da página.

---

## Stack visual — o que é "novo" aqui

1. **MUI CSS Theme Variables** (`extendTheme` / `cssVariables: true`, MUI v6) —
   se o projeto já estiver no v6, migrar `theme.ts` para essa API elimina o
   flash de tema errado na troca claro/escuro e permite estilizar via
   `var(--mui-palette-*)` direto no CSS quando fizer sentido. Se ainda estiver
   no v5, usar `CssVarsProvider` de `@mui/material/styles` é o equivalente.
2. **Framer Motion** para movimento orquestrado, não decorativo:
   - `StatTile`: contador animado do valor (de 0 ou do valor anterior até o
     atual) via `animate()`/`useSpring`, ao montar a Dashboard.
   - Lista de transações/linhas de extrato: entrada em stagger sutil
     (~40–60ms entre itens) na primeira carga; `AnimatePresence` ao
     filtrar/remover.
   - Navegação: indicador ativo desliza entre itens do menu com
     `layoutId` compartilhado, em vez de trocar de cor abruptamente.
   - **Não fazer**: bounce, confete, parallax, hover exagerado — é um app de
     finanças, o movimento deve comunicar "isso atualizou", não "isso é
     divertido". Respeitar `prefers-reduced-motion` (Framer Motion tem
     `useReducedMotion()` pronto pra isso).
   ```bash
   npm install framer-motion --workspace=@finance/web
   ```

---

## Ordem de execução

Trabalhar de dentro pra fora — mudar a base primeiro garante que toda tela
herde o novo visual automaticamente, em vez de retrabalhar tela por tela do
zero.

1. **`apps/web/src/theme.ts`** — reescrever paleta (claro/escuro), tipografia
   (as três famílias, escala e pesos), `shape.borderRadius`, e overrides de
   componente: `MuiButton`, `MuiPaper`/`MuiCard` (tirar sombra default, trocar
   por hairline onde fizer sentido), `MuiTableCell`/linhas de lista,
   `MuiChip`, `MuiDivider`, `MuiAppBar`/`MuiDrawer`. Focus visível (outline)
   em todos os controles interativos.
2. **`apps/web/src/lib/chartTokens.ts`** — remapear as cores categóricas e de
   status pra nova paleta, mantendo a regra que já existe: slots categóricos
   em ordem fixa (nunca ciclam), magnitude numa hue só, os quatro estados
   reservados e sempre com ícone + palavra ao lado — só trocar os hex.
3. **Fontes** — instalar pacotes Fontsource, importar em `main.tsx`.
4. **Componentes compartilhados** (`components/StatTile.tsx`,
   `ChartTooltip.tsx`, `SeriesLegend.tsx`, `AppLayout.tsx`,
   `ConfirmDialog.tsx`) — são reusados em todo lugar, então o maior ganho de
   consistência está aqui. Fazer a "linha de extrato" como um componente
   reutilizável agora (provavelmente `components/LedgerRow.tsx`) já que
   Transactions, Budgets (linhas) e Recurring vão usar o mesmo padrão.
5. **Telas**, na ordem: Dashboard (é a vitrine) → Transactions (onde a linha
   de extrato mais aparece) → Budgets, Goals, Recurring, Reports, Accounts,
   Alerts, Settings.
6. Framer Motion por último, nos pontos específicos listados acima — depois
   que o visual estático já estiver certo.

---

## Barra de qualidade antes de considerar pronto

- Contraste AA (texto sobre `paper`/`grafite`, valores coloridos sobre fundo)
  em ambos os modos.
- Foco de teclado visível em todo controle interativo, sem exceção.
- Responsivo até mobile — a linha de extrato precisa continuar legível numa
  tela estreita (provavelmente empilha descrição/categoria acima do valor).
- `prefers-reduced-motion` respeitado nas animações do Framer Motion.
- Verificação visual real, não só `tsc`/`vite build` — seguir o processo que
  já está documentado na seção "End-to-end / visual verification" do
  `CLAUDE.md` (Playwright contra o Chrome já instalado, login com a conta
  demo, screenshot de cada tela em claro e escuro) antes de considerar
  qualquer tela concluída.
- Ao final, registrar a decisão no padrão que o projeto já usa: uma entrada
  nova em `docs/decisions.md` ("Redesign visual: tema, tokens e o motivo da
  linha de extrato") explicando a paleta, a tipografia e por quê — do mesmo
  jeito que as outras decisões do arquivo já são documentadas.
