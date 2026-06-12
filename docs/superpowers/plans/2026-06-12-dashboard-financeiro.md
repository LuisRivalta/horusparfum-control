# Dashboard Financeiro com Dados Reais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o dashboard financeiro placeholder por dados reais da tabela `transacoes`: saldo histórico, receita/despesa/lucro do período, e gráficos de evolução e categorias.

**Architecture:** Lógica pura e testável em `lib/financeiro.ts` (cálculos + construtores de período). `Dashboard.tsx` busca todas as transações uma vez (useState/useEffect + supabase, padrão do projeto) e calcula tudo em memória; um seletor de período controla cards e gráfico de categorias. Gráficos com recharts (já instalado). Somas com decimal.js (mesmo padrão de `lib/pedidos.ts`).

**Tech Stack:** React 19 + TypeScript + recharts 3 + decimal.js · Vitest + Testing Library

---

### Task 1: Construtores de período em `lib/financeiro.ts`

**Files:**
- Create: `frontend/src/lib/financeiro.ts`
- Create: `frontend/src/lib/__tests__/financeiro.test.ts`

- [ ] **Passo 1: Escrever os testes que falham**

Crie `frontend/src/lib/__tests__/financeiro.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  periodoMes,
  periodoTrimestre,
  periodoAno,
  periodoPersonalizado,
} from '../financeiro'

describe('periodoMes', () => {
  it('cria início e fim do mês (mes 0-11) com bordas de dia inteiras', () => {
    const p = periodoMes(2026, 5) // junho
    expect(p.inicio).toEqual(new Date(2026, 5, 1, 0, 0, 0, 0))
    expect(p.fim).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999))
    expect(p.label).toBe('Junho 2026')
  })
})

describe('periodoTrimestre', () => {
  it('cria início e fim do trimestre (1-4)', () => {
    const p = periodoTrimestre(2026, 2) // abr-jun
    expect(p.inicio).toEqual(new Date(2026, 3, 1, 0, 0, 0, 0))
    expect(p.fim).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999))
    expect(p.label).toBe('2º trimestre 2026')
  })
})

describe('periodoAno', () => {
  it('cria o ano inteiro', () => {
    const p = periodoAno(2026)
    expect(p.inicio).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0))
    expect(p.fim).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999))
    expect(p.label).toBe('2026')
  })
})

describe('periodoPersonalizado', () => {
  it('normaliza início para 00:00 e fim para 23:59:59.999', () => {
    const p = periodoPersonalizado(new Date(2026, 5, 1, 14, 30), new Date(2026, 5, 15, 9, 0))
    expect(p.inicio).toEqual(new Date(2026, 5, 1, 0, 0, 0, 0))
    expect(p.fim).toEqual(new Date(2026, 5, 15, 23, 59, 59, 999))
    expect(p.label).toBe('01/06/2026 – 15/06/2026')
  })
})
```

- [ ] **Passo 2: Rodar e confirmar que falham**

```
cd frontend && npx vitest run src/lib/__tests__/financeiro.test.ts
```

Esperado: FAIL (módulo/funções não existem).

- [ ] **Passo 3: Implementar os construtores**

Crie `frontend/src/lib/financeiro.ts`:

```typescript
import Decimal from 'decimal.js'

export interface Transacao {
  id: string
  descricao: string
  tipo: 'entrada' | 'saida'
  valor: number
  categoria: string | null
  created_at: string
}

export interface Periodo {
  inicio: Date
  fim: Date
  label: string
}

export interface ResumoPeriodo {
  receita: number
  despesa: number
  lucro: number
}

export interface FatiaCategoria {
  categoria: string
  total: number
}

export interface PontoEvolucao {
  mes: string
  receita: number
  despesa: number
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const MESES_CURTOS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

function dd(d: Date): string {
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${d.getFullYear()}`
}

export function periodoMes(ano: number, mes: number): Periodo {
  return {
    inicio: new Date(ano, mes, 1, 0, 0, 0, 0),
    fim: new Date(ano, mes + 1, 0, 23, 59, 59, 999),
    label: `${MESES[mes]} ${ano}`,
  }
}

