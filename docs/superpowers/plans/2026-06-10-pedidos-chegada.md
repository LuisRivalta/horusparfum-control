# Pedidos de Compra com Conferência de Recebimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a tela "Movimentações" por um fluxo de pedidos de compra (criar pedido → aguardar → conferir recebimento item a item → entrada automática no estoque) com log de divergências por fornecedor e saída rápida avulsa.

**Architecture:** 3 tabelas novas no Supabase (`pedidos`, `pedido_itens`, `divergencias`) + 2 colunas em `produtos` (`custo_medio`, `ultimo_custo`). A confirmação do recebimento é atômica via função RPC Postgres. A tabela `movimentacoes` vira ledger interno (sem CRUD manual). Frontend segue o padrão existente: páginas chamam Supabase direto, lógica pura extraída em `lib/pedidos.ts` com testes unitários.

**Tech Stack:** React 19 + Vite + TypeScript, Tailwind 4, Supabase JS, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-10-pedidos-chegada-design.md`

---

## Contexto essencial do projeto (leia antes de começar)

- Comandos: `cd C:\Horus\frontend` → `npm run dev` | `npm run test:run` | `npm run build`
- Alias `@/` → `frontend/src/`
- Formatação monetária: SEMPRE `formatBRL()` de `@/lib/utils`
- Componentes compartilhados: `Modal`, `Button`, `Input`, `Select` (de `@/components/shared/Modal` e `@/components/shared/FormControls`), `Icon` (nomes válidos: dashboard, swap, up, down, report, goal, box, grid, supplier, alert, search, bell, plus, more, download, calendar, filter, chevron, edit, trash, warn)
- Padrão de página: ver `frontend/src/pages/financeiro/Transacoes.tsx` (header com eyebrow mono dourado + h1 + tabela em `border border-line rounded-xl`)
- Badges de status: `<span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-up/15 text-up">...`
- Testes existentes: `frontend/src/pages/auth/__tests__/Login.test.tsx` mostra o padrão de mocks (`vi.mock`)
- O usuário aplica SQL manualmente no SQL Editor do Supabase (project ref `wyobbztexoofhqdttxzq`)

---

### Task 1: Migração SQL (tabelas, RLS, RPCs)

**Files:**
- Create: `supabase/migrations/20260610_pedidos.sql`

- [ ] **Step 1: Criar o arquivo SQL completo**

```sql
-- =============================================================
-- Pedidos de compra + conferência de recebimento + divergências
-- Aplicar no SQL Editor do Supabase (project wyobbztexoofhqdttxzq)
-- =============================================================

-- 1. Tabelas -----------------------------------------------------

create table if not exists pedidos (
  id uuid primary key default uuid_generate_v4(),
  numero serial unique,
  fornecedor_id uuid not null references fornecedores(id),
  status text not null default 'aguardando'
    check (status in ('aguardando', 'recebido', 'cancelado')),
  previsao_chegada date,
  valor_total numeric(12,2) not null default 0,
  responsavel text,
  recebido_em timestamptz,
  recebido_por text,
  created_at timestamptz not null default now()
);

create table if not exists pedido_itens (
  id uuid primary key default uuid_generate_v4(),
  pedido_id uuid not null references pedidos(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  qtd_pedida int not null check (qtd_pedida >= 1),
  qtd_recebida int check (qtd_recebida >= 0),
  preco_unitario numeric(12,2) not null check (preco_unitario >= 0)
);

create table if not exists divergencias (
  id uuid primary key default uuid_generate_v4(),
  pedido_id uuid not null references pedidos(id),
  pedido_item_id uuid not null references pedido_itens(id),
  fornecedor_id uuid not null references fornecedores(id),
  tipo text not null
    check (tipo in ('faltou', 'veio_a_mais', 'avariado', 'produto_errado')),
  qtd_pedida int not null,
  qtd_recebida int not null,
  observacao text,
  created_at timestamptz not null default now()
);

alter table produtos add column if not exists custo_medio numeric(12,2);
alter table produtos add column if not exists ultimo_custo numeric(12,2);

-- 2. RLS ---------------------------------------------------------

alter table pedidos enable row level security;
alter table pedido_itens enable row level security;
alter table divergencias enable row level security;

create policy "Acesso total autenticados" on pedidos
  for all to authenticated using (true) with check (true);
create policy "Acesso total autenticados" on pedido_itens
  for all to authenticated using (true) with check (true);
create policy "Acesso total autenticados" on divergencias
  for all to authenticated using (true) with check (true);

-- 3. RPC: confirmação atômica do recebimento ---------------------
-- p_itens: [{"item_id": uuid, "qtd_recebida": int,
--            "divergencia_tipo": text|null, "divergencia_obs": text|null}]

create or replace function confirmar_recebimento(
  p_pedido_id uuid,
  p_itens jsonb,
  p_recebido_por text
) returns void
language plpgsql
as $$
declare
  v_pedido pedidos%rowtype;
  v_item pedido_itens%rowtype;
  v_produto produtos%rowtype;
  v_entrada jsonb;
  v_qtd int;
  v_div_tipo text;
  v_novo_estoque int;
  v_novo_custo numeric(12,2);
begin
  select * into v_pedido from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado';
  end if;
  if v_pedido.status <> 'aguardando' then
    raise exception 'Pedido já está com status %', v_pedido.status;
  end if;

  -- todo item do pedido precisa vir na conferência
  if (select count(*) from pedido_itens where pedido_id = p_pedido_id)
     <> jsonb_array_length(p_itens) then
    raise exception 'Conferência incompleta: todos os itens devem ser informados';
  end if;

  for v_entrada in select * from jsonb_array_elements(p_itens) loop
    select * into v_item from pedido_itens
      where id = (v_entrada->>'item_id')::uuid and pedido_id = p_pedido_id;
    if not found then
      raise exception 'Item % não pertence ao pedido', v_entrada->>'item_id';
    end if;

    v_qtd := (v_entrada->>'qtd_recebida')::int;
    v_div_tipo := v_entrada->>'divergencia_tipo';

    if v_qtd <> v_item.qtd_pedida and v_div_tipo is null then
      raise exception 'Item com quantidade divergente exige tipo de divergência';
    end if;

    update pedido_itens set qtd_recebida = v_qtd where id = v_item.id;

    -- divergência (se houver)
    if v_div_tipo is not null then
      insert into divergencias
        (pedido_id, pedido_item_id, fornecedor_id, tipo,
         qtd_pedida, qtd_recebida, observacao)
      values
        (p_pedido_id, v_item.id, v_pedido.fornecedor_id, v_div_tipo,
         v_item.qtd_pedida, v_qtd, v_entrada->>'divergencia_obs');
    end if;

    -- entrada no estoque (só se chegou algo)
    if v_qtd > 0 then
      select * into v_produto from produtos
        where id = v_item.produto_id for update;

      v_novo_estoque := v_produto.estoque_atual + v_qtd;

      if v_produto.custo_medio is null or v_produto.estoque_atual <= 0 then
        v_novo_custo := v_item.preco_unitario;
      else
        v_novo_custo := round(
          (v_produto.estoque_atual * v_produto.custo_medio
           + v_qtd * v_item.preco_unitario)
          / (v_produto.estoque_atual + v_qtd), 2);
      end if;

      update produtos set
        estoque_atual = v_novo_estoque,
        custo_medio = v_novo_custo,
        ultimo_custo = v_item.preco_unitario
      where id = v_produto.id;

      insert into movimentacoes
        (produto_id, tipo, quantidade, motivo, responsavel, saldo_resultante)
      values
        (v_item.produto_id, 'entrada', v_qtd,
         'Pedido #' || v_pedido.numero, p_recebido_por, v_novo_estoque);
    end if;
  end loop;

  update pedidos set
    status = 'recebido',
    recebido_em = now(),
    recebido_por = p_recebido_por
  where id = p_pedido_id;

  update fornecedores set ultima_compra = current_date
  where id = v_pedido.fornecedor_id;
end;
$$;

-- 4. RPC: saída rápida atômica ------------------------------------

create or replace function registrar_saida(
  p_produto_id uuid,
  p_qtd int,
  p_motivo text,
  p_responsavel text
) returns void
language plpgsql
as $$
declare
  v_produto produtos%rowtype;
  v_novo_estoque int;
begin
  if p_qtd < 1 then
    raise exception 'Quantidade deve ser maior que zero';
  end if;

  select * into v_produto from produtos where id = p_produto_id for update;
  if not found then
    raise exception 'Produto não encontrado';
  end if;
  if v_produto.estoque_atual < p_qtd then
    raise exception 'Estoque insuficiente: % unidades disponíveis', v_produto.estoque_atual;
  end if;

  v_novo_estoque := v_produto.estoque_atual - p_qtd;

  update produtos set estoque_atual = v_novo_estoque where id = p_produto_id;

  insert into movimentacoes
    (produto_id, tipo, quantidade, motivo, responsavel, saldo_resultante)
  values
    (p_produto_id, 'saida', p_qtd, p_motivo, p_responsavel, v_novo_estoque);
end;
$$;
```

