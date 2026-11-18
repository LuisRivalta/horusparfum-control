-- Roda no SQL Editor depois da migração 20261118110000_canais_nucleo.sql.
-- Termina em ROLLBACK (não deixa dados).
begin;

-- sem URL configurada o gatilho não faz chamada HTTP
delete from canais_sync_config;

do $$
declare
  v_prod    uuid;
  v_sem     uuid;
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
  insert into canal_vinculos (canal, produto_id, tipo, externo_variante_id)
  values ('shopify', v_prod, 'frasco', 'teste-check-variante');

  v_itens := jsonb_build_array(jsonb_build_object(
    'tipo', 'produto', 'produto_id', v_prod, 'quantidade', 1, 'preco_unitario', 300));
  insert into pedidos_canal (canal, externo_id, numero, status, cliente, total, itens)
  values ('shopify', 'teste-check-pedido', '#1001', 'a_confirmar', 'cliente', 300,
          jsonb_build_array(jsonb_build_object(
            'variante_id', 'teste-check-variante', 'titulo', 'teste', 'quantidade', 1,
            'preco_unitario', 300, 'produto_id', v_prod, 'tipo', 'frasco', 'ml', null)))
  returning id into v_pedido;

  -- 1. Confirmar baixa o estoque e grava a venda ----------------------
  r := confirmar_pedido_canal(v_pedido, v_canal, current_date, 'Pix', 'cliente', 0, 0,
                              'check', null, v_itens);
  v_venda := (r->>'id')::uuid;
  assert v_venda is not null, 'retorna id da venda';
  assert (select estoque_atual from produtos where id = v_prod) = 1, 'estoque baixou 1';
  assert (select venda_id from pedidos_canal where id = v_pedido) = v_venda, 'venda_id gravado';
  assert (select status from pedidos_canal where id = v_pedido) = 'confirmado', 'status confirmado';

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

  -- 4. Desfazer devolve o estoque e marca cancelado -------------------
  v_estoque := (select estoque_atual from produtos where id = v_prod);
  update pedidos_canal set status = 'cancelado_pos_confirmacao', alerta = 'cancelado na loja'
  where id = v_pedido;
  perform desfazer_pedido_canal(v_pedido);
  assert (select estoque_atual from produtos where id = v_prod) = v_estoque + 1, 'estoque devolvido';
  assert (select status from pedidos_canal where id = v_pedido) = 'cancelado', 'status cancelado';
  assert (select alerta from pedidos_canal where id = v_pedido) is null, 'alerta limpo';
  assert (select status from vendas where id = v_venda) = 'cancelada', 'venda cancelada';
end $$;

rollback;
