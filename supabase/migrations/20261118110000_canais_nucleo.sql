-- supabase/migrations/20261118110000_canais_nucleo.sql
-- Núcleo de vendas dos canais (Shopify; depois ML): vínculos produto ↔ variante,
-- pedidos importados ("a confirmar"), fila de sincronização de estoque com aviso
-- ao backend via pg_net, e RPCs de confirmar / desfazer pedido.
-- Rodar depois de 20261118100000_tipos_produto.sql.

-- 0. Extensão -----------------------------------------------------
-- No Supabase o pg_net é instalado no schema "extensions", mas as funções
-- ficam no schema "net" (net.http_post).
create extension if not exists pg_net with schema extensions;

-- 1. Canal Shopify ------------------------------------------------
insert into public.canais (nome, taxa_padrao, usa_envio, ativo)
select 'Shopify', 0, true, true
where not exists (select 1 from public.canais where nome = 'Shopify');

-- 2. Tabelas ------------------------------------------------------
create table if not exists public.shopify_conexao (
  id           int          primary key default 1 check (id = 1),
  access_token text,
  expires_at   timestamptz,
  location_id  text,
  conectado_em timestamptz,
  updated_at   timestamptz
);

create table if not exists public.canal_vinculos (
  id                  uuid         primary key default gen_random_uuid(),
  canal               text         not null check (canal in ('shopify','ml')),
  produto_id          uuid         not null references public.produtos(id),
  tipo                text         not null check (tipo in ('frasco','decant')),
  ml                  numeric(6,1),
  externo_produto_id  text,
  externo_variante_id text         not null,
  externo_estoque_id  text,
  titulo              text,
  ultima_qtd          int,
  sincronizado_em     timestamptz,
  erro                text,
  created_at          timestamptz  default now(),
  unique (canal, externo_variante_id),
  check ((tipo = 'decant') = (ml is not null))
);
create index if not exists canal_vinculos_produto_idx on public.canal_vinculos (produto_id);

-- itens[] = {variante_id text, titulo text, quantidade int, preco_unitario numeric,
--            produto_id uuid|null, tipo 'frasco'|'decant'|null, ml numeric|null}
create table if not exists public.pedidos_canal (
  id         uuid          primary key default gen_random_uuid(),
  canal      text          not null,
  externo_id text          not null,
  numero     text,
  status     text          not null check (status in ('aguardando_pagamento','a_confirmar',
                                                    'confirmado','cancelado',
                                                    'cancelado_pos_confirmacao')),
  cliente    text,
  criado_em  timestamptz,
  total      numeric(12,2),
  frete      numeric(12,2) default 0,
  itens      jsonb         not null default '[]',
  venda_id   uuid          references public.vendas(id) on delete set null,
  alerta     text,
  created_at timestamptz   default now(),
  updated_at timestamptz   default now(),
  unique (canal, externo_id)
);
create index if not exists pedidos_canal_status_idx on public.pedidos_canal (status);
-- excluir_venda apaga a venda: o pedido fica, sem venda_id (re-run: recria a FK)
alter table public.pedidos_canal drop constraint if exists pedidos_canal_venda_id_fkey;
alter table public.pedidos_canal add constraint pedidos_canal_venda_id_fkey
  foreign key (venda_id) references public.vendas(id) on delete set null;

create table if not exists public.canal_sync_fila (
  produto_id uuid        primary key references public.produtos(id) on delete cascade,
  criado_em  timestamptz default now()
);

create table if not exists public.canais_sync_config (
  id      int  primary key default 1 check (id = 1),
  url     text,
  segredo text
);

-- 3. RLS ----------------------------------------------------------
alter table public.shopify_conexao    enable row level security;
alter table public.canal_vinculos     enable row level security;
alter table public.pedidos_canal      enable row level security;
alter table public.canal_sync_fila    enable row level security;
alter table public.canais_sync_config enable row level security;

drop policy if exists "Acesso total autenticados" on public.canal_vinculos;
create policy "Acesso total autenticados" on public.canal_vinculos
  for all to authenticated using (true) with check (true);
drop policy if exists "Acesso total autenticados" on public.pedidos_canal;
create policy "Acesso total autenticados" on public.pedidos_canal
  for all to authenticated using (true) with check (true);
