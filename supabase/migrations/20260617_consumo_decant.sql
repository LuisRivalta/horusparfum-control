-- =============================================================
-- Consumo de decant não-faturável (perda/brinde/amostra/marketing)
-- Pré-requisito: 20260616_vendas.sql (embalagens_decant, transacoes.origem)
-- Aplicar no SQL Editor do Supabase
-- =============================================================

-- 1. Colunas em decants
alter table decants add column if not exists classificacao text
  check (classificacao in ('perda','amostra','brinde','marketing','uso_interno','outro'));
alter table decants add column if not exists custo numeric(12,2) not null default 0;
alter table decants add column if not exists custo_embalagem numeric(12,2) not null default 0;

-- 2. transacoes.origem passa a aceitar 'decant'
alter table transacoes drop constraint if exists transacoes_origem_check;
alter table transacoes add constraint transacoes_origem_check
  check (origem in ('manual','venda','decant'));

-- 3. RPC: consumo de decant não-faturável (atômico)
create or replace function registrar_consumo_decant(
  p_frasco_id uuid,
  p_ml int,
  p_classificacao text,
  p_custo_embalagem numeric,
  p_responsavel text
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_frasco frascos_abertos%rowtype;
  v_produto produtos%rowtype;
  v_custo_perfume numeric(12,2);
  v_custo_emb numeric(12,2);
  v_custo_total numeric(12,2);
  v_novo_ml int;
  v_decant_id uuid;
  v_label text;
begin
  if p_classificacao not in ('perda','amostra','brinde','marketing','uso_interno','outro') then
    raise exception 'Classificação inválida';
  end if;
  if p_ml is null or p_ml <= 0 then raise exception 'ml inválido'; end if;

  select * into v_frasco from frascos_abertos where id = p_frasco_id for update;
  if not found then raise exception 'Frasco não encontrado'; end if;
  if v_frasco.status <> 'ativo' then raise exception 'Frasco não está ativo'; end if;
  if v_frasco.ml_restante < p_ml then
    raise exception 'ml insuficiente no frasco: % disponíveis', v_frasco.ml_restante;
  end if;

  select * into v_produto from produtos where id = v_frasco.produto_id for update;

  v_custo_perfume := round(p_ml * coalesce(v_produto.custo_medio, 0) / nullif(v_frasco.ml_total, 0), 2);
  v_custo_emb := case when p_classificacao = 'perda' then 0 else coalesce(p_custo_embalagem, 0) end;
  v_custo_total := coalesce(v_custo_perfume, 0) + v_custo_emb;

  v_novo_ml := v_frasco.ml_restante - p_ml;
  update frascos_abertos set
    ml_restante = v_novo_ml,
    status = case when v_novo_ml <= 0 then 'esgotado' else 'ativo' end
  where id = v_frasco.id;

  insert into decants (frasco_id, produto_id, ml, classificacao, custo, custo_embalagem)
  values (v_frasco.id, v_frasco.produto_id, p_ml, p_classificacao, v_custo_total, v_custo_emb)
  returning id into v_decant_id;

  v_label := case p_classificacao
    when 'perda' then 'Perda' when 'amostra' then 'Amostra' when 'brinde' then 'Brinde'
    when 'marketing' then 'Marketing' when 'uso_interno' then 'Uso interno' else 'Outro' end;

  if v_custo_total > 0 then
    insert into transacoes (descricao, tipo, valor, categoria, responsavel, origem)
    values (v_label || ' — ' || p_ml || 'ml ' || v_produto.nome, 'saida', v_custo_total,
            v_label, p_responsavel, 'decant');
  end if;

  return jsonb_build_object('id', v_decant_id, 'custo', v_custo_total, 'esgotado', v_novo_ml <= 0);
end;
$$;
