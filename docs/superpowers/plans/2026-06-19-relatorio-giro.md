# Relatório de giro de estoque Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar funcional o stub `/estoque/relatorios` ("Relatório de giro") com um painel de giro/cobertura/produtos-parados de frascos cheios + uma seção de decants, período em dias selecionável.

**Architecture:** Frontend-only, espelhando o Dashboard financeiro: a página busca `produtos` + `movimentacoes` (últimos N dias) + `frascos_abertos` + `decants` no Supabase e calcula tudo numa lib pura testável (`lib/giro.ts`). Giro usa estoque médio do período reconstruído ancorando no `estoque_atual` e descendo pelo ledger. Sem migração de banco.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Vitest + Testing Library, Supabase JS, decimal.js.

**Spec:** `docs/superpowers/specs/2026-06-19-relatorio-giro-design.md`

---

## File Structure

- **Create:** `frontend/src/lib/giro.ts` — lógica pura: cálculo de giro/cobertura/parado por produto e por decant, resumo e ordenação.
- **Create:** `frontend/src/lib/__tests__/giro.test.ts` — testes TDD da lib.
- **Modify (substitui o stub):** `frontend/src/pages/estoque/Relatorios.tsx` — página do relatório (controle de período, cards, tabela de frascos, seção de decants).
- **Create:** `frontend/src/pages/estoque/__tests__/Relatorios.test.tsx` — teste de componente da página.

Comandos (de `C:\Horus\frontend`):
- Teste da lib: `npm run test:run -- src/lib/__tests__/giro.test.ts`
- Teste da página: `npm run test:run -- src/pages/estoque/__tests__/Relatorios.test.tsx`
- Suite completa: `npm run test:run`
- Typecheck: `npx tsc -b`

Git roda de `C:\Horus`.

---

## Task 1: Lógica pura `lib/giro.ts` (TDD)

