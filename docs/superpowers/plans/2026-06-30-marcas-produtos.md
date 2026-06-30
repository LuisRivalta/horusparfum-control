# Marcas de Produtos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class optional brand (`marca`) cadastro and link products to brands without changing stock, sales, orders, or finance flows.

**Architecture:** Add a Supabase migration for `marcas` and nullable `produtos.marca_id`, then integrate brands into the existing React/Supabase cadastro flow. Keep the feature frontend-driven like Categorias and Fornecedores, with no backend FastAPI changes.

**Tech Stack:** Supabase PostgreSQL/RLS, React 19, TypeScript, Vite, Tailwind CSS, Vitest, Testing Library.

---

## File Structure

- Create `supabase/migrations/20260630_marcas_produtos.sql`: table `marcas`, `produtos.marca_id`, index, RLS policy.
- Create `frontend/src/pages/estoque/Marcas.tsx`: simple CRUD-create/list page for brands.
- Create `frontend/src/pages/estoque/__tests__/Marcas.test.tsx`: tests brand listing and creation.
- Modify `frontend/src/pages/estoque/Cadastros.tsx`: add `Marcas` tab and count.
- Modify `frontend/src/pages/estoque/__tests__/Cadastros.test.tsx`: assert the new tab and route.
- Modify `frontend/src/App.tsx`: add nested route `/estoque/cadastros/marcas`.
- Modify `frontend/src/pages/estoque/Produtos.tsx`: load brands, create products with optional `marca_id`, filter by brand, pass brands to details modal.
- Modify `frontend/src/pages/estoque/__tests__/Produtos.test.tsx`: cover product creation with and without brand.
- Modify `frontend/src/components/shared/ProductDetailsModal.tsx`: display/edit brand.
- Modify `frontend/src/components/shared/__tests__/ProductDetailsModal.test.tsx`: cover brand display and update payload.
- Modify `frontend/src/pages/estoque/EstoqueView.tsx`: load/filter brands.
- Modify `frontend/src/pages/estoque/__tests__/EstoqueView.test.tsx`: cover brand filter.
- Modify `docs/BANCO.md`, `docs/HANDOFF_IA.md`, `docs/LOGS.md`: document schema and session result after implementation.

## Task 1: Supabase Migration

**Files:**
- Create: `supabase/migrations/20260630_marcas_produtos.sql`
- Modify: `docs/BANCO.md`

- [ ] **Step 1: Create the migration SQL**

Create `supabase/migrations/20260630_marcas_produtos.sql`:

```sql
create extension if not exists "uuid-ossp";

create table if not exists public.marcas (
  id uuid primary key default uuid_generate_v4(),
  nome text not null unique,
  created_at timestamptz not null default now()
);

alter table public.marcas enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'marcas'
      and policyname = 'Acesso total autenticados'
  ) then
    create policy "Acesso total autenticados"
    on public.marcas
    for all
    to authenticated
    using (true)
    with check (true);
  end if;
end $$;

alter table public.produtos
  add column if not exists marca_id uuid references public.marcas(id) on delete set null;

create index if not exists idx_produtos_marca_id on public.produtos(marca_id);
```

- [ ] **Step 2: Validate the migration text locally**

Run:

```bash
rg -n "create table if not exists public.marcas|enable row level security|marca_id uuid references public.marcas|idx_produtos_marca_id" supabase/migrations/20260630_marcas_produtos.sql
```

Expected: all four patterns are found.

- [ ] **Step 3: Update database docs**

Modify `docs/BANCO.md`.

Add a new section after `fornecedores`:

```md
### `marcas`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| nome | text unique | Marca/fabricante do produto, ex: Lattafa, Armaf |
| created_at | timestamptz | — |
```

In the `produtos` table, add this row after `fornecedor_id`:

```md
| marca_id | uuid (FK → marcas) | Nullable; marca/fabricante do produto |
```

In `Relações`, change:

```txt
categorias ←── produtos
fornecedores ←── produtos
```

to:

```txt
categorias ←── produtos
fornecedores ←── produtos
marcas ←── produtos
```

Near the migration notes at the bottom, add:

```md
Migração de marcas: `supabase/migrations/20260630_marcas_produtos.sql` (tabela `marcas`, coluna nullable `produtos.marca_id`, índice e RLS para `authenticated`). Aplicar manualmente no Supabase SQL Editor.
```

- [ ] **Step 4: Commit Task 1**

Run:

```bash
git add supabase/migrations/20260630_marcas_produtos.sql docs/BANCO.md
git commit -m "feat(db): adiciona marcas de produtos"
```

## Task 2: Cadastros Marcas Page and Route

**Files:**
- Create: `frontend/src/pages/estoque/Marcas.tsx`
- Create: `frontend/src/pages/estoque/__tests__/Marcas.test.tsx`
- Modify: `frontend/src/pages/estoque/Cadastros.tsx`
- Modify: `frontend/src/pages/estoque/__tests__/Cadastros.test.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write failing tests for Cadastros and Marcas**

Modify `frontend/src/pages/estoque/__tests__/Cadastros.test.tsx`:

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
          <Route path="marcas" element={<div>stub-marcas</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('Cadastros (layout de abas)', () => {
  it('renderiza o título e as quatro abas', () => {
    renderAt('/estoque/cadastros/produtos')
    expect(screen.getByText('Cadastros')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /produtos/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /categorias/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /fornecedores/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /marcas/i })).toBeInTheDocument()
  })

  it('marca a aba da rota atual como ativa e renderiza a filha', () => {
    renderAt('/estoque/cadastros/marcas')
    expect(screen.getByRole('link', { name: /marcas/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('stub-marcas')).toBeInTheDocument()
  })

  it('exibe a contagem nas abas após carregar', async () => {
    renderAt('/estoque/cadastros/produtos')
    await waitFor(() => expect(screen.getAllByText('5').length).toBeGreaterThan(0))
  })
})
```

Create `frontend/src/pages/estoque/__tests__/Marcas.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EstMarcas } from '../Marcas'

const { inserts } = vi.hoisted(() => ({
  inserts: [] as unknown[],
}))

vi.mock('react-router-dom', () => ({
  useOutletContext: () => ({ actionSlot: document.body }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: [{ id: 'm1', nome: 'Lattafa', created_at: '2026-06-30T00:00:00Z' }],
          error: null,
        })),
      })),
      insert: vi.fn((payload: unknown) => {
        inserts.push(payload)
        return Promise.resolve({ error: null })
      }),
    })),
  },
}))

beforeEach(() => {
  inserts.length = 0
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
    this.open = false
  })
})

describe('EstMarcas', () => {
  it('renderiza marcas existentes', async () => {
    render(<EstMarcas />)
    expect(await screen.findByText('Lattafa')).toBeInTheDocument()
  })

  it('cria uma nova marca', async () => {
    const user = userEvent.setup()
    render(<EstMarcas />)

    await user.click(await screen.findByRole('button', { name: /nova marca/i }))
    await user.type(screen.getByLabelText(/nome/i), 'Armaf')
    await user.click(screen.getByRole('button', { name: /^salvar$/i }))

    await waitFor(() => expect(inserts).toHaveLength(1))
    expect(inserts[0]).toEqual({ nome: 'Armaf' })
  })
})
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
cd frontend
npm run test:run -- src/pages/estoque/__tests__/Cadastros.test.tsx src/pages/estoque/__tests__/Marcas.test.tsx
```

Expected: FAIL because `Marcas.tsx` and the `Marcas` tab/route do not exist.

- [ ] **Step 3: Implement `Marcas.tsx`**

Create `frontend/src/pages/estoque/Marcas.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Modal } from '@/components/shared/Modal'
import { Button, Input } from '@/components/shared/FormControls'

interface Marca {
  id: string
  nome: string
  created_at: string
}

export function EstMarcas() {
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nome: '' })

  const ctx = useOutletContext<{ actionSlot: HTMLElement | null } | null>()
  const actionSlot = ctx?.actionSlot ?? null

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase.from('marcas').select('*').order('nome')
    setMarcas(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('marcas').insert({ nome: form.nome })
    setForm({ nome: '' })
    setModalOpen(false)
    fetchData()
  }

  return (
    <div className="flex flex-col gap-5">
      {actionSlot && createPortal(
        <Button onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={16} />
          Nova marca
        </Button>,
        actionSlot
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? (
          <p className="text-muted col-span-full text-center py-8">Carregando...</p>
        ) : marcas.length === 0 ? (
          <p className="text-muted col-span-full text-center py-8">Nenhuma marca cadastrada</p>
        ) : (
          marcas.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-4 border border-line rounded-xl bg-surface hover:bg-surface-2 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-gold-dim flex items-center justify-center">
                <Icon name="tag" size={20} gold />
              </div>
              <span className="font-medium">{m.nome}</span>
            </div>
          ))
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova marca">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Nome" value={form.nome} onChange={(e) => setForm({ nome: e.target.value })} required placeholder="Ex: Lattafa, Armaf" />
          <div className="flex justify-end gap-3 mt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
```