export function periodoTrimestre(ano: number, trimestre: number): Periodo {
  const mesInicial = (trimestre - 1) * 3
  return {
    inicio: new Date(ano, mesInicial, 1, 0, 0, 0, 0),
    fim: new Date(ano, mesInicial + 3, 0, 23, 59, 59, 999),
    label: `${trimestre}º trimestre ${ano}`,
  }
}

export function periodoAno(ano: number): Periodo {
  return {
    inicio: new Date(ano, 0, 1, 0, 0, 0, 0),
    fim: new Date(ano, 11, 31, 23, 59, 59, 999),
    label: `${ano}`,
  }
}

export function periodoPersonalizado(inicio: Date, fim: Date): Periodo {
  const i = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), 0, 0, 0, 0)
  const f = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 23, 59, 59, 999)
  return { inicio: i, fim: f, label: `${dd(i)} – ${dd(f)}` }
}
```

Nota: `MESES_CURTOS`, `Decimal` e as interfaces de cálculo são usados na Task 2; declará-los aqui evita um segundo import depois.

- [ ] **Passo 4: Rodar e confirmar que passam**

```
cd frontend && npx vitest run src/lib/__tests__/financeiro.test.ts
```

Esperado: 4 testes PASS.

- [ ] **Passo 5: Commit**

```
git add frontend/src/lib/financeiro.ts frontend/src/lib/__tests__/financeiro.test.ts
git commit -m "feat: construtores de periodo (mes/trimestre/ano/personalizado)"
```

---

### Task 2: Funções de cálculo em `lib/financeiro.ts`

**Files:**
- Modify: `frontend/src/lib/financeiro.ts`
- Modify: `frontend/src/lib/__tests__/financeiro.test.ts`

- [ ] **Passo 1: Adicionar os testes que falham**

Acrescente ao final de `frontend/src/lib/__tests__/financeiro.test.ts` (e adicione os imports `calcularSaldoHistorico, resumoPeriodo, agruparPorCategoria, evolucaoMensal, type Transacao` ao import existente do topo):

```typescript
import {
  calcularSaldoHistorico,
  resumoPeriodo,
  agruparPorCategoria,
  evolucaoMensal,
  type Transacao,
} from '../financeiro'

function tx(over: Partial<Transacao>): Transacao {
  return {
    id: 'x', descricao: '', tipo: 'entrada', valor: 0,
    categoria: null, created_at: '2026-06-10T12:00:00',
    ...over,
  }
}

describe('calcularSaldoHistorico', () => {
  it('soma entradas menos saídas de tudo', () => {
    const t = [
      tx({ tipo: 'entrada', valor: 100 }),
      tx({ tipo: 'entrada', valor: 50 }),
      tx({ tipo: 'saida', valor: 30 }),
    ]
    expect(calcularSaldoHistorico(t)).toBe(120)
  })

  it('lista vazia retorna 0', () => {
    expect(calcularSaldoHistorico([])).toBe(0)
  })
})

describe('resumoPeriodo', () => {
  const periodo = periodoMes(2026, 5) // junho

  it('soma receita e despesa dentro do período e calcula lucro', () => {
    const t = [
      tx({ tipo: 'entrada', valor: 200, created_at: '2026-06-10T12:00:00' }),
      tx({ tipo: 'saida', valor: 80, created_at: '2026-06-20T12:00:00' }),
      tx({ tipo: 'entrada', valor: 999, created_at: '2026-05-31T12:00:00' }), // fora
    ]
    expect(resumoPeriodo(t, periodo)).toEqual({ receita: 200, despesa: 80, lucro: 120 })
  })

  it('inclui transações no primeiro e no último instante do período', () => {
    const t = [
      tx({ tipo: 'entrada', valor: 10, created_at: '2026-06-01T00:00:00' }),
      tx({ tipo: 'entrada', valor: 5, created_at: '2026-06-30T23:59:59' }),
    ]
    expect(resumoPeriodo(t, periodo).receita).toBe(15)
  })
})

