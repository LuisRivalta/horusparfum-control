-- RPC: registrar_entrada
-- Incrementa estoque_atual e grava movimentação de entrada manual.
-- Mesma estrutura da registrar_saida (ver 20260610_pedidos.sql).
create or replace function registrar_entrada(
  p_produto_id  uuid,
  p_qtd         int,
  p_motivo      text,
  p_responsavel text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_saldo int;
begin
  if p_qtd < 1 then
    raise exception 'Quantidade deve ser maior que zero';
  end if;

  update produtos
  set estoque_atual = estoque_atual + p_qtd
  where id = p_produto_id
  returning estoque_atual into v_saldo;

  if not found then
    raise exception 'Produto não encontrado';
  end if;

  insert into movimentacoes (produto_id, tipo, quantidade, motivo, responsavel, saldo_resultante)
  values (p_produto_id, 'entrada', p_qtd, p_motivo, p_responsavel, v_saldo);
end;
$$;
