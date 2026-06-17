# Decants não-faturáveis — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na página Decants, registrar decants que só consomem produto (perda/brinde/amostra/marketing/uso interno/outro) com custo + classificação, lançando despesa automática no Financeiro, mais uma ação "Esgotar frasco" e um resumo por tipo.

**Architecture:** Uma RPC atômica `registrar_consumo_decant` baixa o ml do frasco, grava o decant com `classificacao` + `custo` (perfume + embalagem, exceto perda) e lança uma despesa em `transacoes` (`origem='decant'`). O frontend reaproveita `custoDecantUnitario` (de `lib/vendas.ts`) para a prévia e `embalagens_decant` para o custo do insumo. Um resumo por classificação é computado por uma função pura nova em `lib/decants.ts`.

**Tech Stack:** PostgreSQL/Supabase (plpgsql), React + Vite + TypeScript, Tailwind, decimal.js, Vitest.

**Spec de referência:** `docs/superpowers/specs/2026-06-16-decants-nao-faturaveis-design.md`

**Pré-requisito:** a migração de Vendas (`20260616_vendas.sql`) precisa já estar aplicada — esta feature usa `embalagens_decant` e a coluna `transacoes.origem`.

---

## Estrutura de arquivos

**Criar:**
- `supabase/migrations/20260617_consumo_decant.sql` — colunas em `decants`, ajuste do check de `transacoes.origem`, RPC `registrar_consumo_decant` (aplicar manualmente).

**Modificar:**
- `frontend/src/lib/decants.ts` — função pura `resumoConsumo` + tipos.
- `frontend/src/lib/__tests__/decants.test.ts` — testes de `resumoConsumo`.
- `frontend/src/pages/estoque/Decants.tsx` — query com `custo_medio`, "Esgotar frasco", card de resumo.
- `frontend/src/pages/estoque/decants/DecantModal.tsx` — classificação + embalagem + prévia de custo + chamada à RPC.
- `frontend/src/pages/financeiro/Transacoes.tsx` — badge para `origem='decant'`.
- `docs/BANCO.md`, `docs/PRD.md`, `docs/HANDOFF_IA.md`, `docs/LOGS.md`.

**Ordem:** migração → lib pura → página Decants (esgotar + resumo) → DecantModal (que passa a exigir `custo_medio`, já fornecido pela página) → badge → docs. Cada task compila de forma independente.

---

## Task 1: Migração SQL

**Files:**
- Create: `supabase/migrations/20260617_consumo_decant.sql`

Sem teste automatizado (plpgsql) — aplicar manualmente no Supabase, com smoke test ao final.

- [ ] **Step 1: Criar o arquivo de migração**

Create `supabase/migrations/20260617_consumo_decant.sql`:

```sql
-- =============================================================
-- Consumo de decant não-faturável (perda/brinde/amostra/marketing)
-- Pré-requisito: 20260616_vendas.sql (embalagens_decant, transacoes.origem)
-- Aplicar no SQL Editor do Supabase
-- =============================================================

-- 1. Colunas em decants
alter table decants add column if not exists classificacao text
  check (classificacao in ('perda','amostra','brinde','marketing','uso_interno','outro'));
alter table decants add column if not exists custo numeric(12,2) not null default 0;
alter table decants add column if not exists custo_embalagem numeric(12,2) not null default 0;

-- 2. transacoes.origem passa a aceitar 'decant'
alter table transacoes drop constraint if exists transacoes_origem_check;
alter table transacoes add constraint transacoes_origem_check
  check (origem in ('manual','venda','decant'));

-- 3. RPC: consumo de decant não-faturável (atômico)
create or replace function registrar_consumo_decant(
  p_frasco_id uuid,
  p_ml int,
  p_classificacao text,
  p_custo_embalagem numeric,
  p_responsavel text
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_frasco frascos_abertos%rowtype;
  v_produto produtos%rowtype;
  v_custo_perfume numeric(12,2);
  v_custo_emb numeric(12,2);
  v_custo_total numeric(12,2);
  v_novo_ml int;
  v_decant_id uuid;
  v_label text;
begin
  if p_classificacao not in ('perda','amostra','brinde','marketing','uso_interno','outro') then
    raise exception 'Classificação inválida';
  end if;
  if p_ml is null or p_ml <= 0 then raise exception 'ml inválido'; end if;

  select * into v_frasco from frascos_abertos where id = p_frasco_id for update;
  if not found then raise exception 'Frasco não encontrado'; end if;
  if v_frasco.status <> 'ativo' then raise exception 'Frasco não está ativo'; end if;
  if v_frasco.ml_restante < p_ml then
    raise exception 'ml insuficiente no frasco: % disponíveis', v_frasco.ml_restante;
  end if;

  select * into v_produto from produtos where id = v_frasco.produto_id for update;

  v_custo_perfume := round(p_ml * coalesce(v_produto.custo_medio, 0) / nullif(v_frasco.ml_total, 0), 2);
  v_custo_emb := case when p_classificacao = 'perda' then 0 else coalesce(p_custo_embalagem, 0) end;
  v_custo_total := coalesce(v_custo_perfume, 0) + v_custo_emb;

  v_novo_ml := v_frasco.ml_restante - p_ml;
  update frascos_abertos set
    ml_restante = v_novo_ml,
    status = case when v_novo_ml <= 0 then 'esgotado' else 'ativo' end
  where id = v_frasco.id;

  insert into decants (frasco_id, produto_id, ml, classificacao, custo, custo_embalagem)
  values (v_frasco.id, v_frasco.produto_id, p_ml, p_classificacao, v_custo_total, v_custo_emb)
  returning id into v_decant_id;

  v_label := case p_classificacao
    when 'perda' then 'Perda' when 'amostra' then 'Amostra' when 'brinde' then 'Brinde'
    when 'marketing' then 'Marketing' when 'uso_interno' then 'Uso interno' else 'Outro' end;

  if v_custo_total > 0 then
    insert into transacoes (descricao, tipo, valor, categoria, responsavel, origem)
    values (v_label || ' — ' || p_ml || 'ml ' || v_produto.nome, 'saida', v_custo_total,
            v_label, p_responsavel, 'decant');
  end if;

  return jsonb_build_object('id', v_decant_id, 'custo', v_custo_total, 'esgotado', v_novo_ml <= 0);
end;
$$;
```

- [ ] **Step 2: Aplicar no Supabase SQL Editor** (project `wyobbztexoofhqdttxzq`). Esperado: "Success. No rows returned".

- [ ] **Step 3: Smoke test**

```sql
select
  exists(select 1 from information_schema.columns where table_name='decants' and column_name='classificacao') as tem_classificacao,
  exists(select 1 from information_schema.columns where table_name='decants' and column_name='custo') as tem_custo,
  exists(select 1 from pg_proc where proname='registrar_consumo_decant') as tem_rpc;
```
Esperado: `tem_classificacao=true, tem_custo=true, tem_rpc=true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260617_consumo_decant.sql
git commit -m "feat(decants): migracao consumo nao-faturavel (classificacao, custo, RPC)"
```

---

## Task 2: lib/decants.ts — resumoConsumo + testes

**Files:**
- Modify: `frontend/src/lib/decants.ts`
- Test: `frontend/src/lib/__tests__/decants.test.ts`

`lib/decants.ts` já tem `podeFrasco`, `calcularNovoML`, `statusAposDecant`. Você vai **adicionar** `resumoConsumo` e tipos, sem alterar o que existe. O teste já existe (`decants.test.ts`) — você **acrescenta** describes.

- [ ] **Step 1: Acrescentar os testes que falham**

Append ao final de `frontend/src/lib/__tests__/decants.test.ts`:

```ts
import { resumoConsumo, type ConsumoDecant } from '../decants'

describe('resumoConsumo', () => {
  const ini = new Date('2026-06-01T00:00:00')
  const fim = new Date('2026-06-30T23:59:59')

  it('agrupa por classificação e soma o custo no período', () => {
    const dados: ConsumoDecant[] = [
      { classificacao: 'perda', custo: 6.25, created_at: '2026-06-10T12:00:00Z' },
      { classificacao: 'brinde', custo: 8.25, created_at: '2026-06-12T12:00:00Z' },
      { classificacao: 'perda', custo: 3.75, created_at: '2026-06-15T12:00:00Z' },
    ]
    const r = resumoConsumo(dados, ini, fim)
    expect(r).toEqual([
      { classificacao: 'perda', label: 'Perda', total: 10 },
      { classificacao: 'brinde', label: 'Brinde', total: 8.25 },
    ])
  })

  it('ignora itens fora do período', () => {
    const dados: ConsumoDecant[] = [
      { classificacao: 'brinde', custo: 8.25, created_at: '2026-06-12T12:00:00Z' },
      { classificacao: 'brinde', custo: 100, created_at: '2026-05-30T12:00:00Z' },
    ]
    const r = resumoConsumo(dados, ini, fim)
    expect(r).toEqual([{ classificacao: 'brinde', label: 'Brinde', total: 8.25 }])
  })

  it('classifica null como "Sem classificação"', () => {
    const dados: ConsumoDecant[] = [
      { classificacao: null, custo: 5, created_at: '2026-06-10T12:00:00Z' },
    ]
    const r = resumoConsumo(dados, ini, fim)
    expect(r).toEqual([{ classificacao: 'sem', label: 'Sem classificação', total: 5 }])
  })

  it('retorna lista vazia quando não há dados', () => {
    expect(resumoConsumo([], ini, fim)).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd frontend && npx vitest run src/lib/__tests__/decants.test.ts`
Expected: FAIL — "resumoConsumo is not a function".

- [ ] **Step 3: Implementar**

Primeiro, adicionar o import **no topo** de `frontend/src/lib/decants.ts` (o arquivo hoje não tem imports — esta vira a primeira linha):

```ts
import Decimal from 'decimal.js'
```

Depois, append o restante ao **final** de `frontend/src/lib/decants.ts`:

```ts
export interface ConsumoDecant {
  classificacao: string | null
  custo: number
  created_at: string
}

export interface FatiaConsumo {
  classificacao: string
  label: string
  total: number
}

const LABELS: Record<string, string> = {
  perda: 'Perda', amostra: 'Amostra', brinde: 'Brinde',
  marketing: 'Marketing', uso_interno: 'Uso interno', outro: 'Outro',
  sem: 'Sem classificação',
}

export function resumoConsumo(decants: ConsumoDecant[], inicio: Date, fim: Date): FatiaConsumo[] {
  const mapa = new Map<string, Decimal>()
  for (const d of decants) {
    const t = new Date(d.created_at)
    if (t < inicio || t > fim) continue
    const key = d.classificacao ?? 'sem'
    mapa.set(key, (mapa.get(key) ?? new Decimal(0)).add(d.custo))
  }
  return Array.from(mapa.entries())
    .map(([classificacao, total]) => ({
      classificacao,
      label: LABELS[classificacao] ?? classificacao,
      total: total.toDecimalPlaces(2).toNumber(),
    }))
    .sort((a, b) => b.total - a.total)
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd frontend && npx vitest run src/lib/__tests__/decants.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/decants.ts frontend/src/lib/__tests__/decants.test.ts
git commit -m "feat(decants): resumoConsumo (agrupa custo por classificacao no periodo)"
```

---

## Task 3: Página Decants — query custo_medio, "Esgotar frasco" e resumo

**Files:**
- Modify: `frontend/src/pages/estoque/Decants.tsx`

Esta task: (a) inclui `custo_medio` na query/interface do frasco (para o DecantModal usar depois), (b) adiciona o botão "Esgotar frasco" nos frascos ativos, (c) adiciona o card de resumo por classificação. O `DecantModal` continua o antigo nesta task (compila normalmente — o campo extra `custo_medio` no frasco é ignorado por ele).

- [ ] **Step 1: Imports, useAuth e estado**

No topo de `frontend/src/pages/estoque/Decants.tsx`, adicionar imports:

```tsx
import { useAuth } from '@/contexts/AuthContext'
import { formatBRL } from '@/lib/utils'
import { resumoConsumo, type FatiaConsumo } from '@/lib/decants'
```

Na interface `FrascoComProduto`, adicionar `custo_medio` ao `produtos`:

```tsx
  produtos: { nome: string; foto_url: string | null; volume_ml: number; custo_medio: number | null }
```

Dentro do componente `EstDecants`, adicionar:

```tsx
  const { user } = useAuth()
  const [resumo, setResumo] = useState<FatiaConsumo[]>([])
  const [esgotando, setEsgotando] = useState<string | null>(null)
```

- [ ] **Step 2: Query inclui custo_medio + carrega resumo**

Substituir a função `carregar` por:

```tsx
  async function carregar() {
    setLoading(true)
    const [{ data, error }, { data: consumos }] = await Promise.all([
      supabase
        .from('frascos_abertos')
        .select('*, produtos(nome, foto_url, volume_ml, custo_medio)')
        .order('aberto_em', { ascending: false }),
      supabase.from('decants').select('classificacao, custo, created_at'),
    ])
    if (error) setErro(error.message)
    else setFrascos((data as FrascoComProduto[]) ?? [])
    const agora = new Date()
    const ini = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0)
    const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999)
    setResumo(resumoConsumo(consumos ?? [], ini, fim).filter((f) => f.total > 0))
    setLoading(false)
  }
```

- [ ] **Step 3: Handler de esgotar frasco**

Adicionar dentro do componente:

```tsx
  async function esgotarFrasco(frasco: FrascoComProduto) {
    setEsgotando(null)
    const { error } = await supabase.rpc('registrar_consumo_decant', {
      p_frasco_id: frasco.id,
      p_ml: frasco.ml_restante,
      p_classificacao: 'perda',
      p_custo_embalagem: 0,
      p_responsavel: user?.email ?? null,
    })
    if (error) { setErro(error.message); return }
    carregar()
  }
```

- [ ] **Step 4: Card de resumo (JSX)**

Logo após o bloco de erro (`{erro && (...)}`) e antes do estado vazio, adicionar:

```tsx
        {resumo.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-3 rounded-xl border border-line bg-surface text-sm">
            <span className="text-xs font-mono uppercase tracking-[.18em] text-muted">Consumo do mês</span>
            {resumo.map((f) => (
              <span key={f.classificacao} className="text-text-2">
                {f.label} <span className="font-mono text-text">{formatBRL(f.total)}</span>
              </span>
            ))}
          </div>
        )}
```

- [ ] **Step 5: Botão "Esgotar" no card do frasco ativo (JSX)**

No card do frasco, dentro do bloco do cabeçalho (`<div className="flex items-start justify-between gap-3">`), o lado direito hoje só mostra o botão de excluir para `esgotado`. Adicionar, para frascos **ativos**, um controle de esgotar com confirmação inline. Substituir a expressão `{esgotado && ( ... )}` do cabeçalho por este bloco que trata os dois casos:

```tsx
                  {esgotado ? (
                    confirmandoExclusao === frasco.id ? (
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[0.65rem] text-down/70 whitespace-nowrap">Excluir?</span>
                        <button onClick={() => { excluirFrasco(frasco.id); setConfirmandoExclusao(null) }} className="w-6 h-6 flex items-center justify-center rounded text-down hover:bg-down/15 transition-colors cursor-pointer" aria-label="Confirmar exclusão"><Icon name="check" size={12} /></button>
                        <button onClick={() => setConfirmandoExclusao(null)} className="w-6 h-6 flex items-center justify-center rounded text-muted hover:bg-surface-3 transition-colors cursor-pointer" aria-label="Cancelar exclusão"><Icon name="x" size={12} /></button>
                      </div>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); setConfirmandoExclusao(frasco.id) }} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-down/60 hover:text-down hover:bg-down/10 transition-colors cursor-pointer" aria-label="Excluir frasco"><Icon name="trash" size={14} /></button>
                    )
                  ) : (
                    esgotando === frasco.id ? (
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[0.65rem] text-muted whitespace-nowrap">Esgotar (perda {frasco.ml_restante}ml)?</span>
                        <button onClick={() => esgotarFrasco(frasco)} className="w-6 h-6 flex items-center justify-center rounded text-gold hover:bg-gold/15 transition-colors cursor-pointer" aria-label="Confirmar esgotar"><Icon name="check" size={12} /></button>
                        <button onClick={() => setEsgotando(null)} className="w-6 h-6 flex items-center justify-center rounded text-muted hover:bg-surface-3 transition-colors cursor-pointer" aria-label="Cancelar esgotar"><Icon name="x" size={12} /></button>
                      </div>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); setEsgotando(frasco.id) }} className="shrink-0 text-[0.65rem] font-medium text-muted hover:text-gold border border-line hover:border-gold-line rounded px-2 py-1 transition-colors cursor-pointer whitespace-nowrap" aria-label="Esgotar frasco">Esgotar</button>
                    )
                  )}
```

