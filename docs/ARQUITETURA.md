# Arquitetura — Horus Parfum Control

## Stack

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Frontend | React + Vite + TypeScript | React 19, Vite 8 |
| Estilo | Tailwind CSS 4 | @tailwindcss/vite |
| 3D/Visual | Three.js | 0.184 |
| Gráficos | Recharts | — |
| Roteamento | React Router | v7 |
| Data fetching | TanStack Query + Supabase JS | — |
| Aritmética monetária | decimal.js | — |
| Imagem | react-easy-crop | — |
| Testes | Vitest + Testing Library | — |
| Banco + lógica | PostgreSQL + PL/pgSQL (RPCs) | Supabase (cloud) |
| Auth | Supabase Auth | JWT |
| Backend (dormente) | FastAPI (Python) | Python 3.14 |
| Deploy frontend | Vercel | produção |

> **Onde mora a lógica de negócio:** o app roda **direto contra o Supabase** (frontend → Supabase JS com anon key + RLS). As operações que exigem atomicidade (baixar estoque + lançar no caixa numa transação só) vivem em **funções PL/pgSQL no Postgres** (RPCs — ver seção abaixo). O **backend FastAPI existe mas está dormente** — nenhuma feature atual depende dele. Ele fica reservado para quando houver lógica que o banco não deva fazer: e-mail, PDF, integrações externas (marketplaces, pagamento). Decisão registrada na Sessão 9.

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
│       └── 20260617_consumo_decant.sql
├── frontend\
│   ├── vercel.json             → Rewrite SPA para o deploy na Vercel
│   └── src\
│       ├── components\
│       │   ├── layout\         → Layout.tsx (sidebar + header + outlet)
│       │   └── shared\         → Icon, Mark, Modal, FormControls, AnimatedButton,
│       │                       → DayNightSwitch, UserMenu, ImageCropper, ProtectedRoute,
│       │                       → ProductDetailsModal, SaidaRapidaModal, EntradaRapidaModal,
│       │                       → ColorBends, ModelViewer
│       ├── contexts\           → AuthContext.tsx, ThemeContext.tsx
│       ├── pages\
│       │   ├── auth\           → Login.tsx
│       │   ├── home\           → Home.tsx
│       │   ├── financeiro\     → Dashboard, Transacoes, Contas, Relatorios, Metas
│       │   └── estoque\        → EstoqueView (Estoque), Produtos, Vendas, Decants,
│       │       │               → Pedidos, Divergencias, Categorias, Fornecedores,
│       │       │               → Alertas, Relatorios
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
└── backend\                    → FastAPI (dormente — ver nota acima)
    └── app\
        ├── main.py             → FastAPI app + CORS
        ├── auth\               → deps.py (validação de JWT)
        ├── routers\            → financeiro.py, estoque.py (placeholders)
        ├── models\             → schemas Pydantic
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

### Backend (dormente)
```bash
cd C:\Horus\backend
pip install fastapi "uvicorn[standard]" pydantic pydantic-settings "python-jose[cryptography]" httpx
pip install supabase --no-deps
pip install postgrest storage3 gotrue --no-deps
uvicorn app.main:app --reload   # → http://localhost:8000
```
> Nota: `pip install -r requirements.txt` falha no Windows por causa do `pyiceberg`. Use os comandos acima. O backend não é necessário para rodar o app.

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
JWT_SECRET=<copiar de Supabase > Settings > API > JWT Secret>
FRONTEND_URL=http://localhost:5173
```

## Fluxo de dados

```
Browser (React SPA)
    │
    ├── supabase.from(...)   → CRUDs simples (leitura/escrita direta, RLS)
    │
    └── supabase.rpc(...)    → operações atômicas (lógica de negócio no Postgres)
                                  │
                                  └── transação única no Postgres (rollback em falha)

(FastAPI dormente — fora do fluxo atual)
```

## Autenticação

- Login via Supabase Auth (email + senha).
- Frontend gerencia sessão via `AuthContext` (onAuthStateChange); `ProtectedRoute` redireciona para `/login` se não autenticado.
- Token JWT incluído automaticamente pelo Supabase JS SDK; RLS no banco exige role `authenticated` em todas as tabelas.
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
| /estoque/produtos | Produtos (catálogo) |
| /estoque/pedidos · /divergencias | Pedidos · Divergências |
| /estoque/categorias · /fornecedores · /alertas · /relatorios | demais telas de estoque |

Tudo sob `/financeiro/*` e `/estoque/*` usa o `Layout` (sidebar + header). A nav lateral alterna entre os grupos Financeiro e Estoque.

## Deploy

- **Produção:** https://horusparfum-control.vercel.app — frontend na **Vercel**, auto-deploy a cada push na `main`.
- `frontend/vercel.json` faz o rewrite SPA (`/(.*) → /index.html`). Root directory do projeto Vercel aponta para `frontend/`.
- **Banco:** Supabase (cloud). Migrações aplicadas manualmente no SQL Editor — **aplicar antes do deploy**, senão páginas que dependem de tabelas/RPCs novas quebram em produção.
- **Backend:** não está em deploy (dormente).

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
