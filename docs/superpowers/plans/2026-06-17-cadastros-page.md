# Página "Cadastros" — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar Produtos, Categorias e Fornecedores numa página `/estoque/cadastros` com uma barra de abas premium (indicador dourado deslizante + contadores), reduzindo a sidebar de Estoque de 10 → 8 itens.

**Architecture:** Rota-layout `Cadastros.tsx` com `<Outlet/>` para a aba ativa; as três páginas viram rotas-filhas reaproveitando os componentes existentes. O botão de ação de cada filha sobe para uma "slot" na linha das abas via `createPortal` + `useOutletContext`. Rotas antigas redirecionam para as novas.

**Tech Stack:** React + Vite + TypeScript, React Router v7 (rotas aninhadas, `Outlet`, `useOutletContext`, `NavLink`), Tailwind, Vitest.

**Spec de referência:** `docs/superpowers/specs/2026-06-17-cadastros-page-design.md`

---

## Estrutura de arquivos

**Criar:**
- `frontend/src/pages/estoque/Cadastros.tsx` — layout: breadcrumb + título + barra de abas (indicador + contadores) + slot de ação + divisor ornamental + `<Outlet/>`.
- `frontend/src/pages/estoque/__tests__/Cadastros.test.tsx` — teste de componente.

**Modificar:**
- `frontend/src/App.tsx` — rota aninhada `/estoque/cadastros` + redirects das rotas antigas.
- `frontend/src/components/layout/Layout.tsx` — `EST_NAV` (remove 3, add Cadastros) + ativação por `startsWith`.
- `frontend/src/pages/estoque/Produtos.tsx` — remove cabeçalho, porta os botões, move "Limpar filtros" para a barra de filtros.
- `frontend/src/pages/estoque/Categorias.tsx` — remove cabeçalho, porta o botão.
- `frontend/src/pages/estoque/Fornecedores.tsx` — remove cabeçalho, porta o botão.
- `docs/ARQUITETURA.md`, `docs/HANDOFF_IA.md`, `docs/LOGS.md`.

**Ordem:** layout → rotas+teste → sidebar → cada filha (remove header + porta botão) → docs. Cada task compila com `tsc -b` (entre as tasks 2 e 4-6 há um estado transitório com cabeçalho duplicado, que compila e roda normalmente).

---

## Task 1: Componente de layout `Cadastros.tsx`

**Files:**
- Create: `frontend/src/pages/estoque/Cadastros.tsx`

- [ ] **Step 1: Criar o componente**