- [ ] **Step 2: Commit do arquivo**

```bash
git add supabase/migrations/20260610_pedidos.sql
git commit -m "feat: migracao SQL de pedidos, divergencias e RPCs"
```

- [ ] **Step 3: CHECKPOINT — pedir ao usuário para aplicar o SQL**

Pausar e pedir: *"Aplique o conteúdo de `supabase/migrations/20260610_pedidos.sql` no SQL Editor do Supabase e me avise quando terminar."* Não prosseguir para as tasks de UI que dependem do banco (4+) sem essa confirmação. (A Task 2 é lógica pura e pode ser feita em paralelo.)

- [ ] **Step 4: Verificação manual da RPC (com o usuário ou via SQL Editor)**

No SQL Editor, rodar o caso feliz com um pedido de seed:

```sql
-- seed mínimo (usa um fornecedor e produto existentes; ajuste os selects se vazio)
with f as (select id from fornecedores limit 1),
     p as (select id from produtos limit 1),
     ped as (
       insert into pedidos (fornecedor_id, responsavel)
       select f.id, 'teste' from f returning id
     )
insert into pedido_itens (pedido_id, produto_id, qtd_pedida, preco_unitario)
select ped.id, p.id, 5, 100.00 from ped, p
returning pedido_id, id;

-- confirmar (substituir <PEDIDO_ID> e <ITEM_ID> pelos retornados acima)
select confirmar_recebimento(
  '<PEDIDO_ID>'::uuid,
  '[{"item_id": "<ITEM_ID>", "qtd_recebida": 3, "divergencia_tipo": "faltou", "divergencia_obs": "teste"}]'::jsonb,
  'teste'
);

-- conferir efeitos:
select status, recebido_por from pedidos where id = '<PEDIDO_ID>';        -- recebido
select estoque_atual, custo_medio, ultimo_custo from produtos
  where id = (select produto_id from pedido_itens where pedido_id = '<PEDIDO_ID>'); -- +3, custos
select tipo, qtd_pedida, qtd_recebida from divergencias where pedido_id = '<PEDIDO_ID>'; -- faltou 5x3
select tipo, quantidade, motivo from movimentacoes order by created_at desc limit 1;     -- entrada 3

-- dupla confirmação deve FALHAR:
select confirmar_recebimento('<PEDIDO_ID>'::uuid, '[]'::jsonb, 'teste');
-- Expected: ERROR: Pedido já está com status recebido
```

---

### Task 2: Lógica pura — `lib/pedidos.ts` (TDD)

**Files:**
- Create: `frontend/src/lib/pedidos.ts`
- Test: `frontend/src/lib/__tests__/pedidos.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// frontend/src/lib/__tests__/pedidos.test.ts
import { describe, it, expect } from 'vitest'
import {
  calcularCustoMedio,
  calcularTotalPedido,
  validarConferencia,
  DIVERGENCIA_TIPOS,
  type ConferenciaItem,
} from '../pedidos'

describe('calcularCustoMedio', () => {
  it('faz a média ponderada entre estoque atual e lote recebido', () => {
    // 1 un. a R$100 em estoque + 3 un. a R$130 chegando = R$122,50
    expect(calcularCustoMedio(1, 100, 3, 130)).toBe(122.5)
  })

  it('assume o preço do pedido quando o produto não tem custo ainda', () => {
    expect(calcularCustoMedio(5, null, 3, 130)).toBe(130)
  })

  it('assume o preço do pedido quando o estoque atual é zero', () => {
    expect(calcularCustoMedio(0, 100, 3, 130)).toBe(130)
  })

  it('arredonda para 2 casas decimais', () => {
    expect(calcularCustoMedio(3, 10, 3, 11)).toBe(10.5)
    expect(calcularCustoMedio(1, 100, 2, 101)).toBe(100.67)
  })
})

describe('calcularTotalPedido', () => {
  it('soma qtd × preço de cada item', () => {
    expect(calcularTotalPedido([
      { qtd: 5, preco: 100 },
      { qtd: 3, preco: 130 },
    ])).toBe(890)
  })

  it('retorna 0 para lista vazia', () => {
    expect(calcularTotalPedido([])).toBe(0)
  })
})

describe('validarConferencia', () => {
  const itemOk: ConferenciaItem = {
    itemId: 'a', qtdPedida: 5, qtdRecebida: 5, divergenciaTipo: null, divergenciaObs: '',
  }

  it('passa quando todas as quantidades batem', () => {
    expect(validarConferencia([itemOk])).toEqual([])
  })

  it('exige tipo de divergência quando a qtd recebida difere da pedida', () => {
    const erros = validarConferencia([
      { ...itemOk, qtdRecebida: 3, divergenciaTipo: null },
    ])
    expect(erros).toHaveLength(1)
    expect(erros[0]).toMatch(/divergência/i)
  })

  it('passa quando a qtd difere mas a divergência está classificada', () => {
    expect(validarConferencia([
      { ...itemOk, qtdRecebida: 3, divergenciaTipo: 'faltou' },
    ])).toEqual([])
  })

  it('rejeita qtd recebida negativa', () => {
    const erros = validarConferencia([
      { ...itemOk, qtdRecebida: -1, divergenciaTipo: 'faltou' },
    ])
    expect(erros).toHaveLength(1)
  })
})

describe('DIVERGENCIA_TIPOS', () => {
  it('contém os 4 tipos do spec', () => {
    expect(DIVERGENCIA_TIPOS.map(t => t.value)).toEqual(
      ['faltou', 'veio_a_mais', 'avariado', 'produto_errado']
    )
  })
})
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `cd C:\Horus\frontend; npx vitest run src/lib/__tests__/pedidos.test.ts`
Expected: FAIL — `Cannot find module '../pedidos'` (ou equivalente)

- [ ] **Step 3: Implementar `lib/pedidos.ts`**

```typescript
// frontend/src/lib/pedidos.ts
export type PedidoStatus = 'aguardando' | 'recebido' | 'cancelado'
export type DivergenciaTipo = 'faltou' | 'veio_a_mais' | 'avariado' | 'produto_errado'

