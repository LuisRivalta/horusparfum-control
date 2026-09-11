-- =============================================================
-- Contas parceladas (com entrada) — Contas a Pagar / a Receber
--
-- Modelo: toda conta passa a ter linhas em `conta_parcelas`.
--   - Conta a vista      -> 1 parcela (numero = 1)
--   - Conta com entrada  -> parcela numero = 0 (a entrada) + 1..N
-- `contas.valor` continua sendo o TOTAL do acordo.
-- `contas.status` vira campo derivado, mantido por trigger (compat).
--
-- Baixar uma parcela gera automaticamente uma transacao
-- (origem = 'conta'), entrando no fluxo de caixa / metas.
--
-- Aplicar no SQL Editor do Supabase.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Colunas novas em `contas`
-- -------------------------------------------------------------
alter table public.contas add column if not exists valor_entrada numeric(12,2) not null default 0;
alter table public.contas add column if not exists num_parcelas int not null default 1;
alter table public.contas add column if not exists categoria text;
alter table public.contas add column if not exists forma_pagamento text;
alter table public.contas add column if not exists responsavel text;

alter table public.contas drop constraint if exists contas_num_parcelas_check;
alter table public.contas add constraint contas_num_parcelas_check check (num_parcelas >= 0);

alter table public.contas drop constraint if exists contas_valor_entrada_check;
alter table public.contas add constraint contas_valor_entrada_check check (valor_entrada >= 0);

-- -------------------------------------------------------------
-- 2. Tabela `conta_parcelas`
--    numero = 0  -> entrada
--    numero >= 1 -> parcela N de num_parcelas
-- -------------------------------------------------------------
create table if not exists public.conta_parcelas (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas(id) on delete cascade,
  numero int not null check (numero >= 0),
  valor numeric(12,2) not null check (valor > 0),
  vencimento date,
  status text not null default 'a_vencer' check (status in ('a_vencer','paga','recebida')),
  quitada_em date,
  transacao_id uuid,
  created_at timestamptz not null default now(),
  unique (conta_id, numero)
);

create index if not exists conta_parcelas_conta_id_idx on public.conta_parcelas (conta_id);
create index if not exists conta_parcelas_vencimento_idx on public.conta_parcelas (vencimento);

alter table public.conta_parcelas enable row level security;
drop policy if exists "Acesso total autenticados" on public.conta_parcelas;
create policy "Acesso total autenticados" on public.conta_parcelas
  for all to authenticated using (true) with check (true);

-- -------------------------------------------------------------
-- 3. `transacoes` passa a aceitar origem 'conta'
-- -------------------------------------------------------------
alter table public.transacoes drop constraint if exists transacoes_origem_check;
alter table public.transacoes add constraint transacoes_origem_check
  check (origem in ('manual','venda','decant','conta'));

alter table public.transacoes add column if not exists conta_parcela_id uuid;

alter table public.transacoes drop constraint if exists transacoes_conta_parcela_id_fkey;
alter table public.transacoes add constraint transacoes_conta_parcela_id_fkey
  foreign key (conta_parcela_id) references public.conta_parcelas(id) on delete set null;

create index if not exists transacoes_conta_parcela_id_idx on public.transacoes (conta_parcela_id);

-- `conta_parcelas.transacao_id` aponta de volta (set null se a transacao sumir)
alter table public.conta_parcelas drop constraint if exists conta_parcelas_transacao_id_fkey;
alter table public.conta_parcelas add constraint conta_parcelas_transacao_id_fkey
  foreign key (transacao_id) references public.transacoes(id) on delete set null;

-- -------------------------------------------------------------
-- 4. Backfill — cada conta existente vira 1 parcela a vista
-- -------------------------------------------------------------
insert into public.conta_parcelas (conta_id, numero, valor, vencimento, status, quitada_em, created_at)
select
  c.id,
  1,
  c.valor,
  c.vencimento,
  case when c.status in ('paga','recebida') then c.status else 'a_vencer' end,
  case when c.status in ('paga','recebida') then coalesce(c.vencimento, c.created_at::date) end,
  c.created_at
from public.contas c
where c.valor > 0
  and not exists (select 1 from public.conta_parcelas p where p.conta_id = c.id);

-- -------------------------------------------------------------
-- 5. Trigger: mantem `contas.status` derivado das parcelas
-- -------------------------------------------------------------
create or replace function public.sync_conta_status()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_conta_id uuid := coalesce(new.conta_id, old.conta_id);
  v_tipo text;
  v_abertas int;
  v_vencidas int;
begin
  select tipo into v_tipo from contas where id = v_conta_id;
  if not found then return null; end if;

  select
    count(*) filter (where status = 'a_vencer'),
    count(*) filter (where status = 'a_vencer' and vencimento is not null and vencimento < current_date)
  into v_abertas, v_vencidas
  from conta_parcelas where conta_id = v_conta_id;

  update contas set status = case
    when v_abertas = 0 then (case when v_tipo = 'receber' then 'recebida' else 'paga' end)
    when v_vencidas > 0 then 'vencida'
    else 'a_vencer'
  end
  where id = v_conta_id;

  return null;