(O `esgotado` continua sendo `frasco.status === 'esgotado'`; mantenha a declaração existente acima do `return` do card.)

- [ ] **Step 6: Verificar typecheck/build**

Run: `cd frontend && npx tsc -b`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/estoque/Decants.tsx
git commit -m "feat(decants): esgotar frasco (perda) + resumo de consumo por classificacao"
```

---

## Task 4: DecantModal — classificação, embalagem, prévia de custo e RPC

**Files:**
- Modify: `frontend/src/pages/estoque/decants/DecantModal.tsx`

Reescreve o modal: além de ml, agora exige **classificação**, mostra **custo de embalagem** (auto pelo ml, oculto quando perda) e a **prévia do custo total**, e grava via `registrar_consumo_decant` (substitui o insert manual de 2 passos). A página Decants já passa `custo_medio` no frasco (Task 3).

- [ ] **Step 1: Reescrever o arquivo**

Replace todo o conteúdo de `frontend/src/pages/estoque/decants/DecantModal.tsx`:

```tsx
// frontend/src/pages/estoque/decants/DecantModal.tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, formatBRL } from '@/lib/utils'
import { Modal } from '@/components/shared/Modal'
import { Button, Select, Input } from '@/components/shared/FormControls'
import { FrascoViewer } from './FrascoViewer'
import { calcularNovoML } from '@/lib/decants'
import { custoDecantUnitario } from '@/lib/vendas'

interface FrascoComProduto {
  id: string
  produto_id: string
  ml_total: number
  ml_restante: number
  status: 'ativo' | 'esgotado'
  aberto_em: string
  produtos: { nome: string; foto_url: string | null; volume_ml: number; custo_medio: number | null }
}

interface Embalagem { tamanho_ml: number; custo: number }

interface Props {
  frasco: FrascoComProduto
  onClose: () => void
  onSaved: () => void
}

const ML_RAPIDO = [2, 5, 10] as const

const CLASSIFICACOES = [
  { value: 'amostra', label: 'Amostra' },
  { value: 'brinde', label: 'Brinde' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'uso_interno', label: 'Uso interno' },
  { value: 'perda', label: 'Perda' },
  { value: 'outro', label: 'Outro' },
]