describe('agruparPorCategoria', () => {
  const periodo = periodoMes(2026, 5)

  it('agrupa por categoria e ordena desc', () => {
    const t = [
      tx({ tipo: 'saida', valor: 30, categoria: 'Marketing' }),
      tx({ tipo: 'saida', valor: 100, categoria: 'Fornecedores' }),
      tx({ tipo: 'saida', valor: 20, categoria: 'Marketing' }),
    ]
    expect(agruparPorCategoria(t, periodo, 'saida')).toEqual([
      { categoria: 'Fornecedores', total: 100 },
      { categoria: 'Marketing', total: 50 },
    ])
  })

  it('categoria nula vira "Sem categoria"', () => {
    const t = [tx({ tipo: 'saida', valor: 10, categoria: null })]
    expect(agruparPorCategoria(t, periodo, 'saida')).toEqual([
      { categoria: 'Sem categoria', total: 10 },
    ])
  })
})

describe('evolucaoMensal', () => {
  it('retorna nMeses pontos terminando no mês de referência, zerando meses sem dados', () => {
    const t = [
      tx({ tipo: 'entrada', valor: 100, created_at: '2026-06-10T12:00:00' }),
      tx({ tipo: 'saida', valor: 40, created_at: '2026-06-12T12:00:00' }),
      tx({ tipo: 'entrada', valor: 70, created_at: '2026-04-05T12:00:00' }),
    ]
    const r = evolucaoMensal(t, new Date(2026, 5, 15), 6) // jan..jun
    expect(r).toHaveLength(6)
    expect(r[0]).toEqual({ mes: 'jan', receita: 0, despesa: 0 })
    expect(r[3]).toEqual({ mes: 'abr', receita: 70, despesa: 0 })
    expect(r[5]).toEqual({ mes: 'jun', receita: 100, despesa: 40 })
  })
})
```

- [ ] **Passo 2: Rodar e confirmar que falham**

```
cd frontend && npx vitest run src/lib/__tests__/financeiro.test.ts
```

Esperado: os novos testes FAIL (funções não existem).

- [ ] **Passo 3: Implementar as funções de cálculo**

Acrescente ao final de `frontend/src/lib/financeiro.ts`:

```typescript
function somar(valores: number[]): number {
  return valores
    .reduce((acc, v) => acc.add(v), new Decimal(0))
    .toDecimalPlaces(2)
    .toNumber()
}

function dentroDoPeriodo(t: Transacao, periodo: Periodo): boolean {
  const d = new Date(t.created_at)
  return d >= periodo.inicio && d <= periodo.fim
}

export function calcularSaldoHistorico(transacoes: Transacao[]): number {
  const entradas = somar(transacoes.filter(t => t.tipo === 'entrada').map(t => t.valor))
  const saidas = somar(transacoes.filter(t => t.tipo === 'saida').map(t => t.valor))
  return new Decimal(entradas).sub(saidas).toDecimalPlaces(2).toNumber()
}

export function resumoPeriodo(transacoes: Transacao[], periodo: Periodo): ResumoPeriodo {
  const noPeriodo = transacoes.filter(t => dentroDoPeriodo(t, periodo))
  const receita = somar(noPeriodo.filter(t => t.tipo === 'entrada').map(t => t.valor))
  const despesa = somar(noPeriodo.filter(t => t.tipo === 'saida').map(t => t.valor))
  const lucro = new Decimal(receita).sub(despesa).toDecimalPlaces(2).toNumber()
  return { receita, despesa, lucro }
}

export function agruparPorCategoria(
  transacoes: Transacao[],
  periodo: Periodo,
  tipo: 'entrada' | 'saida'
): FatiaCategoria[] {
  const filtradas = transacoes.filter(t => t.tipo === tipo && dentroDoPeriodo(t, periodo))
  const mapa = new Map<string, number[]>()
  for (const t of filtradas) {
    const cat = t.categoria?.trim() || 'Sem categoria'
    const arr = mapa.get(cat) ?? []
    arr.push(t.valor)
    mapa.set(cat, arr)
  }
  return Array.from(mapa.entries())
    .map(([categoria, valores]) => ({ categoria, total: somar(valores) }))
    .sort((a, b) => b.total - a.total)
}