**Files:**
- Create: `frontend/src/lib/giro.ts`
- Test: `frontend/src/lib/__tests__/giro.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/__tests__/giro.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  calcularGiroProduto,
  calcularGiroDecant,
  resumoGiro,
  ordenarGiro,
  type LinhaGiro,
} from '../giro'

describe('calcularGiroProduto', () => {
  it('caso normal: reconstrói estoque inicial e calcula giro/cobertura', () => {
    // estoqueAtual=5, no período: saídas=10, entradas=0, dias=30
    // estoqueInicio = 5 - 0 + 10 = 15; estoqueMedio = (15+5)/2 = 10
    // giro = 10/10 = 1; cobertura = 5*30/10 = 15
    const r = calcularGiroProduto(5, [
      { tipo: 'saida', quantidade: 6 },
      { tipo: 'saida', quantidade: 4 },
    ], 30)
    expect(r.saidas).toBe(10)
    expect(r.entradas).toBe(0)
    expect(r.estoqueInicio).toBe(15)
    expect(r.estoqueMedio).toBe(10)
    expect(r.giro).toBeCloseTo(1)
    expect(r.coberturaDias).toBeCloseTo(15)
    expect(r.parado).toBe(false)
  })

  it('considera entradas na reconstrução do estoque inicial', () => {
    // estoqueAtual=8, saídas=4, entradas=6, dias=30
    // estoqueInicio = 8 - 6 + 4 = 6; estoqueMedio = (6+8)/2 = 7
    const r = calcularGiroProduto(8, [
      { tipo: 'entrada', quantidade: 6 },
      { tipo: 'saida', quantidade: 4 },
    ], 30)
    expect(r.estoqueInicio).toBe(6)
    expect(r.estoqueMedio).toBe(7)
    expect(r.giro).toBeCloseTo(4 / 7)
    expect(r.coberturaDias).toBeCloseTo(8 * 30 / 4)
  })

  it('produto parado: estoque > 0 e zero saída → parado, giro 0, cobertura null', () => {
    const r = calcularGiroProduto(5, [], 30)
    expect(r.saidas).toBe(0)
    expect(r.parado).toBe(true)
    expect(r.giro).toBe(0)        // estoqueMedio=5>0, saídas=0 → 0
    expect(r.coberturaDias).toBeNull()
  })

  it('estoque médio <= 0 → giro null', () => {
    // estoqueAtual=0, saídas=0, entradas=0 → estoqueInicio=0, estoqueMedio=0
    const r = calcularGiroProduto(0, [], 30)
    expect(r.estoqueMedio).toBe(0)
    expect(r.giro).toBeNull()
    expect(r.parado).toBe(false) // estoqueAtual não é > 0
  })
})

describe('calcularGiroDecant', () => {
  it('cobertura por ml e parado quando sem consumo', () => {
    expect(calcularGiroDecant(50, 0, 30)).toEqual({ coberturaDias: null, parado: true })
  })
  it('cobertura = mlRestante * dias / mlConsumido', () => {
    const r = calcularGiroDecant(60, 30, 30)
    expect(r.coberturaDias).toBeCloseTo(60)
    expect(r.parado).toBe(false)
  })
})

describe('resumoGiro', () => {
  const linhas: LinhaGiro[] = [
    { estoqueAtual: 5, custoMedio: 100, giro: 2, coberturaDias: 10, parado: false },
    { estoqueAtual: 3, custoMedio: 50, giro: 0, coberturaDias: null, parado: true },
    { estoqueAtual: 4, custoMedio: 20, giro: null, coberturaDias: null, parado: false },
  ]
  it('giroMedio e coberturaMedia ignoram nulls', () => {
    const r = resumoGiro(linhas)
    expect(r.giroMedio).toBeCloseTo((2 + 0) / 2) // 1
    expect(r.coberturaMedia).toBeCloseTo(10)     // só uma cobertura definida
  })
  it('qtdParados conta os parados e valorEncalhado soma estoque*custo dos parados', () => {
    const r = resumoGiro(linhas)
    expect(r.qtdParados).toBe(1)
    expect(r.valorEncalhado).toBeCloseTo(3 * 50) // 150
  })
  it('listas sem valores definidos retornam médias null', () => {
    const r = resumoGiro([{ estoqueAtual: 4, custoMedio: 20, giro: null, coberturaDias: null, parado: false }])
    expect(r.giroMedio).toBeNull()
    expect(r.coberturaMedia).toBeNull()
    expect(r.valorEncalhado).toBe(0)
  })
})

describe('ordenarGiro', () => {
  const linhas = [
    { nome: 'B', giro: 1, coberturaDias: 30, saidas: 2 },
    { nome: 'A', giro: 3, coberturaDias: 10, saidas: 5 },
    { nome: 'C', giro: null, coberturaDias: null, saidas: 0 },
  ]
  it('giro_desc: maior giro primeiro, null por último', () => {
    expect(ordenarGiro(linhas, 'giro_desc').map(l => l.nome)).toEqual(['A', 'B', 'C'])
  })
  it('cobertura_asc: menor cobertura primeiro, null por último', () => {
    expect(ordenarGiro(linhas, 'cobertura_asc').map(l => l.nome)).toEqual(['A', 'B', 'C'])
  })
  it('saidas_desc: mais saídas primeiro', () => {
    expect(ordenarGiro(linhas, 'saidas_desc').map(l => l.nome)).toEqual(['A', 'B', 'C'])
  })
  it('az: ordem alfabética', () => {
    expect(ordenarGiro(linhas, 'az').map(l => l.nome)).toEqual(['A', 'B', 'C'])
  })
  it('não muta o array original', () => {
    const orig = linhas.map(l => ({ ...l }))
    ordenarGiro(linhas, 'giro_desc')
    expect(linhas).toEqual(orig)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/__tests__/giro.test.ts`
Expected: FAIL — não resolve `../giro` (módulo inexistente).

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/giro.ts`:

```ts
import Decimal from 'decimal.js'

export type TipoMov = 'entrada' | 'saida'
export interface MovimentacaoGiro { tipo: TipoMov; quantidade: number }

export interface GiroProduto {
  saidas: number
  entradas: number
  estoqueInicio: number
  estoqueMedio: number
  giro: number | null
  coberturaDias: number | null
  parado: boolean
}

