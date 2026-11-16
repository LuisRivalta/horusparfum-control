-- Roda no SQL Editor depois da migração 20261117100000_anuncios_schema.sql.
-- Termina em ROLLBACK (não deixa dados). Esperado: NOTICE "anuncios ok".
begin;

do $$
declare
  c text;
  cols text[] := array[
    'produtos.gtin','produtos.ficha',
    'produto_fotos.id','produto_fotos.produto_id','produto_fotos.url','produto_fotos.uso',
    'produto_fotos.ordem','produto_fotos.created_at',
    'anuncios_config.id','anuncios_config.margem_padrao','anuncios_config.tipo_padrao',
    'anuncios_config.modelo_descricao','anuncios_config.ia_ativa',
    'anuncios_config.tamanhos_decant','anuncios_config.canal_id',
    'anuncios.id','anuncios.produto_id','anuncios.canal_id','anuncios.tipo','anuncios.ml',
    'anuncios.listing_type','anuncios.margem','anuncios.custo_base','anuncios.preco',
    'anuncios.titulo','anuncios.descricao','anuncios.fotos','anuncios.status',
    'anuncios.ml_item_id','anuncios.permalink','anuncios.erro','anuncios.qualidade_score',
    'anuncios.qualidade_nivel','anuncios.qualidade_em','anuncios.created_at','anuncios.updated_at',
    'ml_conexao.id','ml_conexao.ml_user_id','ml_conexao.nickname','ml_conexao.access_token',
    'ml_conexao.refresh_token','ml_conexao.expires_at','ml_conexao.user_product',
    'ml_conexao.updated_at'
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

  -- decant sem ml tem que ser recusado pelo check (CHECK roda antes da FK)
  begin
    insert into anuncios (produto_id, tipo, ml, listing_type)
    values (gen_random_uuid(), 'decant', null, 'gold_special');
    raise exception 'anuncios aceitou decant sem ml';
  exception when check_violation then
    null;
  end;

  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'ml_conexao') > 0 then
    raise exception 'ml_conexao não pode ter policy (só service role)';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.ml_conexao'::regclass) then
    raise exception 'ml_conexao sem RLS ligado';
  end if;

  if (select count(*) from anuncios_config) <> 1 then
    raise exception 'anuncios_config deve ter exatamente 1 linha';
  end if;

  raise notice 'anuncios ok';
end $$;

rollback;
