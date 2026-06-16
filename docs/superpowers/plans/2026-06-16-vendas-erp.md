# Módulo de Vendas (ERP estoque ↔ financeiro) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar vendas (frascos cheios e decants) que baixam estoque e lançam no caixa automaticamente, armazenando custo/lucro/ROI por venda e por item.

**Architecture:** Uma RPC atômica `registrar_venda` baixa estoque (produto → `estoque_atual`; decant → ml do frasco), grava `vendas`+`venda_itens` com snapshot de custo, e injeta linhas em `transacoes` (receita + taxa + frete). Lógica de cálculo vive em `lib/vendas.ts` (pura, decimal.js) que dirige a prévia ao vivo no formulário; a RPC é a fonte da verdade dos valores gravados. Correção de venda = cancelar (estorno completo via `cancelar_venda`) + recriar.

**Tech Stack:** PostgreSQL/Supabase (plpgsql RPCs), React 19 + Vite + TypeScript, Tailwind, decimal.js, Vitest + Testing Library.

**Spec de referência:** `docs/superpowers/specs/2026-06-16-vendas-erp-design.md`

---

## Estrutura de arquivos

**Criar:**
- `supabase/migrations/20260616_vendas.sql` — tabelas, alterações, RLS, RPCs, seeds (aplicar manualmente no Supabase).
- `frontend/src/lib/vendas.ts` — funções puras de cálculo (custo decant, rateio, lucro, ROI, margem, resumo).
- `frontend/src/lib/__tests__/vendas.test.ts` — testes unitários da lib.
- `frontend/src/pages/estoque/vendas/NovaVendaModal.tsx` — modal de nova venda (multi-item, prévia).
- `frontend/src/pages/estoque/vendas/VendaDetalheModal.tsx` — modal de detalhe da venda.
- `frontend/src/pages/estoque/Vendas.tsx` — página lista de vendas.
- `frontend/src/pages/estoque/vendas/VendasConfig.tsx` — CRUD de canais e embalagens de decant.
- `frontend/src/pages/estoque/__tests__/Vendas.test.tsx` — teste de componente da lista.

**Modificar:**
- `frontend/src/components/shared/Icon.tsx` — adicionar ícone `cart`.
- `frontend/src/components/layout/Layout.tsx` — item de nav "Vendas".
- `frontend/src/App.tsx` — rotas `/estoque/vendas` e `/estoque/vendas/config`.
- `frontend/src/pages/estoque/Produtos.tsx` — campo `preco_referencia` no formulário.
- `frontend/src/pages/financeiro/Transacoes.tsx` — badge "origem venda" nas linhas geradas.
- `docs/PRD.md`, `docs/BANCO.md`, `docs/HANDOFF_IA.md`, `docs/LOGS.md` — documentação.

**Ordem das tasks:** infra primeiro (SQL → lib pura → scaffolding de nav/rota), depois os modais (leaf) e só então a página de lista que os compõe, garantindo que cada task compile de forma independente.

---

## Task 1: Migração SQL (tabelas, RPCs, seeds)

**Files:**
- Create: `supabase/migrations/20260616_vendas.sql`

Esta migração não tem teste automatizado (o projeto não testa plpgsql) — é aplicada manualmente no Supabase SQL Editor, igual a `20260610_pedidos.sql` e `20260615_decants.sql`. A verificação é um smoke test SQL ao final.

- [ ] **Step 1: Criar o arquivo de migração completo**

Create `supabase/migrations/20260616_vendas.sql`:

```sql
-- =============================================================
-- Módulo de Vendas — integração estoque ↔ financeiro (ERP)
-- Aplicar no SQL Editor do Supabase (project wyobbztexoofhqdttxzq)
-- =============================================================

-- 1. Tabelas -----------------------------------------------------

create table if not exists canais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  taxa_padrao numeric(5,2) not null default 0 check (taxa_padrao >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists embalagens_decant (
  id uuid primary key default gen_random_uuid(),
  tamanho_ml int not null unique check (tamanho_ml > 0),
  custo numeric(12,2) not null default 0 check (custo >= 0),
  ativo boolean not null default true
);

create table if not exists vendas (
  id uuid primary key default gen_random_uuid(),
  numero serial unique,
  canal_id uuid not null references canais(id),
  data_venda date not null default current_date,
  forma_pagamento text,
  cliente text,
  taxa_total numeric(12,2) not null default 0 check (taxa_total >= 0),
  frete numeric(12,2) not null default 0 check (frete >= 0),
  total_bruto numeric(12,2) not null default 0,
  total_custo numeric(12,2) not null default 0,
  lucro_bruto numeric(12,2) not null default 0,
  responsavel text,
  observacao text,
  status text not null default 'concluida' check (status in ('concluida', 'cancelada')),
  created_at timestamptz not null default now()
);

create table if not exists venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  tipo text not null check (tipo in ('produto', 'decant')),
  produto_id uuid not null references produtos(id),
  frasco_id uuid references frascos_abertos(id),
  decant_id uuid references decants(id),
  ml int check (ml > 0),
  quantidade int not null default 1 check (quantidade > 0),
  preco_unitario numeric(12,2) not null check (preco_unitario >= 0),
  custo_unitario numeric(12,2) not null default 0,
  custo_embalagem numeric(12,2) not null default 0,
  taxa_rateada numeric(12,2) not null default 0,
  frete_rateado numeric(12,2) not null default 0,
  lucro numeric(12,2) not null default 0
);

create index if not exists idx_venda_itens_venda on venda_itens(venda_id);
create index if not exists idx_vendas_canal on vendas(canal_id);
create index if not exists idx_vendas_data on vendas(data_venda);

-- Alterações em tabelas existentes
alter table produtos add column if not exists preco_referencia numeric(12,2);
alter table transacoes add column if not exists venda_id uuid references vendas(id);
alter table transacoes add column if not exists origem text not null default 'manual'
  check (origem in ('manual', 'venda'));

-- 2. RLS ---------------------------------------------------------

alter table canais enable row level security;
alter table embalagens_decant enable row level security;
alter table vendas enable row level security;
alter table venda_itens enable row level security;

drop policy if exists "Acesso total autenticados" on canais;
create policy "Acesso total autenticados" on canais
  for all to authenticated using (true) with check (true);
drop policy if exists "Acesso total autenticados" on embalagens_decant;
create policy "Acesso total autenticados" on embalagens_decant
  for all to authenticated using (true) with check (true);
drop policy if exists "Acesso total autenticados" on vendas;
create policy "Acesso total autenticados" on vendas
  for all to authenticated using (true) with check (true);
drop policy if exists "Acesso total autenticados" on venda_itens;
create policy "Acesso total autenticados" on venda_itens
  for all to authenticated using (true) with check (true);

-- 3. RPC: registrar venda (atômica) ------------------------------
-- p_itens: [{"tipo","produto_id","frasco_id","ml","quantidade",
--            "preco_unitario","custo_embalagem"}]

create or replace function registrar_venda(
  p_canal_id uuid,
  p_data_venda date,
  p_forma_pagamento text,
  p_cliente text,
  p_taxa_total numeric,
  p_frete numeric,
  p_responsavel text,
  p_observacao text,
  p_itens jsonb
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_venda vendas%rowtype;
  v_entrada jsonb;
  v_tipo text;
  v_produto produtos%rowtype;
  v_frasco frascos_abertos%rowtype;
  v_qtd int;
  v_ml int;
  v_preco numeric(12,2);
  v_custo_emb numeric(12,2);
  v_custo_unit numeric(12,2);
  v_bruto numeric(12,2);
  v_custo_total numeric(12,2);
  v_total_bruto numeric(12,2) := 0;
  v_total_custo numeric(12,2) := 0;
  v_novo_estoque int;
  v_novo_ml int;
  v_decant_id uuid;
  v_taxa_total numeric(12,2) := coalesce(p_taxa_total, 0);
  v_frete numeric(12,2) := coalesce(p_frete, 0);
  v_item_ids uuid[] := '{}';
  v_brutos numeric[] := '{}';
  v_item_id uuid;
  v_idx int;
  v_n int;
  v_taxa_rateada numeric(12,2);
  v_frete_rateado numeric(12,2);
  v_taxa_acc numeric(12,2) := 0;
  v_frete_acc numeric(12,2) := 0;
  v_ci venda_itens%rowtype;
begin
  if p_canal_id is null then raise exception 'Canal é obrigatório'; end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Venda sem itens';
  end if;
  if v_taxa_total < 0 or v_frete < 0 then
    raise exception 'Taxa e frete não podem ser negativos';
  end if;

  insert into vendas (canal_id, data_venda, forma_pagamento, cliente,
                      taxa_total, frete, responsavel, observacao, status)
  values (p_canal_id, coalesce(p_data_venda, current_date), p_forma_pagamento, p_cliente,
          v_taxa_total, v_frete, p_responsavel, p_observacao, 'concluida')
  returning * into v_venda;

  -- 1ª passada: baixa estoque, snapshot de custo, insere itens
  for v_entrada in select * from jsonb_array_elements(p_itens) loop
    v_tipo := v_entrada->>'tipo';
    v_qtd := coalesce((v_entrada->>'quantidade')::int, 1);
    v_preco := coalesce((v_entrada->>'preco_unitario')::numeric, 0);
    v_decant_id := null;
    if v_qtd < 1 then raise exception 'Quantidade inválida'; end if;
    if v_preco < 0 then raise exception 'Preço inválido'; end if;

    if v_tipo = 'produto' then
      select * into v_produto from produtos
        where id = (v_entrada->>'produto_id')::uuid for update;
      if not found then raise exception 'Produto não encontrado'; end if;
      if coalesce(v_produto.estoque_atual, 0) < v_qtd then
        raise exception 'Estoque insuficiente de %: % disponíveis',
          v_produto.nome, coalesce(v_produto.estoque_atual, 0);
      end if;
      v_custo_unit := coalesce(v_produto.custo_medio, 0);
      v_custo_emb := 0;
      v_novo_estoque := v_produto.estoque_atual - v_qtd;
      update produtos set estoque_atual = v_novo_estoque where id = v_produto.id;
      insert into movimentacoes (produto_id, tipo, quantidade, motivo, responsavel, saldo_resultante)
      values (v_produto.id, 'saida', v_qtd, 'Venda #' || v_venda.numero, p_responsavel, v_novo_estoque);

    elsif v_tipo = 'decant' then
      v_ml := (v_entrada->>'ml')::int;
      v_custo_emb := coalesce((v_entrada->>'custo_embalagem')::numeric, 0);
      if v_ml is null or v_ml <= 0 then raise exception 'ml inválido'; end if;
      select * into v_frasco from frascos_abertos
        where id = (v_entrada->>'frasco_id')::uuid for update;
      if not found then raise exception 'Frasco não encontrado'; end if;
      if v_frasco.status <> 'ativo' then raise exception 'Frasco não está ativo'; end if;
      if v_frasco.ml_restante < v_ml * v_qtd then
        raise exception 'ml insuficiente no frasco: % disponíveis', v_frasco.ml_restante;
      end if;
      select * into v_produto from produtos where id = v_frasco.produto_id for update;
      v_custo_unit := round(v_ml * coalesce(v_produto.custo_medio, 0)
                            / nullif(v_frasco.ml_total, 0), 2);
      v_novo_ml := v_frasco.ml_restante - v_ml * v_qtd;
      update frascos_abertos set
        ml_restante = v_novo_ml,
        status = case when v_novo_ml <= 0 then 'esgotado' else 'ativo' end
      where id = v_frasco.id;
      insert into decants (frasco_id, produto_id, ml)
      values (v_frasco.id, v_frasco.produto_id, v_ml * v_qtd)
      returning id into v_decant_id;
    else
      raise exception 'Tipo de item inválido: %', v_tipo;
    end if;

    v_bruto := round(v_preco * v_qtd, 2);
    v_custo_total := round((v_custo_unit + v_custo_emb) * v_qtd, 2);
    v_total_bruto := v_total_bruto + v_bruto;
    v_total_custo := v_total_custo + v_custo_total;

    insert into venda_itens (venda_id, tipo, produto_id, frasco_id, decant_id, ml, quantidade,
                             preco_unitario, custo_unitario, custo_embalagem)
    values (v_venda.id, v_tipo, v_produto.id,
            case when v_tipo = 'decant' then v_frasco.id else null end,
            v_decant_id,
            case when v_tipo = 'decant' then v_ml else null end,
            v_qtd, v_preco, v_custo_unit, v_custo_emb)
    returning id into v_item_id;

    v_item_ids := array_append(v_item_ids, v_item_id);
    v_brutos := array_append(v_brutos, v_bruto);
  end loop;

  -- 2ª passada: rateio proporcional de taxa e frete (último item absorve a sobra)
  v_n := array_length(v_item_ids, 1);
  for v_idx in 1..v_n loop
    if v_idx < v_n then
      if v_total_bruto > 0 then
        v_taxa_rateada := round(v_taxa_total * v_brutos[v_idx] / v_total_bruto, 2);
        v_frete_rateado := round(v_frete * v_brutos[v_idx] / v_total_bruto, 2);
      else
        v_taxa_rateada := 0; v_frete_rateado := 0;
      end if;
      v_taxa_acc := v_taxa_acc + v_taxa_rateada;
      v_frete_acc := v_frete_acc + v_frete_rateado;
    else
      v_taxa_rateada := v_taxa_total - v_taxa_acc;
      v_frete_rateado := v_frete - v_frete_acc;
    end if;

    select * into v_ci from venda_itens where id = v_item_ids[v_idx];
    update venda_itens set
      taxa_rateada = v_taxa_rateada,
      frete_rateado = v_frete_rateado,
      lucro = round(v_brutos[v_idx] - v_taxa_rateada - v_frete_rateado
                    - (v_ci.custo_unitario + v_ci.custo_embalagem) * v_ci.quantidade, 2)
    where id = v_item_ids[v_idx];
  end loop;

  update vendas set
    total_bruto = v_total_bruto,
    total_custo = v_total_custo,
    lucro_bruto = round(v_total_bruto - v_taxa_total - v_frete - v_total_custo, 2)
  where id = v_venda.id;

  -- lançamentos no caixa
  insert into transacoes (descricao, tipo, valor, categoria, forma_pagamento, responsavel, origem, venda_id)
  values ('Venda #' || v_venda.numero, 'entrada', v_total_bruto, 'Vendas',
          p_forma_pagamento, p_responsavel, 'venda', v_venda.id);
  if v_taxa_total > 0 then
    insert into transacoes (descricao, tipo, valor, categoria, forma_pagamento, responsavel, origem, venda_id)
    values ('Taxa — Venda #' || v_venda.numero, 'saida', v_taxa_total, 'Taxas marketplace',
            p_forma_pagamento, p_responsavel, 'venda', v_venda.id);
  end if;
  if v_frete > 0 then
    insert into transacoes (descricao, tipo, valor, categoria, forma_pagamento, responsavel, origem, venda_id)
    values ('Frete — Venda #' || v_venda.numero, 'saida', v_frete, 'Frete',
            p_forma_pagamento, p_responsavel, 'venda', v_venda.id);
  end if;

  return jsonb_build_object('id', v_venda.id, 'numero', v_venda.numero);
end;
$$;

-- 4. RPC: cancelar venda (estorno completo, atômico) -------------

create or replace function cancelar_venda(p_venda_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_venda vendas%rowtype;
  v_item venda_itens%rowtype;
  v_novo_estoque int;
begin
  select * into v_venda from vendas where id = p_venda_id for update;
  if not found then raise exception 'Venda não encontrada'; end if;
  if v_venda.status = 'cancelada' then raise exception 'Venda já está cancelada'; end if;

  for v_item in select * from venda_itens where venda_id = p_venda_id loop
    if v_item.tipo = 'produto' then
      update produtos set estoque_atual = coalesce(estoque_atual, 0) + v_item.quantidade
        where id = v_item.produto_id
        returning estoque_atual into v_novo_estoque;
      insert into movimentacoes (produto_id, tipo, quantidade, motivo, responsavel, saldo_resultante)
      values (v_item.produto_id, 'entrada', v_item.quantidade,
              'Estorno venda #' || v_venda.numero, v_venda.responsavel, v_novo_estoque);
    elsif v_item.tipo = 'decant' then
      update frascos_abertos set
        ml_restante = ml_restante + coalesce(v_item.ml, 0) * v_item.quantidade,
        status = 'ativo'
      where id = v_item.frasco_id;
      if v_item.decant_id is not null then
        delete from decants where id = v_item.decant_id;
      end if;
    end if;
  end loop;

  delete from transacoes where venda_id = p_venda_id and origem = 'venda';
  update vendas set status = 'cancelada' where id = p_venda_id;
end;
$$;

-- 5. Seeds -------------------------------------------------------

insert into canais (nome, taxa_padrao) values
  ('Loja física', 0),
  ('Shopee', 20),
  ('Mercado Livre', 16),
  ('Site próprio', 0),
  ('Instagram/WhatsApp', 0)
on conflict do nothing;

insert into embalagens_decant (tamanho_ml, custo) values
  (2, 1.50), (5, 2.00), (10, 3.00)
on conflict (tamanho_ml) do nothing;
```

