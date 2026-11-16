-- supabase/migrations/20261116110000_insumos_rpcs.sql
-- Baixa de insumos e decant com várias origens (frasco aberto + lacrado) nas RPCs de
-- venda e de consumo de decant. ml passa a ser numeric (2,5 ml).
-- Pré-requisito: 20261116100000_insumos_schema.sql.

-- decants.frasco_id fica nulo só entre o insert do decant e a abertura do lacrado
-- (quando a primeira origem é 'abrir'); _consumir_origens preenche em seguida.
alter table public.decants alter column frasco_id drop not null;

-- Excluir um frasco aberto não pode esbarrar na origem de um decant de outro frasco.
alter table public.decant_origens drop constraint if exists decant_origens_frasco_id_fkey;
alter table public.decant_origens add constraint decant_origens_frasco_id_fkey
  foreign key (frasco_id) references public.frascos_abertos(id) on delete set null;

-- =============================================================
-- Helpers internos
-- =============================================================

-- Baixa uma lista [{insumo_id, quantidade}]. Estoque pode ficar negativo.
create or replace function public._baixar_insumos(
  p_itens jsonb, p_venda_id uuid, p_decant_id uuid, p_responsavel text
) returns numeric
language plpgsql
set search_path = public
as $$
declare
  v_it    jsonb;
  v_qtd   numeric;
  v_ins   insumos%rowtype;
  v_total numeric := 0;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    return 0;
  end if;

  for v_it in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_it->>'quantidade')::numeric;
    if v_qtd is null or v_qtd < 0 then
      raise exception 'Quantidade de insumo invalida';
    end if;
    continue when v_qtd = 0;

    select * into v_ins from insumos where id = (v_it->>'insumo_id')::uuid for update;
    if not found then raise exception 'Insumo nao encontrado'; end if;

    insert into insumo_movimentacoes
      (insumo_id, tipo, quantidade, custo_unitario, venda_id, decant_id, responsavel)
    values (v_ins.id, 'consumo', -v_qtd, v_ins.custo_medio, p_venda_id, p_decant_id, p_responsavel);
    update insumos set estoque_atual = estoque_atual - v_qtd where id = v_ins.id;

    v_total := v_total + v_qtd * v_ins.custo_medio;
  end loop;

  return round(v_total, 2);
end;
$$;