Create `frontend/src/pages/estoque/Cadastros.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

interface Aba { id: string; label: string; icon: string; path: string; tabela: string }

const ABAS: Aba[] = [
  { id: 'produtos', label: 'Produtos', icon: 'tag', path: '/estoque/cadastros/produtos', tabela: 'produtos' },
  { id: 'categorias', label: 'Categorias', icon: 'grid', path: '/estoque/cadastros/categorias', tabela: 'categorias' },
  { id: 'fornecedores', label: 'Fornecedores', icon: 'supplier', path: '/estoque/cadastros/fornecedores', tabela: 'fornecedores' },
]

export function Cadastros() {
  const location = useLocation()
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null)
  const [contagens, setContagens] = useState<Record<string, number | null>>({
    produtos: null, categorias: null, fornecedores: null,
  })

  useEffect(() => {
    ABAS.forEach((aba) => {
      supabase.from(aba.tabela).select('id', { count: 'exact', head: true })
        .then(({ count, error }) => {
          if (error) { console.error('Erro ao contar', aba.tabela, error); return }
          setContagens((prev) => ({ ...prev, [aba.id]: count ?? 0 }))
        })
    })
  }, [])

  const activeIndex = Math.max(0, ABAS.findIndex((a) => location.pathname.startsWith(a.path)))

  return (
    <div className="flex flex-col">
      <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold flex items-center gap-2">
        <span className="w-1 h-1 bg-gold rotate-45 shrink-0" />
        Estoque / Cadastros
      </p>
      <h1 className="text-4xl tracking-tight mt-1.5">Cadastros</h1>

      <div className="flex items-center justify-between gap-4 flex-wrap mt-5">
        <div className="relative inline-flex bg-surface-2 border border-line-2 rounded-xl p-1">
          <span
            className="absolute top-1 bottom-1 left-1 w-[160px] rounded-lg bg-gold shadow-[0_3px_14px_rgba(201,168,76,0.34)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `translateX(${activeIndex * 160}px)` }}
          />
          {ABAS.map((aba) => {
            const ativo = location.pathname.startsWith(aba.path)
            const c = contagens[aba.id]
            return (
              <NavLink
                key={aba.id}
                to={aba.path}
                className={cn(
                  'relative z-10 w-[160px] flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg transition-colors',
                  ativo ? 'text-[#1A1407] font-semibold' : 'text-text-2 font-medium hover:text-gold'
                )}
              >
                <Icon name={aba.icon} size={17} />
                {aba.label}
                <span className={cn(
                  'font-mono text-[11px] px-1.5 py-px rounded-full tabular-nums',
                  ativo ? 'bg-[#1A1407]/15 text-[#1A1407]' : 'bg-line text-muted'
                )}>
                  {c === null ? '—' : c}
                </span>
              </NavLink>
            )
          })}
        </div>

        <div ref={setActionSlot} className="flex items-center gap-2" />
      </div>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent to-gold/30" />
        <span className="w-1.5 h-1.5 bg-gold rotate-45" />
        <div className="flex-1 h-px bg-gradient-to-l from-transparent to-gold/30" />
      </div>

      <Outlet context={{ actionSlot }} />
    </div>
  )
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd frontend && npx tsc -b`
Expected: sem erros. (Se `cn` não existir em `@/lib/utils`, pare e reporte BLOCKED — mas ele é usado em todo o app, ex: `Layout.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/estoque/Cadastros.tsx
git commit -m "feat(cadastros): layout com abas premium (indicador deslizante + contadores)"
```

---

## Task 2: Rotas aninhadas + redirects + teste

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/estoque/__tests__/Cadastros.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

Create `frontend/src/pages/estoque/__tests__/Cadastros.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Cadastros } from '../Cadastros'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ count: 5, error: null })),
    })),
  },
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/estoque/cadastros" element={<Cadastros />}>
          <Route path="produtos" element={<div>stub-produtos</div>} />
          <Route path="categorias" element={<div>stub-categorias</div>} />
          <Route path="fornecedores" element={<div>stub-fornecedores</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('Cadastros (layout de abas)', () => {
  it('renderiza o título e as três abas', () => {
    renderAt('/estoque/cadastros/produtos')
    expect(screen.getByText('Cadastros')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /produtos/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /categorias/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /fornecedores/i })).toBeInTheDocument()
  })

  it('marca a aba da rota atual como ativa e renderiza a filha', () => {
    renderAt('/estoque/cadastros/categorias')
    expect(screen.getByRole('link', { name: /categorias/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('stub-categorias')).toBeInTheDocument()
  })

  it('exibe a contagem nas abas após carregar', async () => {
    renderAt('/estoque/cadastros/produtos')
    await waitFor(() => expect(screen.getAllByText('5').length).toBeGreaterThan(0))
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd frontend && npx vitest run src/pages/estoque/__tests__/Cadastros.test.tsx`
Expected: FAIL — `Cadastros` ainda não existe como rota / o componente pode falhar se importado errado. (Na verdade o componente existe da Task 1; este teste valida o layout com rotas. Deve passar já — então o "fail" aqui é só garantir que o arquivo de teste roda. Se passar de primeira, siga.)

> Nota TDD: o componente já foi criado na Task 1, então este teste pode passar imediatamente. Tudo bem — o valor aqui é travar o comportamento do layout antes de mexer nas rotas reais.

- [ ] **Step 3: Adicionar as rotas no App**

Em `frontend/src/App.tsx`:

Adicionar imports (junto aos outros de estoque):
```tsx
import { Cadastros } from '@/pages/estoque/Cadastros'
import { Navigate } from 'react-router-dom'
```
(Se `Navigate` já estiver importado de `react-router-dom`, não duplicar — adicionar só `Cadastros`.)

Dentro do bloco `<Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>`, **remover** as três rotas diretas existentes (elas NÃO são adjacentes — `/estoque/produtos` fica num ponto e `/estoque/categorias` + `/estoque/fornecedores` em outro; remova cada uma onde estiver):
```tsx
        <Route path="/estoque/produtos" element={<EstProdutos />} />
        <Route path="/estoque/categorias" element={<EstCategorias />} />
        <Route path="/estoque/fornecedores" element={<EstFornecedores />} />
```
e adicionar o bloco aninhado + os redirects (em React Router v7 a ordem não importa para o matching, então podem ficar onde fizer sentido, ex: logo após a rota de `/estoque/vendas/config`):
```tsx
        <Route path="/estoque/cadastros" element={<Cadastros />}>
          <Route index element={<Navigate to="/estoque/cadastros/produtos" replace />} />
          <Route path="produtos" element={<EstProdutos />} />
          <Route path="categorias" element={<EstCategorias />} />
          <Route path="fornecedores" element={<EstFornecedores />} />
        </Route>
        <Route path="/estoque/produtos" element={<Navigate to="/estoque/cadastros/produtos" replace />} />
        <Route path="/estoque/categorias" element={<Navigate to="/estoque/cadastros/categorias" replace />} />
        <Route path="/estoque/fornecedores" element={<Navigate to="/estoque/cadastros/fornecedores" replace />} />
```
(As três linhas antigas de produtos/categorias/fornecedores deixam de apontar para os componentes diretamente — viram redirects. As importações `EstProdutos`/`EstCategorias`/`EstFornecedores` continuam usadas, agora como filhas de Cadastros.)

- [ ] **Step 4: Rodar o teste e o build**

Run: `cd frontend && npx vitest run src/pages/estoque/__tests__/Cadastros.test.tsx && npx tsc -b`
Expected: teste PASS (3); `tsc -b` sem erros.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/estoque/__tests__/Cadastros.test.tsx
git commit -m "feat(cadastros): rotas aninhadas + redirects das rotas antigas + teste"
```

---

## Task 3: Sidebar — `EST_NAV` e ativação por grupo

**Files:**
- Modify: `frontend/src/components/layout/Layout.tsx`

- [ ] **Step 1: Atualizar `EST_NAV`**

Em `frontend/src/components/layout/Layout.tsx`, no array `EST_NAV`, **remover** os itens `produtos`, `categorias` e `fornecedores`, e **adicionar** o item `cadastros` na posição onde estava `produtos` (após `decants`). O array deve ficar:

```tsx
const EST_NAV = [
  { id: 'estoque', label: 'Estoque', icon: 'box', path: '/estoque' },
  { id: 'vendas', label: 'Vendas', icon: 'cart', path: '/estoque/vendas' },
  { id: 'decants', label: 'Decants', icon: 'droplet', path: '/estoque/decants' },
  { id: 'cadastros', label: 'Cadastros', icon: 'tag', path: '/estoque/cadastros' },
  { id: 'pedidos', label: 'Pedidos', icon: 'swap', path: '/estoque/pedidos' },
  { id: 'divergencias', label: 'Divergências', icon: 'warn', path: '/estoque/divergencias' },
  { id: 'alertas', label: 'Alertas', icon: 'alert', path: '/estoque/alertas' },
  { id: 'relatorios', label: 'Relatório de giro', icon: 'report', path: '/estoque/relatorios' },
]
```

- [ ] **Step 2: Ativação por `startsWith` para Cadastros**

Ainda em `Layout.tsx`, a marcação de item ativo usa `location.pathname === item.path`. Para o item Cadastros ficar ativo em qualquer sub-rota (`/estoque/cadastros/produtos` etc.), trocar a linha que calcula `active` dentro do `nav.map(...)`:

```tsx
          const active = location.pathname === item.path
```
por:
```tsx
          const active = item.path === '/estoque/cadastros'
            ? location.pathname.startsWith('/estoque/cadastros')
            : location.pathname === item.path
```

- [ ] **Step 3: Verificar build**

Run: `cd frontend && npx tsc -b`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/Layout.tsx
git commit -m "feat(cadastros): sidebar 10->8 (item Cadastros no lugar dos tres)"
```

---

## Task 4: Produtos — remover cabeçalho e portar ações

**Files:**
- Modify: `frontend/src/pages/estoque/Produtos.tsx`

- [ ] **Step 1: Imports do portal/outlet**

No topo de `frontend/src/pages/estoque/Produtos.tsx`, adicionar:
```tsx
import { createPortal } from 'react-dom'
import { useOutletContext } from 'react-router-dom'
```

- [ ] **Step 2: Ler o actionSlot do contexto**

Dentro do componente `EstProdutos`, logo no início (após os hooks de estado, antes do `return`), adicionar:
```tsx
  const ctx = useOutletContext<{ actionSlot: HTMLElement | null } | null>()
  const actionSlot = ctx?.actionSlot ?? null
```

- [ ] **Step 3: Substituir o bloco de cabeçalho**

Localizar o bloco do cabeçalho (de `<div className="flex items-end justify-between">` até o `</div>` que o fecha — atualmente linhas ~180-209) e **substituí-lo** por um portal dos botões de ação (sem breadcrumb/h1/subtítulo):

```tsx
      {actionSlot && createPortal(
        <>
          <Button variant="secondary">
            <Icon name="download" size={16} />
            Importar
          </Button>
          <Button onClick={() => setModalOpen(true)}>
            <Icon name="plus" size={16} />
            Novo produto
          </Button>
        </>,
        actionSlot
      )}
```

- [ ] **Step 4: Mover "Limpar filtros" para a barra de filtros**

Na barra de busca e filtros (`<div className="flex items-center gap-2.5">`, logo após os dois `<Select>` de Categoria e Fornecedor), adicionar ao final, dentro desse mesmo `div`:
```tsx
        {(search || filterCategoria || filterFornecedor) && (
          <button
            type="button"
            onClick={() => { setSearch(''); setFilterCategoria(''); setFilterFornecedor('') }}
            className="text-xs text-muted hover:text-text transition-colors cursor-pointer whitespace-nowrap"
          >
            Limpar filtros
          </button>
        )}
```

- [ ] **Step 5: Verificar build + suíte**

Run: `cd frontend && npx tsc -b && npx vitest run`
Expected: sem erros; suíte verde.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/estoque/Produtos.tsx
git commit -m "feat(cadastros): Produtos sem cabecalho, acoes na barra de abas"
```

---

## Task 5: Categorias — remover cabeçalho e portar ação

**Files:**
- Modify: `frontend/src/pages/estoque/Categorias.tsx`

- [ ] **Step 1: Imports + actionSlot**

No topo de `frontend/src/pages/estoque/Categorias.tsx`, adicionar:
```tsx
import { createPortal } from 'react-dom'
import { useOutletContext } from 'react-router-dom'
```
Dentro de `EstCategorias` (após os hooks, antes do `return`):
```tsx
  const ctx = useOutletContext<{ actionSlot: HTMLElement | null } | null>()
  const actionSlot = ctx?.actionSlot ?? null
```

- [ ] **Step 2: Substituir o cabeçalho pelo portal**

Localizar o bloco do cabeçalho (de `<div className="flex items-end justify-between">` até seu `</div>` de fechamento — contém breadcrumb "Estoque", `<h1>Categorias</h1>`, subtítulo "Organização do catálogo" e o `<Button>Nova categoria`) e **substituí-lo** por:

```tsx
      {actionSlot && createPortal(
        <Button onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={16} />
          Nova categoria
        </Button>,
        actionSlot
      )}
```

- [ ] **Step 3: Verificar build**

Run: `cd frontend && npx tsc -b`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/estoque/Categorias.tsx
git commit -m "feat(cadastros): Categorias sem cabecalho, acao na barra de abas"
```

---

## Task 6: Fornecedores — remover cabeçalho e portar ação

**Files:**
- Modify: `frontend/src/pages/estoque/Fornecedores.tsx`

- [ ] **Step 1: Imports + actionSlot**

No topo de `frontend/src/pages/estoque/Fornecedores.tsx`, adicionar:
```tsx
import { createPortal } from 'react-dom'
import { useOutletContext } from 'react-router-dom'
```
Dentro de `EstFornecedores` (após os hooks, antes do `return`):
```tsx
  const ctx = useOutletContext<{ actionSlot: HTMLElement | null } | null>()
  const actionSlot = ctx?.actionSlot ?? null
```

- [ ] **Step 2: Substituir o cabeçalho pelo portal**

Localizar o bloco do cabeçalho (de `<div className="flex items-end justify-between">` até seu `</div>` de fechamento — contém breadcrumb "Estoque", `<h1>Fornecedores</h1>`, subtítulo "Parceiros e distribuidores" e o `<Button>Novo fornecedor`) e **substituí-lo** por:

```tsx
      {actionSlot && createPortal(
        <Button onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={16} />
          Novo fornecedor
        </Button>,
        actionSlot
      )}
```

- [ ] **Step 3: Verificar build + suíte completa**

Run: `cd frontend && npx tsc -b && npx vitest run`
Expected: sem erros; suíte verde.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/estoque/Fornecedores.tsx
git commit -m "feat(cadastros): Fornecedores sem cabecalho, acao na barra de abas"
```

---

## Task 7: Documentação

**Files:**
- Modify: `docs/ARQUITETURA.md`, `docs/HANDOFF_IA.md`, `docs/LOGS.md`

- [ ] **Step 1: ARQUITETURA**

Em `docs/ARQUITETURA.md`:
- Na tabela de **Rotas**, substituir as linhas de produtos/categorias/fornecedores por uma linha de Cadastros: `/estoque/cadastros (+ /produtos, /categorias, /fornecedores)` → "Cadastros (abas)". Anotar que as rotas antigas redirecionam.
- Na **Estrutura de pastas**, adicionar `Cadastros` à lista de páginas de estoque.

- [ ] **Step 2: HANDOFF**

Em `docs/HANDOFF_IA.md`: bumpar a sessão no topo e adicionar um item em "O que já foi feito" descrevendo a página Cadastros (unifica Produtos/Categorias/Fornecedores com barra de abas premium; sidebar 10→8; redirects).

- [ ] **Step 3: LOGS**

Em `docs/LOGS.md`, prepend uma entrada de sessão: página Cadastros unificando os três cadastros sob `/estoque/cadastros`, barra de abas com indicador dourado deslizante + contadores + divisor ornamental, botão de ação via portal, redirects das rotas antigas, sidebar 10→8.

- [ ] **Step 4: Commit**

```bash
git add docs/ARQUITETURA.md docs/HANDOFF_IA.md docs/LOGS.md
git commit -m "docs(cadastros): atualiza ARQUITETURA, HANDOFF e LOGS"
```

---

## Verificação final (após todas as tasks)

- [ ] **Suíte + typecheck + build**

Run: `cd frontend && npx vitest run && npx tsc -b && npm run build`
Expected: todos os testes passam; `tsc -b` sem erros; build conclui. (`tsc -b` é o typecheck real — `tsc --noEmit` não checa os arquivos.)

- [ ] **Verificação visual no preview**

1. Abrir `/estoque/cadastros` → redireciona para a aba Produtos; conferir o cabeçalho (breadcrumb mono, título serif, barra de abas com indicador dourado, contadores, divisor ornamental).
2. Clicar nas abas Categorias e Fornecedores → indicador desliza, conteúdo troca, URL muda, e o botão de ação à direita muda ("Nova categoria"/"Novo fornecedor").
3. Conferir que o botão de ação abre o modal correto em cada aba e que os filtros do Produtos continuam funcionando (incluindo "Limpar filtros").
4. Sidebar: só "Cadastros" no lugar dos três; item ativo em qualquer sub-rota.
5. Acessar `/estoque/produtos` direto → redireciona para `/estoque/cadastros/produtos`.
```