- [ ] **Step 4: Add tab and route**

Modify `frontend/src/pages/estoque/Cadastros.tsx`:

```tsx
interface Aba { id: string; label: string; icon: string; path: string; tabela: string }

const TAB_WIDTH = 150

const ABAS: Aba[] = [
  { id: 'produtos', label: 'Produtos', icon: 'tag', path: '/estoque/cadastros/produtos', tabela: 'produtos' },
  { id: 'categorias', label: 'Categorias', icon: 'grid', path: '/estoque/cadastros/categorias', tabela: 'categorias' },
  { id: 'fornecedores', label: 'Fornecedores', icon: 'supplier', path: '/estoque/cadastros/fornecedores', tabela: 'fornecedores' },
  { id: 'marcas', label: 'Marcas', icon: 'tag', path: '/estoque/cadastros/marcas', tabela: 'marcas' },
]
```

Initialize counts with all IDs:

```tsx
const [contagens, setContagens] = useState<Record<string, number | null>>(
  Object.fromEntries(ABAS.map((aba) => [aba.id, null]))
)
```

Replace fixed `160px` widths with `TAB_WIDTH`:

```tsx
className="absolute top-1 bottom-1 left-1 rounded-lg bg-gold shadow-[0_3px_14px_rgba(201,168,76,0.34)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
style={{ width: TAB_WIDTH, transform: `translateX(${activeIndex * TAB_WIDTH}px)` }}
```

For each `NavLink`, replace `w-[160px]` with:

```tsx
style={{ width: TAB_WIDTH }}
```

Modify `frontend/src/App.tsx`:

```tsx
import { EstMarcas } from '@/pages/estoque/Marcas'
```

Add nested route:

```tsx
<Route path="marcas" element={<EstMarcas />} />
```

- [ ] **Step 5: Run focused tests to verify GREEN**

Run:

```bash
cd frontend
npm run test:run -- src/pages/estoque/__tests__/Cadastros.test.tsx src/pages/estoque/__tests__/Marcas.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add frontend/src/pages/estoque/Marcas.tsx frontend/src/pages/estoque/__tests__/Marcas.test.tsx frontend/src/pages/estoque/Cadastros.tsx frontend/src/pages/estoque/__tests__/Cadastros.test.tsx frontend/src/App.tsx
git commit -m "feat(frontend): adiciona cadastro de marcas"
```

## Task 3: Product Create and Details Brand Integration

**Files:**
- Modify: `frontend/src/pages/estoque/Produtos.tsx`
- Modify: `frontend/src/pages/estoque/__tests__/Produtos.test.tsx`
- Modify: `frontend/src/components/shared/ProductDetailsModal.tsx`
- Modify: `frontend/src/components/shared/__tests__/ProductDetailsModal.test.tsx`

- [ ] **Step 1: Write failing product create tests**

Modify `frontend/src/pages/estoque/__tests__/Produtos.test.tsx` Supabase mock data:

```tsx
data: table === 'categorias'
  ? [{ id: 'c1', nome: 'Arabes' }]
  : table === 'fornecedores'
    ? [{ id: 'f1', nome: 'Onun' }]
    : table === 'marcas'
      ? [{ id: 'm1', nome: 'Lattafa' }]
      : [],
```

Update the first test expectation:

```tsx
expect(screen.queryByLabelText(/estoque atual/i)).not.toBeInTheDocument()
expect(screen.getByLabelText(/marca/i)).toBeInTheDocument()
```

Add this test:

```tsx
it('permite cadastrar produto com marca opcional', async () => {
  const user = userEvent.setup()
  render(<EstProdutos />)

  await user.click(await screen.findByRole('button', { name: /novo produto/i }))
  await user.type(screen.getByLabelText(/nome/i), 'Lattafa Asad')
  await user.selectOptions(screen.getByLabelText(/marca/i), 'm1')
  await user.click(screen.getByRole('button', { name: /^salvar$/i }))

  await waitFor(() => expect(inserts).toHaveLength(1))
  expect(inserts[0]).toMatchObject({
    nome: 'Lattafa Asad',
    marca_id: 'm1',
  })
})
```