export function evolucaoMensal(
  transacoes: Transacao[],
  referencia: Date,
  nMeses = 6
): PontoEvolucao[] {
  const pontos: PontoEvolucao[] = []
  for (let i = nMeses - 1; i >= 0; i--) {
    const d = new Date(referencia.getFullYear(), referencia.getMonth() - i, 1)
    const periodo = periodoMes(d.getFullYear(), d.getMonth())
    const r = resumoPeriodo(transacoes, periodo)
    pontos.push({ mes: MESES_CURTOS[d.getMonth()], receita: r.receita, despesa: r.despesa })
  }
  return pontos
}
```

- [ ] **Passo 4: Rodar e confirmar que passam**

```
cd frontend && npx vitest run src/lib/__tests__/financeiro.test.ts
```

Esperado: todos os testes do arquivo PASS.

- [ ] **Passo 5: Commit**

```
git add frontend/src/lib/financeiro.ts frontend/src/lib/__tests__/financeiro.test.ts
git commit -m "feat: calculos do dashboard (saldo, resumo, categoria, evolucao)"
```

---

### Task 3: `PeriodSelector.tsx`

**Files:**
- Create: `frontend/src/pages/financeiro/dashboard/PeriodSelector.tsx`

- [ ] **Passo 1: Implementar o componente**

Crie `frontend/src/pages/financeiro/dashboard/PeriodSelector.tsx`:

```tsx
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  periodoMes,
  periodoTrimestre,
  periodoAno,
  periodoPersonalizado,
  type Periodo,
} from '@/lib/financeiro'

type Granularidade = 'mes' | 'trimestre' | 'ano' | 'personalizado'

interface Props {
  value: Periodo
  onChange: (p: Periodo) => void
}

const MES_OPCOES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const GRANS: { id: Granularidade; label: string }[] = [
  { id: 'mes', label: 'Mês' },
  { id: 'trimestre', label: 'Trimestre' },
  { id: 'ano', label: 'Ano' },
  { id: 'personalizado', label: 'Personalizado' },
]

