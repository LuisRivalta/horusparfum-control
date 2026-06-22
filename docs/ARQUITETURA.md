# Arquitetura — Horus Parfum Control

## Stack

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Frontend | React + Vite + TypeScript | React 19, Vite 8 |
| Estilo | Tailwind CSS 4 | @tailwindcss/vite |
| 3D/Visual | Three.js | 0.184 |
| Scroll | Lenis | 1.3 |
| Gráficos | Recharts | — |
| Roteamento | React Router | v7 |
| Data fetching | TanStack Query + Supabase JS | — |
| Aritmética monetária | decimal.js | — |
| Imagem | react-easy-crop | — |
| Testes | Vitest + Testing Library | — |
| Banco + lógica | PostgreSQL + PL/pgSQL (RPCs) | Supabase (cloud) |
| Auth | Supabase Auth | JWT |
| Backend | FastAPI (Python) | Python 3.14 |
| Deploy frontend | Vercel | produção |
| Deploy backend | Vercel Python Runtime | produção |

> **Onde mora a lógica de negócio:** CRUDs simples ainda rodam direto contra o Supabase (frontend → Supabase JS com anon key + RLS). Operações atômicas continuam em **funções PL/pgSQL no Postgres** (RPCs). Relatórios agregados que não devem depender de carregar todo o histórico no navegador passam pelo **FastAPI**; hoje `/financeiro/relatorios` consome `GET /api/financeiro/relatorios`.

## Estrutura de pastas

```
C:\Horus\
├── docs\                       → Documentação (este conjunto)
│   └── superpowers\
│       ├── specs\              → Specs de design (brainstorming) por feature
│       └── plans\              → Planos de implementação por feature
├── supabase\
│   └── migrations\             → SQL versionado (tabelas, RLS, RPCs, seeds)
│       ├── 20260610_pedidos.sql
│       ├── 20260615_decants.sql
│       ├── 20260616_registrar_entrada.sql
│       ├── 20260616_vendas.sql
│       ├── 20260617_consumo_decant.sql
│       └── 20260622142718_fix_cancelar_venda_decant_fk.sql
├── frontend\
│   ├── vercel.json             → Rewrite SPA para o deploy na Vercel
│   └── src\
│       ├── components\
│       │   ├── layout\         → Layout.tsx (sidebar + header + outlet)
│       │   └── shared\         → Icon, Mark, Modal, FormControls, AnimatedButton,
│       │                       → DayNightSwitch, UserMenu, ImageCropper, ProtectedRoute,
│       │                       → ProductDetailsModal, SaidaRapidaModal, EntradaRapidaModal,
│       │                       → ColorBends, ModelViewer
│       ├── components\layout\SmoothScrollArea.tsx → Lenis aplicado ao container scrollável principal
│       ├── contexts\           → AuthContext.tsx, ThemeContext.tsx
│       ├── pages\
│       │   ├── auth\           → Login.tsx
│       │   ├── home\           → Home.tsx
│       │   ├── financeiro\     → Dashboard, Transacoes, Contas, Relatorios, Metas
│       │   └── estoque\        → EstoqueView (Estoque), Cadastros (layout), Produtos, Vendas, Decants,
│       │       │               → Pedidos, Divergencias, Categorias, Fornecedores,
│       │       │               → Relatorios
│       │       │               → Cadastros.tsx = rota-layout com <Outlet/>; abas Produtos/Categorias/Fornecedores
│       │       ├── pedidos\    → NovoPedidoModal, ConferenciaModal
│       │       ├── decants\    → FrascoViewer, AbrirFrascoModal, DecantModal
│       │       ├── vendas\     → NovaVendaModal, VendaDetalheModal, VendasConfig
│       │       └── __tests__\  → testes de componente (colocados por área)
│       ├── lib\                → utils, supabase, financeiro, pedidos, estoque,
│       │   │                   → decants, vendas (lógica pura, testável)
│       │   └── __tests__\      → financeiro, pedidos, estoque, decants, vendas (TDD)
│       ├── test\               → setup.ts (Vitest)
│       ├── styles\             → globals.css (Tailwind + tema dark/light)
│       ├── App.tsx             → Rotas
│       └── main.tsx            → Entry (ThemeProvider + AuthProvider + QueryClient + Router)
└── backend\                    → FastAPI
    └── app\
        ├── main.py             → FastAPI app + CORS
        ├── auth\               → deps.py (validação de JWT)
        ├── routers\            → financeiro.py, estoque.py
        ├── models\             → schemas Pydantic
        ├── services\           → cálculos backend (relatórios financeiros)
        └── db\                 → supabase.py (service role client)
```

## Camada de lógica de negócio: RPCs no Postgres

Operações que tocam várias tabelas de forma atômica são funções PL/pgSQL chamadas via `supabase.rpc(...)`. Cada uma roda numa transação: ou tudo acontece, ou nada (rollback). Padrão central do projeto.

