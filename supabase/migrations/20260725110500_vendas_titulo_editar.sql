drop function if exists editar_venda(uuid, uuid, date, text, text, numeric, numeric, text, text, jsonb);

create or replace function editar_venda(
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
  p_titulo text default null
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
  v_nome_venda text;
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

  perform cancelar_venda(p_venda_id);

  if exists (
    select 1
    from transacoes
    where venda_id = p_venda_id and origem = 'venda'
  ) then
    raise exception 'Lancamentos da venda nao foram estornados';
  end if;

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
    lucro_bruto = 0,
    status = 'concluida'
  where id = p_venda_id
  returning * into v_venda;

  v_nome_venda := coalesce(p_titulo, 'Venda #' || v_venda.numero);

  for v_entrada in select * from jsonb_array_elements(p_itens) loop
    v_tipo := v_entrada->>'tipo';
    v_qtd := coalesce((v_entrada->>'quantidade')::int, 1);
    v_preco := coalesce((v_entrada->>'preco_unitario')::numeric, 0);
    v_decant_id := null;
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

      v_custo_unit := coalesce(v_produto.custo_medio, 0);
      v_custo_emb := 0;
      v_novo_estoque := v_produto.estoque_atual - v_qtd;
      update produtos set estoque_atual = v_novo_estoque where id = v_produto.id;
      insert into movimentacoes (
        produto_id, tipo, quantidade, motivo, responsavel, saldo_resultante
      )
      values (
        v_produto.id, 'saida', v_qtd, v_nome_venda,
        p_responsavel, v_novo_estoque
      );

    elsif v_tipo = 'decant' then
      v_ml := (v_entrada->>'ml')::int;
      v_custo_emb := coalesce((v_entrada->>'custo_embalagem')::numeric, 0);
      if v_ml is null or v_ml <= 0 then raise exception 'ml invalido'; end if;
      if v_custo_emb < 0 then
        raise exception 'Custo de embalagem nao pode ser negativo';
      end if;

      select * into v_frasco
      from frascos_abertos
      where id = (v_entrada->>'frasco_id')::uuid
      for update;
      if not found then raise exception 'Frasco nao encontrado'; end if;
      if v_frasco.status <> 'ativo' then raise exception 'Frasco nao esta ativo'; end if;
      if v_frasco.ml_restante < v_ml * v_qtd then
        raise exception 'ml insuficiente no frasco: % disponiveis', v_frasco.ml_restante;
      end if;

      select * into v_produto
      from produtos
      where id = v_frasco.produto_id
      for update;
      if not found then raise exception 'Produto nao encontrado'; end if;

      v_custo_unit := round(
        v_ml * coalesce(v_produto.custo_medio, 0) / nullif(v_frasco.ml_total, 0),
        2
      );
      v_novo_ml := v_frasco.ml_restante - v_ml * v_qtd;
      update frascos_abertos set
        ml_restante = v_novo_ml,
        status = case when v_novo_ml <= 0 then 'esgotado' else 'ativo' end
      where id = v_frasco.id;

      insert into decants (frasco_id, produto_id, ml)
      values (v_frasco.id, v_frasco.produto_id, v_ml * v_qtd)
      returning id into v_decant_id;
    else
      raise exception 'Tipo de item invalido: %', v_tipo;
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
      v_venda.id, v_tipo, v_produto.id,
      case when v_tipo = 'decant' then v_frasco.id else null end,
      v_decant_id,
      case when v_tipo = 'decant' then v_ml else null end,
      v_qtd, v_preco, v_custo_unit, v_custo_emb
    )
    returning id into v_item_id;

    v_item_ids := array_append(v_item_ids, v_item_id);
    v_brutos := array_append(v_brutos, v_bruto);
  end loop;

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
    lucro_bruto = round(v_total_bruto - v_taxa_total - v_frete - v_total_custo, 2)
  where id = v_venda.id;

  insert into transacoes (
    descricao, tipo, valor, categoria, forma_pagamento, responsavel, origem, venda_id
  )
  values (
    v_nome_venda, 'entrada', v_total_bruto, 'Vendas',
    p_forma_pagamento, p_responsavel, 'venda', v_venda.id
  );
  if v_taxa_total > 0 then
    insert into transacoes (
      descricao, tipo, valor, categoria, forma_pagamento, responsavel, origem, venda_id
    )
    values (
      'Taxa - ' || v_nome_venda, 'saida', v_taxa_total, 'Taxas marketplace',
      p_forma_pagamento, p_responsavel, 'venda', v_venda.id
    );
  end if;
  if v_frete > 0 then
    insert into transacoes (
      descricao, tipo, valor, categoria, forma_pagamento, responsavel, origem, venda_id
    )
    values (
      'Frete - ' || v_nome_venda, 'saida', v_frete, 'Frete',
      p_forma_pagamento, p_responsavel, 'venda', v_venda.id
    );
  end if;

  return jsonb_build_object('id', v_venda.id, 'numero', v_venda.numero, 'titulo', v_venda.titulo);
end;
$$;