-- Estorna o saldo líquido (consumo − estornos já feitos) de cada insumo da venda/decant.
-- Chamar de novo não estorna duas vezes.
create or replace function public._estornar_insumos(p_venda_id uuid, p_decant_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select m.insumo_id, m.venda_id, m.decant_id,
           -sum(m.quantidade) as qtd,
           coalesce(sum(-m.quantidade * m.custo_unitario) filter (where m.tipo = 'consumo')
                    / nullif(sum(-m.quantidade) filter (where m.tipo = 'consumo'), 0), 0) as custo
    from insumo_movimentacoes m
    where m.tipo in ('consumo', 'estorno')
      and ((p_venda_id is not null and m.venda_id = p_venda_id)
           or (p_decant_id is not null and m.decant_id = p_decant_id))
    group by m.insumo_id, m.venda_id, m.decant_id
    having sum(m.quantidade) < 0
  loop
    insert into insumo_movimentacoes (insumo_id, tipo, quantidade, custo_unitario, venda_id, decant_id)
    values (r.insumo_id, 'estorno', r.qtd, round(r.custo, 4), r.venda_id, r.decant_id);
    update insumos set estoque_atual = estoque_atual + r.qtd where id = r.insumo_id;
  end loop;
end;
$$;

-- Cria o decant a partir da primeira origem. p_ml_esperado (opcional) tem que bater
-- com a soma das origens. decants.ml = soma das origens.
create or replace function public._novo_decant(p_origens jsonb, p_ml_esperado numeric)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_o      jsonb;
  v_frasco uuid;
  v_prod   uuid;
  v_ml     numeric;
  v_id     uuid;
begin
  if p_origens is null or jsonb_typeof(p_origens) <> 'array' or jsonb_array_length(p_origens) = 0 then
    raise exception 'Decant sem origens';
  end if;

  select coalesce(sum((o->>'ml')::numeric), 0) into v_ml from jsonb_array_elements(p_origens) o;
  if p_ml_esperado is not null and v_ml < p_ml_esperado then
    raise exception 'ml insuficiente nas origens: % de % ml', v_ml, p_ml_esperado;
  end if;
  if p_ml_esperado is not null and v_ml > p_ml_esperado then
    raise exception 'Origens somam % ml, mais que os % ml do item', v_ml, p_ml_esperado;
  end if;
  if v_ml <= 0 then raise exception 'ml invalido'; end if;

  v_o := p_origens->0;
  v_frasco := (v_o->>'frasco_id')::uuid;
  if v_frasco is not null then
    select produto_id into v_prod from frascos_abertos where id = v_frasco;
    if v_prod is null then raise exception 'Frasco nao encontrado'; end if;
  elsif v_o->>'abrir_produto_id' is not null then
    select id into v_prod from produtos where id = (v_o->>'abrir_produto_id')::uuid;
    if v_prod is null then raise exception 'Produto nao encontrado'; end if;
  else
    raise exception 'Origem invalida';
  end if;

  insert into decants (frasco_id, produto_id, ml) values (v_frasco, v_prod, v_ml)
  returning id into v_id;
  return v_id;
end;
$$;

-- Consome as origens em ordem. Devolve o custo do perfume (soma das origens).
create or replace function public._consumir_origens(
  p_origens jsonb, p_decant_id uuid, p_responsavel text default null
) returns numeric
language plpgsql
set search_path = public
as $$
declare
  v_o       jsonb;
  v_ml      numeric;
  v_frasco  frascos_abertos%rowtype;
  v_produto produtos%rowtype;
  v_novo_ml numeric;
  v_saldo   int;
  v_custo   numeric(12,2);
  v_total   numeric := 0;
begin
  if p_origens is null or jsonb_typeof(p_origens) <> 'array' or jsonb_array_length(p_origens) = 0 then
    raise exception 'Decant sem origens';
  end if;

  for v_o in select o from jsonb_array_elements(p_origens) with ordinality as t(o, n) order by n loop
    v_ml := (v_o->>'ml')::numeric;
    if v_ml is null or v_ml <= 0 then raise exception 'ml invalido'; end if;

    if v_o->>'frasco_id' is not null then
      select * into v_frasco from frascos_abertos where id = (v_o->>'frasco_id')::uuid for update;
      if not found then raise exception 'Frasco nao encontrado'; end if;
      if v_frasco.status <> 'ativo' then raise exception 'Frasco nao esta ativo'; end if;
      if v_frasco.ml_restante < v_ml then
        raise exception 'ml insuficiente no frasco: % disponiveis', v_frasco.ml_restante;
      end if;
      select * into v_produto from produtos where id = v_frasco.produto_id for update;

      v_custo := coalesce(round(v_ml * coalesce(v_produto.custo_medio, 0) / nullif(v_frasco.ml_total, 0), 2), 0);
      v_novo_ml := v_frasco.ml_restante - v_ml;
      update frascos_abertos set
        ml_restante = v_novo_ml,
        status = case when v_novo_ml <= 0 then 'esgotado' else 'ativo' end
      where id = v_frasco.id;

      insert into decant_origens (decant_id, frasco_id, produto_id, ml, custo, abriu_frasco)
      values (p_decant_id, v_frasco.id, v_frasco.produto_id, v_ml, v_custo, false);

    elsif v_o->>'abrir_produto_id' is not null then
      select * into v_produto from produtos where id = (v_o->>'abrir_produto_id')::uuid for update;
      if not found then raise exception 'Produto nao encontrado'; end if;
      if coalesce(v_produto.estoque_atual, 0) < 1 then
        raise exception 'Sem frasco lacrado de % em estoque', v_produto.nome;
      end if;
      if exists (select 1 from frascos_abertos where produto_id = v_produto.id and status = 'ativo') then
        raise exception 'Ainda ha frasco aberto de %: use-o antes de abrir outro', v_produto.nome;
      end if;
      if coalesce(v_produto.volume_ml, 0) <= 0 then
        raise exception 'Produto % sem volume cadastrado', v_produto.nome;
      end if;
      if v_produto.volume_ml < v_ml then
        raise exception 'ml insuficiente no frasco: % disponiveis', v_produto.volume_ml;
      end if;

      update produtos set estoque_atual = estoque_atual - 1 where id = v_produto.id
      returning estoque_atual into v_saldo;
      insert into movimentacoes (produto_id, tipo, quantidade, motivo, responsavel, saldo_resultante)
      values (v_produto.id, 'saida', 1, 'Abertura de frasco para decant', p_responsavel, v_saldo);

      v_novo_ml := v_produto.volume_ml - v_ml;
      insert into frascos_abertos (produto_id, ml_total, ml_restante, status)
      values (v_produto.id, v_produto.volume_ml, v_novo_ml,
              case when v_novo_ml <= 0 then 'esgotado' else 'ativo' end)
      returning * into v_frasco;

      v_custo := round(v_ml * coalesce(v_produto.custo_medio, 0) / v_frasco.ml_total, 2);
      insert into decant_origens (decant_id, frasco_id, produto_id, ml, custo, abriu_frasco)
      values (p_decant_id, v_frasco.id, v_produto.id, v_ml, v_custo, true);

      -- primeira origem foi 'abrir': o decant ainda não tinha frasco
      update decants set frasco_id = v_frasco.id where id = p_decant_id and frasco_id is null;
    else
      raise exception 'Origem invalida';
    end if;

    v_total := v_total + v_custo;
  end loop;

  return v_total;
end;
$$;

-- Devolve os ml de cada origem do decant. Decant antigo sem decant_origens: usa
-- decants.frasco_id/ml. Lacrado aberto nunca volta ao estoque; teto = ml_total.
create or replace function public._devolver_origens(p_decant_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  r       record;
  v_f     frascos_abertos%rowtype;
  v_ativo frascos_abertos%rowtype;
begin
  for r in
    select o.frasco_id, o.ml from decant_origens o
    where o.decant_id = p_decant_id and o.frasco_id is not null
    union all
    select d.frasco_id, d.ml from decants d
    where d.id = p_decant_id and d.frasco_id is not null
      and not exists (select 1 from decant_origens o where o.decant_id = p_decant_id)
  loop
    select * into v_f from frascos_abertos where id = r.frasco_id for update;
    continue when not found;

    if v_f.status <> 'ativo' then
      select * into v_ativo from frascos_abertos
      where produto_id = v_f.produto_id and status = 'ativo' for update;
      if found then
        v_f := v_ativo;
      end if;
    end if;

    update frascos_abertos set
      ml_restante = least(ml_restante + r.ml, ml_total),
      status = 'ativo'
    where id = v_f.id;
  end loop;
end;
$$;

-- =============================================================
-- Vendas
-- =============================================================

drop function if exists public.registrar_venda(uuid, date, text, text, numeric, numeric, text, text, jsonb);
drop function if exists public.registrar_venda(uuid, date, text, text, numeric, numeric, text, text, jsonb, text);

create or replace function public.registrar_venda(
  p_canal_id uuid,
  p_data_venda date,
  p_forma_pagamento text,
  p_cliente text,
  p_taxa_total numeric,
  p_frete numeric,
  p_responsavel text,
  p_observacao text,
  p_itens jsonb,
  p_titulo text default null,
  p_insumos_envio jsonb default '[]'
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_venda vendas%rowtype;
  v_entrada jsonb;
  v_tipo text;
  v_produto produtos%rowtype;
  v_decant decants%rowtype;
  v_origens jsonb;
  v_produto_id uuid;
  v_frasco_id uuid;
  v_qtd int;
  v_ml numeric;
  v_preco numeric(12,2);
  v_custo_emb numeric(12,2);
  v_custo_unit numeric(12,2);
  v_custo_origens numeric;
  v_bruto numeric(12,2);
  v_custo_total numeric(12,2);
  v_total_bruto numeric(12,2) := 0;
  v_total_custo numeric(12,2) := 0;
  v_custo_envio numeric(12,2);
  v_novo_estoque int;
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
  v_nome_venda text;
begin
  if p_canal_id is null then raise exception 'Canal é obrigatório'; end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Venda sem itens';
  end if;
  if v_taxa_total < 0 or v_frete < 0 then
    raise exception 'Taxa e frete não podem ser negativos';
  end if;

  insert into vendas (canal_id, data_venda, forma_pagamento, cliente,
                      taxa_total, frete, responsavel, observacao, status, titulo)
  values (p_canal_id, coalesce(p_data_venda, current_date), p_forma_pagamento, p_cliente,
          v_taxa_total, v_frete, p_responsavel, p_observacao, 'concluida', p_titulo)
  returning * into v_venda;

  v_nome_venda := coalesce(p_titulo, 'Venda #' || v_venda.numero);

  for v_entrada in select * from jsonb_array_elements(p_itens) loop
    v_tipo := v_entrada->>'tipo';
    v_qtd := coalesce((v_entrada->>'quantidade')::int, 1);
    v_preco := coalesce((v_entrada->>'preco_unitario')::numeric, 0);
    v_decant_id := null;
    v_frasco_id := null;
    v_ml := null;
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

      v_custo_unit := coalesce(
        (v_entrada->>'custo_unitario')::numeric,
        coalesce(v_produto.custo_medio, 0)
      );
      v_custo_emb := 0;
      v_novo_estoque := v_produto.estoque_atual - v_qtd;
      update produtos set estoque_atual = v_novo_estoque where id = v_produto.id;
      insert into movimentacoes (produto_id, tipo, quantidade, motivo, responsavel, saldo_resultante)
      values (v_produto.id, 'saida', v_qtd, v_nome_venda, p_responsavel, v_novo_estoque);
      v_produto_id := v_produto.id;

    elsif v_tipo = 'decant' then
      v_ml := (v_entrada->>'ml')::numeric;
      v_custo_emb := coalesce((v_entrada->>'custo_embalagem')::numeric, 0);
      if v_ml is null or v_ml <= 0 then raise exception 'ml inválido'; end if;
      if v_custo_emb < 0 then raise exception 'Custo de embalagem não pode ser negativo'; end if;

      -- sem 'origens' (frontend antigo): origem única = frasco_id com ml * quantidade
      v_origens := case when jsonb_typeof(v_entrada->'origens') = 'array' then v_entrada->'origens'
                        else jsonb_build_array(jsonb_build_object(
                               'frasco_id', v_entrada->'frasco_id', 'ml', v_ml * v_qtd)) end;
      v_decant_id := _novo_decant(v_origens, v_ml * v_qtd);
      v_custo_origens := _consumir_origens(v_origens, v_decant_id, p_responsavel);
      select * into v_decant from decants where id = v_decant_id;

      v_custo_unit := coalesce(
        (v_entrada->>'custo_unitario')::numeric,
        round(v_custo_origens / v_qtd, 2)
      );
      v_produto_id := v_decant.produto_id;
      v_frasco_id := v_decant.frasco_id;
    else
      raise exception 'Tipo de item inválido: %', v_tipo;
    end if;

    -- insumos do item: custo vira custo_embalagem (sem 'insumos', mantém o enviado)
    if jsonb_typeof(v_entrada->'insumos') = 'array' then
      v_custo_emb := round(
        _baixar_insumos(v_entrada->'insumos', v_venda.id, v_decant_id, p_responsavel) / v_qtd, 2);
    end if;

    v_bruto := round(v_preco * v_qtd, 2);
    v_custo_total := round((v_custo_unit + v_custo_emb) * v_qtd, 2);
    v_total_bruto := v_total_bruto + v_bruto;
    v_total_custo := v_total_custo + v_custo_total;

    insert into venda_itens (venda_id, tipo, produto_id, frasco_id, decant_id, ml, quantidade,
                             preco_unitario, custo_unitario, custo_embalagem)
    values (v_venda.id, v_tipo, v_produto_id, v_frasco_id, v_decant_id, v_ml,
            v_qtd, v_preco, v_custo_unit, v_custo_emb)
    returning id into v_item_id;

    v_item_ids := array_append(v_item_ids, v_item_id);
    v_brutos := array_append(v_brutos, v_bruto);
  end loop;

  v_custo_envio := _baixar_insumos(p_insumos_envio, v_venda.id, null, p_responsavel);

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
    custo_envio = v_custo_envio,
    lucro_bruto = round(v_total_bruto - v_taxa_total - v_frete - v_total_custo - v_custo_envio, 2)
  where id = v_venda.id;

  insert into transacoes (descricao, tipo, valor, categoria, forma_pagamento, responsavel, origem, venda_id)
  values (v_nome_venda, 'entrada', v_total_bruto, 'Vendas',
          p_forma_pagamento, p_responsavel, 'venda', v_venda.id);
  if v_taxa_total > 0 then
    insert into transacoes (descricao, tipo, valor, categoria, forma_pagamento, responsavel, origem, venda_id)
    values ('Taxa — ' || v_nome_venda, 'saida', v_taxa_total, 'Taxas marketplace',
            p_forma_pagamento, p_responsavel, 'venda', v_venda.id);
  end if;
  if v_frete > 0 then
    insert into transacoes (descricao, tipo, valor, categoria, forma_pagamento, responsavel, origem, venda_id)
    values ('Frete — ' || v_nome_venda, 'saida', v_frete, 'Frete',
            p_forma_pagamento, p_responsavel, 'venda', v_venda.id);
  end if;

  return jsonb_build_object('id', v_venda.id, 'numero', v_venda.numero, 'titulo', v_venda.titulo);
end;
$$;

create or replace function public.cancelar_venda(p_venda_id uuid)
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
  if not found then raise exception 'Venda nao encontrada'; end if;
  if v_venda.status = 'cancelada' then raise exception 'Venda ja esta cancelada'; end if;

  -- insumos de envio e dos itens (antes de apagar os decants, que zeram decant_id)
  perform _estornar_insumos(p_venda_id, null);

  for v_item in select * from venda_itens where venda_id = p_venda_id for update loop
    if v_item.tipo = 'produto' then
      update produtos set estoque_atual = coalesce(estoque_atual, 0) + v_item.quantidade
        where id = v_item.produto_id
        returning estoque_atual into v_novo_estoque;
      insert into movimentacoes (produto_id, tipo, quantidade, motivo, responsavel, saldo_resultante)
      values (v_item.produto_id, 'entrada', v_item.quantidade,
              'Estorno venda #' || v_venda.numero, v_venda.responsavel, v_novo_estoque);
    elsif v_item.tipo = 'decant' then
      if v_item.decant_id is not null then
        perform _devolver_origens(v_item.decant_id);
        perform _estornar_insumos(null, v_item.decant_id);

        update venda_itens
          set decant_id = null
          where id = v_item.id;

        delete from decants
          where id = v_item.decant_id;
      else
        -- item antigo sem decant vinculado
        update frascos_abertos set
          ml_restante = ml_restante + coalesce(v_item.ml, 0) * v_item.quantidade,
          status = 'ativo'
        where id = v_item.frasco_id;
      end if;
    end if;
  end loop;

  delete from transacoes where venda_id = p_venda_id and origem = 'venda';
  update vendas set status = 'cancelada' where id = p_venda_id;
end;
$$;

-- excluir_venda: inalterada na lógica; devolve origens e insumos via cancelar_venda.
create or replace function public.excluir_venda(p_venda_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from vendas where id = p_venda_id for update;
  if not found then
    raise exception 'Venda não encontrada';
  end if;

  -- Se a venda estiver concluída, cancela (devolve estoque, origens dos decants e insumos)
  if v_status = 'concluida' then
    perform cancelar_venda(p_venda_id);
  end if;

  -- Remove decants associados aos itens da venda (caso existam)
  delete from decants where id in (
    select decant_id from venda_itens where venda_id = p_venda_id and decant_id is not null
  );

  -- Remove lançamentos financeiros vinculados, itens e o registro da venda
  delete from transacoes where venda_id = p_venda_id;
  delete from venda_itens where venda_id = p_venda_id;
  delete from vendas where id = p_venda_id;
end;
$$;

-- Item de decant da edição bate com o gravado? (ml, quantidade e origens; sem 'origens',
-- compara frasco_id). Origem 'abrir' bate com a origem gravada que abriu frasco daquele
-- perfume, enviada como abrir_produto_id ou como o frasco que foi aberto.
create or replace function public._decant_inalterado(p_entrada jsonb, p_item venda_itens)
returns boolean
language plpgsql
stable
set search_path = public
as $$
begin
  if (p_entrada->>'ml')::numeric is distinct from p_item.ml
     or coalesce((p_entrada->>'quantidade')::int, 1) <> p_item.quantidade then
    return false;
  end if;

  if jsonb_typeof(p_entrada->'origens') is distinct from 'array' then
    return (p_entrada->>'frasco_id')::uuid is not distinct from p_item.frasco_id;
  end if;

  return (select count(*) from decant_origens where decant_id = p_item.decant_id)
           = jsonb_array_length(p_entrada->'origens')
     and not exists (
       select case
                when o->>'abrir_produto_id' is not null
                  then 'a:' || ((o->>'abrir_produto_id')::uuid)::text
                else coalesce(
                  (select 'a:' || d.produto_id::text from decant_origens d
                   where d.decant_id = p_item.decant_id and d.abriu_frasco
                     and d.frasco_id = (o->>'frasco_id')::uuid),
                  'f:' || ((o->>'frasco_id')::uuid)::text)
              end,
              (o->>'ml')::numeric
       from jsonb_array_elements(p_entrada->'origens') o
       except all
       select case when abriu_frasco then 'a:' || produto_id::text else 'f:' || frasco_id::text end,
              ml
       from decant_origens
       where decant_id = p_item.decant_id
     );
end;
$$;

drop function if exists public.editar_venda(uuid, uuid, date, text, text, numeric, numeric, text, text, jsonb);
drop function if exists public.editar_venda(uuid, uuid, date, text, text, numeric, numeric, text, text, jsonb, text);

create or replace function public.editar_venda(
  p_venda_id uuid,
  p_canal_id uuid,
  p_data_venda date,
  p_forma_pagamento text,
  p_cliente text,
  p_taxa_total numeric,
  p_frete numeric,
  p_responsavel text,
  p_observacao text,
  p_itens jsonb,
  p_titulo text default null,
  p_insumos_envio jsonb default '[]'
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_venda vendas%rowtype;
  v_entrada jsonb;
  v_tipo text;
  v_produto produtos%rowtype;
  v_decant decants%rowtype;
  v_origens jsonb;
  v_produto_id uuid;
  v_frasco_id uuid;
  v_qtd int;
  v_ml numeric;
  v_preco numeric(12,2);
  v_custo_emb numeric(12,2);
  v_custo_unit numeric(12,2);
  v_custo_origens numeric;
  v_bruto numeric(12,2);
  v_custo_total numeric(12,2);
  v_total_bruto numeric(12,2) := 0;
  v_total_custo numeric(12,2) := 0;
  v_custo_envio numeric(12,2);
  v_novo_estoque int;
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
  v_manter uuid[] := '{}';
  v_manter_custo numeric[] := '{}';
  v_pos int;
begin
  select * into v_venda from vendas where id = p_venda_id for update;
  if not found then raise exception 'Venda nao encontrada'; end if;
  if v_venda.status = 'cancelada' then
    raise exception 'Venda cancelada nao pode ser corrigida';
  end if;
  if p_canal_id is null then raise exception 'Canal e obrigatorio'; end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Venda sem itens';
  end if;
  if coalesce(p_taxa_total, 0) < 0 or coalesce(p_frete, 0) < 0 then
    raise exception 'Taxa e frete nao podem ser negativos';
  end if;

  -- Decant reenviado com o mesmo decant_id, ml, quantidade e origens: fica como está.
  -- Tira a linha dele de venda_itens antes do cancelamento, que assim não devolve os ml
  -- nem apaga o decant (os insumos dele seguem o estorno + regravação da venda).
  for v_entrada in select * from jsonb_array_elements(p_itens) loop
    continue when v_entrada->>'tipo' is distinct from 'decant' or v_entrada->>'decant_id' is null;
    select * into v_ci from venda_itens
    where venda_id = p_venda_id and tipo = 'decant'
      and decant_id = (v_entrada->>'decant_id')::uuid;
    if found and _decant_inalterado(v_entrada, v_ci) then
      v_manter := array_append(v_manter, v_ci.decant_id);
      v_manter_custo := array_append(v_manter_custo, v_ci.custo_unitario);
      delete from venda_itens where id = v_ci.id;
    end if;
  end loop;

  -- estorna estoque, origens dos decants, insumos e lançamentos
  perform cancelar_venda(p_venda_id);

  if exists (
    select 1
    from transacoes
    where venda_id = p_venda_id and origem = 'venda'
  ) then
    raise exception 'Lancamentos da venda nao foram estornados';
  end if;

  -- consumo e estorno da versão anterior já se anulam: a correção não deixa os pares,
  -- assim os 'consumo' da venda são sempre os da versão atual (a tela de edição lê deles).
  delete from insumo_movimentacoes where venda_id = p_venda_id;

  delete from venda_itens where venda_id = p_venda_id;
  update vendas set
    canal_id = p_canal_id,
    data_venda = coalesce(p_data_venda, current_date),
    forma_pagamento = p_forma_pagamento,
    cliente = p_cliente,
    taxa_total = coalesce(p_taxa_total, 0),
    frete = coalesce(p_frete, 0),
    responsavel = p_responsavel,
    observacao = p_observacao,
    titulo = p_titulo,
    total_bruto = 0,
    total_custo = 0,
    custo_envio = 0,
    lucro_bruto = 0,
    status = 'concluida'
  where id = p_venda_id
  returning * into v_venda;

  for v_entrada in select * from jsonb_array_elements(p_itens) loop
    v_tipo := v_entrada->>'tipo';
    v_qtd := coalesce((v_entrada->>'quantidade')::int, 1);
    v_preco := coalesce((v_entrada->>'preco_unitario')::numeric, 0);
    v_decant_id := null;
    v_frasco_id := null;
    v_ml := null;
    if v_qtd < 1 then raise exception 'Quantidade invalida'; end if;
    if v_preco < 0 then raise exception 'Preco invalido'; end if;

    if v_tipo = 'produto' then
      select * into v_produto
      from produtos
      where id = (v_entrada->>'produto_id')::uuid
      for update;
      if not found then raise exception 'Produto nao encontrado'; end if;
      if coalesce(v_produto.estoque_atual, 0) < v_qtd then
        raise exception 'Estoque insuficiente de %: % disponiveis',
          v_produto.nome, coalesce(v_produto.estoque_atual, 0);
      end if;

      v_custo_unit := coalesce(
        (v_entrada->>'custo_unitario')::numeric,
        coalesce(v_produto.custo_medio, 0)
      );
      v_custo_emb := 0;
      v_novo_estoque := v_produto.estoque_atual - v_qtd;
      update produtos set estoque_atual = v_novo_estoque where id = v_produto.id;
      insert into movimentacoes (
        produto_id, tipo, quantidade, motivo, responsavel, saldo_resultante
      )
      values (
        v_produto.id, 'saida', v_qtd, 'Venda #' || v_venda.numero,
        p_responsavel, v_novo_estoque
      );
      v_produto_id := v_produto.id;

    elsif v_tipo = 'decant' then
      v_ml := (v_entrada->>'ml')::numeric;
      v_custo_emb := coalesce((v_entrada->>'custo_embalagem')::numeric, 0);
      if v_ml is null or v_ml <= 0 then raise exception 'ml invalido'; end if;
      if v_custo_emb < 0 then
        raise exception 'Custo de embalagem nao pode ser negativo';
      end if;

      v_pos := case when v_entrada->>'decant_id' is not null
                    then array_position(v_manter, (v_entrada->>'decant_id')::uuid) end;
      if v_pos is not null then
        -- decant inalterado: mantém decant e origens, sem devolver nem reconsumir ml
        v_decant_id := v_manter[v_pos];
        v_manter[v_pos] := null;
        select * into v_decant from decants where id = v_decant_id;
        v_custo_unit := coalesce(
          (v_entrada->>'custo_unitario')::numeric,
          v_manter_custo[v_pos]
        );
      else
        -- sem 'origens' (frontend antigo): origem única = frasco_id com ml * quantidade
        v_origens := case when jsonb_typeof(v_entrada->'origens') = 'array' then v_entrada->'origens'
                          else jsonb_build_array(jsonb_build_object(
                                 'frasco_id', v_entrada->'frasco_id', 'ml', v_ml * v_qtd)) end;
        v_decant_id := _novo_decant(v_origens, v_ml * v_qtd);
        v_custo_origens := _consumir_origens(v_origens, v_decant_id, p_responsavel);
        select * into v_decant from decants where id = v_decant_id;

        v_custo_unit := coalesce(
          (v_entrada->>'custo_unitario')::numeric,
          round(v_custo_origens / v_qtd, 2)
        );
      end if;
      v_produto_id := v_decant.produto_id;
      v_frasco_id := v_decant.frasco_id;
    else
      raise exception 'Tipo de item invalido: %', v_tipo;
    end if;

    -- insumos do item: custo vira custo_embalagem (sem 'insumos', mantém o enviado)
    if jsonb_typeof(v_entrada->'insumos') = 'array' then
      v_custo_emb := round(
        _baixar_insumos(v_entrada->'insumos', v_venda.id, v_decant_id, p_responsavel) / v_qtd, 2);
    end if;

    v_bruto := round(v_preco * v_qtd, 2);
    v_custo_total := round((v_custo_unit + v_custo_emb) * v_qtd, 2);
    v_total_bruto := v_total_bruto + v_bruto;
    v_total_custo := v_total_custo + v_custo_total;

    insert into venda_itens (
      venda_id, tipo, produto_id, frasco_id, decant_id, ml, quantidade,
      preco_unitario, custo_unitario, custo_embalagem
    )
    values (
      v_venda.id, v_tipo, v_produto_id, v_frasco_id, v_decant_id, v_ml,
      v_qtd, v_preco, v_custo_unit, v_custo_emb
    )
    returning id into v_item_id;

    v_item_ids := array_append(v_item_ids, v_item_id);
    v_brutos := array_append(v_brutos, v_bruto);
  end loop;

  v_custo_envio := _baixar_insumos(p_insumos_envio, v_venda.id, null, p_responsavel);

  v_n := array_length(v_item_ids, 1);
  for v_idx in 1..v_n loop
    if v_idx < v_n then
      if v_total_bruto > 0 then
        v_taxa_rateada := round(v_taxa_total * v_brutos[v_idx] / v_total_bruto, 2);
        v_frete_rateado := round(v_frete * v_brutos[v_idx] / v_total_bruto, 2);
      else
        v_taxa_rateada := 0;
        v_frete_rateado := 0;
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
      lucro = round(
        v_brutos[v_idx] - v_taxa_rateada - v_frete_rateado
        - (v_ci.custo_unitario + v_ci.custo_embalagem) * v_ci.quantidade,
        2
      )
    where id = v_item_ids[v_idx];
  end loop;

  update vendas set
    total_bruto = v_total_bruto,
    total_custo = v_total_custo,
    custo_envio = v_custo_envio,
    lucro_bruto = round(v_total_bruto - v_taxa_total - v_frete - v_total_custo - v_custo_envio, 2)
  where id = v_venda.id;

  insert into transacoes (
    descricao, tipo, valor, categoria, forma_pagamento, responsavel, origem, venda_id
  )
  values (
    'Venda #' || v_venda.numero, 'entrada', v_total_bruto, 'Vendas',
    p_forma_pagamento, p_responsavel, 'venda', v_venda.id
  );
  if v_taxa_total > 0 then
    insert into transacoes (
      descricao, tipo, valor, categoria, forma_pagamento, responsavel, origem, venda_id
    )
    values (
      'Taxa - Venda #' || v_venda.numero, 'saida', v_taxa_total, 'Taxas marketplace',
      p_forma_pagamento, p_responsavel, 'venda', v_venda.id
    );
  end if;
  if v_frete > 0 then
    insert into transacoes (
      descricao, tipo, valor, categoria, forma_pagamento, responsavel, origem, venda_id
    )
    values (
      'Frete - Venda #' || v_venda.numero, 'saida', v_frete, 'Frete',
      p_forma_pagamento, p_responsavel, 'venda', v_venda.id
    );
  end if;

  return jsonb_build_object('id', v_venda.id, 'numero', v_venda.numero);
end;
$$;

-- =============================================================
-- Consumo de decant não faturável
-- =============================================================

drop function if exists public.registrar_consumo_decant(uuid, int, text, numeric, text);

create or replace function public.registrar_consumo_decant(
  p_frasco_id uuid,
  p_ml numeric,
  p_classificacao text,
  p_custo_embalagem numeric,
  p_responsavel text,
  p_origens jsonb default null,
  p_insumos jsonb default '[]'
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_origens jsonb;
  v_decant decants%rowtype;
  v_produto produtos%rowtype;
  v_custo_perfume numeric(12,2);
  v_custo_emb numeric(12,2);
  v_custo_total numeric(12,2);
  v_decant_id uuid;
  v_transacao_id uuid;
  v_label text;
begin
  if p_classificacao is null
     or p_classificacao not in ('perda', 'amostra', 'brinde', 'marketing', 'uso_interno', 'outro') then
    raise exception 'Classificacao invalida';
  end if;
  if coalesce(p_custo_embalagem, 0) < 0 then
    raise exception 'Custo de embalagem nao pode ser negativo';
  end if;

  if jsonb_typeof(p_origens) = 'array' then
    v_origens := p_origens;
  else
    if p_ml is null or p_ml <= 0 then
      raise exception 'ml invalido';
    end if;
    v_origens := jsonb_build_array(jsonb_build_object('frasco_id', p_frasco_id, 'ml', p_ml));
  end if;

  v_decant_id := _novo_decant(v_origens, null);
  v_custo_perfume := _consumir_origens(v_origens, v_decant_id, p_responsavel);

  -- perda não baixa insumos; com insumos informados, o custo deles vira a embalagem
  if p_classificacao = 'perda' then
    v_custo_emb := 0;
  elsif jsonb_typeof(p_insumos) = 'array' and jsonb_array_length(p_insumos) > 0 then
    v_custo_emb := _baixar_insumos(p_insumos, null, v_decant_id, p_responsavel);
  else
    v_custo_emb := coalesce(p_custo_embalagem, 0);
  end if;
  v_custo_total := coalesce(v_custo_perfume, 0) + v_custo_emb;

  update decants set
    classificacao = p_classificacao,
    custo = v_custo_total,
    custo_embalagem = v_custo_emb
  where id = v_decant_id
  returning * into v_decant;

  select * into v_produto from produtos where id = v_decant.produto_id;

  v_label := case p_classificacao
    when 'perda' then 'Perda'
    when 'amostra' then 'Amostra'
    when 'brinde' then 'Brinde'
    when 'marketing' then 'Marketing'
    when 'uso_interno' then 'Uso interno'
    else 'Outro'
  end;

  if v_custo_total > 0 then
    insert into transacoes (
      descricao, tipo, valor, categoria, responsavel, origem, decant_id
    )
    values (
      v_label || ' - ' || trim_scale(v_decant.ml) || 'ml ' || v_produto.nome,
      'saida', v_custo_total, v_label, p_responsavel, 'decant', v_decant_id
    )
    returning id into v_transacao_id;
  end if;

  return jsonb_build_object(
    'id', v_decant_id,
    'transacao_id', v_transacao_id,
    'custo', v_custo_total,
    'esgotado', exists (
      select 1 from decant_origens o join frascos_abertos f on f.id = o.frasco_id
      where o.decant_id = v_decant_id and f.status = 'esgotado')
  );
end;
$$;

drop function if exists public.corrigir_consumo_decant(uuid, uuid, int, text, numeric, text);

-- Devolve origens e insumos do consumo antigo e regrava com os dados novos.
-- Sem p_origens: tira p_ml do frasco ativo do perfume (para onde os ml voltaram).
create or replace function public.corrigir_consumo_decant(
  p_transacao_id uuid,
  p_decant_id uuid,
  p_ml numeric,
  p_classificacao text,
  p_custo_embalagem numeric,
  p_responsavel text,
  p_origens jsonb default null,
  p_insumos jsonb default '[]'
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_transacao transacoes%rowtype;
  v_decant decants%rowtype;
  v_novo decants%rowtype;
  v_novo_id uuid;
  v_produto produtos%rowtype;
  v_origens jsonb;
  v_frasco_id uuid;
  v_custo_perfume numeric(12,2);
  v_custo_emb numeric(12,2);
  v_custo_total numeric(12,2);
  v_label text;
begin
  select * into v_transacao from transacoes
  where id = p_transacao_id and origem = 'decant' for update;
  if not found then raise exception 'Transacao de decant nao encontrada'; end if;

  if v_transacao.decant_id is not null and v_transacao.decant_id <> p_decant_id then
    raise exception 'O consumo informado nao corresponde a esta transacao';
  end if;

  select * into v_decant
  from decants d
  where d.id = p_decant_id and d.classificacao is not null
  for update;
  if not found then raise exception 'Consumo de decant nao encontrado'; end if;

  if p_classificacao is null
     or p_classificacao not in ('perda', 'amostra', 'brinde', 'marketing', 'uso_interno', 'outro') then
    raise exception 'Classificacao invalida';
  end if;
  if jsonb_typeof(p_origens) is distinct from 'array' and (p_ml is null or p_ml <= 0) then
    raise exception 'ml invalido';
  end if;
  if coalesce(p_custo_embalagem, 0) < 0 then
    raise exception 'Custo de embalagem nao pode ser negativo';
  end if;

  -- desfaz o consumo antigo; o par consumo/estorno dos insumos não fica (é correção)
  perform _devolver_origens(v_decant.id);
  perform _estornar_insumos(null, v_decant.id);
  delete from insumo_movimentacoes where decant_id = v_decant.id;

  if jsonb_typeof(p_origens) = 'array' then
    v_origens := p_origens;
  else
    select id into v_frasco_id from frascos_abertos
    where produto_id = v_decant.produto_id and status = 'ativo';
    if v_frasco_id is null then raise exception 'Frasco nao encontrado'; end if;
    v_origens := jsonb_build_array(jsonb_build_object('frasco_id', v_frasco_id, 'ml', p_ml));
  end if;

  v_novo_id := _novo_decant(v_origens, null);
  v_custo_perfume := _consumir_origens(v_origens, v_novo_id, p_responsavel);

  if p_classificacao = 'perda' then
    v_custo_emb := 0;
  elsif jsonb_typeof(p_insumos) = 'array' and jsonb_array_length(p_insumos) > 0 then
    v_custo_emb := _baixar_insumos(p_insumos, null, v_novo_id, p_responsavel);
  else
    v_custo_emb := coalesce(p_custo_embalagem, 0);
  end if;
  v_custo_total := coalesce(v_custo_perfume, 0) + v_custo_emb;

  update decants set
    classificacao = p_classificacao,
    custo = v_custo_total,
    custo_embalagem = v_custo_emb
  where id = v_novo_id
  returning * into v_novo;

  select * into v_produto from produtos where id = v_novo.produto_id;

  v_label := case p_classificacao
    when 'perda' then 'Perda'
    when 'amostra' then 'Amostra'
    when 'brinde' then 'Brinde'
    when 'marketing' then 'Marketing'
    when 'uso_interno' then 'Uso interno'
    else 'Outro'
  end;

  if v_custo_total > 0 then
    update transacoes set
      descricao = v_label || ' - ' || trim_scale(v_novo.ml) || 'ml ' || v_produto.nome,
      categoria = v_label,
      valor = v_custo_total,
      responsavel = p_responsavel,
      decant_id = v_novo_id
    where id = v_transacao.id;
  else
    update transacoes set decant_id = null where id = v_transacao.id;
    delete from transacoes where id = v_transacao.id;
  end if;

  delete from decants where id = v_decant.id;

  return jsonb_build_object(
    'id', v_novo_id,
    'custo', v_custo_total,
    'esgotado', exists (
      select 1 from decant_origens o join frascos_abertos f on f.id = o.frasco_id
      where o.decant_id = v_novo_id and f.status = 'esgotado')
  );
end;
$$;

-- Reversão completa de um consumo de decant: origens, insumos, despesa e decant.
create or replace function public.cancelar_consumo_decant(p_decant_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_decant decants%rowtype;
begin
  select * into v_decant from decants where id = p_decant_id for update;
  if not found then raise exception 'Decant nao encontrado'; end if;

  perform _devolver_origens(v_decant.id);
  perform _estornar_insumos(null, v_decant.id);

  delete from transacoes where decant_id = p_decant_id;
  delete from decants where id = p_decant_id;
end;
$$;
