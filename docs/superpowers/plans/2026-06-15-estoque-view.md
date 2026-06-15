# Estoque View + Reestruturação de Produtos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a página `EstoqueView` (`/estoque`) que mostra apenas produtos com estoque > 0 com filtros e ordenação, e mover `EstProdutos` para `/estoque/produtos` removendo controles de estoque que não fazem parte do catálogo.

**Architecture:** Nova página `EstoqueView.tsx` em `/estoque` (landing do módulo); `EstProdutos` move para `/estoque/produtos`. Lógica pura de situação e ordenação extraída em `lib/estoque.ts` (TDD). Nav reordenada: Estoque → Decants → Produtos. Filtros e ordenação client-side sobre dados do Supabase.

**Tech Stack:** React 19 + TypeScript + Tailwind CSS v4, Supabase client (`@/lib/supabase`), Vitest + Testing Library, componentes compartilhados `ProductDetailsModal`, `SaidaRapidaModal`, `Select`, `Button`, `Icon`.

---

## Mapa de arquivos

| Ação | Arquivo |
|------|---------|
| Criar | `frontend/src/lib/estoque.ts` |
| Criar | `frontend/src/lib/__tests__/estoque.test.ts` |
| Criar | `frontend/src/pages/estoque/EstoqueView.tsx` |
| Criar | `frontend/src/pages/estoque/__tests__/EstoqueView.test.tsx` |
| Modificar | `frontend/src/App.tsx` |
| Modificar | `frontend/src/components/layout/Layout.tsx` |
| Modificar | `frontend/src/components/shared/Icon.tsx` |
| Modificar | `frontend/src/pages/estoque/Produtos.tsx` |
| Modificar | `docs/HANDOFF_IA.md` |
| Modificar | `docs/LOGS.md` |

---

## Task 1: `lib/estoque.ts` — lógica pura (TDD)

**Files:**
- Create: `frontend/src/lib/estoque.ts`
- Create: `frontend/src/lib/__tests__/estoque.test.ts`

- [ ] **Step 1: Escrever os testes falhando**

Crie `frontend/src/lib/__tests__/estoque.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { situacaoEstoque, ordenarProdutos } from '../estoque'

describe('situacaoEstoque', () => {
  it('ok quando estoque_atual > estoque_minimo', () => {
    expect(situacaoEstoque(5, 3)).toBe('ok')
    expect(situacaoEstoque(4, 3)).toBe('ok')
  })

  it('baixo quando estoque_atual <= estoque_minimo mas acima do critico', () => {
    expect(situacaoEstoque(3, 3)).toBe('baixo') // ceil(3*0.5)=2, 3>2, 3<=3 → baixo
    expect(situacaoEstoque(3, 4)).toBe('baixo') // ceil(4*0.5)=2, 3>2, 3<=4 → baixo
  })

  it('critico quando estoque_atual <= ceil(estoque_minimo * 0.5)', () => {
    expect(situacaoEstoque(2, 3)).toBe('critico') // ceil(1.5)=2, 2<=2 → critico
    expect(situacaoEstoque(1, 3)).toBe('critico')
  })

  it('ok quando estoque_minimo = 0 (sem mínimo definido)', () => {
    expect(situacaoEstoque(1, 0)).toBe('ok') // ceil(0)=0, 1>0 → ok
  })
})

describe('ordenarProdutos', () => {
  const prods = [
    { nome: 'Zebra', estoque_atual: 3 },
    { nome: 'Alfa', estoque_atual: 10 },
    { nome: 'Meio', estoque_atual: 5 },
  ]

  it('qty_desc: maior para menor', () => {
    expect(ordenarProdutos(prods, 'qty_desc').map(p => p.estoque_atual)).toEqual([10, 5, 3])
  })

  it('qty_asc: menor para maior', () => {
    expect(ordenarProdutos(prods, 'qty_asc').map(p => p.estoque_atual)).toEqual([3, 5, 10])
  })

  it('az: ordem alfabética', () => {
    expect(ordenarProdutos(prods, 'az').map(p => p.nome)).toEqual(['Alfa', 'Meio', 'Zebra'])
  })

  it('za: ordem alfabética invertida', () => {
    expect(ordenarProdutos(prods, 'za').map(p => p.nome)).toEqual(['Zebra', 'Meio', 'Alfa'])
  })

  it('não muta o array original', () => {
    const original = prods.map(p => ({ ...p }))
    ordenarProdutos(prods, 'qty_asc')
    expect(prods).toEqual(original)
  })
})
```

