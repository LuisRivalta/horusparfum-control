-- Roda no SQL Editor depois da migração. Termina em ROLLBACK (não deixa dados).
begin;

do $$
declare
  v_id uuid;
  r jsonb;
begin
  insert into insumos (nome) values ('teste-check') returning id into v_id;

  r := registrar_compra_insumo(v_id, 1000, 2000, 0, 'Pix', 'check');
  assert (r->>'custo_medio')::numeric = 2, 'custo_medio 1a compra';
  assert (r->>'estoque_atual')::numeric = 1000, 'estoque 1a compra';
  assert (select count(*) from transacoes
          where origem = 'insumo' and valor = 2000 and categoria = 'Insumos') = 1,
    'transacao da compra';

  r := registrar_compra_insumo(v_id, 200, 30, 5, 'Pix', 'check');
  assert (r->>'diferenca')::numeric = -995, 'diferenca da contagem';
  assert (r->>'estoque_atual')::numeric = 205, 'estoque 2a compra';
  assert exists (select 1 from insumo_movimentacoes
                 where insumo_id = v_id and tipo = 'perda' and quantidade = -995), 'mov perda';

  r := acertar_estoque_insumo(v_id, 210, 'check');
  assert exists (select 1 from insumo_movimentacoes
                 where insumo_id = v_id and tipo = 'acerto' and quantidade = 5), 'mov acerto';

  assert (select data_type from information_schema.columns
          where table_name = 'decants' and column_name = 'ml') = 'numeric', 'decants.ml numeric';
  assert (select count(*) from insumo_listas) = 6, 'seeds das listas';
end $$;

rollback;
