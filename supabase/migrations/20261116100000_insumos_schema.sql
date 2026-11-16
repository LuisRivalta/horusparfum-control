-- supabase/migrations/20261116100000_insumos_schema.sql
-- Insumos (estoque de embalagem/etiqueta/etc.), listas de insumos, ml decimal,
-- origens do decant (frasco aberto + lacrado), custo de envio e RPCs de compra/acerto.

-- 1. ml decimal (numeric(6,1)) ---------------------------------
alter table public.decants           alter column ml          type numeric(6,1);
alter table public.venda_itens       alter column ml          type numeric(6,1);
alter table public.frascos_abertos   alter column ml_total    type numeric(6,1);
alter table public.frascos_abertos   alter column ml_restante type numeric(6,1);
alter table public.embalagens_decant alter column tamanho_ml  type numeric(6,1);

-- 2. Canais / vendas -------------------------------------------
alter table public.canais add column if not exists usa_envio boolean not null default true;
update public.canais set usa_envio = false where nome = 'Loja física';
alter table public.vendas add column if not exists custo_envio numeric(12,2) not null default 0;

-- 3. transacoes aceita origem 'insumo' --------------------------
alter table public.transacoes drop constraint if exists transacoes_origem_check;
alter table public.transacoes add constraint transacoes_origem_check
  check (origem in ('manual','venda','decant','conta','insumo'));

-- 4. Tabelas novas ----------------------------------------------
create table if not exists public.insumos (
  id             uuid          primary key default gen_random_uuid(),
  nome           text          not null unique,
  unidade        text          not null default 'un',
  estoque_atual  numeric(12,2) not null default 0,
  estoque_minimo numeric(12,2) not null default 0,
  custo_medio    numeric(12,4) not null default 0,
  ativo          boolean       not null default true,
  created_at     timestamptz   default now()
);

create table if not exists public.insumo_movimentacoes (
  id             uuid          primary key default gen_random_uuid(),
  insumo_id      uuid          not null references public.insumos(id) on delete restrict,
  tipo           text          not null check (tipo in ('compra','consumo','perda','acerto','estorno')),
  quantidade     numeric(12,2) not null, -- + entra, - sai
  custo_unitario numeric(12,4) not null default 0,
  venda_id       uuid          references public.vendas(id)  on delete set null,
  decant_id      uuid          references public.decants(id) on delete set null,
  responsavel    text,
  created_at     timestamptz   default now()
);
create index if not exists insumo_movimentacoes_insumo_idx
  on public.insumo_movimentacoes (insumo_id, created_at desc);

create table if not exists public.insumo_listas (
  id              uuid         primary key default gen_random_uuid(),
  tipo            text         not null check (tipo in ('decant','frasco','envio_decant','envio_frasco')),
  tamanho_ml      numeric(6,1),
  peso_g          int,
  altura_cm       numeric(6,1),
  largura_cm      numeric(6,1),
  comprimento_cm  numeric(6,1),
  created_at      timestamptz  default now(),
  check ((tipo = 'decant') = (tamanho_ml is not null))
);
create unique index if not exists insumo_listas_tipo_tamanho_uq
  on public.insumo_listas (tipo, coalesce(tamanho_ml, 0));

create table if not exists public.insumo_lista_itens (
  lista_id   uuid          not null references public.insumo_listas(id) on delete cascade,
  insumo_id  uuid          not null references public.insumos(id) on delete restrict,
  quantidade numeric(12,2) not null check (quantidade > 0),
  primary key (lista_id, insumo_id)
);

create table if not exists public.decant_origens (
  id           uuid          primary key default gen_random_uuid(),
  decant_id    uuid          not null references public.decants(id) on delete cascade,
  frasco_id    uuid          references public.frascos_abertos(id),
  produto_id   uuid          not null references public.produtos(id),
  ml           numeric(6,1)  not null check (ml > 0),
  custo        numeric(12,2) not null default 0,
  abriu_frasco boolean       not null default false
);
create index if not exists decant_origens_decant_idx on public.decant_origens (decant_id);

-- 5. RLS ---------------------------------------------------------
alter table public.insumos               enable row level security;
alter table public.insumo_movimentacoes  enable row level security;
alter table public.insumo_listas         enable row level security;
alter table public.insumo_lista_itens    enable row level security;
alter table public.decant_origens        enable row level security;

drop policy if exists "Acesso total autenticados" on public.insumos;
create policy "Acesso total autenticados" on public.insumos
  for all to authenticated using (true) with check (true);
drop policy if exists "Acesso total autenticados" on public.insumo_movimentacoes;
create policy "Acesso total autenticados" on public.insumo_movimentacoes
  for all to authenticated using (true) with check (true);