/**
 * Giro de um produto no período de `dias`. O período termina hoje, então o estoque
 * final = estoqueAtual. O estoque inicial é reconstruído ancorando no estoqueAtual
 * e desfazendo as movimentações do período: inicio = atual - entradas + saídas.
 */
export function calcularGiroProduto(
  estoqueAtual: number,
  movs: MovimentacaoGiro[],
  dias: number,
): GiroProduto {
  const saidas = movs.filter((m) => m.tipo === 'saida').reduce((s, m) => s + m.quantidade, 0)
  const entradas = movs.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + m.quantidade, 0)
  const estoqueInicio = estoqueAtual - entradas + saidas
  const estoqueMedio = (estoqueInicio + estoqueAtual) / 2
  const giro = estoqueMedio > 0 ? saidas / estoqueMedio : null
  const coberturaDias = saidas > 0 ? (estoqueAtual * dias) / saidas : null
  const parado = estoqueAtual > 0 && saidas === 0
  return { saidas, entradas, estoqueInicio, estoqueMedio, giro, coberturaDias, parado }
}

export interface GiroDecant { coberturaDias: number | null; parado: boolean }

export function calcularGiroDecant(
  mlRestante: number,
  mlConsumido: number,
  dias: number,
): GiroDecant {
  const coberturaDias = mlConsumido > 0 ? (mlRestante * dias) / mlConsumido : null
  const parado = mlRestante > 0 && mlConsumido === 0
  return { coberturaDias, parado }
}

export interface LinhaGiro {
  estoqueAtual: number
  custoMedio: number
  giro: number | null
  coberturaDias: number | null
  parado: boolean
}

export interface ResumoGiro {
  giroMedio: number | null
  qtdParados: number
  valorEncalhado: number
  coberturaMedia: number | null
}

function media(valores: number[]): number | null {
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null
}

export function resumoGiro(linhas: LinhaGiro[]): ResumoGiro {
  const giros = linhas.map((l) => l.giro).filter((g): g is number => g !== null)
  const cobs = linhas.map((l) => l.coberturaDias).filter((c): c is number => c !== null)
  const valorEncalhado = linhas
    .filter((l) => l.parado)
    .reduce((acc, l) => acc.plus(new Decimal(l.estoqueAtual).times(l.custoMedio)), new Decimal(0))
    .toNumber()
  return {
    giroMedio: media(giros),
    qtdParados: linhas.filter((l) => l.parado).length,
    valorEncalhado,
    coberturaMedia: media(cobs),
  }
}

export type OrdemGiro =
  | 'giro_desc' | 'giro_asc'
  | 'cobertura_asc' | 'cobertura_desc'
  | 'saidas_desc' | 'az'

interface OrdenavelGiro { nome: string; giro: number | null; coberturaDias: number | null; saidas: number }

// nulls sempre por último: em asc viram +Infinity, em desc viram -Infinity.
function cmpNum(a: number | null, b: number | null, dir: 'asc' | 'desc'): number {
  const fix = (v: number | null) => (v === null ? (dir === 'asc' ? Infinity : -Infinity) : v)
  const av = fix(a), bv = fix(b)
  return dir === 'asc' ? av - bv : bv - av
}