| RPC | Faz | Migração |
|-----|-----|----------|
| `confirmar_recebimento(pedido, itens, recebido_por)` | Entrada de estoque + custo médio ponderado + ledger + divergências | 20260610_pedidos |
| `registrar_saida(produto, qtd, motivo, responsavel)` | Saída rápida de estoque + ledger | 20260610_pedidos |
| `registrar_entrada(produto, qtd, motivo, responsavel)` | Entrada manual de estoque + ledger | 20260616_registrar_entrada |
| `registrar_venda(canal, data, pgto, cliente, taxa, frete, resp, obs, itens)` | Baixa estoque (produto/decant) + grava `vendas`/`venda_itens` com snapshot de custo + rateio de taxa/frete + lança receita/taxa/frete em `transacoes` | 20260616_vendas |
| `cancelar_venda(venda)` | Estorno completo: devolve estoque/ml, apaga decant, remove lançamentos do caixa, marca `status='cancelada'` | 20260616_vendas |
| `registrar_consumo_decant(frasco, ml, classificacao, embalagem, resp)` | Consumo não-faturável de decant: baixa ml do frasco + grava decant com custo + lança despesa em `transacoes` (`origem='decant'`) | 20260617_consumo_decant |

> Operações de uma tabela só (CRUDs simples, abrir frasco, config de canais/embalagens) são feitas direto via `supabase.from(...)` no frontend, sem RPC.

## Lógica pura no frontend (`lib/`)

Cálculo testável em TypeScript com `decimal.js`, separado da UI. Muitas funções **espelham** a aritmética de uma RPC (a RPC é a fonte da verdade gravada; a lib alimenta a **prévia ao vivo** no formulário).

| Arquivo | Responsabilidade |
|---------|------------------|
| `lib/financeiro.ts` | Saldo histórico, resumo por período, agrupar por categoria, evolução mensal, construtores de período |
| `lib/estoque.ts` | `situacaoEstoque` (crítico/baixo/ok), `ordenarProdutos` |
| `lib/pedidos.ts` | Custo médio ponderado, total do pedido, validação de conferência |
| `lib/decants.ts` | `podeFrasco`, `calcularNovoML`, `statusAposDecant`, `resumoConsumo` (custo por classificação no período) |
| `lib/vendas.ts` | Custo de decant, rateio proporcional, lucro por item, ROI, margem, resumo da venda |

## Lógica de relatório no backend

| Endpoint | Faz | Observação |
|----------|-----|------------|
| `GET /api/financeiro/relatorios?inicio=<iso>&fim=<iso>` | Calcula receita, despesa, lucro, saldo histórico até o fim do período, categorias, origens, maiores lançamentos e lançamentos do período | Requer `Authorization: Bearer <Supabase JWT>`; consulta Supabase via service role no servidor e usa `Decimal` para valores monetários |
| `GET /api/financeiro/metas` | Retorna metas com progresso calculado; metas em R$ usam entradas financeiras (`transacoes.tipo='entrada'`) no período da meta | Períodos aceitos: `YYYY-MM`, `YYYY-Qn`, `YYYY`; sem período usa mês atual; metas em `%` permanecem manuais |

## Como rodar

### Frontend
```bash
cd C:\Horus\frontend
npm install
npm run dev         # → http://localhost:5173
npm run test:run    # → roda os testes uma vez
npm run build       # → tsc -b && vite build (o tsc -b é o typecheck real)
```

> **Atenção ao typecheck:** `npx tsc --noEmit` no tsconfig raiz NÃO checa os arquivos (usa project references). O check real é `npx tsc -b` (o que `npm run build` roda). Sempre valide com `tsc -b`.

### Backend
```bash
cd C:\Horus\backend
pip install fastapi "uvicorn[standard]" pydantic pydantic-settings "python-jose[cryptography]" httpx
pip install supabase --no-deps
pip install postgrest storage3 gotrue --no-deps
uvicorn app.main:app --reload   # → http://localhost:8000
```
> Nota: o relatório financeiro e as metas dependem do backend publicado em `https://horusparfum-control-api.vercel.app`. Em desenvolvimento, mantenha `VITE_API_URL=http://localhost:8000`.

### Migrações
Os SQLs em `supabase/migrations/` são aplicados **manualmente** no Supabase SQL Editor (project `wyobbztexoofhqdttxzq`), em ordem de data. Cada um é idempotente onde possível (`if not exists`).

## Variáveis de ambiente

**frontend/.env**
```
VITE_SUPABASE_URL=https://wyobbztexoofhqdttxzq.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
VITE_API_URL=http://localhost:8000
```
No Vercel, as mesmas variáveis são configuradas no painel do projeto.

**backend/.env** (só se for usar o backend)
```
SUPABASE_URL=https://wyobbztexoofhqdttxzq.supabase.co
SUPABASE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
FRONTEND_URL=http://localhost:5173
```

## Fluxo de dados

```
Browser (React SPA)
    │
    ├── supabase.from(...)   → CRUDs simples (leitura/escrita direta, RLS)
    │
    ├── supabase.rpc(...)    → operações atômicas (lógica de negócio no Postgres)
    │                             │
    │                             └── transação única no Postgres (rollback em falha)
    │
    └── FastAPI /api/...     → relatórios agregados e futuras integrações
                                  │
                                  └── Supabase service role no servidor
```