export function DecantModal({ frasco, onClose, onSaved }: Props) {
  const { user } = useAuth()
  const [mlRapido, setMlRapido] = useState<number | null>(null)
  const [mlCustom, setMlCustom] = useState('')
  const [classificacao, setClassificacao] = useState('')
  const [custoEmb, setCustoEmb] = useState('0')
  const [embalagens, setEmbalagens] = useState<Embalagem[]>([])
  const [confirming, setConfirming] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('embalagens_decant').select('tamanho_ml, custo').eq('ativo', true)
      .then(({ data }) => setEmbalagens((data as Embalagem[]) ?? []))
  }, [])

  const mlValor = mlRapido ?? (mlCustom !== '' ? (parseInt(mlCustom, 10) || 0) : 0)
  const novoML = mlValor > 0 ? calcularNovoML(frasco.ml_restante, mlValor) : null
  const pctAtual = frasco.ml_restante / frasco.ml_total
  const novoPct = novoML !== null ? novoML / frasco.ml_total : pctAtual

  const isPerda = classificacao === 'perda'
  const custoPerfume = custoDecantUnitario(mlValor, frasco.produtos.custo_medio ?? 0, frasco.ml_total)
  const embValor = isPerda ? 0 : (Number(custoEmb) || 0)
  const custoTotal = custoPerfume + embValor

  function aplicarEmbalagemPorMl(ml: number) {
    const emb = embalagens.find((e) => e.tamanho_ml === ml)
    if (emb) setCustoEmb(String(emb.custo))
  }

  function handleMlRapido(ml: number) {
    setMlRapido(ml); setMlCustom(''); setErro(null)
    aplicarEmbalagemPorMl(ml)
  }

  function handleCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    setMlRapido(null); setMlCustom(e.target.value); setErro(null)
    aplicarEmbalagemPorMl(parseInt(e.target.value, 10) || 0)
  }

  async function handleConfirm() {
    if (!classificacao) { setErro('Selecione a classificação'); return }
    if (novoML === null || mlValor <= 0) {
      setErro(mlValor <= 0 ? 'Informe a quantidade de ml' : 'Quantidade maior que o disponível')
      return
    }
    setConfirming(true)
    setErro(null)
    const { error } = await supabase.rpc('registrar_consumo_decant', {
      p_frasco_id: frasco.id,
      p_ml: mlValor,
      p_classificacao: classificacao,
      p_custo_embalagem: embValor,
      p_responsavel: user?.email ?? null,
    })
    if (error) { setErro(error.message); setConfirming(false); return }
    await new Promise((r) => setTimeout(r, 700))
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={`Consumo — ${frasco.produtos.nome}`} size="lg">
      <div className="flex gap-8 items-start">
        <div className="flex flex-col items-center gap-3 shrink-0">
          <FrascoViewer percentual={confirming ? novoPct : pctAtual} size="lg" />
          <span className="tabular-nums text-sm text-muted">
            {frasco.ml_restante}<span className="text-xs">/{frasco.ml_total}ml</span>
          </span>
        </div>

        <div className="flex flex-col gap-5 flex-1">
          {erro && (
            <div className="px-3 py-2 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>
          )}

          <Select
            label="Classificação"
            options={CLASSIFICACOES}
            value={classificacao}
            onChange={(e) => setClassificacao(e.target.value)}
            required
          />

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-[.08em] text-muted">Quantidade rápida</span>
            <div className="flex gap-2">
              {ML_RAPIDO.map((ml) => (
                <button
                  key={ml}
                  onClick={() => handleMlRapido(ml)}
                  disabled={confirming}
                  className={cn(
                    'flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all cursor-pointer',
                    mlRapido === ml
                      ? 'bg-gold text-[#1A1407] border-gold shadow-[0_2px_12px_rgba(201,168,76,0.3)]'
                      : 'border-line bg-surface-2 text-text hover:border-gold-line hover:text-gold'
                  )}
                >
                  {ml}ml
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <Input
              label="Ou ml (custom)"
              type="number" min={1} max={frasco.ml_restante}
              value={mlCustom}
              onChange={handleCustomChange}
              placeholder="ex: 7"
            />
            {!isPerda && (
              <Input
                label="Embalagem (R$)"
                type="number" step="0.01" min="0"
                value={custoEmb}
                onChange={(e) => setCustoEmb(e.target.value)}
              />
            )}
          </div>

          {novoML !== null && mlValor > 0 && (
            <p className="text-sm text-muted">
              Restará <span className="font-semibold text-text tabular-nums">{novoML}ml</span>
              {novoML === 0 && <span className="ml-2 text-down text-xs">(frasco ficará esgotado)</span>}
            </p>
          )}

          <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
            <span className="text-muted">Custo do consumo</span>
            <span className="font-mono text-text">{formatBRL(custoTotal)}</span>
          </div>

          <Button onClick={handleConfirm} disabled={mlValor <= 0 || !classificacao || confirming} className="mt-auto">
            {confirming ? 'Registrando...' : 'Registrar consumo'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Verificar typecheck/build**

Run: `cd frontend && npx tsc -b`
Expected: sem erros. (`Select`/`Input` com `label`/`options`/`required` e `Modal size="lg"` são usados igual em `NovoPedidoModal.tsx`. Se houver erro real de prop, pare e reporte BLOCKED com o erro exato.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/estoque/decants/DecantModal.tsx
git commit -m "feat(decants): modal de consumo (classificacao, embalagem, custo, RPC)"
```

---

## Task 5: Badge de decant em Transações

**Files:**
- Modify: `frontend/src/pages/financeiro/Transacoes.tsx`

A coluna de descrição já mostra um badge "venda" para `origem='venda'`. Adicionar um badge "decant" para `origem='decant'`.

- [ ] **Step 1: Ajustar a célula da descrição**

Em `frontend/src/pages/financeiro/Transacoes.tsx`, localizar a célula da descrição (que hoje tem o badge de venda) e trocar o trecho do badge por uma versão que cobre os dois casos. Substituir:

```tsx
                    {t.origem === 'venda' && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[0.6rem] font-medium bg-gold-dim text-gold align-middle">
                        venda
                      </span>
                    )}
```

por:

```tsx
                    {t.origem === 'venda' && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[0.6rem] font-medium bg-gold-dim text-gold align-middle">
                        venda
                      </span>
                    )}
                    {t.origem === 'decant' && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[0.6rem] font-medium bg-surface-2 text-text-2 border border-line align-middle">
                        decant
                      </span>
                    )}
```

- [ ] **Step 2: Verificar typecheck/build**

Run: `cd frontend && npx tsc -b`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/financeiro/Transacoes.tsx
git commit -m "feat(financeiro): badge decant nas transacoes de consumo"
```

---

## Task 6: Documentação

**Files:**
- Modify: `docs/BANCO.md`, `docs/PRD.md`, `docs/HANDOFF_IA.md`, `docs/LOGS.md`

- [ ] **Step 1: BANCO**

Em `docs/BANCO.md`: na seção da tabela `decants`, adicionar as colunas `classificacao` (text: perda/amostra/brinde/marketing/uso_interno/outro, nullable), `custo` (numeric, custo total do consumo) e `custo_embalagem` (numeric). Na tabela `transacoes`, anotar que `origem` agora aceita também `'decant'`. Citar a migração `supabase/migrations/20260617_consumo_decant.sql` e a RPC `registrar_consumo_decant`.

- [ ] **Step 2: PRD**

Em `docs/PRD.md`, adicionar uma nota (na seção de Estoque ou regras): a página **Decants** registra consumo **não-faturável** (perda, brinde, amostra, marketing, uso interno) com custo gerencial e despesa no Financeiro; a venda de decant é feita na página **Vendas**.

- [ ] **Step 3: HANDOFF**

Em `docs/HANDOFF_IA.md`: bumpar a sessão no topo, adicionar um item em "O que já foi feito" (consumo de decant não-faturável: classificação + custo, RPC, esgotar frasco, resumo, badge), e em "Próximos passos imediatos" adicionar **Aplicar `supabase/migrations/20260617_consumo_decant.sql` no Supabase**.

- [ ] **Step 4: LOGS**

Em `docs/LOGS.md`, prepend uma entrada de sessão resumindo: consumo de decant não-faturável (classificação perda/brinde/amostra/marketing/uso interno/outro), custo = perfume + embalagem exceto perda, despesa automática no Financeiro (`origem='decant'`), "Esgotar frasco" como perda, card de resumo por tipo no mês, `resumoConsumo` com testes; pendência de aplicar a migração.

- [ ] **Step 5: Commit**

```bash
git add docs/BANCO.md docs/PRD.md docs/HANDOFF_IA.md docs/LOGS.md
git commit -m "docs(decants): documenta consumo nao-faturavel"
```

---

## Verificação final (após todas as tasks)

- [ ] **Suíte de testes + build**

Run: `cd frontend && npx vitest run && npx tsc -b && npm run build`
Expected: todos os testes passam; `tsc -b` sem erros; build conclui. (Lembrar: `tsc -b` é o typecheck real — `tsc --noEmit` no tsconfig raiz não checa os arquivos.)

- [ ] **Verificação manual no preview (após aplicar a migração)**

1. Em `/estoque/decants`, abrir um frasco, clicar nele → escolher classificação "Brinde", 5ml → conferir a prévia de custo (perfume + embalagem) → registrar.
2. Conferir que o ml do frasco baixou e que o card "Consumo do mês" mostra "Brinde R$ X".
3. Em `/financeiro/transacoes`, conferir a despesa com badge "decant" e categoria "Brinde".
4. Num frasco ativo, clicar "Esgotar" → confirmar → frasco vira esgotado, e aparece "Perda R$ Y" no resumo (sem embalagem).
5. Verificar que vender decant continua só pela página Vendas (a página Decants não fatura).
```