end;
$fn$;

drop trigger if exists trg_sync_conta_status on public.conta_parcelas;
create trigger trg_sync_conta_status
after insert or update or delete on public.conta_parcelas
for each row execute function public.sync_conta_status();

-- -------------------------------------------------------------
-- 6. RPC: baixar parcela (marca quitada + gera transacao)
-- -------------------------------------------------------------
drop function if exists public.baixar_parcela(uuid, date, text, text);

create or replace function public.baixar_parcela(
  p_parcela_id uuid,
  p_data date default null,
  p_forma_pagamento text default null,
  p_responsavel text default null
) returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  v_parcela conta_parcelas%rowtype;
  v_conta contas%rowtype;
  v_data date := coalesce(p_data, current_date);
  v_status text;
  v_tipo_tx text;
  v_label text;
  v_descricao text;
  v_transacao_id uuid;
begin
  select * into v_parcela from conta_parcelas where id = p_parcela_id for update;
  if not found then raise exception 'Parcela nao encontrada'; end if;
  if v_parcela.status <> 'a_vencer' then
    raise exception 'Parcela ja esta quitada';
  end if;

  select * into v_conta from contas where id = v_parcela.conta_id for update;
  if not found then raise exception 'Conta nao encontrada'; end if;

  v_status := case when v_conta.tipo = 'receber' then 'recebida' else 'paga' end;
  v_tipo_tx := case when v_conta.tipo = 'receber' then 'entrada' else 'saida' end;

  v_label := case
    when v_parcela.numero = 0 then 'Entrada'
    when v_conta.num_parcelas <= 1 then 'Parcela unica'
    else 'Parcela ' || v_parcela.numero || '/' || v_conta.num_parcelas
  end;

  v_descricao := coalesce(nullif(v_conta.descricao, ''), nullif(v_conta.entidade, ''),
                          'Conta a ' || v_conta.tipo) || ' — ' || v_label;

  insert into transacoes (descricao, tipo, valor, categoria, forma_pagamento, responsavel,
                          origem, conta_parcela_id, created_at)
  values (v_descricao, v_tipo_tx, v_parcela.valor,
          coalesce(nullif(v_conta.categoria, ''),
                   case when v_conta.tipo = 'receber' then 'Vendas' else 'Fornecedores' end),
          coalesce(nullif(p_forma_pagamento, ''), nullif(v_conta.forma_pagamento, '')),
          coalesce(nullif(p_responsavel, ''), nullif(v_conta.responsavel, '')),
          'conta', v_parcela.id, v_data::timestamptz)
  returning id into v_transacao_id;

  update conta_parcelas
    set status = v_status, quitada_em = v_data, transacao_id = v_transacao_id
  where id = v_parcela.id;

  return jsonb_build_object('parcela_id', v_parcela.id, 'transacao_id', v_transacao_id, 'status', v_status);
end;
$fn$;

-- -------------------------------------------------------------
-- 7. RPC: criar conta (a vista, parcelada, com ou sem entrada)
-- -------------------------------------------------------------
drop function if exists public.criar_conta(text, text, text, numeric, numeric, int, date, int, boolean, date, text, text, text);

create or replace function public.criar_conta(
  p_tipo text,
  p_entidade text,
  p_descricao text,
  p_valor_total numeric,
  p_entrada numeric default 0,
  p_num_parcelas int default 1,
  p_primeiro_vencimento date default null,
  p_intervalo_meses int default 1,
  p_entrada_quitada boolean default false,
  p_data_entrada date default null,
  p_categoria text default null,
  p_forma_pagamento text default null,
  p_responsavel text default null
) returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  v_conta_id uuid;
  v_total numeric(12,2) := round(coalesce(p_valor_total, 0), 2);
  v_entrada numeric(12,2) := round(coalesce(p_entrada, 0), 2);
  v_restante numeric(12,2);
  v_n int := coalesce(p_num_parcelas, 1);
  v_intervalo int := greatest(coalesce(p_intervalo_meses, 1), 1);
  v_base numeric(12,2);
  v_valor numeric(12,2);
  v_acc numeric(12,2) := 0;
  v_venc date;
  v_parcela_id uuid;
  i int;