- [ ] **Step 2: Rodar testes para confirmar falha**

```powershell
cd C:\Horus\frontend
npx vitest run src/lib/__tests__/estoque.test.ts
```

Esperado: FAIL — `Cannot find module '../estoque'`

- [ ] **Step 3: Implementar `lib/estoque.ts`**

Crie `frontend/src/lib/estoque.ts`:

```typescript
export type SituacaoEstoque = 'ok' | 'baixo' | 'critico'
export type OrdemEstoque = 'qty_desc' | 'qty_asc' | 'az' | 'za'

export function situacaoEstoque(estoqueAtual: number, estoqueMinimo: number): SituacaoEstoque {
  if (estoqueAtual <= Math.ceil(estoqueMinimo * 0.5)) return 'critico'
  if (estoqueAtual <= estoqueMinimo) return 'baixo'
  return 'ok'
}

export function ordenarProdutos<T extends { nome: string; estoque_atual: number }>(
  produtos: T[],
  ordem: OrdemEstoque
): T[] {
  return [...produtos].sort((a, b) => {
    if (ordem === 'qty_desc') return b.estoque_atual - a.estoque_atual
    if (ordem === 'qty_asc') return a.estoque_atual - b.estoque_atual
    if (ordem === 'az') return a.nome.localeCompare(b.nome)
    return b.nome.localeCompare(a.nome)
  })
}
```

- [ ] **Step 4: Rodar testes para confirmar verde**

```powershell
npx vitest run src/lib/__tests__/estoque.test.ts
```

Esperado: 9 testes PASS

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/lib/estoque.ts frontend/src/lib/__tests__/estoque.test.ts
git commit -m "feat(estoque): logica pura situacaoEstoque e ordenarProdutos (TDD)"
```

---

## Task 2: EstoqueView.tsx + rotas + nav + ícone `tag`

**Files:**
- Create: `frontend/src/pages/estoque/EstoqueView.tsx`
- Create: `frontend/src/pages/estoque/__tests__/EstoqueView.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/Layout.tsx`
- Modify: `frontend/src/components/shared/Icon.tsx`

### 2a — Ícone `tag` em `Icon.tsx`

- [ ] **Step 1: Abrir `frontend/src/components/shared/Icon.tsx` e adicionar o ícone `tag` após `droplet`**

Conteúdo atual do objeto `ICONS` termina com:
```tsx
  droplet: <path d="M12 3C8 8 5 12 5 16a7 7 0 0014 0c0-4-3-8-7-13z" />,
  check: <path d="M4 12l5 5L20 7" />,
  x: <><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>,
```

Adicione após a última linha acima:
```tsx
  tag: <><path d="M4 4h7l9 9-7 7-9-9V4z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
```

### 2b — `EstoqueView.tsx`

- [ ] **Step 2: Escrever o teste falhando**

Crie `frontend/src/pages/estoque/__tests__/EstoqueView.test.tsx`:

```typescript
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EstEstoque } from '../EstoqueView'

vi.mock('@/components/shared/ProductDetailsModal', () => ({
  ProductDetailsModal: () => <div data-testid="details-modal" />,
}))
vi.mock('@/components/shared/SaidaRapidaModal', () => ({
  SaidaRapidaModal: () => <div data-testid="saida-modal" />,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'produtos') {
        return {
          select: vi.fn(() => ({
            gt: vi.fn(() =>
              Promise.resolve({
                data: [
                  {
                    id: 'p1', nome: 'Asad', volume_ml: 100, categoria_id: 'c1',
                    fornecedor_id: 'f1', estoque_atual: 8, estoque_minimo: 3,
                    foto_url: null, created_at: '',
                    categorias: { nome: 'Masculino' }, fornecedores: { nome: 'Cairo' },
                  },
                  {
                    id: 'p2', nome: 'Lattafa', volume_ml: 50, categoria_id: 'c2',
                    fornecedor_id: 'f1', estoque_atual: 2, estoque_minimo: 5,
                    foto_url: null, created_at: '',
                    categorias: { nome: 'Unissex' }, fornecedores: { nome: 'Cairo' },
                  },
                ],
                error: null,
              })
            ),
          })),
        }
      }
      // categorias e fornecedores
      return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) }
    }),
  },
}))

