# Pedidos com abas (Pedidos + Divergências) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a página Pedidos numa rota-layout com duas abas — Pedidos e Divergências — espelhando o padrão visual de `Cadastros.tsx`, removendo o item Divergências da sidebar.

**Architecture:** Nova rota-layout `PedidosLayout` com `<Outlet/>`, barra de abas (pílula dourada deslizante + contadores) e botão de ação via `createPortal` + `useOutletContext`. `EstPedidos` vira a rota index; `EstDivergencias` vira a aba `divergencias`. Ambas as filhas perdem o próprio cabeçalho (o layout é o dono do título). Rota antiga `/estoque/divergencias` redireciona.

**Tech Stack:** React 19, React Router v7, TypeScript, Tailwind CSS 4, Vitest + Testing Library, Supabase JS.

**Spec:** `docs/superpowers/specs/2026-06-19-pedidos-divergencias-abas-design.md`

---

## File Structure

- **Create:** `frontend/src/pages/estoque/PedidosLayout.tsx` — rota-layout com as abas (cópia adaptada de `Cadastros.tsx`).
- **Create:** `frontend/src/pages/estoque/__tests__/PedidosLayout.test.tsx` — teste de componente (espelha `Cadastros.test.tsx`).
- **Modify:** `frontend/src/App.tsx` — aninhar rotas sob `/estoque/pedidos` e redirecionar `/estoque/divergencias`.
- **Modify:** `frontend/src/pages/estoque/Pedidos.tsx` — remover cabeçalho; empurrar botão "Novo pedido" para o `actionSlot` via portal.
- **Modify:** `frontend/src/pages/estoque/Divergencias.tsx` — remover cabeçalho.
- **Modify:** `frontend/src/components/layout/Layout.tsx` — remover item "Divergências" da nav.

Comandos úteis (rodar de `frontend/`):
- Teste único: `npm run test:run -- src/pages/estoque/__tests__/PedidosLayout.test.tsx`
- Suite completa: `npm run test:run`
- Typecheck real: `npx tsc -b`

---

## Task 1: Componente `PedidosLayout` (rota-layout com abas)

**Files:**
- Create: `frontend/src/pages/estoque/PedidosLayout.tsx`
- Test: `frontend/src/pages/estoque/__tests__/PedidosLayout.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/estoque/__tests__/PedidosLayout.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { PedidosLayout } from '../PedidosLayout'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ count: 4, error: null })),
    })),
  },
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/estoque/pedidos" element={<PedidosLayout />}>
          <Route index element={<div>stub-pedidos</div>} />
          <Route path="divergencias" element={<div>stub-divergencias</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('PedidosLayout (layout de abas)', () => {
  it('renderiza o título e as duas abas', () => {
    renderAt('/estoque/pedidos')
    expect(screen.getByRole('heading', { name: 'Pedidos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /pedidos/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /divergências/i })).toBeInTheDocument()
  })

  it('na rota index mostra a lista de pedidos e marca a aba Pedidos como ativa', () => {
    renderAt('/estoque/pedidos')
    expect(screen.getByText('stub-pedidos')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /pedidos/i })).toHaveAttribute('aria-current', 'page')
  })

  it('na rota divergencias mostra a filha e marca a aba Divergências como ativa', () => {
    renderAt('/estoque/pedidos/divergencias')
    expect(screen.getByText('stub-divergencias')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /divergências/i })).toHaveAttribute('aria-current', 'page')
  })

  it('exibe a contagem nas abas após carregar', async () => {
    renderAt('/estoque/pedidos')
    await waitFor(() => expect(screen.getAllByText('4').length).toBeGreaterThan(0))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/pages/estoque/__tests__/PedidosLayout.test.tsx`
Expected: FAIL — não resolve o import `../PedidosLayout` (módulo inexistente).

- [ ] **Step 3: Write the component**