In the existing test, assert no brand selected writes null:

```tsx
expect(inserts[0]).toMatchObject({
  nome: 'Lattafa Asad',
  estoque_atual: 0,
  estoque_minimo: 2,
  marca_id: null,
})
```

- [ ] **Step 2: Write failing product details tests**

Modify `frontend/src/components/shared/__tests__/ProductDetailsModal.test.tsx`.

Add to `produto`:

```tsx
marca_id: 'm1',
marcas: { nome: 'Lattafa' },
```

Pass `marcas={[{ id: 'm1', nome: 'Lattafa' }, { id: 'm2', nome: 'Armaf' }]}` in test renders. Existing renders can use `marcas={[]}` if brand behavior is irrelevant, but the prop must be present after implementation.

Add tests:

```tsx
it('exibe a marca no modo leitura', async () => {
  render(
    <ProductDetailsModal
      open
      produto={produto}
      categorias={[{ id: 'c1', nome: 'Masculino' }]}
      fornecedores={[{ id: 'f1', nome: 'Cairo' }]}
      marcas={[{ id: 'm1', nome: 'Lattafa' }]}
      onClose={vi.fn()}
      onUpdated={vi.fn()}
      onDeleted={vi.fn()}
    />
  )

  expect(screen.getByText('Marca')).toBeInTheDocument()
  expect(screen.getByText('Lattafa')).toBeInTheDocument()
})

it('edita marca do produto', async () => {
  const onUpdated = vi.fn()

  render(
    <ProductDetailsModal
      open
      produto={produto}
      categorias={[{ id: 'c1', nome: 'Masculino' }]}
      fornecedores={[{ id: 'f1', nome: 'Cairo' }]}
      marcas={[{ id: 'm1', nome: 'Lattafa' }, { id: 'm2', nome: 'Armaf' }]}
      onClose={vi.fn()}
      onUpdated={onUpdated}
      onDeleted={vi.fn()}
    />
  )

  fireEvent.click(screen.getByRole('button', { name: /editar/i }))
  fireEvent.change(screen.getByLabelText(/marca/i), { target: { value: 'm2' } })
  fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }))

  await waitFor(() => expect(onUpdated).toHaveBeenCalled())
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    marca_id: 'm2',
  }))
})
```

- [ ] **Step 3: Run focused tests to verify RED**

Run:

```bash
cd frontend
npm run test:run -- src/pages/estoque/__tests__/Produtos.test.tsx src/components/shared/__tests__/ProductDetailsModal.test.tsx
```

Expected: FAIL because `marca_id`, `marcas` props, selects, and display do not exist.

- [ ] **Step 4: Implement `Produtos.tsx` brand support**

Modify `frontend/src/pages/estoque/Produtos.tsx`.

Add fields to `Produto`:

```tsx
marca_id: string | null
marcas?: { nome: string } | null
```

Add interface:

```tsx
interface Marca {
  id: string
  nome: string
}
```

Add state:

```tsx
const [marcas, setMarcas] = useState<Marca[]>([])
const [filterMarca, setFilterMarca] = useState('')
```

Filter:

```tsx
if (filterMarca && p.marca_id !== filterMarca) return false
```

Form:

```tsx
marca_id: '',
```

Fetch:

```tsx
const [{ data: prods }, { data: cats }, { data: forns }, { data: marcasData }] = await Promise.all([
  supabase.from('produtos').select('*, categorias(nome), fornecedores(nome), marcas(nome)').order('created_at', { ascending: false }),
  supabase.from('categorias').select('id, nome'),
  supabase.from('fornecedores').select('id, nome'),
  supabase.from('marcas').select('id, nome').order('nome'),
])
setMarcas(marcasData || [])
```

Insert:

```tsx
marca_id: form.marca_id || null,
```

Reset:

```tsx
setForm({ nome: '', volume_ml: '', preco_referencia: '', categoria_id: '', fornecedor_id: '', marca_id: '', estoque_minimo: '0' })
```

Add brand filter after fornecedor:

```tsx
<Select
  label=""
  options={[{ value: '', label: 'Marca' }, ...marcas.map(m => ({ value: m.id, label: m.nome }))]}
  value={filterMarca}
  onChange={(e) => setFilterMarca(e.target.value)}
/>
```

Update clear filters condition and handler:

```tsx
{(search || filterCategoria || filterFornecedor || filterMarca) && (
  <button
    type="button"
    onClick={() => { setSearch(''); setFilterCategoria(''); setFilterFornecedor(''); setFilterMarca('') }}
```