export const DIVERGENCIA_TIPOS: { value: DivergenciaTipo; label: string }[] = [
  { value: 'faltou', label: 'Faltou' },
  { value: 'veio_a_mais', label: 'Veio a mais' },
  { value: 'avariado', label: 'Avariado' },
  { value: 'produto_errado', label: 'Produto errado' },
]

export interface ConferenciaItem {
  itemId: string
  qtdPedida: number
  qtdRecebida: number
  divergenciaTipo: DivergenciaTipo | null
  divergenciaObs: string
}

/** Custo médio ponderado. Espelha a regra da RPC confirmar_recebimento. */
export function calcularCustoMedio(
  estoqueAtual: number,
  custoMedio: number | null,
  qtdRecebida: number,
  precoUnitario: number
): number {
  if (custoMedio === null || estoqueAtual <= 0) return precoUnitario
  const total = estoqueAtual * custoMedio + qtdRecebida * precoUnitario
  return Math.round((total / (estoqueAtual + qtdRecebida)) * 100) / 100
}

export function calcularTotalPedido(itens: { qtd: number; preco: number }[]): number {
  return itens.reduce((acc, i) => acc + i.qtd * i.preco, 0)
}

/** Retorna lista de mensagens de erro; vazia = conferência válida. */
export function validarConferencia(itens: ConferenciaItem[]): string[] {
  const erros: string[] = []
  for (const item of itens) {
    if (item.qtdRecebida < 0) {
      erros.push('Quantidade recebida não pode ser negativa')
      continue
    }
    if (item.qtdRecebida !== item.qtdPedida && !item.divergenciaTipo) {
      erros.push('Item com quantidade divergente exige tipo de divergência')
    }
  }
  return erros
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `cd C:\Horus\frontend; npx vitest run src/lib/__tests__/pedidos.test.ts`
Expected: PASS (12 testes)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/pedidos.ts frontend/src/lib/__tests__/pedidos.test.ts
git commit -m "feat: logica pura de pedidos (custo medio, total, validacao de conferencia)"
```

---

### Task 3: Página Pedidos (lista) + rota + navegação

**Files:**
- Create: `frontend/src/pages/estoque/Pedidos.tsx`
- Modify: `frontend/src/App.tsx` (rota `/estoque/pedidos`)
- Modify: `frontend/src/components/layout/Layout.tsx` (item de nav)
- Test: `frontend/src/pages/estoque/__tests__/Pedidos.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// frontend/src/pages/estoque/__tests__/Pedidos.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { EstPedidos } from '../Pedidos'

// Mock encadeável do supabase: from().select().order() → resolve com dados
const mockPedidos = [
  {
    id: 'p1', numero: 1, status: 'aguardando', valor_total: 890,
    previsao_chegada: '2026-06-11', responsavel: 'Luis',
    created_at: '2026-06-10T12:00:00Z',
    fornecedores: { nome: 'Essências Cairo' },
    pedido_itens: [{ id: 'i1' }, { id: 'i2' }],
  },
  {
    id: 'p2', numero: 2, status: 'recebido', valor_total: 300,
    previsao_chegada: null, responsavel: 'Ana',
    created_at: '2026-06-09T12:00:00Z',
    fornecedores: { nome: 'Aromas SP' },
    pedido_itens: [{ id: 'i3' }],
  },
]

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: table === 'pedidos' ? mockPedidos : [],
          error: null,
        })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  },
}))

describe('EstPedidos (lista)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renderiza os pedidos com fornecedor, total e status', async () => {
    render(<MemoryRouter><EstPedidos /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByText('Essências Cairo')).toBeInTheDocument()
    })
    expect(screen.getByText('Aromas SP')).toBeInTheDocument()
    expect(screen.getByText('R$ 890,00')).toBeInTheDocument()
    expect(screen.getByText('Aguardando')).toBeInTheDocument()
    expect(screen.getByText('Recebido')).toBeInTheDocument()
  })

  it('tem o botão "Novo pedido"', async () => {
    render(<MemoryRouter><EstPedidos /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /novo pedido/i })).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `cd C:\Horus\frontend; npx vitest run src/pages/estoque/__tests__/Pedidos.test.tsx`
Expected: FAIL — `Cannot find module '../Pedidos'`

- [ ] **Step 3: Implementar a página de lista**

Nota: os modais de criar/conferir entram nas Tasks 4 e 5 — aqui ficam só os botões com estado.

```tsx
// frontend/src/pages/estoque/Pedidos.tsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Button } from '@/components/shared/FormControls'
import { formatBRL } from '@/lib/utils'
import type { PedidoStatus } from '@/lib/pedidos'

export interface PedidoRow {
  id: string
  numero: number
  status: PedidoStatus
  valor_total: number
  previsao_chegada: string | null
  responsavel: string | null
  created_at: string
  fornecedores: { nome: string } | null
  pedido_itens: { id: string }[]
}

const STATUS_BADGE: Record<PedidoStatus, { label: string; cls: string }> = {
  aguardando: { label: 'Aguardando', cls: 'bg-gold-dim text-gold' },
  recebido: { label: 'Recebido', cls: 'bg-up/15 text-up' },
  cancelado: { label: 'Cancelado', cls: 'bg-line text-muted' },
}

export function EstPedidos() {
  const [pedidos, setPedidos] = useState<PedidoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [novoOpen, setNovoOpen] = useState(false)
  const [conferindo, setConferindo] = useState<PedidoRow | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('pedidos')
      .select('*, fornecedores(nome), pedido_itens(id)')
      .order('created_at', { ascending: false })
    setPedidos(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  return (
    <div className="flex flex-col gap-5">
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

      <div className="border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="text-left px-4 py-3 text-text-2 font-medium">Nº</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Fornecedor</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Itens</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Total</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Previsão</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Responsável</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
            ) : pedidos.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Nenhum pedido registrado</td></tr>
            ) : (
              pedidos.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-mono text-muted">#{p.numero}</td>
                  <td className="px-4 py-3 font-medium">{p.fornecedores?.nome || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">{p.pedido_itens.length}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatBRL(p.valor_total)}</td>
                  <td className="px-4 py-3 text-text-2 text-xs">{formatDate(p.previsao_chegada)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[p.status].cls}`}>
                      {STATUS_BADGE[p.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-2">{p.responsavel || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {p.status === 'aguardando' && (
                      <Button size="sm" onClick={() => setConferindo(p)}>
                        Confirmar chegada
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modais entram nas Tasks 4 e 5: */}
      {/* <NovoPedidoModal open={novoOpen} onClose={...} onCreated={fetchData} /> */}
      {/* <ConferenciaModal pedido={conferindo} onClose={...} onConfirmed={fetchData} /> */}
      {novoOpen && null}
      {conferindo && null}
    </div>
  )
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `cd C:\Horus\frontend; npx vitest run src/pages/estoque/__tests__/Pedidos.test.tsx`
Expected: PASS (2 testes)