begin
  if p_tipo not in ('pagar','receber') then
    raise exception 'Tipo invalido: use pagar ou receber';
  end if;
  if v_total <= 0 then
    raise exception 'Valor total deve ser maior que zero';
  end if;
  if v_entrada < 0 or v_entrada > v_total then
    raise exception 'Entrada deve estar entre 0 e o valor total';
  end if;

  v_restante := v_total - v_entrada;

  if v_restante > 0 and v_n < 1 then
    raise exception 'Informe ao menos 1 parcela para o saldo restante';
  end if;
  if v_restante = 0 then
    v_n := 0;
  end if;
  if v_n > 120 then
    raise exception 'Numero de parcelas acima do limite (120)';
  end if;

  insert into contas (tipo, entidade, descricao, valor, vencimento, status,
                      valor_entrada, num_parcelas, categoria, forma_pagamento, responsavel)
  values (p_tipo, nullif(p_entidade, ''), nullif(p_descricao, ''), v_total,
          coalesce(p_primeiro_vencimento, p_data_entrada), 'a_vencer',
          v_entrada, v_n, nullif(p_categoria, ''), nullif(p_forma_pagamento, ''), nullif(p_responsavel, ''))
  returning id into v_conta_id;

  -- entrada (parcela numero 0)
  if v_entrada > 0 then
    insert into conta_parcelas (conta_id, numero, valor, vencimento, status)
    values (v_conta_id, 0, v_entrada, coalesce(p_data_entrada, current_date), 'a_vencer')
    returning id into v_parcela_id;

    if coalesce(p_entrada_quitada, false) then
      perform baixar_parcela(v_parcela_id, coalesce(p_data_entrada, current_date),
                             nullif(p_forma_pagamento, ''), nullif(p_responsavel, ''));
    end if;
  end if;

  -- parcelas 1..N (resto de arredondamento vai na ultima)
  if v_n > 0 then
    v_base := trunc(v_restante / v_n, 2);
    for i in 1..v_n loop
      if i = v_n then
        v_valor := v_restante - v_acc;
      else
        v_valor := v_base;
        v_acc := v_acc + v_base;
      end if;

      if v_valor <= 0 then
        raise exception 'Parcela % ficou com valor invalido — reduza o numero de parcelas', i;
      end if;

      v_venc := case
        when p_primeiro_vencimento is null then null
        else (p_primeiro_vencimento + ((i - 1) * v_intervalo) * interval '1 month')::date
      end;

      insert into conta_parcelas (conta_id, numero, valor, vencimento)
      values (v_conta_id, i, v_valor, v_venc);
    end loop;
  end if;

  return jsonb_build_object('conta_id', v_conta_id, 'parcelas', v_n, 'entrada', v_entrada);
end;
$fn$;

-- -------------------------------------------------------------
-- 8. RPC: estornar parcela (desfaz a baixa e remove a transacao)
-- -------------------------------------------------------------
drop function if exists public.estornar_parcela(uuid);

create or replace function public.estornar_parcela(p_parcela_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  v_parcela conta_parcelas%rowtype;
begin
  select * into v_parcela from conta_parcelas where id = p_parcela_id for update;
  if not found then raise exception 'Parcela nao encontrada'; end if;
  if v_parcela.status = 'a_vencer' then
    raise exception 'Parcela nao esta quitada';
  end if;

  update conta_parcelas
    set status = 'a_vencer', quitada_em = null, transacao_id = null
  where id = v_parcela.id;

  if v_parcela.transacao_id is not null then
    delete from transacoes where id = v_parcela.transacao_id;
  end if;

  return jsonb_build_object('parcela_id', v_parcela.id, 'status', 'a_vencer');
end;
$fn$;

-- Estorno a partir da transacao (usado na tela de Transacoes)
drop function if exists public.estornar_parcela_por_transacao(uuid);

create or replace function public.estornar_parcela_por_transacao(p_transacao_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  v_parcela_id uuid;
begin
  select id into v_parcela_id from conta_parcelas where transacao_id = p_transacao_id;
  if v_parcela_id is null then
    select conta_parcela_id into v_parcela_id from transacoes where id = p_transacao_id;
  end if;

  if v_parcela_id is null then
    delete from transacoes where id = p_transacao_id;
    return jsonb_build_object('estornada', false);
  end if;

  return estornar_parcela(v_parcela_id) || jsonb_build_object('estornada', true);
end;
$fn$;

-- -------------------------------------------------------------
-- 9. RPC: excluir conta (remove parcelas e transacoes geradas)
-- -------------------------------------------------------------
drop function if exists public.excluir_conta(uuid);

create or replace function public.excluir_conta(p_conta_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  v_removidas int := 0;
begin
  if not exists (select 1 from contas where id = p_conta_id) then
    raise exception 'Conta nao encontrada';
  end if;

  delete from transacoes
  where conta_parcela_id in (select id from conta_parcelas where conta_id = p_conta_id)
     or id in (select transacao_id from conta_parcelas
               where conta_id = p_conta_id and transacao_id is not null);
  get diagnostics v_removidas = row_count;

  delete from contas where id = p_conta_id;

  return jsonb_build_object('conta_id', p_conta_id, 'transacoes_removidas', v_removidas);
end;
$fn$;

-- -------------------------------------------------------------
-- 10. Grants
-- -------------------------------------------------------------
grant execute on function public.criar_conta(text, text, text, numeric, numeric, int, date, int, boolean, date, text, text, text) to authenticated;
grant execute on function public.baixar_parcela(uuid, date, text, text) to authenticated;
grant execute on function public.estornar_parcela(uuid) to authenticated;
grant execute on function public.estornar_parcela_por_transacao(uuid) to authenticated;
grant execute on function public.excluir_conta(uuid) to authenticated;
