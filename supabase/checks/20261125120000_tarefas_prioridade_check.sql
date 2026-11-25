-- Roda no SQL Editor depois da migração 20261125120000_tarefas_prioridade.sql.
-- Termina em ROLLBACK (não deixa dados). Esperado: NOTICE "prioridade ok".
begin;

do $$
begin
  if exists (select 1 from public.tarefas where prioridade is null) then
    raise exception 'há tarefa sem prioridade';
  end if;

  insert into public.tarefas (titulo) values ('Teste do check');
  if (select prioridade from public.tarefas where titulo = 'Teste do check' limit 1) <> 'media' then
    raise exception 'default da prioridade não é media';
  end if;

  begin
    insert into public.tarefas (titulo, prioridade) values ('X', 'urgente');
    raise exception 'prioridade inválida foi aceita';
  exception when check_violation then null;
  end;

  raise notice 'prioridade ok';
end $$;

rollback;