- [ ] **Step 5: Adicionar rota e item de navegação**

Em `frontend/src/App.tsx`, adicionar import e rota (manter a rota de movimentações por enquanto — sai na Task 8):

```tsx
import { EstPedidos } from '@/pages/estoque/Pedidos'
// ... dentro das rotas de estoque:
<Route path="/estoque/pedidos" element={<EstPedidos />} />
```

Em `frontend/src/components/layout/Layout.tsx`, no array `EST_NAV`, substituir a linha de movimentações:

```tsx
// REMOVE: { id: 'movimentacoes', label: 'Movimentações', icon: 'swap', path: '/estoque/movimentacoes' },
{ id: 'pedidos', label: 'Pedidos', icon: 'swap', path: '/estoque/pedidos' },
```

- [ ] **Step 6: Verificar que tudo compila e testes globais passam**

Run: `cd C:\Horus\frontend; npm run test:run; npm run build`
Expected: todos os testes PASS, build OK

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/estoque/Pedidos.tsx frontend/src/pages/estoque/__tests__/Pedidos.test.tsx frontend/src/App.tsx frontend/src/components/layout/Layout.tsx
git commit -m "feat: pagina de pedidos (lista) com rota e navegacao"
```

---

### Task 4: Modal "Novo pedido" (itens dinâmicos + cadastro rápido de produto)

**Files:**
- Create: `frontend/src/pages/estoque/pedidos/NovoPedidoModal.tsx`
- Modify: `frontend/src/pages/estoque/Pedidos.tsx` (plugar o modal)
- Test: `frontend/src/pages/estoque/__tests__/NovoPedidoModal.test.tsx`

- [ ] **Step 1: Escrever os testes que falham**

```tsx
// frontend/src/pages/estoque/__tests__/NovoPedidoModal.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NovoPedidoModal } from '../pedidos/NovoPedidoModal'

const mockInsert = vi.fn(() => ({
  select: vi.fn(() => ({
    single: vi.fn(() => Promise.resolve({ data: { id: 'novo-id' }, error: null })),
  })),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: table === 'fornecedores'
            ? [{ id: 'f1', nome: 'Essências Cairo' }]
            : table === 'produtos'
              ? [{ id: 'pr1', nome: 'Perfume X' }, { id: 'pr2', nome: 'Perfume Y' }]
              : [],
          error: null,
        })),
      })),
      insert: mockInsert,
    })),
  },
}))

// jsdom não implementa <dialog>
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
})