- [ ] **Step 2: Aplicar a migração no Supabase**

Abrir o SQL Editor do Supabase (project `wyobbztexoofhqdttxzq`), colar o conteúdo do arquivo e executar. Esperado: "Success. No rows returned".

- [ ] **Step 3: Smoke test no SQL Editor**

Rodar a query abaixo para confirmar que os seeds e colunas existem:

```sql
select (select count(*) from canais) as canais,
       (select count(*) from embalagens_decant) as embalagens,
       exists(select 1 from information_schema.columns
              where table_name='produtos' and column_name='preco_referencia') as tem_preco_ref,
       exists(select 1 from information_schema.columns
              where table_name='transacoes' and column_name='origem') as tem_origem;
```

Esperado: `canais=5, embalagens=3, tem_preco_ref=true, tem_origem=true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260616_vendas.sql
git commit -m "feat(vendas): migracao SQL (tabelas, RPCs registrar_venda/cancelar_venda, seeds)"
```

---

## Task 2: lib/vendas.ts — cálculos básicos (custo, bruto, ROI, margem)

**Files:**
- Create: `frontend/src/lib/vendas.ts`
- Test: `frontend/src/lib/__tests__/vendas.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Create `frontend/src/lib/__tests__/vendas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  custoDecantUnitario, brutoItem, custoItem, roi, margem,
  type ItemVenda,
} from '../vendas'

const produto = (over: Partial<ItemVenda> = {}): ItemVenda => ({
  tipo: 'produto', quantidade: 1, precoUnitario: 0, custoUnitario: 0, custoEmbalagem: 0, ...over,
})

describe('custoDecantUnitario', () => {
  it('é proporcional ao ml sobre o volume da garrafa', () => {
    // 5ml de uma garrafa de 100ml que custou 200 → 10.00
    expect(custoDecantUnitario(5, 200, 100)).toBe(10)
  })
  it('retorna 0 quando o volume é 0 (evita divisão por zero)', () => {
    expect(custoDecantUnitario(5, 200, 0)).toBe(0)
  })
  it('arredonda para 2 casas', () => {
    expect(custoDecantUnitario(3, 100, 7)).toBe(42.86)
  })
})

describe('brutoItem', () => {
  it('multiplica preço por quantidade', () => {
    expect(brutoItem(produto({ precoUnitario: 120, quantidade: 2 }))).toBe(240)
  })
})

describe('custoItem', () => {
  it('soma custo unitário e embalagem, vezes quantidade', () => {
    expect(custoItem(produto({ custoUnitario: 30, custoEmbalagem: 2, quantidade: 3 }))).toBe(96)
  })
})

describe('roi', () => {
  it('é lucro dividido pelo custo', () => {
    expect(roi(50, 100)).toBe(0.5)
  })
  it('retorna null quando custo é 0 (indefinido)', () => {
    expect(roi(50, 0)).toBeNull()
  })
})

