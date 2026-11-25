-- Roda no SQL Editor depois da migração 20261125110000_tarefas.sql.
-- Termina em ROLLBACK (não deixa dados). Esperado: NOTICE "tarefas ok".
begin;

do $$
declare
  c text;
begin
  foreach c in array array['id','titulo','descricao','prazo','status','ordem','created_at'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'tarefas' and column_name = c) then
      raise exception 'falta a coluna tarefas.%', c;
    end if;
  end loop;

  insert into public.tarefas (titulo, prazo) values ('Teste do check', current_date);

  begin
    insert into public.tarefas (titulo, status) values ('X', 'outro');
    raise exception 'status inválido foi aceito';
  exception when check_violation then null;
  end;

  begin
    insert into public.tarefas (titulo) values ('   ');
    raise exception 'título vazio foi aceito';
  exception when check_violation then null;
  end;

  if not (select relrowsecurity from pg_class where oid = 'public.tarefas'::regclass) then
    raise exception 'RLS desligado em tarefas';
  end if;

  raise notice 'tarefas ok';
end $$;

rollback;