Create `frontend/src/pages/estoque/PedidosLayout.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

interface Aba { id: string; label: string; icon: string; path: string; tabela: string; end: boolean }

const ABAS: Aba[] = [
  { id: 'pedidos', label: 'Pedidos', icon: 'swap', path: '/estoque/pedidos', tabela: 'pedidos', end: true },
  { id: 'divergencias', label: 'Divergências', icon: 'warn', path: '/estoque/pedidos/divergencias', tabela: 'divergencias', end: false },
]

export function PedidosLayout() {
  const location = useLocation()
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null)
  const [contagens, setContagens] = useState<Record<string, number | null>>({
    pedidos: null, divergencias: null,
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

  const isDiv = location.pathname.startsWith('/estoque/pedidos/divergencias')
  const activeIndex = isDiv ? 1 : 0

  return (
    <div className="flex flex-col">
      <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold flex items-center gap-2">
        <span className="w-1 h-1 bg-gold rotate-45 shrink-0" />
        Estoque / Compras
      </p>
      <h1 className="text-4xl tracking-tight mt-1.5">Pedidos</h1>

      <div className="flex items-center justify-between gap-4 flex-wrap mt-5">
        <div className="relative inline-flex bg-surface-2 border border-line-2 rounded-xl p-1">
          <span
            className="absolute top-1 bottom-1 left-1 w-[160px] rounded-lg bg-gold shadow-[0_3px_14px_rgba(201,168,76,0.34)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `translateX(${activeIndex * 160}px)` }}
          />
          {ABAS.map((aba) => {
            const ativo = aba.id === 'divergencias' ? isDiv : !isDiv
            const c = contagens[aba.id]
            return (
              <NavLink
                key={aba.id}
                to={aba.path}
                end={aba.end}
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

> Nota sobre a aba ativa: o `NavLink` da aba Pedidos usa `end` para não ficar ativo na rota `divergencias` (que compartilha o prefixo `/estoque/pedidos`). O `aria-current="page"` é setado pelo próprio `NavLink` quando ativo.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/pages/estoque/__tests__/PedidosLayout.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/estoque/PedidosLayout.tsx frontend/src/pages/estoque/__tests__/PedidosLayout.test.tsx
git commit -m "feat(pedidos): layout de abas Pedidos + Divergencias"
```

---

## Task 2: Aninhar rotas em `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Import the layout**

Adicionar o import junto aos outros (perto de `import { Cadastros } from '@/pages/estoque/Cadastros'`):

```tsx
import { PedidosLayout } from '@/pages/estoque/PedidosLayout'
```

- [ ] **Step 2: Replace the Pedidos + Divergências routes**

Substituir estas duas linhas:

```tsx
        <Route path="/estoque/pedidos" element={<EstPedidos />} />
        <Route path="/estoque/divergencias" element={<EstDivergencias />} />
```

por:

```tsx
        <Route path="/estoque/pedidos" element={<PedidosLayout />}>
          <Route index element={<EstPedidos />} />
          <Route path="divergencias" element={<EstDivergencias />} />
        </Route>
        <Route path="/estoque/divergencias" element={<Navigate to="/estoque/pedidos/divergencias" replace />} />
```

> `Navigate` já está importado (usado nos redirects de Cadastros). `EstPedidos` e `EstDivergencias` continuam importados.

- [ ] **Step 3: Typecheck**

Run (de `frontend/`): `npx tsc -b`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(pedidos): aninha rotas Pedidos/Divergencias e redireciona rota antiga"
```

---

## Task 3: Remover cabeçalho de `Pedidos.tsx` e mover o botão para o slot de ação

**Files:**
- Modify: `frontend/src/pages/estoque/Pedidos.tsx`

- [ ] **Step 1: Add imports para portal e contexto do outlet**

No topo de `Pedidos.tsx`, ajustar os imports. A primeira linha hoje é:

```tsx
import { useState, useEffect, useCallback } from 'react'
```

Adicionar logo abaixo dela:

```tsx
import { createPortal } from 'react-dom'
import { useOutletContext } from 'react-router-dom'
```

- [ ] **Step 2: Ler o actionSlot do contexto**

Dentro de `EstPedidos`, logo após a declaração dos estados (depois de `const [editando, setEditando] = useState<PedidoRow | null>(null)`), adicionar:

```tsx
  const ctx = useOutletContext<{ actionSlot: HTMLElement | null } | null>()
  const actionSlot = ctx?.actionSlot ?? null