describe('margem', () => {
  it('é lucro dividido pelo bruto', () => {
    expect(margem(30, 120)).toBe(0.25)
  })
  it('retorna 0 quando bruto é 0', () => {
    expect(margem(30, 0)).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd frontend && npx vitest run src/lib/__tests__/vendas.test.ts`
Expected: FAIL — "Failed to resolve import '../vendas'".

- [ ] **Step 3: Implementar as funções**

Create `frontend/src/lib/vendas.ts`:

```ts
import Decimal from 'decimal.js'

export interface ItemVenda {
  tipo: 'produto' | 'decant'
  quantidade: number
  precoUnitario: number   // bruto, por unidade
  custoUnitario: number   // snapshot por unidade (só perfume, no caso do decant)
  custoEmbalagem: number  // por unidade; 0 para produto
}

export interface ResumoVenda {
  totalBruto: number
  totalCusto: number
  receitaLiquida: number
  lucroBruto: number
  roi: number | null   // null quando custo = 0
  margem: number       // 0 quando bruto = 0
}

export function custoDecantUnitario(ml: number, custoMedio: number, volumeMl: number): number {
  if (volumeMl <= 0) return 0
  return new Decimal(ml).mul(custoMedio).div(volumeMl).toDecimalPlaces(2).toNumber()
}

export function brutoItem(item: ItemVenda): number {
  return new Decimal(item.precoUnitario).mul(item.quantidade).toDecimalPlaces(2).toNumber()
}

export function custoItem(item: ItemVenda): number {
  return new Decimal(item.custoUnitario).add(item.custoEmbalagem)
    .mul(item.quantidade).toDecimalPlaces(2).toNumber()
}

export function roi(lucro: number, custo: number): number | null {
  if (custo <= 0) return null
  return new Decimal(lucro).div(custo).toDecimalPlaces(4).toNumber()
}

export function margem(lucro: number, bruto: number): number {
  if (bruto <= 0) return 0
  return new Decimal(lucro).div(bruto).toDecimalPlaces(4).toNumber()
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd frontend && npx vitest run src/lib/__tests__/vendas.test.ts`
Expected: PASS (todos os testes deste arquivo).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/vendas.ts frontend/src/lib/__tests__/vendas.test.ts
git commit -m "feat(vendas): lib de calculo basico (custo decant, bruto, custo, ROI, margem)"
```

---

## Task 3: lib/vendas.ts — rateio, lucro por item e resumo da venda

**Files:**
- Modify: `frontend/src/lib/vendas.ts`
- Test: `frontend/src/lib/__tests__/vendas.test.ts`

- [ ] **Step 1: Adicionar os testes que falham**

Append ao final de `frontend/src/lib/__tests__/vendas.test.ts`:

```ts
import { ratearProporcional, lucroItem, resumoVenda } from '../vendas'

describe('ratearProporcional', () => {
  it('rateia proporcional aos pesos e o último absorve a sobra de centavos', () => {
    // 10 entre [1,1,1] → 3.33 + 3.33 + 3.34 = 10.00 exato
    expect(ratearProporcional(10, [1, 1, 1])).toEqual([3.33, 3.33, 3.34])
  })
  it('rateia proporcional a pesos diferentes', () => {
    expect(ratearProporcional(100, [30, 70])).toEqual([30, 70])
  })
  it('retorna zeros quando a soma dos pesos é 0', () => {
    expect(ratearProporcional(50, [0, 0])).toEqual([0, 0])
  })
  it('devolve o total inteiro quando há um só item', () => {
    expect(ratearProporcional(42.5, [5])).toEqual([42.5])
  })
  it('retorna lista vazia quando não há itens', () => {
    expect(ratearProporcional(10, [])).toEqual([])
  })
})

describe('lucroItem', () => {
  it('é bruto menos taxa rateada, frete rateado e custo', () => {
    const item: ItemVenda = {
      tipo: 'produto', quantidade: 1, precoUnitario: 200, custoUnitario: 120, custoEmbalagem: 0,
    }
    // 200 - 20 (taxa) - 5 (frete) - 120 (custo) = 55
    expect(lucroItem(item, 20, 5)).toBe(55)
  })
})

describe('resumoVenda', () => {
  it('soma bruto/custo, desconta taxa+frete e calcula lucro, ROI e margem', () => {
    const itens: ItemVenda[] = [
      { tipo: 'produto', quantidade: 1, precoUnitario: 200, custoUnitario: 120, custoEmbalagem: 0 },
      { tipo: 'decant', quantidade: 1, precoUnitario: 40, custoUnitario: 10, custoEmbalagem: 2 },
    ]
    const r = resumoVenda(itens, 24, 6)
    expect(r.totalBruto).toBe(240)
    expect(r.totalCusto).toBe(132)        // 120 + (10+2)
    expect(r.receitaLiquida).toBe(210)    // 240 - 24 - 6
    expect(r.lucroBruto).toBe(78)         // 210 - 132
    expect(r.roi).toBe(0.5909)            // 78 / 132
    expect(r.margem).toBe(0.325)          // 78 / 240
  })
  it('lida com taxa 0 e frete 0 (loja física)', () => {
    const itens: ItemVenda[] = [
      { tipo: 'produto', quantidade: 2, precoUnitario: 100, custoUnitario: 60, custoEmbalagem: 0 },
    ]
    const r = resumoVenda(itens, 0, 0)
    expect(r.totalBruto).toBe(200)
    expect(r.lucroBruto).toBe(80)         // 200 - 120
    expect(r.roi).toBe(0.6667)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd frontend && npx vitest run src/lib/__tests__/vendas.test.ts`
Expected: FAIL — "ratearProporcional is not a function" (ou erro de import).

- [ ] **Step 3: Implementar as funções**

Append ao final de `frontend/src/lib/vendas.ts`:

```ts
export function ratearProporcional(valorTotal: number, pesos: number[]): number[] {
  const n = pesos.length
  if (n === 0) return []
  const soma = pesos.reduce((acc, p) => acc.add(p), new Decimal(0))
  if (soma.lte(0)) return pesos.map(() => 0)

  const total = new Decimal(valorTotal)
  let acumulado = new Decimal(0)
  const parcelas: number[] = []
  for (let i = 0; i < n; i++) {
    if (i < n - 1) {
      const parcela = total.mul(pesos[i]).div(soma).toDecimalPlaces(2)
      acumulado = acumulado.add(parcela)
      parcelas.push(parcela.toNumber())
    } else {
      parcelas.push(total.sub(acumulado).toDecimalPlaces(2).toNumber())
    }
  }
  return parcelas
}

export function lucroItem(item: ItemVenda, taxaRateada: number, freteRateado: number): number {
  return new Decimal(brutoItem(item))
    .sub(taxaRateada).sub(freteRateado).sub(custoItem(item))
    .toDecimalPlaces(2).toNumber()
}

export function resumoVenda(itens: ItemVenda[], taxaTotal: number, frete: number): ResumoVenda {
  const totalBruto = itens.reduce((acc, it) => acc.add(brutoItem(it)), new Decimal(0)).toDecimalPlaces(2)
  const totalCusto = itens.reduce((acc, it) => acc.add(custoItem(it)), new Decimal(0)).toDecimalPlaces(2)
  const receitaLiquida = totalBruto.sub(taxaTotal).sub(frete).toDecimalPlaces(2)
  const lucroBruto = receitaLiquida.sub(totalCusto).toDecimalPlaces(2)
  return {
    totalBruto: totalBruto.toNumber(),
    totalCusto: totalCusto.toNumber(),
    receitaLiquida: receitaLiquida.toNumber(),
    lucroBruto: lucroBruto.toNumber(),
    roi: roi(lucroBruto.toNumber(), totalCusto.toNumber()),
    margem: margem(lucroBruto.toNumber(), totalBruto.toNumber()),
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd frontend && npx vitest run src/lib/__tests__/vendas.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/vendas.ts frontend/src/lib/__tests__/vendas.test.ts
git commit -m "feat(vendas): rateio proporcional, lucro por item e resumo da venda"
```

---

## Task 4: Ícone, rota e página vazia de Vendas (scaffolding + nav)

**Files:**
- Modify: `frontend/src/components/shared/Icon.tsx`
- Modify: `frontend/src/components/layout/Layout.tsx:20-30`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/estoque/Vendas.tsx`

Cria uma página de Vendas mínima (sem modais ainda), só para a rota e a nav funcionarem. A lista completa e os modais vêm nas Tasks 5-7.

- [ ] **Step 1: Adicionar o ícone `cart` ao Icon**

Em `frontend/src/components/shared/Icon.tsx`, dentro do objeto de paths (junto dos outros, ex: após a linha `tag:`), adicionar:

```tsx
  cart: <><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M3 4h2l2.4 11.5a1 1 0 001 .8h8.7a1 1 0 001-.8L20 8H6" /></>,
```

- [ ] **Step 2: Criar a página mínima de Vendas**

Create `frontend/src/pages/estoque/Vendas.tsx`:

```tsx
import { Icon } from '@/components/shared/Icon'
import { Button } from '@/components/shared/FormControls'

export function EstVendas() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Estoque / Vendas</p>
          <h1 className="text-3xl font-medium tracking-tight mt-1">Vendas</h1>
          <p className="text-muted text-sm mt-1">Registro de vendas com baixa de estoque e lançamento no caixa</p>
        </div>
        <Button>
          <Icon name="plus" size={16} />
          Nova venda
        </Button>
      </div>
      <div className="py-12 text-center text-muted border border-dashed border-line rounded-xl">
        <Icon name="cart" size={32} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Nenhuma venda registrada</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Adicionar a rota no App**

Em `frontend/src/App.tsx`, adicionar o import junto aos outros imports de estoque:

```tsx
import { EstVendas } from '@/pages/estoque/Vendas'
```

E adicionar a rota dentro do bloco `<Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>`, logo após a linha `<Route path="/estoque" element={<EstEstoque />} />`:

```tsx
        <Route path="/estoque/vendas" element={<EstVendas />} />
```

- [ ] **Step 4: Adicionar o item de nav**

Em `frontend/src/components/layout/Layout.tsx`, no array `EST_NAV` (linhas 20-30), inserir o item de Vendas como **segundo** item (logo após `estoque`):

```tsx
const EST_NAV = [
  { id: 'estoque', label: 'Estoque', icon: 'box', path: '/estoque' },
  { id: 'vendas', label: 'Vendas', icon: 'cart', path: '/estoque/vendas' },
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

- [ ] **Step 5: Verificar build/typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/shared/Icon.tsx frontend/src/components/layout/Layout.tsx frontend/src/App.tsx frontend/src/pages/estoque/Vendas.tsx
git commit -m "feat(vendas): scaffolding (icone cart, nav, rota e pagina minima)"
```

---

## Task 5: NovaVendaModal (multi-item, prévia ao vivo, submit via RPC)

**Files:**
- Create: `frontend/src/pages/estoque/vendas/NovaVendaModal.tsx`

Componente central, auto-contido (importa só `lib/vendas`, `supabase`, `FormControls`, `Modal`, `Icon`). Reaproveita o padrão de editor multi-item de `NovoPedidoModal`. Cada linha é produto **ou** decant. A prévia usa `resumoVenda`. O submit chama a RPC `registrar_venda`.

- [ ] **Step 1: Criar o componente**

Create `frontend/src/pages/estoque/vendas/NovaVendaModal.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { Icon } from '@/components/shared/Icon'
import { formatBRL } from '@/lib/utils'
import { resumoVenda, custoDecantUnitario, type ItemVenda } from '@/lib/vendas'

interface Canal { id: string; nome: string; taxa_padrao: number }
interface ProdutoOpt { id: string; nome: string; estoque_atual: number; custo_medio: number | null; preco_referencia: number | null }
interface FrascoOpt { id: string; produto_id: string; ml_restante: number; ml_total: number; produtos: { nome: string; custo_medio: number | null } | null }
interface Embalagem { tamanho_ml: number; custo: number }

interface LinhaForm {
  tipo: 'produto' | 'decant'
  produto_id: string   // produto (tipo=produto)
  frasco_id: string    // frasco (tipo=decant)
  ml: string
  quantidade: string
  preco: string
  custo_embalagem: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

const LINHA_VAZIA: LinhaForm = {
  tipo: 'produto', produto_id: '', frasco_id: '', ml: '5', quantidade: '1', preco: '', custo_embalagem: '0',
}

export function NovaVendaModal({ open, onClose, onSaved }: Props) {
  const { user } = useAuth()
  const [canais, setCanais] = useState<Canal[]>([])
  const [produtos, setProdutos] = useState<ProdutoOpt[]>([])
  const [frascos, setFrascos] = useState<FrascoOpt[]>([])
  const [embalagens, setEmbalagens] = useState<Embalagem[]>([])

  const [canalId, setCanalId] = useState('')
  const [dataVenda, setDataVenda] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [cliente, setCliente] = useState('')
  const [taxa, setTaxa] = useState('')
  const [frete, setFrete] = useState('')
  const [linhas, setLinhas] = useState<LinhaForm[]>([{ ...LINHA_VAZIA }])
  const [submitting, setSubmitting] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setErro(null)
    setCanalId(''); setDataVenda(''); setFormaPagamento(''); setCliente('')
    setTaxa(''); setFrete(''); setLinhas([{ ...LINHA_VAZIA }])
    Promise.all([
      supabase.from('canais').select('id, nome, taxa_padrao').eq('ativo', true).order('nome'),
      supabase.from('produtos').select('id, nome, estoque_atual, custo_medio, preco_referencia').order('nome'),
      supabase.from('frascos_abertos').select('id, produto_id, ml_restante, ml_total, produtos(nome, custo_medio)').eq('status', 'ativo'),
      supabase.from('embalagens_decant').select('tamanho_ml, custo').eq('ativo', true),
    ]).then(([c, p, f, e]) => {
      setCanais((c.data as Canal[]) || [])
      setProdutos((p.data as ProdutoOpt[]) || [])
      setFrascos((f.data as FrascoOpt[]) || [])
      setEmbalagens((e.data as Embalagem[]) || [])
    })
  }, [open])

  function setLinha(index: number, patch: Partial<LinhaForm>) {
    setLinhas(prev => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function brutoTotal(): number {
    return linhas.reduce((acc, l) => acc + (Number(l.preco) || 0) * (Number(l.quantidade) || 0), 0)
  }

  // Quando troca o canal, pré-preenche a taxa = taxa_padrao% do bruto atual
  function onCanalChange(id: string) {
    setCanalId(id)
    const canal = canais.find(c => c.id === id)
    if (canal && taxa === '') {
      const bruto = brutoTotal()
      if (bruto > 0) setTaxa(((bruto * canal.taxa_padrao) / 100).toFixed(2))
    }
  }

  function custoUnitarioDaLinha(l: LinhaForm): number {
    if (l.tipo === 'produto') {
      const p = produtos.find(x => x.id === l.produto_id)
      return p?.custo_medio ?? 0
    }
    const f = frascos.find(x => x.id === l.frasco_id)
    if (!f) return 0
    return custoDecantUnitario(Number(l.ml) || 0, f.produtos?.custo_medio ?? 0, f.ml_total)
  }

  function linhaParaItem(l: LinhaForm): ItemVenda {
    return {
      tipo: l.tipo,
      quantidade: Number(l.quantidade) || 0,
      precoUnitario: Number(l.preco) || 0,
      custoUnitario: custoUnitarioDaLinha(l),
      custoEmbalagem: l.tipo === 'decant' ? (Number(l.custo_embalagem) || 0) : 0,
    }
  }

  const itensPreview = linhas
    .filter(l => (l.tipo === 'produto' ? l.produto_id : l.frasco_id) && Number(l.preco) > 0)
    .map(linhaParaItem)
  const resumo = resumoVenda(itensPreview, Number(taxa) || 0, Number(frete) || 0)

  function estoqueDisponivel(l: LinhaForm): string {
    if (l.tipo === 'produto') {
      const p = produtos.find(x => x.id === l.produto_id)
      return p ? `${p.estoque_atual} un.` : ''
    }
    const f = frascos.find(x => x.id === l.frasco_id)
    return f ? `${f.ml_restante} ml` : ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setErro(null)
    if (!canalId) { setErro('Selecione o canal'); return }
    const validas = linhas.filter(l =>
      (l.tipo === 'produto' ? l.produto_id : l.frasco_id) && Number(l.quantidade) >= 1 && Number(l.preco) >= 0 && l.preco !== ''
    )
    if (validas.length === 0) { setErro('Adicione ao menos um item válido (produto/frasco e preço)'); return }
    if (validas.length !== linhas.filter(l => l.produto_id || l.frasco_id || l.preco).length) {
      setErro('Há linhas incompletas — preencha produto/frasco e preço, ou remova a linha'); return
    }

    const itens = validas.map(l => ({
      tipo: l.tipo,
      produto_id: l.tipo === 'produto'
        ? l.produto_id
        : frascos.find(f => f.id === l.frasco_id)?.produto_id,
      frasco_id: l.tipo === 'decant' ? l.frasco_id : null,
      ml: l.tipo === 'decant' ? Number(l.ml) : null,
      quantidade: Number(l.quantidade),
      preco_unitario: Number(l.preco) || 0,
      custo_embalagem: l.tipo === 'decant' ? (Number(l.custo_embalagem) || 0) : 0,
    }))

    setSubmitting(true)
    const { error } = await supabase.rpc('registrar_venda', {
      p_canal_id: canalId,
      p_data_venda: dataVenda || null,
      p_forma_pagamento: formaPagamento || null,
      p_cliente: cliente || null,
      p_taxa_total: Number(taxa) || 0,
      p_frete: Number(frete) || 0,
      p_responsavel: user?.email || null,
      p_observacao: null,
      p_itens: itens,
    })
    setSubmitting(false)
    if (error) { setErro(error.message); return }
    onSaved()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova venda" size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Canal"
            options={canais.map(c => ({ value: c.id, label: `${c.nome} (${c.taxa_padrao}%)` }))}
            value={canalId}
            onChange={(e) => onCanalChange(e.target.value)}
            required
          />
          <Input label="Data da venda" type="date" value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Forma de pagamento" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} placeholder="Pix, Cartão…" />
          <Input label="Cliente (opcional)" value={cliente} onChange={(e) => setCliente(e.target.value)} />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[.08em] text-muted">Itens</span>

          {linhas.map((l, i) => (
            <div key={i} className="flex flex-col gap-2 p-3 border border-line rounded-lg">
              <div className="flex items-center gap-2">
                <Select
                  label="Tipo"
                  options={[{ value: 'produto', label: 'Produto (frasco cheio)' }, { value: 'decant', label: 'Decant' }]}
                  value={l.tipo}
                  onChange={(e) => setLinha(i, { tipo: e.target.value as 'produto' | 'decant', produto_id: '', frasco_id: '' })}
                />
                <span className="text-xs text-muted pb-2.5 ml-auto">{estoqueDisponivel(l)}</span>
                <button
                  type="button"
                  onClick={() => setLinhas(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev)}
                  className="pb-2.5 text-muted hover:text-down cursor-pointer"
                  title="Remover item"
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>

              {l.tipo === 'produto' ? (
                <div className="grid grid-cols-[1fr_70px_110px] gap-2 items-end">
                  <Select
                    label="Produto"
                    options={produtos.map(p => ({ value: p.id, label: p.nome }))}
                    value={l.produto_id}
                    onChange={(e) => {
                      const p = produtos.find(x => x.id === e.target.value)
                      setLinha(i, { produto_id: e.target.value, preco: l.preco || (p?.preco_referencia != null ? String(p.preco_referencia) : '') })
                    }}
                  />
                  <Input label="Qtd" type="number" min="1" value={l.quantidade} onChange={(e) => setLinha(i, { quantidade: e.target.value })} />
                  <Input label="Preço un." type="number" step="0.01" min="0" value={l.preco} onChange={(e) => setLinha(i, { preco: e.target.value })} />
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_60px_70px_100px] gap-2 items-end">
                  <Select
                    label="Frasco aberto"
                    options={frascos.map(f => ({ value: f.id, label: `${f.produtos?.nome} (${f.ml_restante}ml)` }))}
                    value={l.frasco_id}
                    onChange={(e) => setLinha(i, { frasco_id: e.target.value })}
                  />
                  <Input
                    label="ml"
                    type="number" min="1"
                    value={l.ml}
                    onChange={(e) => {
                      const emb = embalagens.find(x => x.tamanho_ml === Number(e.target.value))
                      setLinha(i, { ml: e.target.value, custo_embalagem: emb ? String(emb.custo) : l.custo_embalagem })
                    }}
                  />
                  <Input label="Preço" type="number" step="0.01" min="0" value={l.preco} onChange={(e) => setLinha(i, { preco: e.target.value })} />
                  <Input label="Emb. (R$)" type="number" step="0.01" min="0" value={l.custo_embalagem} onChange={(e) => setLinha(i, { custo_embalagem: e.target.value })} />
                </div>
              )}
            </div>
          ))}

          <Button type="button" variant="secondary" size="sm" className="self-start"
            onClick={() => setLinhas(prev => [...prev, { ...LINHA_VAZIA }])}>
            <Icon name="plus" size={14} />
            Adicionar item
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Taxa do pedido (R$)" type="number" step="0.01" min="0" value={taxa} onChange={(e) => setTaxa(e.target.value)} />
          <Input label="Frete absorvido (R$)" type="number" step="0.01" min="0" value={frete} onChange={(e) => setFrete(e.target.value)} />
        </div>

        {/* Prévia ao vivo */}
        <div className="flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><span className="text-muted">Bruto</span><span className="font-mono">{formatBRL(resumo.totalBruto)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Custo</span><span className="font-mono">{formatBRL(resumo.totalCusto)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Receita líquida</span><span className="font-mono">{formatBRL(resumo.receitaLiquida)}</span></div>
          <div className="flex justify-between text-base">
            <span>Lucro</span>
            <span className={`font-mono ${resumo.lucroBruto < 0 ? 'text-down' : 'text-up'}`}>
              {formatBRL(resumo.lucroBruto)} · ROI {resumo.roi === null ? '—' : `${(resumo.roi * 100).toFixed(0)}%`} · Margem {(resumo.margem * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {erro && (
          <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting}>{submitting ? 'Registrando...' : 'Registrar venda'}</Button>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros (o componente é auto-contido; a página de Vendas da Task 4 ainda não o importa).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/estoque/vendas/NovaVendaModal.tsx
git commit -m "feat(vendas): modal de nova venda (multi-item, previa ao vivo, RPC registrar_venda)"
```

---

## Task 6: VendaDetalheModal (itens, custos e lançamentos vinculados)

**Files:**
- Create: `frontend/src/pages/estoque/vendas/VendaDetalheModal.tsx`

Auto-contido: define seu próprio tipo de prop (`VendaResumo`) em vez de importar da página de lista (que só é criada na Task 7). A `VendaRow` da lista é estruturalmente compatível com `VendaResumo`, então a lista pode passar a venda direto.

- [ ] **Step 1: Criar o componente**

Create `frontend/src/pages/estoque/vendas/VendaDetalheModal.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/shared/Modal'
import { formatBRL } from '@/lib/utils'

export interface VendaResumo {
  id: string
  numero: number
  total_bruto: number
  total_custo: number
  lucro_bruto: number
}

interface ItemDetalhe {
  id: string
  tipo: 'produto' | 'decant'
  ml: number | null
  quantidade: number
  preco_unitario: number
  custo_unitario: number
  custo_embalagem: number
  taxa_rateada: number
  frete_rateado: number
  lucro: number
  produtos: { nome: string } | null
}

interface Props {
  venda: VendaResumo | null
  onClose: () => void
}

export function VendaDetalheModal({ venda, onClose }: Props) {
  const [itens, setItens] = useState<ItemDetalhe[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!venda) { setItens([]); return }
    setLoading(true)
    supabase
      .from('venda_itens')
      .select('id, tipo, ml, quantidade, preco_unitario, custo_unitario, custo_embalagem, taxa_rateada, frete_rateado, lucro, produtos(nome)')
      .eq('venda_id', venda.id)
      .then(({ data }) => {
        setItens((data as ItemDetalhe[]) || [])
        setLoading(false)
      })
  }, [venda])

  return (
    <Modal open={!!venda} onClose={onClose} title={venda ? `Venda #${venda.numero}` : ''} size="lg">
      {loading ? (
        <p className="py-8 text-center text-muted">Carregando...</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="border border-line rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface">
                  <th className="text-left px-3 py-2 text-text-2 font-medium">Item</th>
                  <th className="text-right px-3 py-2 text-text-2 font-medium">Qtd</th>
                  <th className="text-right px-3 py-2 text-text-2 font-medium">Preço</th>
                  <th className="text-right px-3 py-2 text-text-2 font-medium">Custo</th>
                  <th className="text-right px-3 py-2 text-text-2 font-medium">Taxa+Frete</th>
                  <th className="text-right px-3 py-2 text-text-2 font-medium">Lucro</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => (
                  <tr key={it.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-medium">
                      {it.produtos?.nome || '—'}
                      {it.tipo === 'decant' && <span className="text-muted text-xs"> · {it.ml}ml</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{it.quantidade}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatBRL(it.preco_unitario)}</td>
                    <td className="px-3 py-2 text-right font-mono text-text-2">{formatBRL((it.custo_unitario + it.custo_embalagem) * it.quantidade)}</td>
                    <td className="px-3 py-2 text-right font-mono text-text-2">{formatBRL(it.taxa_rateada + it.frete_rateado)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${it.lucro < 0 ? 'text-down' : 'text-up'}`}>{formatBRL(it.lucro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {venda && (
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted">Bruto</span><span className="font-mono">{formatBRL(venda.total_bruto)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Custo</span><span className="font-mono">{formatBRL(venda.total_custo)}</span></div>
              <div className="flex justify-between text-base">
                <span>Lucro</span>
                <span className={`font-mono ${venda.lucro_bruto < 0 ? 'text-down' : 'text-up'}`}>{formatBRL(venda.lucro_bruto)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/estoque/vendas/VendaDetalheModal.tsx
git commit -m "feat(vendas): modal de detalhe da venda (itens, custos, lucro por item)"
```

---

## Task 7: Página de lista de Vendas (fetch + tabela + cancelamento)

**Files:**
- Modify: `frontend/src/pages/estoque/Vendas.tsx`
- Test: `frontend/src/pages/estoque/__tests__/Vendas.test.tsx`

Substitui a página mínima da Task 4 pela lista completa, importando os modais já criados nas Tasks 5 e 6.

- [ ] **Step 1: Escrever o teste de componente que falha**

Create `frontend/src/pages/estoque/__tests__/Vendas.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { EstVendas, type VendaRow } from '../Vendas'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'teste@horus.com' }, signOut: vi.fn() }),
}))

const mockVendas: VendaRow[] = [
  {
    id: 'v1', numero: 1, status: 'concluida', data_venda: '2026-06-16',
    total_bruto: 240, total_custo: 132, lucro_bruto: 78,
    canal_id: 'c1', canais: { nome: 'Shopee' },
    venda_itens: [{ id: 'it1' }, { id: 'it2' }],
  },
  {
    id: 'v2', numero: 2, status: 'cancelada', data_venda: '2026-06-15',
    total_bruto: 100, total_custo: 60, lucro_bruto: 40,
    canal_id: 'c2', canais: { nome: 'Loja física' },
    venda_itens: [{ id: 'it3' }],
  },
]

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: mockVendas, error: null })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  },
}))

describe('EstVendas (lista)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renderiza as vendas com canal, lucro e status', async () => {
    render(<MemoryRouter><EstVendas /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Shopee')).toBeInTheDocument())
    expect(screen.getByText('Loja física')).toBeInTheDocument()
    expect(screen.getByText('R$ 78,00')).toBeInTheDocument()
    expect(screen.getByText('Cancelada')).toBeInTheDocument()
  })

  it('renderiza o botão "Nova venda"', () => {
    render(<MemoryRouter><EstVendas /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /nova venda/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd frontend && npx vitest run src/pages/estoque/__tests__/Vendas.test.tsx`
Expected: FAIL — `EstVendas` não exporta `VendaRow` / textos não encontrados (a página ainda é a mínima da Task 4).

- [ ] **Step 3: Implementar a lista completa**

Replace todo o conteúdo de `frontend/src/pages/estoque/Vendas.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Button } from '@/components/shared/FormControls'
import { Modal } from '@/components/shared/Modal'
import { formatBRL } from '@/lib/utils'
import { NovaVendaModal } from './vendas/NovaVendaModal'
import { VendaDetalheModal } from './vendas/VendaDetalheModal'

export interface VendaRow {
  id: string
  numero: number
  status: 'concluida' | 'cancelada'
  data_venda: string
  total_bruto: number
  total_custo: number
  lucro_bruto: number
  canal_id: string
  canais: { nome: string } | null
  venda_itens: { id: string }[]
}

const STATUS_BADGE: Record<VendaRow['status'], { label: string; cls: string }> = {
  concluida: { label: 'Concluída', cls: 'bg-up/15 text-up' },
  cancelada: { label: 'Cancelada', cls: 'bg-line text-muted' },
}

function pct(roi: number | null): string {
  if (roi === null) return '—'
  return `${(roi * 100).toFixed(0)}%`
}

export function EstVendas() {
  const navigate = useNavigate()
  const [vendas, setVendas] = useState<VendaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [novoOpen, setNovoOpen] = useState(false)
  const [detalhe, setDetalhe] = useState<VendaRow | null>(null)
  const [cancelando, setCancelando] = useState<VendaRow | null>(null)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('vendas')
      .select('id, numero, status, data_venda, total_bruto, total_custo, lucro_bruto, canal_id, canais(nome), venda_itens(id)')
      .order('created_at', { ascending: false })
    if (error) console.error('Erro ao carregar vendas:', error)
    setVendas((data as VendaRow[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function formatDate(iso: string) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  async function confirmarCancelamento() {
    if (!cancelando || cancelSubmitting) return
    setCancelSubmitting(true)
    setErro(null)
    const { error } = await supabase.rpc('cancelar_venda', { p_venda_id: cancelando.id })
    setCancelSubmitting(false)
    if (error) { setErro(error.message); return }
    setCancelando(null)
    fetchData()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Estoque / Vendas</p>
          <h1 className="text-3xl font-medium tracking-tight mt-1">Vendas</h1>
          <p className="text-muted text-sm mt-1">Registro de vendas com baixa de estoque e lançamento no caixa</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => navigate('/estoque/vendas/config')}>
            <Icon name="filter" size={16} />
            Canais e embalagens
          </Button>
          <Button onClick={() => setNovoOpen(true)}>
            <Icon name="plus" size={16} />
            Nova venda
          </Button>
        </div>
      </div>

      {erro && (
        <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>
      )}

      <div className="border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="text-left px-4 py-3 text-text-2 font-medium">Nº</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Data</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Canal</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Itens</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Bruto</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Lucro</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">ROI</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
            ) : vendas.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">Nenhuma venda registrada</td></tr>
            ) : (
              vendas.map((v) => {
                const badge = STATUS_BADGE[v.status]
                const roiV = v.total_custo > 0 ? v.lucro_bruto / v.total_custo : null
                return (
                  <tr
                    key={v.id}
                    className="border-b border-line last:border-0 hover:bg-surface-2/50 cursor-pointer"
                    onClick={() => setDetalhe(v)}
                  >
                    <td className="px-4 py-3 font-mono text-muted">#{v.numero}</td>
                    <td className="px-4 py-3 text-text-2 text-xs">{formatDate(v.data_venda)}</td>
                    <td className="px-4 py-3 font-medium">{v.canais?.nome || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">{v.venda_itens.length}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatBRL(v.total_bruto)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${v.lucro_bruto < 0 ? 'text-down' : 'text-up'}`}>
                      {formatBRL(v.lucro_bruto)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text-2">{pct(roiV)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {v.status === 'concluida' && (
                        <Button size="sm" variant="ghost" onClick={() => setCancelando(v)}>
                          Cancelar
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <NovaVendaModal open={novoOpen} onClose={() => setNovoOpen(false)} onSaved={fetchData} />
      <VendaDetalheModal venda={detalhe} onClose={() => setDetalhe(null)} />

      <Modal open={!!cancelando} onClose={() => setCancelando(null)} title="Cancelar venda" size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-2">
            Cancelar a venda <span className="font-mono">#{cancelando?.numero}</span>? O estoque é devolvido,
            os decants são estornados e os lançamentos no caixa são removidos. A venda não pode ser reaberta.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setCancelando(null)}>Voltar</Button>
            <Button variant="danger" disabled={cancelSubmitting} onClick={confirmarCancelamento}>
              {cancelSubmitting ? 'Cancelando...' : 'Cancelar venda'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd frontend && npx vitest run src/pages/estoque/__tests__/Vendas.test.tsx`
Expected: PASS (2 testes). Os modais ficam fechados (`open=false`/`venda=null`), então não disparam chamadas extras ao supabase no teste.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/estoque/Vendas.tsx frontend/src/pages/estoque/__tests__/Vendas.test.tsx
git commit -m "feat(vendas): pagina de lista com detalhe e cancelamento via RPC"
```

---

## Task 8: VendasConfig (CRUD de canais e embalagens de decant)

**Files:**
- Create: `frontend/src/pages/estoque/vendas/VendasConfig.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Conferir se `Input` aceita `className`**

Abrir `frontend/src/components/shared/FormControls.tsx` e verificar se o componente `Input` repassa `className` para o wrapper. Se **não** aceitar, nos campos estreitos abaixo (`w-24`, `w-28`, `w-32`) envolva o `Input` num `<div className="w-24">…</div>` em vez de passar `className` direto. Use o resultado dessa checagem ao escrever o componente no Step 2.

- [ ] **Step 2: Criar a página de configuração**

Create `frontend/src/pages/estoque/vendas/VendasConfig.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Button, Input } from '@/components/shared/FormControls'

interface Canal { id: string; nome: string; taxa_padrao: number; ativo: boolean }
interface Embalagem { id: string; tamanho_ml: number; custo: number; ativo: boolean }

export function VendasConfig() {
  const navigate = useNavigate()
  const [canais, setCanais] = useState<Canal[]>([])
  const [embalagens, setEmbalagens] = useState<Embalagem[]>([])
  const [novoCanal, setNovoCanal] = useState({ nome: '', taxa: '' })
  const [novaEmb, setNovaEmb] = useState({ tamanho: '', custo: '' })
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const [c, e] = await Promise.all([
      supabase.from('canais').select('*').order('nome'),
      supabase.from('embalagens_decant').select('*').order('tamanho_ml'),
    ])
    setCanais((c.data as Canal[]) || [])
    setEmbalagens((e.data as Embalagem[]) || [])
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function addCanal() {
    if (!novoCanal.nome.trim()) return
    const { error } = await supabase.from('canais').insert({
      nome: novoCanal.nome.trim(),
      taxa_padrao: Number(novoCanal.taxa) || 0,
    })
    if (error) { setErro(error.message); return }
    setNovoCanal({ nome: '', taxa: '' }); setErro(null); carregar()
  }

  async function updateCanalTaxa(id: string, taxa: number) {
    await supabase.from('canais').update({ taxa_padrao: taxa }).eq('id', id)
    carregar()
  }

  async function toggleCanal(id: string, ativo: boolean) {
    await supabase.from('canais').update({ ativo }).eq('id', id)
    carregar()
  }

  async function addEmbalagem() {
    if (!novaEmb.tamanho) return
    const { error } = await supabase.from('embalagens_decant').insert({
      tamanho_ml: Number(novaEmb.tamanho),
      custo: Number(novaEmb.custo) || 0,
    })
    if (error) { setErro(error.message); return }
    setNovaEmb({ tamanho: '', custo: '' }); setErro(null); carregar()
  }

  async function updateEmbCusto(id: string, custo: number) {
    await supabase.from('embalagens_decant').update({ custo }).eq('id', id)
    carregar()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/estoque/vendas')} className="text-muted hover:text-gold cursor-pointer">
          <Icon name="chevron" size={18} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Estoque / Vendas</p>
          <h1 className="text-2xl font-medium tracking-tight">Canais e embalagens</h1>
        </div>
      </div>

      {erro && (
        <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>
      )}

      {/* Canais */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-[.08em] text-muted">Canais de venda</h2>
        <div className="flex flex-col gap-2">
          {canais.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3 border border-line rounded-lg">
              <span className={`flex-1 font-medium ${!c.ativo ? 'text-muted line-through' : ''}`}>{c.nome}</span>
              <div className="flex items-center gap-1">
                <div className="w-24">
                  <Input
                    label="" type="number" step="0.01" min="0"
                    value={String(c.taxa_padrao)}
                    onChange={(e) => updateCanalTaxa(c.id, Number(e.target.value) || 0)}
                  />
                </div>
                <span className="text-muted text-sm">%</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => toggleCanal(c.id, !c.ativo)}>
                {c.ativo ? 'Desativar' : 'Ativar'}
              </Button>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2 p-3 border border-dashed border-gold-line rounded-lg">
          <Input label="Novo canal" value={novoCanal.nome} onChange={(e) => setNovoCanal({ ...novoCanal, nome: e.target.value })} />
          <div className="w-28">
            <Input label="Taxa %" type="number" step="0.01" min="0" value={novoCanal.taxa} onChange={(e) => setNovoCanal({ ...novoCanal, taxa: e.target.value })} />
          </div>
          <Button type="button" size="sm" onClick={addCanal}>Adicionar</Button>
        </div>
      </section>

      {/* Embalagens */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-[.08em] text-muted">Embalagens de decant (custo do insumo)</h2>
        <div className="flex flex-col gap-2">
          {embalagens.map((e) => (
            <div key={e.id} className="flex items-center gap-3 p-3 border border-line rounded-lg">
              <span className="flex-1 font-medium">{e.tamanho_ml} ml</span>
              <div className="flex items-center gap-1">
                <span className="text-muted text-sm">R$</span>
                <div className="w-24">
                  <Input
                    label="" type="number" step="0.01" min="0"
                    value={String(e.custo)}
                    onChange={(ev) => updateEmbCusto(e.id, Number(ev.target.value) || 0)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2 p-3 border border-dashed border-gold-line rounded-lg">
          <div className="w-32">
            <Input label="Tamanho (ml)" type="number" min="1" value={novaEmb.tamanho} onChange={(e) => setNovaEmb({ ...novaEmb, tamanho: e.target.value })} />
          </div>
          <div className="w-28">
            <Input label="Custo R$" type="number" step="0.01" min="0" value={novaEmb.custo} onChange={(e) => setNovaEmb({ ...novaEmb, custo: e.target.value })} />
          </div>
          <Button type="button" size="sm" onClick={addEmbalagem}>Adicionar</Button>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Adicionar a rota**

Em `frontend/src/App.tsx`, adicionar o import:

```tsx
import { VendasConfig } from '@/pages/estoque/vendas/VendasConfig'
```

E a rota, logo após `<Route path="/estoque/vendas" element={<EstVendas />} />`:

```tsx
        <Route path="/estoque/vendas/config" element={<VendasConfig />} />
```

- [ ] **Step 4: Verificar typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/estoque/vendas/VendasConfig.tsx frontend/src/App.tsx
git commit -m "feat(vendas): pagina de config de canais e embalagens de decant"
```

---

## Task 9: Campo preço de referência no formulário de Produtos

**Files:**
- Modify: `frontend/src/pages/estoque/Produtos.tsx`

- [ ] **Step 1: Ler o arquivo e localizar o formulário**

Abrir `frontend/src/pages/estoque/Produtos.tsx`. Localizar: (a) a interface/estado do formulário (procurar onde `volume_ml`/`estoque_minimo` são montados no `form`/`useState`), (b) o JSX do input de `volume_ml`, e (c) o `insert`/`update` do produto no Supabase. As edições abaixo se ancoram nesses pontos.

- [ ] **Step 2: Adicionar `preco_referencia` ao estado do formulário**

No objeto de estado inicial do formulário (onde estão `nome`, `volume_ml`, `estoque_minimo` etc.), adicionar o campo:

```tsx
preco_referencia: '',
```

E, ao abrir o modal de edição (onde o form é populado a partir do produto selecionado), incluir:

```tsx
preco_referencia: produto.preco_referencia != null ? String(produto.preco_referencia) : '',
```

- [ ] **Step 3: Adicionar o input no JSX**

Logo após o input de `volume_ml`, adicionar:

```tsx
<Input
  label="Preço de referência (R$)"
  type="number" step="0.01" min="0"
  value={form.preco_referencia}
  onChange={(e) => setForm({ ...form, preco_referencia: e.target.value })}
/>
```

- [ ] **Step 4: Incluir no insert/update e na tipagem**

No payload enviado ao Supabase (`.insert({...})` e/ou `.update({...})` de `produtos`), adicionar:

```tsx
preco_referencia: form.preco_referencia ? Number(form.preco_referencia) : null,
```

E, se houver uma interface `Produto` local no arquivo, adicionar a propriedade:

```tsx
preco_referencia: number | null
```

- [ ] **Step 5: Verificar typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/estoque/Produtos.tsx
git commit -m "feat(produtos): campo preco de referencia (pre-preenche o preco na venda)"
```

---

## Task 10: Marcar transações geradas por venda no Financeiro

**Files:**
- Modify: `frontend/src/pages/financeiro/Transacoes.tsx`

A tela de Transações hoje é só inserção+lista (não há edição/exclusão de linha), então a "proteção" das linhas de venda é visual: um badge indicando a origem, para deixar claro que vieram de uma venda.

- [ ] **Step 1: Incluir `origem` na interface e na query**

Em `frontend/src/pages/financeiro/Transacoes.tsx`, adicionar à interface `Transacao`:

```tsx
  origem?: string
```

A query já usa `select('*')`, então `origem` virá automaticamente — nenhuma mudança na chamada.

- [ ] **Step 2: Adicionar o badge na coluna Descrição**

No `<td>` da descrição (onde hoje há `{t.descricao}`), trocar por:

```tsx
<td className="px-4 py-3 font-medium">
  {t.descricao}
  {t.origem === 'venda' && (
    <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[0.6rem] font-medium bg-gold-dim text-gold align-middle">
      venda
    </span>
  )}
</td>
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/financeiro/Transacoes.tsx
git commit -m "feat(financeiro): badge nas transacoes geradas por venda"
```

---

## Task 11: Documentação (PRD, BANCO, HANDOFF, LOGS)

**Files:**
- Modify: `docs/PRD.md:39`
- Modify: `docs/BANCO.md`
- Modify: `docs/HANDOFF_IA.md`
- Modify: `docs/LOGS.md`

- [ ] **Step 1: Atualizar a Regra de Negócio #1 no PRD**

Em `docs/PRD.md`, substituir a regra #1 atual:

```markdown
1. **Áreas independentes** — Financeiro e Estoque não têm vínculo direto entre si (não desconta automaticamente do financeiro ao registrar saída de estoque)
```

por:

```markdown
1. **Integração via Vendas** — o módulo de Vendas vincula Estoque e Financeiro: registrar uma venda baixa o estoque (frasco cheio ou ml de decant) e lança automaticamente no caixa (receita + taxa + frete). Lançamentos manuais no Financeiro (compra de insumos, infraestrutura) continuam independentes.
```

E no bloco "Fora de escopo", substituir:

```markdown
- Vendas diretas pelo sistema (é só controle, não PDV)
```

por:

```markdown
- PDV com captura de pagamento (o sistema registra vendas e seus efeitos em estoque/caixa, mas não processa pagamento)
```

- [ ] **Step 2: Documentar as tabelas novas no BANCO**

Em `docs/BANCO.md`, adicionar as seções das tabelas `canais`, `vendas`, `venda_itens`, `embalagens_decant` (no padrão das tabelas existentes), anotar as colunas novas em `produtos` (`preco_referencia`) e `transacoes` (`venda_id`, `origem`), e citar a migração `supabase/migrations/20260616_vendas.sql` com as RPCs `registrar_venda` e `cancelar_venda`. Adicionar à seção "Relações":

```
canais ←── vendas ←── venda_itens ──→ produtos
vendas ←── transacoes (origem='venda')
```

- [ ] **Step 3: Atualizar HANDOFF**

Em `docs/HANDOFF_IA.md`: atualizar a data/sessão no topo, adicionar um item na lista de "O que já foi feito" descrevendo o módulo de Vendas, e adicionar como **próximo passo imediato**:

```markdown
- **Aplicar migração `supabase/migrations/20260616_vendas.sql` no Supabase SQL Editor** (pendente — o módulo de Vendas não funciona sem isso)
- Dashboards de ROI/análise de vendas (os dados já são gerados e armazenados por venda/item)
```

- [ ] **Step 4: Registrar no LOGS**

Em `docs/LOGS.md`, prepend uma entrada de sessão com: criação do módulo de Vendas (tabelas, RPCs `registrar_venda`/`cancelar_venda`, `lib/vendas.ts` com testes, telas de lista/nova venda/detalhe/config, campo preço de referência, badge no financeiro), e a decisão de integração caixa (receita bruta + taxa/frete; custo do produto não relançado pra evitar dupla contagem).

- [ ] **Step 5: Commit**

```bash
git add docs/PRD.md docs/BANCO.md docs/HANDOFF_IA.md docs/LOGS.md
git commit -m "docs(vendas): atualiza PRD, BANCO, HANDOFF e LOGS para o modulo de Vendas"
```

---

## Verificação final (após todas as tasks)

- [ ] **Rodar a suíte de testes completa**

Run: `cd frontend && npx vitest run`
Expected: todos os testes passam (incluindo os novos de `vendas.test.ts` e `Vendas.test.tsx`).

- [ ] **Typecheck e build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: build sem erros.

- [ ] **Verificação manual no preview (após aplicar a migração no Supabase)**

1. Abrir `/estoque/vendas` → "Nova venda".
2. Registrar uma venda com 1 produto + 1 decant, taxa e frete → confirmar que a prévia mostra lucro/ROI/margem.
3. Confirmar → a venda aparece na lista; abrir o detalhe e conferir os valores.
4. Conferir em `/estoque` que o estoque do produto baixou e em `/estoque/decants` que o ml do frasco baixou.
5. Conferir em `/financeiro/transacoes` as linhas "Venda #N" (receita) e "Taxa/Frete — Venda #N" com o badge "venda".
6. Cancelar a venda → estoque/ml voltam, linhas de caixa somem, status vira "Cancelada".
```