export function ordenarGiro<T extends OrdenavelGiro>(linhas: T[], ordem: OrdemGiro): T[] {
  return [...linhas].sort((a, b) => {
    switch (ordem) {
      case 'giro_desc': return cmpNum(a.giro, b.giro, 'desc')
      case 'giro_asc': return cmpNum(a.giro, b.giro, 'asc')
      case 'cobertura_asc': return cmpNum(a.coberturaDias, b.coberturaDias, 'asc')
      case 'cobertura_desc': return cmpNum(a.coberturaDias, b.coberturaDias, 'desc')
      case 'saidas_desc': return b.saidas - a.saidas
      case 'az': return a.nome.localeCompare(b.nome)
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/__tests__/giro.test.ts`
Expected: PASS (todos). Também rode `npx tsc -b` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/giro.ts frontend/src/lib/__tests__/giro.test.ts
git commit -m "feat(giro): logica pura de giro/cobertura/parados (lib)"
```

---

## Task 2: Página `Relatorios.tsx` + teste de componente

**Files:**
- Modify (substitui o stub): `frontend/src/pages/estoque/Relatorios.tsx`
- Test: `frontend/src/pages/estoque/__tests__/Relatorios.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/estoque/__tests__/Relatorios.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EstRelatorios } from '../Relatorios'

// Resultado "thenable" que também responde a .gte()/.eq() (encadeamento do supabase-js)
function makeResult(data: unknown) {
  const p = Promise.resolve({ data, error: null })
  return Object.assign(p, { gte: () => p, eq: () => p })
}

const mockProdutos = [
  { id: 'p1', nome: 'Karnak', estoque_atual: 5, custo_medio: 100 },
  { id: 'p2', nome: 'Imagination', estoque_atual: 3, custo_medio: 50 },
]
// Só p1 tem saída; p2 fica parado (estoque e zero saída)
const mockMovs = [
  { produto_id: 'p1', tipo: 'saida', quantidade: 10 },
]
const mockFrascos = [
  { id: 'f1', produto_id: 'p1', ml_restante: 40, status: 'ativo', produtos: { nome: 'Karnak' } },
]
const mockDecants = [
  { frasco_id: 'f1', ml: 10 },
]

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => makeResult(
        table === 'produtos' ? mockProdutos :
        table === 'movimentacoes' ? mockMovs :
        table === 'frascos_abertos' ? mockFrascos :
        table === 'decants' ? mockDecants : []
      )),
    })),
  },
}))

describe('EstRelatorios (relatório de giro)', () => {
  it('renderiza a tabela de giro com os produtos após carregar', async () => {
    render(<EstRelatorios />)
    await waitFor(() => expect(screen.getByText('Karnak')).toBeInTheDocument())
    expect(screen.getByText('Imagination')).toBeInTheDocument()
  })

  it('marca "Parado" para produto com estoque e zero saída', async () => {
    render(<EstRelatorios />)
    await waitFor(() => expect(screen.getByText('Imagination')).toBeInTheDocument())
    // pelo menos um badge "Parado" (p2)
    expect(screen.getAllByText(/parado/i).length).toBeGreaterThan(0)
  })

  it('preset de período padrão é 90 dias e clicar em 30 troca o ativo', async () => {
    render(<EstRelatorios />)
    const btn90 = screen.getByRole('button', { name: '90 dias' })
    const btn30 = screen.getByRole('button', { name: '30 dias' })
    expect(btn90).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(btn30)
    await waitFor(() => expect(btn30).toHaveAttribute('aria-pressed', 'true'))
    expect(btn90).toHaveAttribute('aria-pressed', 'false')
  })

  it('renderiza a seção de decants com o frasco aberto', async () => {
    render(<EstRelatorios />)
    await waitFor(() => expect(screen.getByText('Decants')).toBeInTheDocument())
    // nome do produto do frasco aparece na seção
    expect(screen.getAllByText('Karnak').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/pages/estoque/__tests__/Relatorios.test.tsx`
Expected: FAIL — o stub atual não tem tabela, presets nem seção de decants (os `getByText`/`getByRole` não encontram).

- [ ] **Step 3: Write the page**

Replace the entire contents of `frontend/src/pages/estoque/Relatorios.tsx` with:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { cn, formatBRL } from '@/lib/utils'
import {
  calcularGiroProduto,
  calcularGiroDecant,
  resumoGiro,
  ordenarGiro,
  type OrdemGiro,
} from '@/lib/giro'

const PRESETS = [30, 60, 90, 180]
const DIA_MS = 86_400_000

interface ProdutoRow { id: string; nome: string; estoque_atual: number | null; custo_medio: number | null }
interface MovRow { produto_id: string; tipo: 'entrada' | 'saida'; quantidade: number }
interface FrascoRow { id: string; produto_id: string; ml_restante: number | null; status: string; produtos: { nome: string } | null }
interface DecantRow { frasco_id: string; ml: number }

interface LinhaProduto {
  id: string; nome: string; estoqueAtual: number; custoMedio: number
  saidas: number; giro: number | null; coberturaDias: number | null; parado: boolean
}
interface LinhaDecant {
  id: string; nome: string; mlRestante: number; mlConsumido: number
  coberturaDias: number | null; parado: boolean
}

function fmtGiro(g: number | null) { return g === null ? '—' : `${g.toFixed(2)}×` }
function fmtCob(c: number | null) { return c === null ? '∞' : `${Math.round(c)} d` }

function StatCard({ label, icon, valor }: { label: string; icon: string; valor: string }) {
  return (
    <div className="gold-hairline bg-surface border border-line rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.62rem] text-muted uppercase tracking-[.14em]">{label}</span>
        <span className="w-8 h-8 rounded-lg border border-line bg-surface-2 flex items-center justify-center text-gold/70">
          <Icon name={icon} size={15} />
        </span>
      </div>
      <span className="text-3xl font-light tabular-nums tracking-tight">{valor}</span>
      <span className="h-px w-full bg-gradient-to-r from-gold-line via-line to-transparent" />
    </div>
  )
}

function ParadoBadge() {
  return (
    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-warn/15 text-warn">
      Parado
    </span>
  )
}

export function EstRelatorios() {
  const [dias, setDias] = useState(90)
  const [diasInput, setDiasInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ordem, setOrdem] = useState<OrdemGiro>('giro_desc')
  const [soParados, setSoParados] = useState(false)

  const [produtos, setProdutos] = useState<ProdutoRow[]>([])
  const [movimentacoes, setMovimentacoes] = useState<MovRow[]>([])
  const [frascos, setFrascos] = useState<FrascoRow[]>([])
  const [decants, setDecants] = useState<DecantRow[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const inicio = new Date(Date.now() - dias * DIA_MS).toISOString()
    const [prodRes, movRes, frascoRes, decantRes] = await Promise.all([
      supabase.from('produtos').select('id, nome, estoque_atual, custo_medio'),
      supabase.from('movimentacoes').select('produto_id, tipo, quantidade').gte('created_at', inicio),
      supabase.from('frascos_abertos').select('id, produto_id, ml_restante, status, produtos(nome)').eq('status', 'ativo'),
      supabase.from('decants').select('frasco_id, ml').gte('created_at', inicio),
    ])
    const err = prodRes.error || movRes.error || frascoRes.error || decantRes.error
    if (err) { setErro(err.message); console.error('Erro ao carregar relatório de giro:', err) }
    setProdutos((prodRes.data as ProdutoRow[]) || [])
    setMovimentacoes((movRes.data as MovRow[]) || [])
    setFrascos((frascoRes.data as unknown as FrascoRow[]) || [])
    setDecants((decantRes.data as DecantRow[]) || [])
    setLoading(false)
  }, [dias])

  useEffect(() => { fetchData() }, [fetchData])

  // --- agregação por produto/frasco ---
  const movsPorProduto = new Map<string, MovRow[]>()
  for (const m of movimentacoes) {
    const arr = movsPorProduto.get(m.produto_id) ?? []
    arr.push(m); movsPorProduto.set(m.produto_id, arr)
  }
  const linhasProduto: LinhaProduto[] = produtos.map((p) => {
    const g = calcularGiroProduto(p.estoque_atual ?? 0, movsPorProduto.get(p.id) ?? [], dias)
    return {
      id: p.id, nome: p.nome, estoqueAtual: p.estoque_atual ?? 0, custoMedio: p.custo_medio ?? 0,
      saidas: g.saidas, giro: g.giro, coberturaDias: g.coberturaDias, parado: g.parado,
    }
  })
  const resumo = resumoGiro(linhasProduto)
  const filtradas = soParados ? linhasProduto.filter((l) => l.parado) : linhasProduto
  const visiveis = ordenarGiro(filtradas, ordem)

  const consumoPorFrasco = new Map<string, number>()
  for (const d of decants) consumoPorFrasco.set(d.frasco_id, (consumoPorFrasco.get(d.frasco_id) ?? 0) + d.ml)
  const linhasDecant: LinhaDecant[] = frascos.map((f) => {
    const mlConsumido = consumoPorFrasco.get(f.id) ?? 0
    const g = calcularGiroDecant(f.ml_restante ?? 0, mlConsumido, dias)
    return {
      id: f.id, nome: f.produtos?.nome ?? '—', mlRestante: f.ml_restante ?? 0, mlConsumido,
      coberturaDias: g.coberturaDias, parado: g.parado,
    }
  })

  function aplicarDiasInput() {
    const n = parseInt(diasInput, 10)
    if (!Number.isNaN(n) && n > 0) setDias(n)
  }

  // alterna ordem ascendente/descendente de uma coluna
  function toggleOrdem(desc: OrdemGiro, asc: OrdemGiro) {
    setOrdem((o) => (o === desc ? asc : desc))
  }

  const card = (v: string) => (loading ? '—' : v)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold flex items-center gap-2">
          <span className="w-1 h-1 bg-gold rotate-45" />
          Estoque / Relatório de giro
        </p>
        <h1 className="text-4xl tracking-tight mt-1.5">Relatório de giro</h1>
        <p className="text-muted text-sm mt-1">Velocidade de giro, cobertura e estoque parado no período</p>
      </div>

      {erro && (
        <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">
          Erro ao carregar dados: {erro}
        </div>
      )}

      {/* Controle de período */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 p-0.5 border border-line-2 rounded-xl bg-surface-2">
          {PRESETS.map((d) => (
            <button
              key={d}
              onClick={() => { setDias(d); setDiasInput('') }}
              aria-pressed={dias === d}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                dias === d ? 'bg-gold text-[#1A1407]' : 'text-muted hover:text-text'
              )}
            >
              {d} dias
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={diasInput}
            onChange={(e) => setDiasInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') aplicarDiasInput() }}
            placeholder="N dias"
            aria-label="Período personalizado em dias"
            className="w-24 px-3 py-1.5 rounded-lg border border-line bg-surface-2 text-text text-sm focus:outline-none focus:border-gold/60"
          />
          <button
            onClick={aplicarDiasInput}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-line bg-surface-2 text-text hover:border-gold-line cursor-pointer"
          >
            Aplicar
          </button>
        </div>
        <span className="text-xs text-muted">Período atual: últimos {dias} dias</span>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <StatCard label="Giro médio" icon="swap" valor={card(fmtGiro(resumo.giroMedio))} />
        <StatCard label="Produtos parados" icon="alert" valor={card(String(resumo.qtdParados))} />
        <StatCard label="Valor encalhado" icon="box" valor={card(formatBRL(resumo.valorEncalhado))} />
        <StatCard label="Cobertura média" icon="dashboard" valor={card(fmtCob(resumo.coberturaMedia))} />
      </div>

      {/* Tabela principal — frascos cheios */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[0.62rem] uppercase tracking-[.14em] text-faint">Frascos cheios</p>
          <label className="flex items-center gap-2 text-xs text-text-2 cursor-pointer select-none">
            <input type="checkbox" checked={soParados} onChange={(e) => setSoParados(e.target.checked)} />
            Só parados
          </label>
        </div>
        <div className="border border-line rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface">
                <th className="text-left px-4 py-3 text-text-2 font-medium">Produto</th>
                <th className="text-right px-4 py-3 text-text-2 font-medium">Estoque</th>
                <th
                  className="text-right px-4 py-3 text-text-2 font-medium cursor-pointer hover:text-gold"
                  onClick={() => setOrdem('saidas_desc')}
                >Saídas</th>
                <th
                  className="text-right px-4 py-3 text-text-2 font-medium cursor-pointer hover:text-gold"
                  onClick={() => toggleOrdem('giro_desc', 'giro_asc')}
                >Giro</th>
                <th
                  className="text-right px-4 py-3 text-text-2 font-medium cursor-pointer hover:text-gold"
                  onClick={() => toggleOrdem('cobertura_desc', 'cobertura_asc')}
                >Cobertura</th>
                <th className="text-left px-4 py-3 text-text-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
              ) : visiveis.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Nenhum produto no período</td></tr>
              ) : (
                visiveis.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                    <td className="px-4 py-3 font-medium">{l.nome}</td>
                    <td className="px-4 py-3 text-right font-mono">{l.estoqueAtual}</td>
                    <td className="px-4 py-3 text-right font-mono">{l.saidas}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtGiro(l.giro)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtCob(l.coberturaDias)}</td>
                    <td className="px-4 py-3">{l.parado && <ParadoBadge />}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Seção de decants */}
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium tracking-tight">Decants</h2>
        <p className="text-muted text-xs">Consumo de ml dos frascos abertos no período</p>
        <div className="border border-line rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface">
                <th className="text-left px-4 py-3 text-text-2 font-medium">Produto</th>
                <th className="text-right px-4 py-3 text-text-2 font-medium">Ml restante</th>
                <th className="text-right px-4 py-3 text-text-2 font-medium">Ml consumidos</th>
                <th className="text-right px-4 py-3 text-text-2 font-medium">Cobertura</th>
                <th className="text-left px-4 py-3 text-text-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
              ) : linhasDecant.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Nenhum frasco aberto</td></tr>
              ) : (
                linhasDecant.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                    <td className="px-4 py-3 font-medium">{l.nome}</td>
                    <td className="px-4 py-3 text-right font-mono">{l.mlRestante}</td>
                    <td className="px-4 py-3 text-right font-mono">{l.mlConsumido}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtCob(l.coberturaDias)}</td>
                    <td className="px-4 py-3">{l.parado && <ParadoBadge />}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/pages/estoque/__tests__/Relatorios.test.tsx`
Expected: PASS (4 testes). Também rode `npx tsc -b` → exit 0.

> Se o typecheck reclamar do shape de `produtos(nome)` no select de `frascos_abertos`, o cast `as unknown as FrascoRow[]` já cobre — é o mesmo padrão usado em `Divergencias.tsx` para joins aninhados do supabase-js.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/estoque/Relatorios.tsx frontend/src/pages/estoque/__tests__/Relatorios.test.tsx
git commit -m "feat(giro): pagina do relatorio de giro (periodo, cards, frascos, decants)"
```

---

## Task 3: Verificação final

**Files:** nenhum (apenas verificação)

- [ ] **Step 1: Suite completa**

Run (de `C:\Horus\frontend`): `npm run test:run`
Expected: todos os testes passam (114 anteriores + os novos de `giro` e `Relatorios`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: exit 0, sem erros.

- [ ] **Step 3: Smoke manual (opcional, se houver login disponível)**

- `/estoque/relatorios` → cabeçalho "Relatório de giro", controle de período (90 dias ativo por padrão), 4 cards, tabela de frascos com colunas Produto/Estoque/Saídas/Giro/Cobertura + badge Parado, e a seção Decants abaixo.
- Clicar nos presets (30/60/90/180) e digitar "N dias" + Aplicar → recarrega os dados do novo período.
- Clicar nos cabeçalhos Giro/Cobertura/Saídas → reordena a tabela.
- Marcar "Só parados" → filtra a tabela.

- [ ] **Step 4: Atualizar docs do projeto**

Conforme `CLAUDE.md`: adicionar item de sessão em `docs/HANDOFF_IA.md` (e atualizar a linha "Última atualização") e uma entrada em `docs/LOGS.md` descrevendo o relatório de giro. Commit:

```bash
git add docs/HANDOFF_IA.md docs/LOGS.md
git commit -m "docs(giro): atualiza HANDOFF e LOGS (relatorio de giro)"
```

---

## Notas de execução

- **Sem migração de banco.** Todas as tabelas (`produtos`, `movimentacoes`, `frascos_abertos`, `decants`) e colunas já existem.
- **Limitação conhecida:** a query de `movimentacoes`/`decants` não pagina; se o histórico de N dias passar de 1.000 linhas, pode truncar (mesma limitação já registrada para o Dashboard financeiro). Aceitável no volume atual.
- O giro usa estoque médio do período reconstruído a partir do `estoque_atual` (fonte da verdade) descendo pelo ledger — preciso para o período recente, que é o que importa.
```
