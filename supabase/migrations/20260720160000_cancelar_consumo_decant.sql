-- Reversão completa de um consumo de decant
create or replace function cancelar_consumo_decant(p_decant_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_decant decants%rowtype;
  v_frasco frascos_abertos%rowtype;
begin
  -- 1. Bloqueia o decant
  select * into v_decant from decants where id = p_decant_id for update;
  if not found then raise exception 'Decant nao encontrado'; end if;

  -- 2. Bloqueia o frasco
  select * into v_frasco from frascos_abertos where id = v_decant.frasco_id for update;
  if not found then raise exception 'Frasco nao encontrado'; end if;

  -- 3. Devolve os ml para o frasco e reativa se estiver esgotado
  update frascos_abertos set
    ml_restante = ml_restante + v_decant.ml,
    status = 'ativo'
  where id = v_frasco.id;

  -- 4. Exclui a transacao financeira vinculada (despesa)
  delete from transacoes where decant_id = p_decant_id;

  -- 5. Exclui o registro de decant
  delete from decants where id = p_decant_id;
end;
$$;