describe('EstEstoque', () => {
  it('renderiza cards com nome e badge de quantidade', async () => {
    render(<EstEstoque />)
    await waitFor(() => expect(screen.getByText('Asad')).toBeInTheDocument())
    expect(screen.getByText('Lattafa')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('filtra cards por busca de nome', async () => {
    render(<EstEstoque />)
    await waitFor(() => expect(screen.getByText('Asad')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Buscar perfume...'), {
      target: { value: 'Lattafa' },
    })
    expect(screen.queryByText('Asad')).not.toBeInTheDocument()
    expect(screen.getByText('Lattafa')).toBeInTheDocument()
  })

  it('mostra estado vazio quando nenhum produto em estoque', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn(() => ({
        gt: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    } as never)
    render(<EstEstoque />)
    await waitFor(() =>
      expect(screen.getByText('Nenhum produto em estoque')).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 3: Rodar testes para confirmar falha**

```powershell
npx vitest run src/pages/estoque/__tests__/EstoqueView.test.tsx
```

Esperado: FAIL — `Cannot find module '../EstoqueView'`

- [ ] **Step 4: Implementar `EstoqueView.tsx`**

Crie `frontend/src/pages/estoque/EstoqueView.tsx`:

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/shared/Icon'
import { Button, Select } from '@/components/shared/FormControls'
import { ProductDetailsModal } from '@/components/shared/ProductDetailsModal'
import { SaidaRapidaModal } from '@/components/shared/SaidaRapidaModal'
import { situacaoEstoque, ordenarProdutos, type OrdemEstoque } from '@/lib/estoque'

interface Produto {
  id: string
  nome: string
  volume_ml: number | null
  categoria_id: string | null
  fornecedor_id: string | null
  estoque_atual: number
  estoque_minimo: number
  foto_url: string | null
  created_at: string
  categorias?: { nome: string } | null
  fornecedores?: { nome: string } | null
}

interface Categoria { id: string; nome: string }
interface Fornecedor { id: string; nome: string }

const BADGE_CLASSES: Record<string, string> = {
  ok: 'bg-gold text-[#1A1407]',
  baixo: 'bg-orange-400 text-white',
  critico: 'bg-down text-white',
}

export function EstEstoque() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategoria, setFilterCategoria] = useState('')
  const [filterFornecedor, setFilterFornecedor] = useState('')
  const [ordem, setOrdem] = useState<OrdemEstoque>('qty_desc')
  const [selectedProduto, setSelectedProduto] = useState<Produto | null>(null)
  const [saidaOpen, setSaidaOpen] = useState(false)
  const [saidaProdutoId, setSaidaProdutoId] = useState<string | undefined>(undefined)

  async function carregar() {
    setLoading(true)
    setErro(null)
    const [{ data: prods, error: e1 }, { data: cats }, { data: forns }] = await Promise.all([
      supabase.from('produtos').select('*, categorias(nome), fornecedores(nome)').gt('estoque_atual', 0),
      supabase.from('categorias').select('id, nome'),
      supabase.from('fornecedores').select('id, nome'),
    ])
    if (e1) { setErro(e1.message); setLoading(false); return }
    setProdutos((prods as Produto[]) ?? [])
    setCategorias(cats ?? [])
    setFornecedores(forns ?? [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const filtrados = ordenarProdutos(
    produtos.filter((p) => {
      if (search && !p.nome.toLowerCase().includes(search.toLowerCase())) return false
      if (filterCategoria && p.categoria_id !== filterCategoria) return false
      if (filterFornecedor && p.fornecedor_id !== filterFornecedor) return false
      return true
    }),
    ordem
  )

  const temFiltros = !!(search || filterCategoria || filterFornecedor)

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">
              Estoque / Visão
            </p>
            <h1 className="text-3xl font-medium tracking-tight mt-1">Estoque</h1>
            <p className="text-muted text-sm mt-1">
              {filtrados.length === produtos.length
                ? `${produtos.length} produto${produtos.length !== 1 ? 's' : ''} em estoque`
                : `${filtrados.length} de ${produtos.length} produtos`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {temFiltros && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setFilterCategoria('')
                  setFilterFornecedor('')
                }}
                className="text-xs text-muted hover:text-text transition-colors cursor-pointer"
              >
                Limpar filtros
              </button>
            )}
            <Button
              variant="secondary"
              onClick={() => { setSaidaProdutoId(undefined); setSaidaOpen(true) }}
            >
              <Icon name="down" size={16} />
              Registrar saída
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2.5">
          <div className="flex-1 max-w-md relative">
            <Icon
              name="search"
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            />
            <input
              type="text"
              placeholder="Buscar perfume..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-line bg-surface text-text text-sm placeholder:text-faint focus:outline-none focus:border-gold/60 transition-colors"
            />
          </div>
          <Select
            label=""
            options={[{ value: '', label: 'Categoria' }, ...categorias.map(c => ({ value: c.id, label: c.nome }))]}
            value={filterCategoria}
            onChange={(e) => setFilterCategoria(e.target.value)}
          />
          <Select
            label=""
            options={[{ value: '', label: 'Fornecedor' }, ...fornecedores.map(f => ({ value: f.id, label: f.nome }))]}
            value={filterFornecedor}
            onChange={(e) => setFilterFornecedor(e.target.value)}
          />
          <Select
            label=""
            options={[
              { value: 'qty_desc', label: 'Maior quantidade' },
              { value: 'qty_asc', label: 'Menor quantidade' },
              { value: 'az', label: 'A → Z' },
              { value: 'za', label: 'Z → A' },
            ]}
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as OrdemEstoque)}
          />
        </div>

        {erro && (
          <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">
            Erro ao carregar: {erro}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-muted">Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="py-12 text-center text-muted border border-dashed border-line rounded-xl">
            <Icon name="box" size={32} className="mx-auto mb-3 opacity-30" />
            {temFiltros ? (
              <p className="text-sm">Nenhum produto encontrado com esses filtros</p>
            ) : (
              <>
                <p className="text-sm">Nenhum produto em estoque</p>
                <p className="text-xs mt-1 opacity-60">
                  Registre uma entrada via Pedidos para começar
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            {filtrados.map((p) => {
              const sit = situacaoEstoque(p.estoque_atual, p.estoque_minimo)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProduto(p)}
                  className="holographic-card group text-left border border-line rounded-xl p-2 hover:border-gold-line transition-colors cursor-pointer"
                >
                  <div className="relative aspect-square rounded-lg bg-surface-2 overflow-hidden flex items-center justify-center mb-2">
                    {p.foto_url ? (
                      <img src={p.foto_url} alt={p.nome} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted">
                        <Icon name="box" size={20} />
                        <span className="text-[10px]">Foto</span>
                      </div>
                    )}
                    <span
                      className={cn(
                        'absolute top-1 right-1 text-[0.6rem] font-bold tabular-nums px-1.5 py-0.5 rounded-full leading-none',
                        BADGE_CLASSES[sit]
                      )}
                    >
                      {p.estoque_atual}
                    </span>
                  </div>
                  <div className="px-1">
                    <div className="text-sm font-medium truncate" title={p.nome}>
                      {p.nome}
                    </div>
                    <div className="text-xs text-muted font-mono mt-0.5">
                      {p.volume_ml ? `${p.volume_ml}mL` : '—'}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <ProductDetailsModal
        open={!!selectedProduto}
        produto={selectedProduto}
        categorias={categorias}
        fornecedores={fornecedores}
        onClose={() => setSelectedProduto(null)}
        onUpdated={carregar}
        onDeleted={carregar}
        onRegistrarSaida={(id) => {
          setSelectedProduto(null)
          setSaidaProdutoId(id)
          setSaidaOpen(true)
        }}
      />

      <SaidaRapidaModal
        open={saidaOpen}
        produtoId={saidaProdutoId}
        onClose={() => { setSaidaOpen(false); setSaidaProdutoId(undefined) }}
        onDone={carregar}
      />
    </>
  )
}
```

- [ ] **Step 5: Rodar testes para confirmar verde**

```powershell
npx vitest run src/pages/estoque/__tests__/EstoqueView.test.tsx
```

Esperado: 3 testes PASS

### 2c — Atualizar `App.tsx`

- [ ] **Step 6: Modificar `frontend/src/App.tsx`**

Adicione o import de `EstEstoque` e troque a rota `/estoque` de `EstProdutos` para `EstEstoque`, e adicione `/estoque/produtos` para `EstProdutos`.

Substitua:
```tsx
import { EstProdutos } from '@/pages/estoque/Produtos'
```
por:
```tsx
import { EstEstoque } from '@/pages/estoque/EstoqueView'
import { EstProdutos } from '@/pages/estoque/Produtos'
```

Substitua a linha de rota:
```tsx
        <Route path="/estoque" element={<EstProdutos />} />
```
pelas duas linhas:
```tsx
        <Route path="/estoque" element={<EstEstoque />} />
        <Route path="/estoque/produtos" element={<EstProdutos />} />
```

### 2d — Atualizar `Layout.tsx`

- [ ] **Step 7: Atualizar `EST_NAV` em `frontend/src/components/layout/Layout.tsx`**

Substitua o array `EST_NAV` inteiro:

```tsx
const EST_NAV = [
  { id: 'estoque', label: 'Estoque', icon: 'box', path: '/estoque' },
  { id: 'decants', label: 'Decants', icon: 'droplet', path: '/estoque/decants' },
  { id: 'produtos', label: 'Produtos', icon: 'tag', path: '/estoque/produtos' },
  { id: 'pedidos', label: 'Pedidos', icon: 'swap', path: '/estoque/pedidos' },
  { id: 'divergencias', label: 'Divergências', icon: 'warn', path: '/estoque/divergencias' },
  { id: 'categorias', label: 'Categorias', icon: 'grid', path: '/estoque/categorias' },
  { id: 'fornecedores', label: 'Fornecedores', icon: 'supplier', path: '/estoque/fornecedores' },
  { id: 'alertas', label: 'Alertas', icon: 'alert', path: '/estoque/alertas' },
  { id: 'relatorios', label: 'Relatório de giro', icon: 'report', path: '/estoque/relatorios' },
]
```

- [ ] **Step 8: Rodar todos os testes**

```powershell
npx vitest run
```

Esperado: todos os testes existentes + 3 novos = ~84 passando. Nenhuma regressão.

- [ ] **Step 9: Commit**

```powershell
git add `
  frontend/src/pages/estoque/EstoqueView.tsx `
  frontend/src/pages/estoque/__tests__/EstoqueView.test.tsx `
  frontend/src/App.tsx `
  frontend/src/components/layout/Layout.tsx `
  frontend/src/components/shared/Icon.tsx
git commit -m "feat(estoque): pagina EstoqueView com filtros, badges e ordenacao"
```

---

## Task 3: Limpar `Produtos.tsx`

**Files:**
- Modify: `frontend/src/pages/estoque/Produtos.tsx`

Produtos vira catálogo puro — sem controles de saída no topbar e sem filtro de situação de estoque. O `SaidaRapidaModal` permanece (ainda acessível via `ProductDetailsModal.onRegistrarSaida`).

- [ ] **Step 1: Remover o botão "Registrar saída" do topbar**

Em `frontend/src/pages/estoque/Produtos.tsx`, localize e remova este bloco completo do topbar (dentro da `<div className="flex items-center gap-2">`):

```tsx
          <Button variant="secondary" onClick={() => { setSaidaProdutoId(undefined); setSaidaOpen(true) }}>
            <Icon name="down" size={16} />
            Registrar saída
          </Button>
```

- [ ] **Step 2: Remover o estado `filterSituacao` e a lógica que o usa**

Remova a linha de estado:
```tsx
  const [filterSituacao, setFilterSituacao] = useState('')
```

No `produtosFiltrados`, remova o bloco completo que usa `filterSituacao`:
```tsx
    if (filterSituacao) {
      const e = p.estoque_atual
      if (filterSituacao === 'disponivel' && e <= p.estoque_minimo) return false
      if (filterSituacao === 'baixo' && (e === 0 || e > p.estoque_minimo)) return false
      if (filterSituacao === 'critico' && (e === 0 || e > Math.ceil(p.estoque_minimo * 0.5))) return false
      if (filterSituacao === 'sem_estoque' && e > 0) return false
    }
```

- [ ] **Step 3: Remover o Select de "Situação" da barra de filtros**

Na barra de filtros de Produtos, localize e remova o `<Select>` de situação:
```tsx
        <Select
          label=""
          options={[
            { value: '', label: 'Situação' },
            { value: 'disponivel', label: 'Disponível' },
            { value: 'baixo', label: 'Estoque baixo' },
            { value: 'critico', label: 'Crítico' },
            { value: 'sem_estoque', label: 'Sem estoque' },
          ]}
          value={filterSituacao}
          onChange={(e) => setFilterSituacao(e.target.value)}
        />
```

- [ ] **Step 4: Remover `filterSituacao` do botão "Limpar filtros"**

Localize a condição do botão "Limpar filtros" e remova `filterSituacao` dela:

Substitua:
```tsx
          {(search || filterCategoria || filterFornecedor || filterSituacao) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setFilterCategoria(''); setFilterFornecedor(''); setFilterSituacao('') }}
```
por:
```tsx
          {(search || filterCategoria || filterFornecedor) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setFilterCategoria(''); setFilterFornecedor('') }}
```

- [ ] **Step 5: Rodar todos os testes**

```powershell
npx vitest run
```

Esperado: mesma contagem de testes passando. Nenhuma regressão.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/pages/estoque/Produtos.tsx
git commit -m "refactor(produtos): remover saida rapida do topbar e filtro de situacao de estoque"
```

---

## Task 4: Atualizar docs

**Files:**
- Modify: `docs/HANDOFF_IA.md`
- Modify: `docs/LOGS.md`

- [ ] **Step 1: Atualizar `docs/HANDOFF_IA.md`**

  1. Atualizar "Última atualização" para `2026-06-15 (Sessão 8)`
  2. Adicionar item 17 na lista "O que já foi feito":

```markdown
17. **Página de Estoque e reestruturação de Produtos (Sessão 8)**
    - Nova página `EstoqueView.tsx` em `/estoque` (landing do módulo): cards de produtos com `estoque_atual > 0`, badge dourado/laranja/vermelho por situação, filtros nome/categoria/fornecedor, ordenação por quantidade ou nome
    - `EstProdutos` movido para `/estoque/produtos` — catálogo puro sem controles de saída ou filtro de situação
    - Nav reordenada: Estoque → Decants → Produtos → demais itens
    - `lib/estoque.ts`: `situacaoEstoque` e `ordenarProdutos` (TDD)
    - Ícone `tag` adicionado em `Icon.tsx` para Produtos na sidebar
```

  3. Atualizar contagem de testes no "Estado atual" (era ~72, agora ~84)

- [ ] **Step 2: Adicionar entrada em `docs/LOGS.md`** (no topo, antes de Sessão 7)

```markdown
## 2026-06-15 — Sessão 8: Página de Estoque + reestruturação de Produtos

**Responsável:** Luis + Claude (subagent-driven development)

### O que foi feito
- **Nova página `EstoqueView`** em `/estoque`: mostra apenas produtos com estoque > 0, filtros (nome, categoria, fornecedor), ordenação por quantidade (maior/menor) e nome (A→Z / Z→A), badge de situação (ok/baixo/crítico) no card
- **`EstProdutos` reestruturado** para `/estoque/produtos`: removidos botão "Registrar saída" do topbar e filtro "Situação" — passa a ser catálogo puro
- **Nav reordenada**: Estoque (primeiro) → Decants → Produtos → restante
- **`lib/estoque.ts` TDD**: `situacaoEstoque` + `ordenarProdutos`
- **Ícone `tag`** adicionado para Produtos na sidebar

### Decisões tomadas
- Estoque vira o landing `/estoque` (mais acessado diariamente); Produtos move para `/estoque/produtos`
- Filtros e ordenação client-side (volume de produtos é pequeno, sem paginação no projeto)
- Badge de situação: crítico = ≤ 50% do mínimo (arredondado), baixo = ≤ mínimo, ok = acima do mínimo
- `SaidaRapidaModal` permanece em `Produtos.tsx` acessível via `ProductDetailsModal` (não é operação primária do catálogo)

---
```

- [ ] **Step 3: Commit**

```powershell
git add docs/HANDOFF_IA.md docs/LOGS.md
git commit -m "docs: HANDOFF e LOGS sessao 8 (pagina Estoque + reestruturacao Produtos)"
```

---

## Verificação final

```powershell
cd C:\Horus\frontend
npx vitest run
```

Esperado: todos os testes passando (~81 total). Sem regressões.