Add brand select in modal after `Fornecedor`:

```tsx
<Select label="Marca" options={[{ value: '', label: '—' }, ...marcas.map(m => ({ value: m.id, label: m.nome }))]} value={form.marca_id} onChange={(e) => setForm({ ...form, marca_id: e.target.value })} />
```

Pass brands:

```tsx
marcas={marcas}
```

- [ ] **Step 5: Implement `ProductDetailsModal.tsx` brand support**

Modify `frontend/src/components/shared/ProductDetailsModal.tsx`.

Add interface:

```tsx
interface Marca { id: string; nome: string }
```

Add to `Produto`:

```tsx
marca_id: string | null
marcas?: { nome: string } | null
```

Add prop:

```tsx
marcas: Marca[]
```

Destructure prop:

```tsx
marcas,
```

Add form field:

```tsx
marca_id: '',
```

In `startEdit`:

```tsx
marca_id: produto!.marca_id ?? '',
```

In update payload:

```tsx
marca_id: form.marca_id || null,
```

Add edit select after `Fornecedor`:

```tsx
<Select label="Marca" options={[{ value: '', label: '—' }, ...marcas.map(m => ({ value: m.id, label: m.nome }))]} value={form.marca_id} onChange={(e) => setForm({ ...form, marca_id: e.target.value })} />
```

Add read-only block near fornecedor:

```tsx
<div>
  <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Marca</div>
  <div className="text-text-2">{produto.marcas?.nome || '—'}</div>
</div>
```

- [ ] **Step 6: Run focused tests to verify GREEN**

Run:

```bash
cd frontend
npm run test:run -- src/pages/estoque/__tests__/Produtos.test.tsx src/components/shared/__tests__/ProductDetailsModal.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add frontend/src/pages/estoque/Produtos.tsx frontend/src/pages/estoque/__tests__/Produtos.test.tsx frontend/src/components/shared/ProductDetailsModal.tsx frontend/src/components/shared/__tests__/ProductDetailsModal.test.tsx
git commit -m "feat(frontend): vincula marcas aos produtos"
```

## Task 4: Estoque Brand Filter

**Files:**
- Modify: `frontend/src/pages/estoque/EstoqueView.tsx`
- Modify: `frontend/src/pages/estoque/__tests__/EstoqueView.test.tsx`

- [ ] **Step 1: Write failing brand filter test**

Modify `frontend/src/pages/estoque/__tests__/EstoqueView.test.tsx`.

In product fake data, add brand fields:

```tsx
marca_id: 'm1',
marcas: { nome: 'Lattafa' },
```

for `Asad`, and:

```tsx
marca_id: 'm2',
marcas: { nome: 'Armaf' },
```

for `Lattafa`.

Change non-product table mock:

```tsx
if (table === 'marcas') {
  return {
    select: vi.fn(() => Promise.resolve({
      data: [{ id: 'm1', nome: 'Lattafa' }, { id: 'm2', nome: 'Armaf' }],
      error: null,
    })),
  }
}
return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) }
```

Add test:

```tsx
it('filtra cards por marca', async () => {
  render(<EstEstoque />)
  await waitFor(() => expect(screen.getByText('Asad')).toBeInTheDocument())

  fireEvent.change(screen.getByDisplayValue('Marca'), {
    target: { value: 'm2' },
  })

  expect(screen.queryByText('Asad')).not.toBeInTheDocument()
  expect(screen.getByText('Lattafa')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run focused test to verify RED**

Run:

```bash
cd frontend
npm run test:run -- src/pages/estoque/__tests__/EstoqueView.test.tsx
```

Expected: FAIL because the brand filter select does not exist.

- [ ] **Step 3: Implement brand loading and filter in EstoqueView**

Modify `frontend/src/pages/estoque/EstoqueView.tsx`.

Add to product type:

```tsx
marca_id: string | null
marcas?: { nome: string } | null
```

Add interface:

```tsx
interface Marca {
  id: string
  nome: string
}
```

Add state:

```tsx
const [marcas, setMarcas] = useState<Marca[]>([])
const [filterMarca, setFilterMarca] = useState('')
```

Fetch products with brands:

```tsx
supabase.from('produtos').select('*, categorias(nome), fornecedores(nome), marcas(nome)').gt('estoque_atual', 0)
```

Fetch brand list:

```tsx
const { data: marcasData } = await supabase.from('marcas').select('id, nome')
setMarcas(marcasData || [])
```

Apply filter:

```tsx
if (filterMarca && p.marca_id !== filterMarca) return false
```

Add select next to category/supplier filters:

```tsx
<Select
  label=""
  options={[{ value: '', label: 'Marca' }, ...marcas.map(m => ({ value: m.id, label: m.nome }))]}
  value={filterMarca}
  onChange={(e) => setFilterMarca(e.target.value)}