describe('NovoPedidoModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calcula o total ao vivo conforme itens são preenchidos', async () => {
    const user = userEvent.setup()
    render(<NovoPedidoModal open onClose={vi.fn()} onCreated={vi.fn()} />)

    await waitFor(() => expect(screen.getByText(/total do pedido/i)).toBeInTheDocument())

    await user.selectOptions(screen.getByLabelText(/produto 1/i), 'pr1')
    await user.clear(screen.getByLabelText(/qtd 1/i))
    await user.type(screen.getByLabelText(/qtd 1/i), '5')
    await user.clear(screen.getByLabelText(/preço 1/i))
    await user.type(screen.getByLabelText(/preço 1/i), '100')

    expect(screen.getByText('R$ 500,00')).toBeInTheDocument()
  })

  it('bloqueia produto repetido em duas linhas', async () => {
    const user = userEvent.setup()
    render(<NovoPedidoModal open onClose={vi.fn()} onCreated={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText(/produto 1/i)).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/produto 1/i), 'pr1')
    await user.click(screen.getByRole('button', { name: /adicionar item/i }))
    await user.selectOptions(screen.getByLabelText(/produto 2/i), 'pr1')

    expect(screen.getByText(/produto repetido/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `cd C:\Horus\frontend; npx vitest run src/pages/estoque/__tests__/NovoPedidoModal.test.tsx`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar o modal**

```tsx
// frontend/src/pages/estoque/pedidos/NovoPedidoModal.tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { Icon } from '@/components/shared/Icon'
import { formatBRL } from '@/lib/utils'
import { calcularTotalPedido } from '@/lib/pedidos'

interface Opcao { id: string; nome: string }

interface ItemForm {
  produto_id: string
  qtd: string
  preco: string
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

const ITEM_VAZIO: ItemForm = { produto_id: '', qtd: '1', preco: '' }

export function NovoPedidoModal({ open, onClose, onCreated }: Props) {
  const { user } = useAuth()
  const [fornecedores, setFornecedores] = useState<Opcao[]>([])
  const [produtos, setProdutos] = useState<Opcao[]>([])
  const [fornecedorId, setFornecedorId] = useState('')
  const [previsao, setPrevisao] = useState('')
  const [itens, setItens] = useState<ItemForm[]>([{ ...ITEM_VAZIO }])
  const [submitting, setSubmitting] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // cadastro rápido de produto
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickNome, setQuickNome] = useState('')
  const [quickVolume, setQuickVolume] = useState('')

  useEffect(() => {
    if (!open) return
    Promise.all([
      supabase.from('fornecedores').select('id, nome').order('nome'),
      supabase.from('produtos').select('id, nome').order('nome'),
    ]).then(([f, p]) => {
      setFornecedores(f.data || [])
      setProdutos(p.data || [])
    })
  }, [open])

  const duplicado = itens.some(
    (item, i) => item.produto_id && itens.findIndex(o => o.produto_id === item.produto_id) !== i
  )

  const total = calcularTotalPedido(
    itens.map(i => ({ qtd: Number(i.qtd) || 0, preco: Number(i.preco) || 0 }))
  )

  function setItem(index: number, patch: Partial<ItemForm>) {
    setItens(prev => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  async function cadastrarProdutoRapido() {
    if (!quickNome.trim()) return
    const { data } = await supabase
      .from('produtos')
      .insert({
        nome: quickNome.trim(),
        volume_ml: quickVolume ? Number(quickVolume) : null,
        estoque_atual: 0,
        estoque_minimo: 0,
      })
      .select()
      .single()
    if (data) {
      setProdutos(prev => [...prev, { id: data.id, nome: quickNome.trim() }])
      setQuickNome('')
      setQuickVolume('')
      setQuickOpen(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || duplicado) return
    setErro(null)
    const validos = itens.filter(i => i.produto_id && Number(i.qtd) >= 1)
    if (!fornecedorId || validos.length === 0) {
      setErro('Selecione o fornecedor e ao menos um item válido')
      return
    }
    setSubmitting(true)
    try {
      const { data: pedido, error } = await supabase
        .from('pedidos')
        .insert({
          fornecedor_id: fornecedorId,
          previsao_chegada: previsao || null,
          valor_total: total,
          responsavel: user?.email || null,
        })
        .select()
        .single()
      if (error || !pedido) throw new Error(error?.message || 'Falha ao criar pedido')

      const { error: itensError } = await supabase.from('pedido_itens').insert(
        validos.map(i => ({
          pedido_id: pedido.id,
          produto_id: i.produto_id,
          qtd_pedida: Number(i.qtd),
          preco_unitario: Number(i.preco) || 0,
        }))
      )
      if (itensError) throw new Error(itensError.message)

      setFornecedorId(''); setPrevisao(''); setItens([{ ...ITEM_VAZIO }])
      onCreated()
      onClose()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar pedido')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo pedido" size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Fornecedor"
            options={fornecedores.map(f => ({ value: f.id, label: f.nome }))}
            value={fornecedorId}
            onChange={(e) => setFornecedorId(e.target.value)}
            required
          />
          <Input
            label="Previsão de chegada"
            type="date"
            value={previsao}
            onChange={(e) => setPrevisao(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[.08em] text-muted">Itens</span>
            <button
              type="button"
              onClick={() => setQuickOpen(!quickOpen)}
              className="text-xs text-gold hover:underline cursor-pointer"
            >
              + Cadastrar produto
            </button>
          </div>

          {quickOpen && (
            <div className="flex items-end gap-2 p-3 border border-dashed border-gold-line rounded-lg">
              <Input label="Nome do produto" value={quickNome} onChange={(e) => setQuickNome(e.target.value)} />
              <Input label="Volume (ml)" type="number" value={quickVolume} onChange={(e) => setQuickVolume(e.target.value)} />
              <Button type="button" size="sm" onClick={cadastrarProdutoRapido}>Cadastrar</Button>
            </div>
          )}

          {itens.map((item, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_110px_90px_32px] gap-2 items-end">
              <Select
                label={`Produto ${i + 1}`}
                options={produtos.map(p => ({ value: p.id, label: p.nome }))}
                value={item.produto_id}
                onChange={(e) => setItem(i, { produto_id: e.target.value })}
              />
              <Input
                label={`Qtd ${i + 1}`}
                type="number" min="1"
                value={item.qtd}
                onChange={(e) => setItem(i, { qtd: e.target.value })}
              />
              <Input
                label={`Preço ${i + 1}`}
                type="number" step="0.01" min="0"
                value={item.preco}
                onChange={(e) => setItem(i, { preco: e.target.value })}
              />
              <span className="text-sm font-mono text-text-2 pb-2.5 text-right">
                {formatBRL((Number(item.qtd) || 0) * (Number(item.preco) || 0))}
              </span>
              <button
                type="button"
                onClick={() => setItens(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev)}
                className="pb-2.5 text-muted hover:text-down cursor-pointer"
                title="Remover item"
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}

          {duplicado && (
            <p className="text-xs text-down">Produto repetido — una as linhas em um item só</p>
          )}

          <Button
            type="button" variant="secondary" size="sm"
            className="self-start"
            onClick={() => setItens(prev => [...prev, { ...ITEM_VAZIO }])}
          >
            <Icon name="plus" size={14} />
            Adicionar item
          </Button>
        </div>

        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-sm text-muted">Total do pedido</span>
          <span className="text-xl font-mono">{formatBRL(total)}</span>
        </div>

        {erro && (
          <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || duplicado}>
            {submitting ? 'Salvando...' : 'Criar pedido'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
```

Nota: `Select`/`Input` recebem `label` — para o `getByLabelText` funcionar, esses componentes precisam associar label↔campo. Se `FormControls.tsx` ainda não usa `htmlFor`/`id`, ajustar `Input` e `Select` para gerar `id` via `useId()` e ligar no `<label htmlFor>`:

```tsx
// Em FormControls.tsx, dentro de Input (e equivalente em Select):
import { useId } from 'react'
// ...
export function Input({ label, className, id, ...props }: InputProps) {
  const autoId = useId()
  const inputId = id || autoId
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium uppercase tracking-[.08em] text-muted">
          {label}
        </label>
      )}
      <input id={inputId} className={/* classes existentes inalteradas */ className} {...props} />
    </div>
  )
}
```

- [ ] **Step 4: Plugar o modal na lista**

Em `frontend/src/pages/estoque/Pedidos.tsx`, trocar o placeholder `{novoOpen && null}` por:

```tsx
import { NovoPedidoModal } from './pedidos/NovoPedidoModal'
// ...
<NovoPedidoModal open={novoOpen} onClose={() => setNovoOpen(false)} onCreated={fetchData} />
```

Atenção ao mock de AuthContext no teste do modal — adicionar ao topo do arquivo de teste:

```tsx
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'teste@horus.com' }, signOut: vi.fn() }),
}))
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `cd C:\Horus\frontend; npx vitest run src/pages/estoque/__tests__/NovoPedidoModal.test.tsx src/pages/estoque/__tests__/Pedidos.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/estoque/pedidos/NovoPedidoModal.tsx frontend/src/pages/estoque/__tests__/NovoPedidoModal.test.tsx frontend/src/pages/estoque/Pedidos.tsx frontend/src/components/shared/FormControls.tsx
git commit -m "feat: modal de novo pedido com itens dinamicos e cadastro rapido de produto"
```

---

### Task 5: Modal de conferência de recebimento

**Files:**
- Create: `frontend/src/pages/estoque/pedidos/ConferenciaModal.tsx`
- Modify: `frontend/src/pages/estoque/Pedidos.tsx` (plugar o modal)
- Test: `frontend/src/pages/estoque/__tests__/ConferenciaModal.test.tsx`

- [ ] **Step 1: Escrever os testes que falham**

```tsx
// frontend/src/pages/estoque/__tests__/ConferenciaModal.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConferenciaModal } from '../pedidos/ConferenciaModal'

const mockRpc = vi.fn(() => Promise.resolve({ data: null, error: null }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({
          data: [
            {
              id: 'i1', qtd_pedida: 5, preco_unitario: 100,
              produtos: { nome: 'Perfume X', foto_url: null },
            },
            {
              id: 'i2', qtd_pedida: 3, preco_unitario: 130,
              produtos: { nome: 'Perfume Y', foto_url: null },
            },
          ],
          error: null,
        })),
      })),
    })),
    rpc: mockRpc,
  },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'teste@horus.com' }, signOut: vi.fn() }),
}))

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
  vi.clearAllMocks()
})

const pedido = { id: 'p1', numero: 1 }