function isoDia(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

export function PeriodSelector({ value, onChange }: Props) {
  const hoje = value.inicio
  const [gran, setGran] = useState<Granularidade>('mes')
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth())
  const [trimestre, setTrimestre] = useState(Math.floor(hoje.getMonth() / 3) + 1)
  const [inicioCustom, setInicioCustom] = useState(isoDia(value.inicio))
  const [fimCustom, setFimCustom] = useState(isoDia(value.fim))

  const selectCls =
    'px-3 py-2 rounded-lg border border-line bg-surface-2 text-text text-sm cursor-pointer ' +
    'focus:outline-none focus:border-gold/60 focus:shadow-[0_0_0_3px_rgba(201,168,76,0.12)]'

  function aplicarMes(a: number, m: number) {
    setAno(a); setMes(m); onChange(periodoMes(a, m))
  }
  function aplicarTrimestre(a: number, t: number) {
    setAno(a); setTrimestre(t); onChange(periodoTrimestre(a, t))
  }
  function aplicarAno(a: number) {
    setAno(a); onChange(periodoAno(a))
  }
  function aplicarCustom(iniISO: string, fimISO: string) {
    if (!iniISO || !fimISO) return
    onChange(periodoPersonalizado(new Date(iniISO + 'T00:00:00'), new Date(fimISO + 'T00:00:00')))
  }

  function trocarGran(g: Granularidade) {
    setGran(g)
    if (g === 'mes') onChange(periodoMes(ano, mes))
    else if (g === 'trimestre') onChange(periodoTrimestre(ano, trimestre))
    else if (g === 'ano') onChange(periodoAno(ano))
    else aplicarCustom(inicioCustom, fimCustom)
  }

  const anos = [ano - 2, ano - 1, ano, ano + 1]

  return (
    <div className="flex flex-col gap-3 border border-line rounded-xl p-4 bg-surface">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex p-0.5 border border-line-2 rounded-2xl bg-surface-2 gap-0.5">
          {GRANS.map((g) => (
            <button
              key={g.id}
              onClick={() => trocarGran(g.id)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer',
                gran === g.id ? 'bg-gold text-[#1A1407]' : 'text-muted hover:text-text'
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs uppercase tracking-[.14em] text-gold">{value.label}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {gran === 'mes' && (
          <>
            <select className={selectCls} value={mes} onChange={(e) => aplicarMes(ano, Number(e.target.value))}>
              {MES_OPCOES.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className={selectCls} value={ano} onChange={(e) => aplicarMes(Number(e.target.value), mes)}>
              {anos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </>
        )}
        {gran === 'trimestre' && (
          <>
            <select className={selectCls} value={trimestre} onChange={(e) => aplicarTrimestre(ano, Number(e.target.value))}>
              {[1, 2, 3, 4].map((t) => <option key={t} value={t}>{t}º trimestre</option>)}
            </select>
            <select className={selectCls} value={ano} onChange={(e) => aplicarTrimestre(Number(e.target.value), trimestre)}>
              {anos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </>
        )}
        {gran === 'ano' && (
          <select className={selectCls} value={ano} onChange={(e) => aplicarAno(Number(e.target.value))}>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        {gran === 'personalizado' && (
          <>
            <input
              type="date" className={selectCls} value={inicioCustom}
              onChange={(e) => { setInicioCustom(e.target.value); aplicarCustom(e.target.value, fimCustom) }}
            />
            <span className="text-muted text-sm">até</span>
            <input
              type="date" className={selectCls} value={fimCustom}
              onChange={(e) => { setFimCustom(e.target.value); aplicarCustom(inicioCustom, e.target.value) }}
            />
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Passo 2: Verificar typecheck/build**

```
cd frontend && npx tsc -b
```

Esperado: sem erros.

- [ ] **Passo 3: Commit**

```
git add frontend/src/pages/financeiro/dashboard/PeriodSelector.tsx
git commit -m "feat: seletor de periodo do dashboard (mes/trimestre/ano/custom)"
```

---

### Task 4: Gráficos `EvolucaoChart.tsx` e `CategoriaChart.tsx`

**Files:**
- Create: `frontend/src/pages/financeiro/dashboard/EvolucaoChart.tsx`
- Create: `frontend/src/pages/financeiro/dashboard/CategoriaChart.tsx`

- [ ] **Passo 1: Implementar `EvolucaoChart.tsx`**

Crie `frontend/src/pages/financeiro/dashboard/EvolucaoChart.tsx`:

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { formatBRL } from '@/lib/utils'
import type { PontoEvolucao } from '@/lib/financeiro'

interface Props {
  data: PontoEvolucao[]
}

export function EvolucaoChart({ data }: Props) {
  return (
    <div className="border border-line rounded-xl p-5 bg-surface">
      <h3 className="font-mono text-[0.62rem] uppercase tracking-[.16em] text-muted mb-4">
        Evolução — últimos 6 meses
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="mes" stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} width={48} />
          <Tooltip
            formatter={(v: number) => formatBRL(v)}
            contentStyle={{
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-line)',
              borderRadius: 8,
              fontSize: 12,
            }}
            cursor={{ fill: 'var(--color-gold)', opacity: 0.06 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="receita" name="Receita" fill="var(--color-gold)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="despesa" name="Despesa" fill="var(--color-down)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Passo 2: Implementar `CategoriaChart.tsx`**

Crie `frontend/src/pages/financeiro/dashboard/CategoriaChart.tsx`:

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatBRL } from '@/lib/utils'
import type { FatiaCategoria } from '@/lib/financeiro'

interface Props {
  data: FatiaCategoria[]
  titulo: string
}

export function CategoriaChart({ data, titulo }: Props) {
  return (
    <div className="border border-line rounded-xl p-5 bg-surface">
      <h3 className="font-mono text-[0.62rem] uppercase tracking-[.16em] text-muted mb-4">{titulo}</h3>
      {data.length === 0 ? (
        <div className="h-[260px] flex items-center justify-center">
          <p className="font-serif italic text-muted">Sem dados no período</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <XAxis type="number" stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis
              type="category" dataKey="categoria" width={110}
              stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false}
            />
            <Tooltip
              formatter={(v: number) => formatBRL(v)}
              contentStyle={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-line)',
                borderRadius: 8,
                fontSize: 12,
              }}
              cursor={{ fill: 'var(--color-gold)', opacity: 0.06 }}
            />
            <Bar dataKey="total" name="Total" fill="var(--color-gold)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
```

- [ ] **Passo 3: Verificar typecheck/build**

```
cd frontend && npx tsc -b
```

Esperado: sem erros. (Se `--color-down` não existir em globals.css, use `var(--color-down)` mesmo assim — confirme que o token existe; o projeto usa `text-down` em FormControls, então o token CSS `--color-down` está definido.)

- [ ] **Passo 4: Commit**

```
git add frontend/src/pages/financeiro/dashboard/EvolucaoChart.tsx frontend/src/pages/financeiro/dashboard/CategoriaChart.tsx
git commit -m "feat: graficos de evolucao e categorias (recharts)"
```

---

### Task 5: Reescrever `Dashboard.tsx` + teste de componente

**Files:**
- Modify: `frontend/src/pages/financeiro/Dashboard.tsx`
- Create: `frontend/src/pages/financeiro/__tests__/Dashboard.test.tsx`

- [ ] **Passo 1: Escrever o teste que falha**

Crie `frontend/src/pages/financeiro/__tests__/Dashboard.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FinDashboard } from '../Dashboard'

// Mockar os gráficos: em jsdom o ResponsiveContainer não tem largura.
// O foco do teste são os cards e o seletor.
vi.mock('../dashboard/EvolucaoChart', () => ({
  EvolucaoChart: () => <div data-testid="evolucao-chart" />,
}))
vi.mock('../dashboard/CategoriaChart', () => ({
  CategoriaChart: () => <div data-testid="categoria-chart" />,
}))

const mockTransacoes = [
  { id: 't1', descricao: 'Venda', tipo: 'entrada', valor: 500, categoria: 'Vendas', created_at: '2026-06-10T12:00:00' },
  { id: 't2', descricao: 'Compra', tipo: 'saida', valor: 200, categoria: 'Fornecedores', created_at: '2026-06-12T12:00:00' },
  { id: 't3', descricao: 'Venda antiga', tipo: 'entrada', valor: 1000, categoria: 'Vendas', created_at: '2026-03-01T12:00:00' },
]

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: mockTransacoes, error: null })),
    })),
  },
}))

describe('FinDashboard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mostra saldo histórico (entradas - saídas de tudo)', async () => {
    render(<FinDashboard />)
    // 500 + 1000 - 200 = 1300
    await waitFor(() => expect(screen.getByText('R$ 1.300,00')).toBeInTheDocument())
  })

  it('mostra receita/despesa/lucro do mês corrente (junho)', async () => {
    render(<FinDashboard />)
    await waitFor(() => expect(screen.getByText('R$ 500,00')).toBeInTheDocument()) // receita
    expect(screen.getByText('R$ 200,00')).toBeInTheDocument() // despesa
    expect(screen.getByText('R$ 300,00')).toBeInTheDocument() // lucro
  })

  it('renderiza os dois gráficos', async () => {
    render(<FinDashboard />)
    await waitFor(() => expect(screen.getByTestId('evolucao-chart')).toBeInTheDocument())
    expect(screen.getByTestId('categoria-chart')).toBeInTheDocument()
  })

  it('trocar para o ano inteiro inclui a transação de março no lucro', async () => {
    render(<FinDashboard />)
    await waitFor(() => expect(screen.getByText('R$ 500,00')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^ano$/i }))
    // ano: receita 1500, despesa 200, lucro 1300
    await waitFor(() => expect(screen.getByText('R$ 1.500,00')).toBeInTheDocument())
  })
})
```

Nota: o teste assume que a data corrente do ambiente cai em 2026. O `Dashboard` usa `new Date()` para o mês inicial; como os mocks têm transações de junho/2026 e a data do projeto é 2026-06-12, o mês corrente bate. Se rodar em outra data, esses testes de "mês corrente" precisariam de mock de data — fora do escopo aqui.

- [ ] **Passo 2: Rodar e confirmar que falha**

```
cd frontend && npx vitest run src/pages/financeiro/__tests__/Dashboard.test.tsx
```

Esperado: FAIL (Dashboard ainda é placeholder, sem cards calculados).

- [ ] **Passo 3: Reescrever `Dashboard.tsx`**

Substitua todo o conteúdo de `frontend/src/pages/financeiro/Dashboard.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { cn, formatBRL } from '@/lib/utils'
import {
  calcularSaldoHistorico,
  resumoPeriodo,
  agruparPorCategoria,
  evolucaoMensal,
  periodoMes,
  type Transacao,
  type Periodo,
} from '@/lib/financeiro'
import { PeriodSelector } from './dashboard/PeriodSelector'
import { EvolucaoChart } from './dashboard/EvolucaoChart'
import { CategoriaChart } from './dashboard/CategoriaChart'