## Autenticação

- Login via Supabase Auth (email + senha).
- Frontend gerencia sessão via `AuthContext` (onAuthStateChange); `ProtectedRoute` redireciona para `/login` se não autenticado.
- Token JWT incluído automaticamente pelo Supabase JS SDK; RLS no banco exige role `authenticated` em todas as tabelas.
- Backend valida endpoints protegidos chamando Supabase Auth (`auth.get_user(token)`), sem depender de `JWT_SECRET` local.
- `ThemeContext` gerencia dark/light com persistência em localStorage.

## Rotas

| Rota | Componente |
|------|-----------|
| /login | Login (tela cheia) |
| / | Home (tela cheia, protegida) |
| /financeiro | Dashboard |
| /financeiro/transacoes | Transações |
| /financeiro/contas-pagar · /contas-receber | Contas |
| /financeiro/relatorios · /metas | Relatórios · Metas |
| /estoque | Estoque (EstoqueView) |
| /estoque/vendas · /estoque/vendas/config | Vendas · Config de canais/embalagens |
| /estoque/decants | Decants |
| /estoque/cadastros (+ /produtos · /categorias · /fornecedores) | Cadastros (abas: Produtos, Categorias, Fornecedores) — as rotas antigas `/estoque/produtos`, `/estoque/categorias`, `/estoque/fornecedores` redirecionam para as novas |
| /estoque/pedidos · /divergencias | Pedidos · Divergências |
| /estoque/relatorios | Relatório de giro |

Tudo sob `/financeiro/*` e `/estoque/*` usa o `Layout` (sidebar + header). A nav lateral alterna entre os grupos Financeiro e Estoque.

## Deploy

- **Frontend produção:** https://horusparfum-control.vercel.app — Vercel, auto-deploy a cada push na `main`.
- **Backend produção:** https://horusparfum-control-api.vercel.app — Vercel Python Runtime, projeto `horusparfum-control-api`.
- `frontend/vercel.json` faz o rewrite SPA (`/(.*) → /index.html`). Root directory do projeto Vercel aponta para `frontend/`.
- `backend/vercel.json` roteia todas as requisições para `backend/main.py`, que exporta `app` de `app.main`.
- **Banco:** Supabase (cloud). Migrações aplicadas manualmente no SQL Editor — **aplicar antes do deploy**, senão páginas que dependem de tabelas/RPCs novas quebram em produção.
- **Variáveis do backend em produção:** `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL=https://horusparfum-control.vercel.app`.

## Temas (dark + light)

- Variáveis CSS no `@theme` em `globals.css` (escuro por padrão); `:root.light` sobrescreve com cores claras.
- `ThemeContext` aplica a classe `.light` no `<html>` e persiste em `localStorage`.
- `DayNightSwitch` (sol/lua) no header alterna; transição suave de 0.2s em cores.

## Design tokens

### Dark mode (padrão)
| Token | Valor | Uso |
|-------|-------|-----|
| --color-bg | #1A1A19 | Fundo principal |
| --color-surface | #1F1F1D | Cards, sidebar |
| --color-surface-2 | #1A1A18 | Cards elevados, formulários |
| --color-raise | #201F1C | Inputs |
| --color-line | rgba(231, 225, 208, 0.09) | Bordas sutis |
| --color-line-2 | rgba(231, 225, 208, 0.15) | Bordas médias |
| --color-gold | #C9A84C | Destaque, ações primárias |
| --color-text | #F1EDE2 | Texto principal |
| --color-text-2 | #B7B1A2 | Texto secundário |
| --color-muted | #7C766A | Texto terciário |
| --color-faint | #534E45 | Texto muito sutil |
| --color-up | #8FBE96 | Entradas, positivo |
| --color-down | #D08C7A | Saídas, negativo |
| --color-warn | #D9BE6A | Alertas |

### Light mode (`.light`)
| Token | Valor |
|-------|-------|
| --color-bg | #F5F1E8 (off-white com tom dourado) |
| --color-surface | #FFFFFF (cards/sidebar brancos) |
| --color-text | #1A1407 (preto profundo) |
| --color-gold | #B08D2E (dourado mais escuro para contraste) |
| (demais variáveis análogas invertidas) |

### Fontes
| Token | Família |
|-------|--------|
| --font-sans | Inter |
| --font-serif | Cormorant Garamond |
| --font-mono | JetBrains Mono |

## Convenções

- TypeScript no frontend; PL/pgSQL nas RPCs.
- Componentes/arquivos em PascalCase; rotas REST/colunas em snake_case.
- Formatação monetária sempre via `formatBRL()` de `lib/utils.ts`; aritmética monetária com `decimal.js`.
- Cores via CSS variables do Tailwind (`globals.css`); imports com alias `@/` → `src/`.
- Tudo commitado direto na `main` (sem feature branches — preferência do projeto).
- Fluxo de feature: brainstorming → spec (`docs/superpowers/specs/`) → plano (`docs/superpowers/plans/`) → execução com subagentes (TDD, commits frequentes).
