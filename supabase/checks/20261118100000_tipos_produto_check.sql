-- Roda no SQL Editor depois da migração 20261118100000_tipos_produto.sql.
-- Termina em ROLLBACK (não deixa dados).
begin;

do $$
declare
  v_n    int;
  v_prod uuid;
  v_tipo text;
begin
  select count(*) into v_n from tipos_produto where nome in ('Perfume','Creme','Body splash');
  if v_n <> 3 then raise exception 'esperava 3 sementes, achei %', v_n; end if;

  if not (select vende_decant from tipos_produto where nome = 'Perfume') then
    raise exception 'Perfume deveria vender em decant';
  end if;
  if (select vende_decant from tipos_produto where nome = 'Creme') then
    raise exception 'Creme não deveria vender em decant';
  end if;

  select count(*) into v_n from produtos where tipo_id is null;
  if v_n <> 0 then raise exception '% produto(s) com tipo_id nulo', v_n; end if;

  insert into produtos (nome, volume_ml, estoque_atual)
  values ('teste-check-tipo', 100, 0)
  returning id into v_prod;
  select t.nome into v_tipo from produtos p join tipos_produto t on t.id = p.tipo_id where p.id = v_prod;
  if v_tipo is distinct from 'Perfume' then
    raise exception 'insert sem tipo deveria receber Perfume, recebeu %', v_tipo;
  end if;

  raise notice 'OK: tipos_produto';
end $$;

rollback;
