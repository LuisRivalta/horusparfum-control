-- Migration: Adiciona função RPC para excluir venda com estorno e limpeza em cascata
create or replace function excluir_venda(p_venda_id uuid)
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

  -- Se a venda estiver concluída, realiza o cancelamento e estorno de estoque/caixa primeiro
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
