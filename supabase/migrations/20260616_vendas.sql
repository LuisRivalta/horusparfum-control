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
