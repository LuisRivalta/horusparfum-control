-- Hardening da RPC registrar_entrada.
-- Objetivo: evitar execucao publica herdada por PUBLIC e fixar search_path.

create or replace function public.registrar_entrada(
  p_produto_id  uuid,
  p_qtd         int,
  p_motivo      text,
  p_responsavel text default null
)
returns void
language plpgsql
security definer
set search_path = public
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
    raise exception 'Produto nao encontrado';
  end if;

  insert into movimentacoes (produto_id, tipo, quantidade, motivo, responsavel, saldo_resultante)
  values (p_produto_id, 'entrada', p_qtd, p_motivo, p_responsavel, v_saldo);
end;
$$;

revoke all on function public.registrar_entrada(uuid, int, text, text) from public;
grant execute on function public.registrar_entrada(uuid, int, text, text) to authenticated;