describe('ConferenciaModal', () => {
  it('lista os itens com qtd pedida e campo de qtd recebida pré-preenchido', async () => {
    render(<ConferenciaModal pedido={pedido} onClose={vi.fn()} onConfirmed={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Perfume X')).toBeInTheDocument())
    const inputs = screen.getAllByLabelText(/qtd recebida/i)
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toHaveValue(5)
    expect(inputs[1]).toHaveValue(3)
  })

  it('exibe seletor de divergência quando a qtd recebida difere', async () => {
    const user = userEvent.setup()
    render(<ConferenciaModal pedido={pedido} onClose={vi.fn()} onConfirmed={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Perfume X')).toBeInTheDocument())
    expect(screen.queryByLabelText(/tipo de divergência/i)).not.toBeInTheDocument()

    const input = screen.getAllByLabelText(/qtd recebida/i)[0]
    await user.clear(input)
    await user.type(input, '3')

    expect(screen.getByLabelText(/tipo de divergência/i)).toBeInTheDocument()
  })

  it('chama a RPC confirmar_recebimento com o payload correto', async () => {
    const user = userEvent.setup()
    const onConfirmed = vi.fn()
    render(<ConferenciaModal pedido={pedido} onClose={vi.fn()} onConfirmed={onConfirmed} />)

    await waitFor(() => expect(screen.getByText('Perfume X')).toBeInTheDocument())

    const input = screen.getAllByLabelText(/qtd recebida/i)[0]
    await user.clear(input)
    await user.type(input, '3')
    await user.selectOptions(screen.getByLabelText(/tipo de divergência/i), 'faltou')
    await user.click(screen.getByRole('button', { name: /confirmar recebimento/i }))

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('confirmar_recebimento', {
        p_pedido_id: 'p1',
        p_itens: [
          { item_id: 'i1', qtd_recebida: 3, divergencia_tipo: 'faltou', divergencia_obs: null },
          { item_id: 'i2', qtd_recebida: 3, divergencia_tipo: null, divergencia_obs: null },
        ],
        p_recebido_por: 'teste@horus.com',
      })
    })
    expect(onConfirmed).toHaveBeenCalled()
  })

  it('bloqueia confirmação com qtd divergente sem tipo classificado', async () => {
    const user = userEvent.setup()
    render(<ConferenciaModal pedido={pedido} onClose={vi.fn()} onConfirmed={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Perfume X')).toBeInTheDocument())
    const input = screen.getAllByLabelText(/qtd recebida/i)[0]
    await user.clear(input)
    await user.type(input, '3')
    await user.click(screen.getByRole('button', { name: /confirmar recebimento/i }))

    expect(mockRpc).not.toHaveBeenCalled()
    expect(screen.getByText(/exige tipo de divergência/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `cd C:\Horus\frontend; npx vitest run src/pages/estoque/__tests__/ConferenciaModal.test.tsx`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar o modal**

```tsx
// frontend/src/pages/estoque/pedidos/ConferenciaModal.tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { Icon } from '@/components/shared/Icon'
import {
  validarConferencia, DIVERGENCIA_TIPOS,
  type ConferenciaItem, type DivergenciaTipo,
} from '@/lib/pedidos'

interface ItemRow {
  id: string
  qtd_pedida: number
  preco_unitario: number
  produtos: { nome: string; foto_url: string | null } | null
}

interface Props {
  pedido: { id: string; numero: number } | null
  onClose: () => void
  onConfirmed: () => void
}

interface ConferenciaState extends ConferenciaItem {
  nome: string
  fotoUrl: string | null
}

export function ConferenciaModal({ pedido, onClose, onConfirmed }: Props) {
  const { user } = useAuth()
  const [itens, setItens] = useState<ConferenciaState[]>([])
  const [erros, setErros] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [rpcError, setRpcError] = useState<string | null>(null)

  useEffect(() => {
    if (!pedido) return
    supabase
      .from('pedido_itens')
      .select('id, qtd_pedida, preco_unitario, produtos(nome, foto_url)')
      .eq('pedido_id', pedido.id)
      .then(({ data }) => {
        setItens((data as ItemRow[] | null || []).map(item => ({
          itemId: item.id,
          qtdPedida: item.qtd_pedida,
          qtdRecebida: item.qtd_pedida,
          divergenciaTipo: null,
          divergenciaObs: '',
          nome: item.produtos?.nome || '—',
          fotoUrl: item.produtos?.foto_url || null,
        })))
      })
  }, [pedido])

  function setItem(itemId: string, patch: Partial<ConferenciaState>) {
    setItens(prev => prev.map(i => (i.itemId === itemId ? { ...i, ...patch } : i)))
    setErros([])
  }

  const divergentes = itens.filter(i => i.qtdRecebida !== i.qtdPedida).length

  async function handleConfirm() {
    if (submitting || !pedido) return
    setRpcError(null)
    const validacao = validarConferencia(itens)
    if (validacao.length > 0) {
      setErros(validacao)
      return
    }
    setSubmitting(true)
    const { error } = await supabase.rpc('confirmar_recebimento', {
      p_pedido_id: pedido.id,
      p_itens: itens.map(i => ({
        item_id: i.itemId,
        qtd_recebida: i.qtdRecebida,
        divergencia_tipo: i.divergenciaTipo,
        divergencia_obs: i.divergenciaObs.trim() || null,
      })),
      p_recebido_por: user?.email || null,
    })
    setSubmitting(false)
    if (error) {
      setRpcError(error.message)
      return
    }
    onConfirmed()
    onClose()
  }

  return (
    <Modal
      open={!!pedido}
      onClose={onClose}
      title={pedido ? `Conferência — Pedido #${pedido.numero}` : ''}
      size="lg"
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Confira fisicamente cada item e ajuste a quantidade recebida se houver diferença.
        </p>

        {itens.map((item) => {
          const divergente = item.qtdRecebida !== item.qtdPedida
          return (
            <div
              key={item.itemId}
              className={`border rounded-xl p-3 flex flex-col gap-3 ${divergente ? 'border-warn/40 bg-warn/5' : 'border-line'}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-2 overflow-hidden flex items-center justify-center shrink-0">
                  {item.fotoUrl
                    ? <img src={item.fotoUrl} alt={item.nome} className="w-full h-full object-cover" />
                    : <Icon name="box" size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.nome}</div>
                  <div className="text-xs text-muted font-mono">Pedido: {item.qtdPedida} un.</div>
                </div>
                <div className="w-28">
                  <Input
                    label="Qtd recebida"
                    type="number" min="0"
                    value={String(item.qtdRecebida)}
                    onChange={(e) => setItem(item.itemId, { qtdRecebida: Number(e.target.value) })}
                  />
                </div>
              </div>

              {divergente && (
                <div className="grid grid-cols-2 gap-3 pl-13">
                  <Select
                    label="Tipo de divergência"
                    options={DIVERGENCIA_TIPOS.map(t => ({ value: t.value, label: t.label }))}
                    value={item.divergenciaTipo || ''}
                    onChange={(e) => setItem(item.itemId, {
                      divergenciaTipo: (e.target.value || null) as DivergenciaTipo | null,
                    })}
                  />
                  <Input
                    label="Observação"
                    value={item.divergenciaObs}
                    onChange={(e) => setItem(item.itemId, { divergenciaObs: e.target.value })}
                    placeholder="Ex: caixa veio violada"
                  />
                </div>
              )}
            </div>
          )
        })}

        {erros.map((e, i) => (
          <div key={i} className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{e}</div>
        ))}
        {rpcError && (
          <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">
            Falha ao confirmar: {rpcError} — o pedido continua aguardando, tente novamente.
          </div>
        )}

        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-sm text-muted">
            {itens.length - divergentes} {itens.length - divergentes === 1 ? 'item ok' : 'itens ok'}
            {divergentes > 0 && <span className="text-warn"> · {divergentes} divergência{divergentes > 1 ? 's' : ''}</span>}
          </span>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="button" onClick={handleConfirm} disabled={submitting}>
              {submitting ? 'Confirmando...' : 'Confirmar recebimento'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Plugar na lista**

Em `frontend/src/pages/estoque/Pedidos.tsx`, trocar `{conferindo && null}` por:

```tsx
import { ConferenciaModal } from './pedidos/ConferenciaModal'
// ...
<ConferenciaModal
  pedido={conferindo ? { id: conferindo.id, numero: conferindo.numero } : null}
  onClose={() => setConferindo(null)}
  onConfirmed={fetchData}
/>
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `cd C:\Horus\frontend; npx vitest run src/pages/estoque/__tests__/ConferenciaModal.test.tsx`
Expected: PASS (4 testes)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/estoque/pedidos/ConferenciaModal.tsx frontend/src/pages/estoque/__tests__/ConferenciaModal.test.tsx frontend/src/pages/estoque/Pedidos.tsx
git commit -m "feat: conferencia de recebimento com divergencias e RPC atomica"
```

---

### Task 6: Página Divergências (log + resumo por fornecedor)

**Files:**
- Create: `frontend/src/pages/estoque/Divergencias.tsx`
- Modify: `frontend/src/App.tsx` (rota)
- Modify: `frontend/src/components/layout/Layout.tsx` (nav)
- Test: `frontend/src/pages/estoque/__tests__/Divergencias.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// frontend/src/pages/estoque/__tests__/Divergencias.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EstDivergencias } from '../Divergencias'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: [
            {
              id: 'd1', tipo: 'faltou', qtd_pedida: 5, qtd_recebida: 3,
              observacao: 'caixa violada', created_at: '2026-06-10T12:00:00Z',
              pedidos: { numero: 1 },
              fornecedores: { nome: 'Essências Cairo' },
              pedido_itens: { produtos: { nome: 'Perfume X' } },
            },
          ],
          error: null,
        })),
      })),
    })),
  },
}))

describe('EstDivergencias', () => {
  it('renderiza o log com fornecedor, produto, tipo e quantidades', async () => {
    render(<EstDivergencias />)

    await waitFor(() => expect(screen.getByText('Essências Cairo')).toBeInTheDocument())
    expect(screen.getByText('Perfume X')).toBeInTheDocument()
    expect(screen.getByText('Faltou')).toBeInTheDocument()
    expect(screen.getByText('5 → 3')).toBeInTheDocument()
    expect(screen.getByText('caixa violada')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `cd C:\Horus\frontend; npx vitest run src/pages/estoque/__tests__/Divergencias.test.tsx`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar a página**

```tsx
// frontend/src/pages/estoque/Divergencias.tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { DIVERGENCIA_TIPOS, type DivergenciaTipo } from '@/lib/pedidos'

interface DivergenciaRow {
  id: string
  tipo: DivergenciaTipo
  qtd_pedida: number
  qtd_recebida: number
  observacao: string | null
  created_at: string
  pedidos: { numero: number } | null
  fornecedores: { nome: string } | null
  pedido_itens: { produtos: { nome: string } | null } | null
}

const TIPO_LABEL = Object.fromEntries(DIVERGENCIA_TIPOS.map(t => [t.value, t.label]))

export function EstDivergencias() {
  const [divergencias, setDivergencias] = useState<DivergenciaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroFornecedor, setFiltroFornecedor] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')

  useEffect(() => {
    supabase
      .from('divergencias')
      .select('*, pedidos(numero), fornecedores(nome), pedido_itens(produtos(nome))')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setDivergencias((data as DivergenciaRow[] | null) || [])
        setLoading(false)
      })
  }, [])

  const fornecedores = [...new Set(divergencias.map(d => d.fornecedores?.nome).filter(Boolean))] as string[]

  const filtradas = divergencias.filter(d => {
    if (filtroFornecedor && d.fornecedores?.nome !== filtroFornecedor) return false
    if (filtroTipo && d.tipo !== filtroTipo) return false
    return true
  })

  // resumo: divergências por fornecedor
  const resumo = fornecedores
    .map(nome => ({ nome, total: divergencias.filter(d => d.fornecedores?.nome === nome).length }))
    .sort((a, b) => b.total - a.total)

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Estoque / Qualidade</p>
        <h1 className="text-3xl font-medium tracking-tight mt-1">Divergências</h1>
        <p className="text-muted text-sm mt-1">Histórico de diferenças entre pedido e recebimento</p>
      </div>

      {resumo.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {resumo.map(r => (
            <div key={r.nome} className="bg-surface border border-line rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-sm font-medium">{r.nome}</span>
              <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-warn/15 text-warn">
                {r.total} divergência{r.total > 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2.5">
        <select
          value={filtroFornecedor}
          onChange={(e) => setFiltroFornecedor(e.target.value)}
          className="px-3.5 py-2.5 rounded-lg border border-line bg-surface text-text text-sm cursor-pointer focus:outline-none focus:border-gold/60"
        >
          <option value="">Todos os fornecedores</option>
          {fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="px-3.5 py-2.5 rounded-lg border border-line bg-surface text-text text-sm cursor-pointer focus:outline-none focus:border-gold/60"
        >
          <option value="">Todos os tipos</option>
          {DIVERGENCIA_TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <div className="border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="text-left px-4 py-3 text-text-2 font-medium">Data</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Pedido</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Fornecedor</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Produto</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Tipo</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Pedida → Recebida</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Observação</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
            ) : filtradas.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Nenhuma divergência registrada</td></tr>
            ) : (
              filtradas.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3 text-text-2 text-xs">{formatDate(d.created_at)}</td>
                  <td className="px-4 py-3 font-mono text-muted">#{d.pedidos?.numero ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">{d.fornecedores?.nome || '—'}</td>
                  <td className="px-4 py-3">{d.pedido_itens?.produtos?.nome || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-warn/15 text-warn">
                      {TIPO_LABEL[d.tipo] || d.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{d.qtd_pedida} → {d.qtd_recebida}</td>
                  <td className="px-4 py-3 text-text-2">{d.observacao || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rota e navegação**

Em `frontend/src/App.tsx`:

```tsx
import { EstDivergencias } from '@/pages/estoque/Divergencias'
// ...
<Route path="/estoque/divergencias" element={<EstDivergencias />} />
```

Em `frontend/src/components/layout/Layout.tsx`, no `EST_NAV`, logo após o item de pedidos:

```tsx
{ id: 'divergencias', label: 'Divergências', icon: 'warn', path: '/estoque/divergencias' },
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `cd C:\Horus\frontend; npx vitest run src/pages/estoque/__tests__/Divergencias.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/estoque/Divergencias.tsx frontend/src/pages/estoque/__tests__/Divergencias.test.tsx frontend/src/App.tsx frontend/src/components/layout/Layout.tsx
git commit -m "feat: pagina de log de divergencias com resumo por fornecedor"
```

---

### Task 7: Saída rápida na tela de Produtos

**Files:**
- Create: `frontend/src/components/shared/SaidaRapidaModal.tsx`
- Modify: `frontend/src/pages/estoque/Produtos.tsx` (botão "Registrar saída")
- Test: `frontend/src/pages/estoque/__tests__/SaidaRapidaModal.test.tsx`

- [ ] **Step 1: Escrever os testes que falham**

```tsx
// frontend/src/pages/estoque/__tests__/SaidaRapidaModal.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SaidaRapidaModal } from '@/components/shared/SaidaRapidaModal'

const mockRpc = vi.fn(() => Promise.resolve({ data: null, error: null }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: [{ id: 'pr1', nome: 'Perfume X', estoque_atual: 10 }],
          error: null,
        })),
      })),
    })),
    rpc: mockRpc,
  },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'teste@horus.com' }, signOut: vi.fn() }),
}))

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
  vi.clearAllMocks()
})

describe('SaidaRapidaModal', () => {
  it('chama a RPC registrar_saida com o payload correto', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<SaidaRapidaModal open onClose={vi.fn()} onDone={onDone} />)

    await waitFor(() => expect(screen.getByLabelText(/produto/i)).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/produto/i), 'pr1')
    await user.clear(screen.getByLabelText(/quantidade/i))
    await user.type(screen.getByLabelText(/quantidade/i), '2')
    await user.selectOptions(screen.getByLabelText(/motivo/i), 'venda')
    await user.click(screen.getByRole('button', { name: /registrar/i }))

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('registrar_saida', {
        p_produto_id: 'pr1',
        p_qtd: 2,
        p_motivo: 'venda',
        p_responsavel: 'teste@horus.com',
      })
    })
    expect(onDone).toHaveBeenCalled()
  })

  it('exibe o erro da RPC (ex: estoque insuficiente)', async () => {
    const user = userEvent.setup()
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Estoque insuficiente: 10 unidades disponíveis' },
    } as never)

    render(<SaidaRapidaModal open onClose={vi.fn()} onDone={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText(/produto/i)).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/produto/i), 'pr1')
    await user.clear(screen.getByLabelText(/quantidade/i))
    await user.type(screen.getByLabelText(/quantidade/i), '99')
    await user.selectOptions(screen.getByLabelText(/motivo/i), 'venda')
    await user.click(screen.getByRole('button', { name: /registrar/i }))

    await waitFor(() => {
      expect(screen.getByText(/estoque insuficiente/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `cd C:\Horus\frontend; npx vitest run src/pages/estoque/__tests__/SaidaRapidaModal.test.tsx`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar o modal**

```tsx
// frontend/src/components/shared/SaidaRapidaModal.tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'

interface ProdutoOpcao { id: string; nome: string; estoque_atual: number }

interface Props {
  open: boolean
  onClose: () => void
  onDone: () => void
  /** pré-seleciona um produto (atalho do modal de detalhes) */
  produtoId?: string
}

const MOTIVOS = [
  { value: 'venda', label: 'Venda' },
  { value: 'perda', label: 'Perda' },
  { value: 'uso_interno', label: 'Uso interno' },
  { value: 'outro', label: 'Outro' },
]

export function SaidaRapidaModal({ open, onClose, onDone, produtoId }: Props) {
  const { user } = useAuth()
  const [produtos, setProdutos] = useState<ProdutoOpcao[]>([])
  const [form, setForm] = useState({ produto_id: '', qtd: '1', motivo: '' })
  const [erro, setErro] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setErro(null)
    setForm({ produto_id: produtoId || '', qtd: '1', motivo: '' })
    supabase.from('produtos').select('id, nome, estoque_atual').order('nome')
      .then(({ data }) => setProdutos(data || []))
  }, [open, produtoId])

  const selecionado = produtos.find(p => p.id === form.produto_id)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setErro(null)
    setSubmitting(true)
    const { error } = await supabase.rpc('registrar_saida', {
      p_produto_id: form.produto_id,
      p_qtd: Number(form.qtd),
      p_motivo: form.motivo,
      p_responsavel: user?.email || null,
    })
    setSubmitting(false)
    if (error) {
      setErro(error.message)
      return
    }
    onDone()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar saída">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select
          label="Produto"
          options={produtos.map(p => ({ value: p.id, label: `${p.nome} (${p.estoque_atual} em estoque)` }))}
          value={form.produto_id}
          onChange={(e) => setForm({ ...form, produto_id: e.target.value })}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Quantidade"
            type="number" min="1"
            max={selecionado?.estoque_atual}
            value={form.qtd}
            onChange={(e) => setForm({ ...form, qtd: e.target.value })}
            required
          />
          <Select
            label="Motivo"
            options={MOTIVOS}
            value={form.motivo}
            onChange={(e) => setForm({ ...form, motivo: e.target.value })}
            required
          />
        </div>
        {erro && (
          <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Registrando...' : 'Registrar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 4: Plugar na tela de Produtos**

Em `frontend/src/pages/estoque/Produtos.tsx`:

1. Import: `import { SaidaRapidaModal } from '@/components/shared/SaidaRapidaModal'`
2. Estado: `const [saidaOpen, setSaidaOpen] = useState(false)`
3. Botão ao lado de "Importar" (no bloco de ações do header):

```tsx
<Button variant="secondary" onClick={() => setSaidaOpen(true)}>
  <Icon name="down" size={16} />
  Registrar saída
</Button>
```

4. Render no final, junto dos outros modais:

```tsx
<SaidaRapidaModal open={saidaOpen} onClose={() => setSaidaOpen(false)} onDone={fetchData} />
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `cd C:\Horus\frontend; npx vitest run src/pages/estoque/__tests__/SaidaRapidaModal.test.tsx`
Expected: PASS (2 testes)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/shared/SaidaRapidaModal.tsx frontend/src/pages/estoque/__tests__/SaidaRapidaModal.test.tsx frontend/src/pages/estoque/Produtos.tsx
git commit -m "feat: saida rapida de estoque via RPC registrar_saida"
```

---

### Task 8: Remover Movimentações, atualizar docs, verificação final

**Files:**
- Delete: `frontend/src/pages/estoque/Movimentacoes.tsx`
- Modify: `frontend/src/App.tsx` (remover import e rota de movimentações)
- Modify: `docs/BANCO.md`, `docs/HANDOFF_IA.md`, `docs/LOGS.md`

- [ ] **Step 1: Remover a página e a rota**

1. Deletar `frontend/src/pages/estoque/Movimentacoes.tsx`
2. Em `frontend/src/App.tsx`, remover:
   - `import { EstMovimentacoes } from '@/pages/estoque/Movimentacoes'`
   - `<Route path="/estoque/movimentacoes" element={<EstMovimentacoes />} />`
3. Confirmar que `Layout.tsx` não referencia mais movimentações (feito na Task 3)

- [ ] **Step 2: Verificar suite completa + build**

Run: `cd C:\Horus\frontend; npm run test:run; npm run build`
Expected: todos os testes PASS, build OK, nenhum import quebrado

- [ ] **Step 3: Atualizar a documentação**

- `docs/BANCO.md`: adicionar as 3 tabelas novas (copiar do spec), as colunas `custo_medio`/`ultimo_custo` em produtos, nota de que `movimentacoes` é ledger interno (escrita só via RPCs), e as 2 RPCs na seção de SQL
- `docs/HANDOFF_IA.md`: registrar a feature no "O que já foi feito", remover "Movimentações" das listas de telas, atualizar próximos passos
- `docs/LOGS.md`: nova entrada de sessão descrevendo a feature

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "feat: substitui movimentacoes por fluxo de pedidos; atualiza docs"
```

---

## Self-review (executado na escrita do plano)

- **Cobertura do spec:** tabelas+RLS+RPC (Task 1), custo médio/validações (Task 2), lista+criar com cadastro rápido (Tasks 3-4), conferência+divergência automática (Task 5), log+resumo por fornecedor (Task 6), saída rápida (Task 7), navegação/remoção+docs (Task 8). Filtros da lista de pedidos por status/fornecedor: deixados de fora da v1 da lista (YAGNI — poucos pedidos; adicionar quando houver volume) — desvio consciente do spec, demais requisitos cobertos.
- **Sem placeholders:** todo step de código tem o código completo.
- **Consistência de tipos:** `ConferenciaItem`/`DivergenciaTipo`/`calcularTotalPedido` definidos na Task 2 e usados nas Tasks 4-6 com as mesmas assinaturas; payload da RPC na Task 5 espelha a assinatura SQL da Task 1 (`p_pedido_id`, `p_itens[{item_id, qtd_recebida, divergencia_tipo, divergencia_obs}]`, `p_recebido_por`); `registrar_saida` idem (Task 7 ↔ Task 1).
