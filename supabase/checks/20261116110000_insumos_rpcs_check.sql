-- Roda no SQL Editor depois da migração 20261116110000_insumos_rpcs.sql.
-- Termina em ROLLBACK (não deixa dados).
begin;

do $$
declare
  v_prod   uuid;
  v_canal  uuid;
  v_a      uuid;
  v_b      uuid;
  v_f_old  uuid;
  v_f_new  uuid;
  v_venda  uuid;
  v_venda2 uuid;
  v_item   venda_itens%rowtype;
  v_ok     boolean;
  v_msg    text;
  r        jsonb;
  v_prod2  uuid;
  v_old2   uuid;
  v_new2   uuid;
  v_venda3 uuid;
  v_dec3   uuid;
  v_itens3 jsonb;
begin
  -- Massa de teste ---------------------------------------------------
  insert into produtos (nome, volume_ml, custo_medio, estoque_atual, categoria_id)
  values ('teste-check-rpc', 100, 180, 2, (select id from categorias limit 1))
  returning id into v_prod;
  insert into canais (nome, usa_envio) values ('teste-check-canal', true) returning id into v_canal;
  insert into insumos (nome, estoque_atual, custo_medio) values ('teste-check-A', 100, 0.5) returning id into v_a;
  insert into insumos (nome, estoque_atual, custo_medio) values ('teste-check-B', 100, 2) returning id into v_b;
  insert into frascos_abertos (produto_id, ml_total, ml_restante)
  values (v_prod, 100, 4) returning id into v_f_old;

  -- 1+2. Decant 10 ml: 4 ml do aberto + abre lacrado (6 ml), insumos do item e do envio
  r := registrar_venda(
    v_canal, current_date, 'Pix', 'cliente', 0, 0, 'check', null,
    jsonb_build_array(jsonb_build_object(
      'tipo', 'decant', 'ml', 10, 'quantidade', 1, 'preco_unitario', 50,
      'origens', jsonb_build_array(
        jsonb_build_object('frasco_id', v_f_old, 'ml', 4),
        jsonb_build_object('abrir_produto_id', v_prod, 'ml', 6)),
      'insumos', jsonb_build_array(jsonb_build_object('insumo_id', v_a, 'quantidade', 2)))),
    null,
    jsonb_build_array(jsonb_build_object('insumo_id', v_b, 'quantidade', 1)));
  v_venda := (r->>'id')::uuid;

  assert (select status from frascos_abertos where id = v_f_old) = 'esgotado', 'frasco antigo esgotado';
  select id into v_f_new from frascos_abertos where produto_id = v_prod and status = 'ativo';
  assert v_f_new is not null and v_f_new <> v_f_old, 'frasco novo aberto';
  assert (select ml_restante from frascos_abertos where id = v_f_new) = 94, 'frasco novo com 94';
  assert (select ml_total from frascos_abertos where id = v_f_new) = 100, 'ml_total = volume_ml';
  assert (select estoque_atual from produtos where id = v_prod) = 1, 'lacrado saiu do estoque';
  assert exists (select 1 from movimentacoes where produto_id = v_prod and tipo = 'saida'
                 and motivo = 'Abertura de frasco para decant'), 'movimentacao da abertura';

  select * into v_item from venda_itens where venda_id = v_venda;
  assert v_item.custo_unitario = 18.00, 'custo_unitario 18.00: ' || v_item.custo_unitario;
  assert v_item.custo_embalagem = 1.00, 'custo_embalagem 1.00: ' || v_item.custo_embalagem;
  assert v_item.frasco_id = v_f_old, 'venda_itens.frasco_id = primeira origem';
  assert (select frasco_id from decants where id = v_item.decant_id) = v_f_old, 'decants.frasco_id = primeira origem';
  assert (select count(*) from decant_origens where decant_id = v_item.decant_id) = 2, '2 origens';
  assert (select abriu_frasco and frasco_id = v_f_new from decant_origens
          where decant_id = v_item.decant_id and ml = 6), 'origem do lacrado aponta para o frasco novo';
  assert (select custo_envio from vendas where id = v_venda) = 2.00, 'custo_envio 2.00';
  assert (select lucro_bruto from vendas where id = v_venda) = 29.00, 'lucro_bruto 50 - 19 - 2';
  assert (select estoque_atual from insumos where id = v_a) = 98, 'estoque A caiu';
  assert (select estoque_atual from insumos where id = v_b) = 99, 'estoque B caiu';

  -- 3. Cancelar devolve ml (com teto no ml_total) e insumos; lacrado não volta
  perform cancelar_venda(v_venda);
  assert (select ml_restante from frascos_abertos where id = v_f_new) = 100, 'frasco novo volta a 100';
  assert (select status from frascos_abertos where id = v_f_old) = 'esgotado', 'antigo continua esgotado';
  assert (select count(*) from frascos_abertos where produto_id = v_prod and status = 'ativo') = 1, 'um ativo';
  assert (select estoque_atual from insumos where id = v_a) = 100, 'estoque A voltou';
  assert (select estoque_atual from insumos where id = v_b) = 100, 'estoque B voltou';
  assert (select estoque_atual from produtos where id = v_prod) = 1, 'lacrado aberto não volta';

  -- 4. Chamada antiga (frasco_id + ml, sem origens), 2,5 ml
  r := registrar_venda(
    v_canal, current_date, 'Pix', 'cliente', 0, 0, 'check', null,
    jsonb_build_array(jsonb_build_object(
      'tipo', 'decant', 'frasco_id', v_f_new, 'ml', 2.5, 'quantidade', 1,
      'preco_unitario', 10, 'custo_embalagem', 0.3)));
  v_venda2 := (r->>'id')::uuid;
  select * into v_item from venda_itens where venda_id = v_venda2;
  assert v_item.ml = 2.5, 'venda_itens.ml 2.5';
  assert v_item.custo_unitario = 4.50, 'custo 2.5 ml: ' || v_item.custo_unitario;
  assert v_item.custo_embalagem = 0.30, 'custo_embalagem enviado é mantido';
  assert (select ml_restante from frascos_abertos where id = v_f_new) = 97.5, 'frasco com 97.5';

  -- 5. 10 ml com frasco de 4 ml e só origem frasco -> 'ml insuficiente'
  update frascos_abertos set ml_restante = 4 where id = v_f_new;
  v_ok := false;
  begin
    perform registrar_venda(
      v_canal, current_date, 'Pix', 'cliente', 0, 0, 'check', null,
      jsonb_build_array(jsonb_build_object(
        'tipo', 'decant', 'ml', 10, 'quantidade', 1, 'preco_unitario', 50,
        'origens', jsonb_build_array(jsonb_build_object('frasco_id', v_f_new, 'ml', 10)))));
    v_ok := true;
  exception when others then
    v_msg := sqlerrm;
  end;
  assert not v_ok and v_msg like '%ml insuficiente%', 'origem 10 ml em frasco de 4: ' || coalesce(v_msg, 'passou');

  v_ok := false;
  v_msg := null;
  begin
    perform registrar_venda(
      v_canal, current_date, 'Pix', 'cliente', 0, 0, 'check', null,
      jsonb_build_array(jsonb_build_object(
        'tipo', 'decant', 'ml', 10, 'quantidade', 1, 'preco_unitario', 50,
        'origens', jsonb_build_array(jsonb_build_object('frasco_id', v_f_new, 'ml', 4)))));
    v_ok := true;
  exception when others then
    v_msg := sqlerrm;
  end;
  assert not v_ok and v_msg like '%ml insuficiente%', 'origens somam 4 de 10: ' || coalesce(v_msg, 'passou');
  update frascos_abertos set ml_restante = 97.5 where id = v_f_new;

  -- 6. editar_venda duas vezes não duplica consumo de insumo
  perform editar_venda(
    v_venda2, v_canal, current_date, 'Pix', 'cliente', 0, 0, 'check', null,
    jsonb_build_array(jsonb_build_object(
      'tipo', 'decant', 'frasco_id', v_f_new, 'ml', 2.5, 'quantidade', 1, 'preco_unitario', 10,
      'insumos', jsonb_build_array(jsonb_build_object('insumo_id', v_a, 'quantidade', 1)))),
    null,
    jsonb_build_array(jsonb_build_object('insumo_id', v_b, 'quantidade', 1)));
  perform editar_venda(
    v_venda2, v_canal, current_date, 'Pix', 'cliente', 0, 0, 'check', null,
    jsonb_build_array(jsonb_build_object(
      'tipo', 'decant', 'frasco_id', v_f_new, 'ml', 2.5, 'quantidade', 1, 'preco_unitario', 10,
      'insumos', jsonb_build_array(
        jsonb_build_object('insumo_id', v_a, 'quantidade', 1),
        jsonb_build_object('insumo_id', v_b, 'quantidade', 1)))),
    null,
    jsonb_build_array(jsonb_build_object('insumo_id', v_b, 'quantidade', 1)));
  assert (select count(*) from insumo_movimentacoes
          where tipo = 'consumo' and venda_id = v_venda2) = 3, 'consumo sem duplicar';
  assert (select estoque_atual from insumos where id = v_a) = 99, 'A após edições';
  assert (select estoque_atual from insumos where id = v_b) = 98, 'B após edições';
  assert (select ml_restante from frascos_abertos where id = v_f_new) = 97.5, 'frasco após edições';
  assert (select count(*) from decant_origens o join venda_itens i on i.decant_id = o.decant_id
          where i.venda_id = v_venda2) = 1, 'origens não duplicam';
  assert (select custo_envio from vendas where id = v_venda2) = 2.00, 'custo_envio após edição';

  -- 7. Consumo não faturável com insumos; cancelar devolve ml e insumos
  r := registrar_consumo_decant(null, null, 'brinde', 0, 'check',
         jsonb_build_array(jsonb_build_object('frasco_id', v_f_new, 'ml', 5)),
         jsonb_build_array(jsonb_build_object('insumo_id', v_a, 'quantidade', 1)));
  assert (select custo_embalagem from decants where id = (r->>'id')::uuid) = 0.50, 'embalagem = insumos';
  assert (r->>'custo')::numeric = 9.50, 'custo brinde 9.00 + 0.50';
  assert (select estoque_atual from insumos where id = v_a) = 98, 'A baixou no brinde';
  perform cancelar_consumo_decant((r->>'id')::uuid);
  assert (select estoque_atual from insumos where id = v_a) = 99, 'A voltou ao cancelar brinde';
  assert (select ml_restante from frascos_abertos where id = v_f_new) = 97.5, 'ml voltou ao cancelar brinde';

  -- 8. editar_venda só com preço novo mantém o decant que abriu lacrado (não perde ml)
  insert into produtos (nome, volume_ml, custo_medio, estoque_atual, categoria_id)
  values ('teste-check-rpc-2', 100, 180, 2, (select id from categorias limit 1))
  returning id into v_prod2;
  insert into frascos_abertos (produto_id, ml_total, ml_restante)
  values (v_prod2, 100, 4) returning id into v_old2;
  r := registrar_venda(
    v_canal, current_date, 'Pix', 'cliente', 0, 0, 'check', null,
    jsonb_build_array(jsonb_build_object(
      'tipo', 'decant', 'ml', 10, 'quantidade', 1, 'preco_unitario', 50,
      'origens', jsonb_build_array(
        jsonb_build_object('frasco_id', v_old2, 'ml', 4),
        jsonb_build_object('abrir_produto_id', v_prod2, 'ml', 6)))));
  v_venda3 := (r->>'id')::uuid;
  select decant_id into v_dec3 from venda_itens where venda_id = v_venda3;
  select id into v_new2 from frascos_abertos where produto_id = v_prod2 and status = 'ativo';

  -- mesmas origens, preço 80
  perform editar_venda(
    v_venda3, v_canal, current_date, 'Pix', 'cliente', 0, 0, 'check', null,
    jsonb_build_array(jsonb_build_object(
      'tipo', 'decant', 'decant_id', v_dec3, 'ml', 10, 'quantidade', 1, 'preco_unitario', 80,
      'origens', jsonb_build_array(
        jsonb_build_object('frasco_id', v_old2, 'ml', 4),
        jsonb_build_object('abrir_produto_id', v_prod2, 'ml', 6)))));
  assert (select ml_restante from frascos_abertos where id = v_new2) = 94, 'edição de preço: frasco novo 94';
  assert (select status from frascos_abertos where id = v_old2) = 'esgotado', 'edição de preço: antigo esgotado';
  assert (select count(*) from decant_origens where decant_id = v_dec3) = 2, 'edição de preço: 2 origens';
  assert (select decant_id from venda_itens where venda_id = v_venda3) = v_dec3, 'mesmo decant';
  assert (select estoque_atual from produtos where id = v_prod2) = 1, 'edição de preço: estoque igual';
  assert (select custo_unitario from venda_itens where venda_id = v_venda3) = 18.00, 'custo mantido';
  assert (select lucro_bruto from vendas where id = v_venda3) = 62.00, 'lucro 80 - 18';

  -- frontend antigo (frasco_id gravado, sem origens) e origens com o id do frasco aberto
  v_itens3 := jsonb_build_array(jsonb_build_object(
    'tipo', 'decant', 'decant_id', v_dec3, 'frasco_id', v_old2, 'ml', 10, 'quantidade', 1,
    'preco_unitario', 70));
  perform editar_venda(v_venda3, v_canal, current_date, 'Pix', 'cliente', 0, 0, 'check', null, v_itens3);
  v_itens3 := jsonb_build_array(jsonb_build_object(
    'tipo', 'decant', 'decant_id', v_dec3, 'ml', 10, 'quantidade', 1, 'preco_unitario', 60,
    'origens', jsonb_build_array(
      jsonb_build_object('frasco_id', v_old2, 'ml', 4),
      jsonb_build_object('frasco_id', v_new2, 'ml', 6))));
  perform editar_venda(v_venda3, v_canal, current_date, 'Pix', 'cliente', 0, 0, 'check', null, v_itens3);
  assert (select ml_restante from frascos_abertos where id = v_new2) = 94, 'outras formas: frasco novo 94';
  assert (select count(*) from decant_origens where decant_id = v_dec3) = 2, 'outras formas: 2 origens';
  assert (select lucro_bruto from vendas where id = v_venda3) = 42.00, 'lucro 60 - 18';

  -- excluir o frasco aberto não esbarra em decant_origens (on delete set null)
  delete from frascos_abertos where id = v_new2;
  assert (select count(*) from decant_origens where decant_id = v_dec3 and frasco_id is null) = 1,
    'origem do frasco excluído fica sem frasco';
end $$;

rollback;
