-- Roda no SQL Editor depois da migração 20261118110000_canais_nucleo.sql.
-- Termina em ROLLBACK (não deixa dados).
begin;

-- sem URL configurada o gatilho não faz chamada HTTP
delete from canais_sync_config;

do $$
declare
  v_prod    uuid;
  v_sem     uuid;
  v_troca   uuid;
  v_antes   timestamptz;
  v_dono    uuid;
  v_dono2   uuid;
  v_canal   uuid;
  v_pedido  uuid;
  v_venda   uuid;
  v_itens   jsonb;
  v_vendas  int;
  v_estoque int;
  v_ok      boolean;
  v_msg     text;
  r         jsonb;
begin
  -- Massa de teste ---------------------------------------------------
  select id into v_canal from canais where nome = 'Shopify';
  assert v_canal is not null, 'canal Shopify criado';

  insert into produtos (nome, volume_ml, custo_medio, estoque_atual, categoria_id)
  values ('teste-check-canal-vinc', 100, 180, 2, (select id from categorias limit 1))
  returning id into v_prod;
  insert into produtos (nome, volume_ml, custo_medio, estoque_atual, categoria_id)
  values ('teste-check-canal-sem', 100, 180, 5, (select id from categorias limit 1))
  returning id into v_sem;
  insert into produtos (nome, volume_ml, custo_medio, estoque_atual, categoria_id)
  values ('teste-check-canal-troca', 100, 180, 5, (select id from categorias limit 1))
  returning id into v_troca;
  -- v_prod com dois vínculos (frasco + decant, como o publicar cria): a fila não pode
  -- tentar atualizar a mesma linha duas vezes no on conflict
  insert into canal_vinculos (canal, produto_id, tipo, ml, externo_variante_id)
  values ('shopify', v_prod, 'frasco', null, 'teste-check-variante'),
         ('shopify', v_prod, 'decant', 5, 'teste-check-variante-dec'),
         ('shopify', v_troca, 'frasco', null, 'teste-check-variante-troca');

  assert exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'pedidos_canal'
                   and column_name = 'alerta_dispensado'), 'coluna alerta_dispensado';

  -- pedido traz v_prod e v_troca (este sem produto_id: reservava pela variante);
  -- o Luis confirma só v_prod (trocou/tirou a linha de v_troca)
  v_itens := jsonb_build_array(jsonb_build_object(
    'tipo', 'produto', 'produto_id', v_prod, 'quantidade', 1, 'preco_unitario', 300));
  insert into pedidos_canal (canal, externo_id, numero, status, cliente, total, itens, alerta)
  values ('shopify', 'teste-check-pedido', '#1001', 'a_confirmar', 'cliente', 300,
          jsonb_build_array(
            jsonb_build_object(
              'variante_id', 'teste-check-variante', 'titulo', 'teste', 'quantidade', 1,
              'preco_unitario', 300, 'produto_id', v_prod, 'tipo', 'frasco', 'ml', null),
            jsonb_build_object(
              'variante_id', 'teste-check-variante-troca', 'titulo', 'troca', 'quantidade', 1,
              'preco_unitario', 50, 'produto_id', null, 'tipo', null, 'ml', null)),
          'Reembolso parcial de R$ 10,00 na Shopify')
  returning id into v_pedido;
  delete from canal_sync_fila where produto_id in (v_prod, v_troca);

  -- 1. Confirmar baixa o estoque e grava a venda ----------------------
  r := confirmar_pedido_canal(v_pedido, v_canal, current_date, 'Pix', 'cliente', 0, 0,
                              'check', null, v_itens);
  v_venda := (r->>'id')::uuid;
  assert v_venda is not null, 'retorna id da venda';
  assert (select estoque_atual from produtos where id = v_prod) = 1, 'estoque baixou 1';
  assert (select venda_id from pedidos_canal where id = v_pedido) = v_venda, 'venda_id gravado';
  assert (select status from pedidos_canal where id = v_pedido) = 'confirmado', 'status confirmado';
  assert exists (select 1 from canal_sync_fila where produto_id = v_troca),
    'confirmar enfileira o item original que saiu da venda (resolvido pela variante)';
  assert (select alerta from pedidos_canal where id = v_pedido) is null, 'confirmar limpa o alerta';
  assert (select alerta_dispensado from pedidos_canal where id = v_pedido)
         = 'Reembolso parcial de R$ 10,00 na Shopify', 'confirmar dispensa o alerta visto';

  -- 2. Segunda confirmação levanta exceção e não cria outra venda ------
  select count(*) into v_vendas from vendas;
  v_ok := false;
  begin
    perform confirmar_pedido_canal(v_pedido, v_canal, current_date, 'Pix', 'cliente', 0, 0,
                                   'check', null, v_itens);
    v_ok := true;
  exception when others then
    v_msg := sqlerrm;
  end;
  assert not v_ok and v_msg like 'Pedido não está a confirmar%',
    'segunda confirmação: ' || coalesce(v_msg, 'passou');
  assert (select count(*) from vendas) = v_vendas, 'sem venda nova';
  assert (select estoque_atual from produtos where id = v_prod) = 1, 'estoque não baixou de novo';

  -- 3. Fila de sincronização ----------------------------------------
  delete from canal_sync_fila where produto_id in (v_prod, v_sem);
  update produtos set estoque_atual = 3 where id = v_prod;
  assert exists (select 1 from canal_sync_fila where produto_id = v_prod), 'vinculado entra na fila';
  update produtos set estoque_atual = 4 where id = v_sem;
  assert not exists (select 1 from canal_sync_fila where produto_id = v_sem), 'sem vínculo fica fora';

  delete from canal_sync_fila where produto_id = v_prod;
  insert into frascos_abertos (produto_id, ml_total, ml_restante) values (v_prod, 100, 50);
  assert exists (select 1 from canal_sync_fila where produto_id = v_prod), 'frasco aberto entra na fila';

  -- reenfileirar avança criado_em (dreno em andamento não apaga a mudança nova)
  v_antes := now() - interval '1 hour';
  update canal_sync_fila set criado_em = v_antes where produto_id = v_prod;
  update produtos set estoque_atual = estoque_atual + 1 where id = v_prod;
  assert (select criado_em from canal_sync_fila where produto_id = v_prod) > v_antes,
    'reenfileirar avança criado_em';
  update produtos set estoque_atual = estoque_atual - 1 where id = v_prod;

  -- 3b. Lease: um dreno por vez, com dono ------------------------------
  update canal_sync_lease set ate = null, dono = null where id = 1;
  v_dono := pegar_lease_sync(60);
  assert v_dono is not null, 'pega o lease livre';
  assert pegar_lease_sync(60) is null, 'lease ocupado não é pego de novo';
  assert pegar_lease_sync(60, v_dono) = v_dono, 'o dono renova';
  assert pegar_lease_sync(60, gen_random_uuid()) is null, 'outro token não renova';
  perform soltar_lease_sync(gen_random_uuid());
  assert (select dono from canal_sync_lease where id = 1) = v_dono, 'outro token não solta';
  perform soltar_lease_sync(v_dono);
  assert (select dono from canal_sync_lease where id = 1) is null, 'o dono solta';
  v_dono := pegar_lease_sync(60);
  assert v_dono is not null, 'pega de novo depois de soltar';
  update canal_sync_lease set ate = now() - interval '1 second' where id = 1;
  v_dono2 := pegar_lease_sync(60);
  assert v_dono2 is not null and v_dono2 <> v_dono, 'lease vencido é pego por outro dono';
  perform soltar_lease_sync(v_dono);
  assert (select dono from canal_sync_lease where id = 1) = v_dono2,
    'dreno lento que perdeu o lease não solta o do próximo';
  perform soltar_lease_sync(v_dono2);
  assert not has_function_privilege('authenticated', 'public.pegar_lease_sync(int, uuid)', 'execute'),
    'authenticated não pega lease';
  assert not has_function_privilege('anon', 'public.soltar_lease_sync(uuid)', 'execute'),
    'anon não solta lease';

  -- 4. Desfazer devolve o estoque e marca cancelado -------------------
  v_estoque := (select estoque_atual from produtos where id = v_prod);
  update pedidos_canal set status = 'cancelado_pos_confirmacao', alerta = 'cancelado na loja'
  where id = v_pedido;
  perform desfazer_pedido_canal(v_pedido);
  assert (select estoque_atual from produtos where id = v_prod) = v_estoque + 1, 'estoque devolvido';
  assert (select status from pedidos_canal where id = v_pedido) = 'cancelado', 'status cancelado';
  assert (select alerta from pedidos_canal where id = v_pedido) is null, 'alerta limpo';
  assert (select status from vendas where id = v_venda) = 'cancelada', 'venda cancelada';

  -- 5. Venda já cancelada à mão: desfazer só fecha o pedido -----------
  v_estoque := (select estoque_atual from produtos where id = v_prod);
  update pedidos_canal set status = 'cancelado_pos_confirmacao', alerta = 'cancelado na loja'
  where id = v_pedido;
  perform desfazer_pedido_canal(v_pedido);
  assert (select status from pedidos_canal where id = v_pedido) = 'cancelado', 'já cancelada: status cancelado';
  assert (select alerta from pedidos_canal where id = v_pedido) is null, 'já cancelada: alerta limpo';
  assert (select estoque_atual from produtos where id = v_prod) = v_estoque, 'já cancelada: estoque igual';

  -- 6. Excluir a venda deixa o pedido sem venda_id --------------------
  perform excluir_venda(v_venda);
  assert not exists (select 1 from vendas where id = v_venda), 'venda excluída';
  assert (select venda_id from pedidos_canal where id = v_pedido) is null, 'venda_id null';
end $$;

rollback;