drop policy if exists "Acesso total autenticados" on public.insumo_listas;
create policy "Acesso total autenticados" on public.insumo_listas
  for all to authenticated using (true) with check (true);
drop policy if exists "Acesso total autenticados" on public.insumo_lista_itens;
create policy "Acesso total autenticados" on public.insumo_lista_itens
  for all to authenticated using (true) with check (true);
drop policy if exists "Acesso total autenticados" on public.decant_origens;
create policy "Acesso total autenticados" on public.decant_origens
  for all to authenticated using (true) with check (true);

-- 6. Seeds das listas (sem itens) --------------------------------
insert into public.insumo_listas (tipo, tamanho_ml)
select 'decant', v.t from (values (2.5), (5), (10)) v(t)
where not exists (
  select 1 from public.insumo_listas l where l.tipo = 'decant' and l.tamanho_ml = v.t
);

insert into public.insumo_listas (tipo)
select v.t from (values ('frasco'), ('envio_decant'), ('envio_frasco')) v(t)
where not exists (select 1 from public.insumo_listas l where l.tipo = v.t);

-- 7. RPC: acertar estoque ----------------------------------------
create or replace function public.acertar_estoque_insumo(
  p_insumo_id uuid, p_saldo_contado numeric, p_responsavel text
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_ins insumos%rowtype;
  v_dif numeric;
begin
  if p_saldo_contado is null or p_saldo_contado < 0 then
    raise exception 'Saldo contado inválido';
  end if;
  select * into v_ins from insumos where id = p_insumo_id for update;
  if not found then
    raise exception 'Insumo não encontrado';
  end if;

  v_dif := p_saldo_contado - v_ins.estoque_atual;
  if v_dif <> 0 then
    insert into insumo_movimentacoes (insumo_id, tipo, quantidade, custo_unitario, responsavel)
    values (p_insumo_id, case when v_dif < 0 then 'perda' else 'acerto' end,
            v_dif, v_ins.custo_medio, p_responsavel);
    update insumos set estoque_atual = p_saldo_contado where id = p_insumo_id;
  end if;

  return jsonb_build_object('estoque_atual', p_saldo_contado, 'diferenca', v_dif);
end;
$$;

-- 8. RPC: registrar compra de insumo -----------------------------
-- p_saldo_contado: contagem física antes da compra (null = confia no saldo do sistema).
create or replace function public.registrar_compra_insumo(
  p_insumo_id uuid, p_qtd numeric, p_valor_total numeric,
  p_saldo_contado numeric, p_forma_pagamento text, p_responsavel text
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_ins    insumos%rowtype;
  v_saldo  numeric;
  v_dif    numeric;
  v_novo   numeric;
  v_custo  numeric;
begin
  if p_qtd is null or p_qtd <= 0 then
    raise exception 'Quantidade deve ser maior que zero';
  end if;
  if p_valor_total is null or p_valor_total < 0 then
    raise exception 'Valor total inválido';
  end if;
  if p_saldo_contado is not null and p_saldo_contado < 0 then
    raise exception 'Saldo contado inválido';
  end if;

  select * into v_ins from insumos where id = p_insumo_id for update;
  if not found then
    raise exception 'Insumo não encontrado';
  end if;

  v_saldo := coalesce(p_saldo_contado, v_ins.estoque_atual);
  v_dif := v_saldo - v_ins.estoque_atual;
  if v_dif <> 0 then
    insert into insumo_movimentacoes (insumo_id, tipo, quantidade, custo_unitario, responsavel)
    values (p_insumo_id, case when v_dif < 0 then 'perda' else 'acerto' end,
            v_dif, v_ins.custo_medio, p_responsavel);
  end if;

  v_novo := v_saldo + p_qtd;
  v_custo := (v_saldo * v_ins.custo_medio + p_valor_total) / v_novo;

  insert into insumo_movimentacoes (insumo_id, tipo, quantidade, custo_unitario, responsavel)
  values (p_insumo_id, 'compra', p_qtd, p_valor_total / p_qtd, p_responsavel);

  update insumos set estoque_atual = v_novo, custo_medio = v_custo where id = p_insumo_id;

  insert into transacoes (descricao, tipo, valor, categoria, forma_pagamento, responsavel, origem)
  values ('Compra de insumo - ' || v_ins.nome, 'saida', p_valor_total, 'Insumos',
          nullif(p_forma_pagamento, ''), p_responsavel, 'insumo');

  return jsonb_build_object('estoque_atual', v_novo, 'custo_medio', v_custo, 'diferenca', v_dif);
end;
$$;