```

- [ ] **Step 3: Substituir o bloco de cabeçalho pelo portal do botão**

Remover o bloco de cabeçalho atual (o `<div className="flex items-end justify-between">...</div>` que contém o eyebrow, o `<h1>Pedidos</h1>`, o subtítulo e o botão "Novo pedido"):

```tsx
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Estoque / Compras</p>
          <h1 className="text-3xl font-medium tracking-tight mt-1">Pedidos</h1>
          <p className="text-muted text-sm mt-1">Pedidos a fornecedores e conferência de chegada</p>
        </div>
        <Button onClick={() => setNovoOpen(true)}>
          <Icon name="plus" size={16} />
          Novo pedido
        </Button>
      </div>
```

e colocar no lugar o portal do botão:

```tsx
      {actionSlot && createPortal(
        <Button onClick={() => setNovoOpen(true)}>
          <Icon name="plus" size={16} />
          Novo pedido
        </Button>,
        actionSlot
      )}
```

> O `Button` e o `Icon` continuam importados (usados aqui e nos modais). O `return` continua começando com `<div className="flex flex-col gap-5">`.

- [ ] **Step 4: Typecheck**

Run (de `frontend/`): `npx tsc -b`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/estoque/Pedidos.tsx
git commit -m "feat(pedidos): lista sem cabecalho, acao no slot do layout"
```

---

## Task 4: Remover cabeçalho de `Divergencias.tsx`

**Files:**
- Modify: `frontend/src/pages/estoque/Divergencias.tsx`

- [ ] **Step 1: Remover o bloco de cabeçalho**

Remover este bloco (logo após o `return (` / `<div className="flex flex-col gap-5">`):

```tsx
      <div>
        <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Estoque / Qualidade</p>
        <h1 className="text-3xl font-medium tracking-tight mt-1">Divergências</h1>
        <p className="text-muted text-sm mt-1">Histórico de diferenças entre pedido e recebimento</p>
      </div>
```

O conteúdo seguinte (`{resumo.length > 0 && (...)}`, filtros e tabela) permanece inalterado dentro do mesmo `<div className="flex flex-col gap-5">`.

- [ ] **Step 2: Typecheck**

Run (de `frontend/`): `npx tsc -b`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/estoque/Divergencias.tsx
git commit -m "feat(pedidos): Divergencias sem cabecalho (vira aba)"
```

---

## Task 5: Remover item "Divergências" da sidebar

**Files:**
- Modify: `frontend/src/components/layout/Layout.tsx`

- [ ] **Step 1: Remover a linha do item Divergências**

Localizar (por volta da linha 25-26):

```tsx
  { id: 'pedidos', label: 'Pedidos', icon: 'swap', path: '/estoque/pedidos' },
  { id: 'divergencias', label: 'Divergências', icon: 'warn', path: '/estoque/divergencias' },
```

Remover a segunda linha (a de `divergencias`), mantendo a de `pedidos`.

- [ ] **Step 2: Typecheck**

Run (de `frontend/`): `npx tsc -b`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/Layout.tsx
git commit -m "feat(pedidos): remove item Divergencias da sidebar (agora e aba de Pedidos)"
```

---

## Task 6: Verificação final

**Files:** nenhum (apenas verificação)

- [ ] **Step 1: Rodar a suite completa**

Run (de `frontend/`): `npm run test:run`
Expected: todos os testes passam (84 anteriores + os 4 novos de `PedidosLayout`).

- [ ] **Step 2: Typecheck final**

Run (de `frontend/`): `npx tsc -b`
Expected: sem erros.

- [ ] **Step 3: Smoke manual (opcional, se o dev server estiver de pé)**

- `/estoque/pedidos` → mostra a lista de pedidos, aba "Pedidos" ativa, botão "Novo pedido" no canto direito da barra de abas.
- Clicar na aba "Divergências" → URL vira `/estoque/pedidos/divergencias`, mostra resumo + tabela, botão "Novo pedido" some.
- Acessar `/estoque/divergencias` diretamente → redireciona para `/estoque/pedidos/divergencias`.
- Sidebar do grupo Estoque tem 7 itens (sem "Divergências").

---

## Notas de execução

- **Sem migração de banco.** Tabelas `pedidos`/`divergencias` e RPCs já existem.
- Ao finalizar, atualizar `docs/HANDOFF_IA.md` (novo item de sessão) e adicionar entrada em `docs/LOGS.md`, conforme o workflow do projeto (`CLAUDE.md`).
