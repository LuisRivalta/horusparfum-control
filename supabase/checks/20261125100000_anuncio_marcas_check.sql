-- Roda no SQL Editor depois da migração 20261125100000_anuncio_marcas.sql.
-- Termina em ROLLBACK (não deixa dados). Esperado: NOTICE "anuncio_marcas ok".
-- Precisa de pelo menos um produto cadastrado.
begin;

do $$
declare
  c text;
  pid uuid;
  cols text[] := array[
    'anuncio_marcas.id','anuncio_marcas.produto_id','anuncio_marcas.canal',
    'anuncio_marcas.tipo','anuncio_marcas.ml','anuncio_marcas.created_at'
  ];
begin
  foreach c in array cols loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public'
                     and table_name = split_part(c, '.', 1)
                     and column_name = split_part(c, '.', 2)) then
      raise exception 'falta coluna %', c;
    end if;
  end loop;

  select id into pid from produtos limit 1;
  if pid is null then
    raise exception 'sem produto para testar';
  end if;

  insert into anuncio_marcas (produto_id, canal, tipo) values (pid, 'ml', 'frasco');
  insert into anuncio_marcas (produto_id, canal, tipo, ml) values (pid, 'ml', 'decant', 5);

  -- mesmo frasco duas vezes: o índice único recusa
  begin
    insert into anuncio_marcas (produto_id, canal, tipo) values (pid, 'ml', 'frasco');
    raise exception 'anuncio_marcas aceitou frasco duplicado';
  exception when unique_violation then
    null;
  end;

  -- decant sem ml: o check recusa
  begin
    insert into anuncio_marcas (produto_id, canal, tipo, ml) values (pid, 'shopify', 'decant', null);
    raise exception 'anuncio_marcas aceitou decant sem ml';
  exception when check_violation then
    null;
  end;

  if not (select relrowsecurity from pg_class where oid = 'public.anuncio_marcas'::regclass) then
    raise exception 'anuncio_marcas sem RLS ligado';
  end if;

  raise notice 'anuncio_marcas ok';
end $$;

rollback;