/>
```

Update clear filters:

```tsx
setFilterMarca('')
```

Pass brands to details modal if the component now requires it:

```tsx
marcas={marcas}
```

- [ ] **Step 4: Run focused test to verify GREEN**

Run:

```bash
cd frontend
npm run test:run -- src/pages/estoque/__tests__/EstoqueView.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add frontend/src/pages/estoque/EstoqueView.tsx frontend/src/pages/estoque/__tests__/EstoqueView.test.tsx
git commit -m "feat(frontend): filtra estoque por marca"
```

## Task 5: Final Verification and Documentation

**Files:**
- Modify: `docs/HANDOFF_IA.md`
- Modify: `docs/LOGS.md`

- [ ] **Step 1: Run full frontend tests**

Run:

```bash
cd frontend
npm run test:run
```

Expected: PASS with all frontend tests.

- [ ] **Step 2: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run backend tests**

Run:

```bash
cd backend
.venv\Scripts\python.exe -m unittest discover tests -v
```

Expected: PASS. Backend code is not changed, but this confirms no repository-level regression.

- [ ] **Step 4: Update handoff**

In `docs/HANDOFF_IA.md`, update the header:

```md
> Última atualização: 2026-06-30 (Sessão 30)
```

Add item:

```md
36. **Marcas em produtos (Sessão 30)**
    - Nova tabela `marcas` e coluna nullable `produtos.marca_id`
    - Cadastros ganhou aba `Marcas` com criação simples
    - Cadastro e edição de produto permitem marca opcional
    - Catálogo e Estoque filtram por marca
    - Migração: `supabase/migrations/20260630_marcas_produtos.sql` — aplicar manualmente no Supabase SQL Editor antes de usar em produção
    - Testes frontend completos e build passando
```

Replace the current test count line with the exact numbers printed by Step 1 and Step 3, for example `- 160 testes frontend + 26 testes backend passando` if those are the command results.

- [ ] **Step 5: Update logs**

Add entry at the top of `docs/LOGS.md`:

```md
## 2026-06-30 — Sessão 30: Marcas em produtos

**Responsável:** Luis + Codex (subagent-driven development)

### O que foi feito
- Criada migration para tabela `marcas` e coluna opcional `produtos.marca_id`.
- Adicionada aba `Marcas` em Cadastros.
- Produto novo e edição de produto passaram a aceitar marca opcional.
- Catálogo e Estoque ganharam filtro por marca.
- `docs/BANCO.md` atualizado com a nova tabela e relação.

### Validação
- Frontend: `npm run test:run` — write the exact passed-test count printed by Step 1.
- Frontend: `npm run build` — build passando.
- Backend: `.venv\Scripts\python.exe -m unittest discover tests -v` — write the exact passed-test count printed by Step 3.

### Pendência operacional
- Aplicar `supabase/migrations/20260630_marcas_produtos.sql` no Supabase SQL Editor antes de usar a feature em produção.

---
```

- [ ] **Step 6: Commit docs**

Run:

```bash
git add docs/HANDOFF_IA.md docs/LOGS.md
git commit -m "docs: atualiza handoff de marcas"
```

- [ ] **Step 7: Final status**

Run:

```bash
git status --short
```

Expected: no tracked feature files left uncommitted. Permission warnings for pytest cache folders can be ignored if no files are listed.

## Operational Note

This feature needs a manual Supabase step before production use:

```txt
Apply supabase/migrations/20260630_marcas_produtos.sql in the Supabase SQL Editor.
```

Until the migration is applied in production, frontend queries that reference `marcas` or `produtos.marca_id` can fail against the production database.

## Self-Review

- Spec coverage: schema, optional brand, Cadastros tab, product create/edit, catalog filter, stock filter, tests, docs, and manual migration note are covered.
- Deferred-work scan: no deferred implementation markers or ambiguous task is left.
- Type consistency: `marca_id`, `marcas`, `Marca`, and `EstMarcas` names are consistent across tasks.