-- shopify_conexao, canal_sync_fila, canais_sync_config: RLS ligado e SEM policy
-- (token e segredo; só service role acessa).
drop policy if exists "Acesso total autenticados" on public.shopify_conexao;
drop policy if exists "Acesso total autenticados" on public.canal_sync_fila;
drop policy if exists "Acesso total autenticados" on public.canais_sync_config;

-- 4. Gatilho de sincronização -------------------------------------
-- Produto com vínculo em algum canal entra na fila; se houver URL configurada,
-- avisa o backend. O pg_net só envia depois do commit (transação desfeita não avisa).
create or replace function public._canal_sync_marcar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_linha jsonb;
  v_produto_id uuid;
  v_cfg canais_sync_config%rowtype;
begin
  v_linha := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_produto_id := case when tg_table_name = 'produtos' then (v_linha->>'id')::uuid
                       else (v_linha->>'produto_id')::uuid end;

  if v_produto_id is null
     or not exists (select 1 from canal_vinculos where produto_id = v_produto_id) then
    return null;
  end if;

  insert into canal_sync_fila (produto_id) values (v_produto_id)
  on conflict do nothing;

  select * into v_cfg from canais_sync_config where id = 1;
  if v_cfg.url is not null then
    perform net.http_post(
      url := v_cfg.url,
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'X-Horus-Sync', coalesce(v_cfg.segredo, ''))
    );
  end if;

  return null;
end;
$$;

drop trigger if exists produtos_canal_sync on public.produtos;
create trigger produtos_canal_sync
  after update of estoque_atual on public.produtos
  for each row
  when (old.estoque_atual is distinct from new.estoque_atual)
  execute function public._canal_sync_marcar();

drop trigger if exists frascos_abertos_canal_sync on public.frascos_abertos;
create trigger frascos_abertos_canal_sync
  after insert or update of ml_restante, status or delete on public.frascos_abertos
  for each row
  execute function public._canal_sync_marcar();

-- 5. RPCs ---------------------------------------------------------
-- Confirma o pedido registrando a venda pelo registrar_venda (mesmos argumentos).
-- A trava + checagem de status impede duas vendas para o mesmo pedido.
create or replace function public.confirmar_pedido_canal(
  p_pedido_id uuid,
  p_canal_id uuid,
  p_data_venda date,
  p_forma_pagamento text,
  p_cliente text,
  p_taxa_total numeric,
  p_frete numeric,
  p_responsavel text,
  p_observacao text,
  p_itens jsonb,
  p_titulo text default null,
  p_insumos_envio jsonb default '[]'
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_pedido pedidos_canal%rowtype;
  v_venda jsonb;
begin
  select * into v_pedido from pedidos_canal where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_pedido.status <> 'a_confirmar' then
    raise exception 'Pedido não está a confirmar (%)', v_pedido.status;
  end if;

  v_venda := registrar_venda(p_canal_id, p_data_venda, p_forma_pagamento, p_cliente,
                             p_taxa_total, p_frete, p_responsavel, p_observacao,
                             p_itens, p_titulo, p_insumos_envio);

  update pedidos_canal set
    status = 'confirmado',
    venda_id = (v_venda->>'id')::uuid,
    updated_at = now()
  where id = p_pedido_id;

  return v_venda;
end;
$$;

-- Pedido cancelado no canal depois de confirmado: cancela a venda (devolve estoque).
create or replace function public.desfazer_pedido_canal(p_pedido_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_pedido pedidos_canal%rowtype;
begin
  select * into v_pedido from pedidos_canal where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_pedido.status <> 'cancelado_pos_confirmacao' then
    raise exception 'Pedido não está cancelado após confirmação (%)', v_pedido.status;
  end if;

  -- venda já cancelada à mão (tela de Vendas) ou excluída: só fecha o pedido
  if exists (select 1 from vendas where id = v_pedido.venda_id and status <> 'cancelada') then
    perform cancelar_venda(v_pedido.venda_id);
  end if;

  update pedidos_canal set
    status = 'cancelado',
    alerta = null,
    updated_at = now()
  where id = p_pedido_id;
end;
$$;