function trackMouse(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
  el.style.setProperty('--my', `${e.clientY - rect.top}px`)
}

function StatCard({ label, icon, valor }: { label: string; icon: string; valor: string }) {
  return (
    <div
      onMouseMove={trackMouse}
      className="glow-card gold-hairline bg-surface border border-line rounded-xl p-5 flex flex-col gap-3 hover:-translate-y-1"
    >
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

const hoje = new Date()

export function FinDashboard() {
  const [transacoes, setTransacoes] = useState<Transacao[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>(periodoMes(hoje.getFullYear(), hoje.getMonth()))
  const [catTipo, setCatTipo] = useState<'entrada' | 'saida'>('saida')

  useEffect(() => {
    supabase
      .from('transacoes')
      .select('*')
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        else setTransacoes((data as Transacao[]) || [])
        setLoading(false)
      })
  }, [])

  const saldo = calcularSaldoHistorico(transacoes)
  const resumo = resumoPeriodo(transacoes, periodo)
  const evolucao = evolucaoMensal(transacoes, hoje, 6)
  const categorias = agruparPorCategoria(transacoes, periodo, catTipo)

  const cardValor = (n: number) => (loading ? '—' : formatBRL(n))

  return (
    <div className="flex flex-col gap-6 stagger">
      <div>
        <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold flex items-center gap-2">
          <span className="w-1 h-1 bg-gold rotate-45" />
          Financeiro / Visão geral
        </p>
        <h1 className="text-4xl tracking-tight mt-1.5">Dashboard</h1>
      </div>

      {erro && (
        <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">
          Erro ao carregar transações: {erro}
        </div>
      )}

      <PeriodSelector value={periodo} onChange={setPeriodo} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <StatCard label="Saldo histórico" icon="dashboard" valor={cardValor(saldo)} />
        <StatCard label="Receita" icon="up" valor={cardValor(resumo.receita)} />
        <StatCard label="Despesas" icon="down" valor={cardValor(resumo.despesa)} />
        <StatCard label="Lucro" icon="goal" valor={cardValor(resumo.lucro)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <EvolucaoChart data={evolucao} />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1 self-end p-0.5 border border-line-2 rounded-xl bg-surface-2">
            <button
              onClick={() => setCatTipo('saida')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                catTipo === 'saida' ? 'bg-gold text-[#1A1407]' : 'text-muted hover:text-text'
              )}
            >
              Despesas
            </button>
            <button
              onClick={() => setCatTipo('entrada')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                catTipo === 'entrada' ? 'bg-gold text-[#1A1407]' : 'text-muted hover:text-text'
              )}
            >
              Receitas
            </button>
          </div>
          <CategoriaChart
            data={categorias}
            titulo={catTipo === 'saida' ? 'Despesas por categoria' : 'Receitas por categoria'}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Passo 4: Rodar o teste do Dashboard**

```
cd frontend && npx vitest run src/pages/financeiro/__tests__/Dashboard.test.tsx
```

Esperado: 4/4 PASS.

- [ ] **Passo 5: Rodar a suíte inteira e o build**

```
cd frontend && npx vitest run && npm run build
```

Esperado: todos os testes PASS; build sem erros.

- [ ] **Passo 6: Commit**

```
git add frontend/src/pages/financeiro/Dashboard.tsx frontend/src/pages/financeiro/__tests__/Dashboard.test.tsx
git commit -m "feat: dashboard financeiro com dados reais e seletor de periodo"
```
