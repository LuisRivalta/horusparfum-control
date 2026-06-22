-- Corrige o cancelamento de venda com item decant.
-- A funcao anterior tentava apagar public.decants antes de remover a
-- referencia public.venda_itens.decant_id, causando violacao de FK.

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
  if not found then raise exception 'Venda nao encontrada'; end if;
  if v_venda.status = 'cancelada' then raise exception 'Venda ja esta cancelada'; end if;

  for v_item in select * from venda_itens where venda_id = p_venda_id for update loop
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
        update venda_itens
          set decant_id = null
          where id = v_item.id;

        delete from decants
          where id = v_item.decant_id;
      end if;
    end if;
  end loop;

  delete from transacoes where venda_id = p_venda_id and origem = 'venda';
  update vendas set status = 'cancelada' where id = p_venda_id;
end;
$$;
