-- supabase/migrations/20261117100000_anuncios_schema.sql
-- Anúncios (Mercado Livre): ficha e GTIN do produto, fotos, anúncios,
-- configuração (linha única) e conexão ML (linha única, só service role).

-- 1. Ficha do produto --------------------------------------------
-- ficha: chave = id do atributo do ML (GENDER, PERFUME_TYPE...),
-- valor = {"value_id": string|null, "value_name": string}
alter table public.produtos add column if not exists gtin  text;
alter table public.produtos add column if not exists ficha jsonb not null default '{}';

-- 2. Tabelas novas ------------------------------------------------
create table if not exists public.produto_fotos (
  id         uuid        primary key default gen_random_uuid(),
  produto_id uuid        not null references public.produtos(id) on delete cascade,
  url        text        not null,
  uso        text        not null check (uso in ('frasco','decant')),
  ordem      int         not null,
  created_at timestamptz default now()
);
create index if not exists produto_fotos_produto_idx
  on public.produto_fotos (produto_id, uso, ordem);

create table if not exists public.anuncios_config (
  id               int           primary key default 1 check (id = 1),
  margem_padrao    numeric(6,4)  not null default 0.6,
  tipo_padrao      text          not null default 'gold_special'
                                 check (tipo_padrao in ('gold_special','gold_pro')),
  modelo_descricao text          not null default '',
  ia_ativa         boolean       not null default false,
  tamanhos_decant  numeric[]     not null default '{2.5,5,10}',
  canal_id         uuid          references public.canais(id)
);

create table if not exists public.anuncios (
  id              uuid          primary key default gen_random_uuid(),
  produto_id      uuid          not null references public.produtos(id),
  canal_id        uuid          references public.canais(id),
  tipo            text          not null check (tipo in ('frasco','decant')),
  ml              numeric(6,1),
  listing_type    text          not null check (listing_type in ('gold_special','gold_pro')),
  margem          numeric(6,4),
  custo_base      numeric(12,2),
  preco           numeric(12,2),
  titulo          text,
  descricao       text,
  fotos           text[]        not null default '{}',
  status          text          not null default 'rascunho'
                                check (status in ('rascunho','publicado','pausado','erro')),
  ml_item_id      text          unique,
  permalink       text,
  erro            text,
  qualidade_score int,
  qualidade_nivel text,
  qualidade_em    timestamptz,
  created_at      timestamptz   default now(),
  updated_at      timestamptz   default now(),
  check ((tipo = 'decant') = (ml is not null))
);
create index if not exists anuncios_produto_idx on public.anuncios (produto_id);

create table if not exists public.ml_conexao (
  id            int          primary key default 1 check (id = 1),
  ml_user_id    bigint,
  nickname      text,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  user_product  boolean      default false,
  updated_at    timestamptz
);

-- 3. RLS ----------------------------------------------------------
alter table public.produto_fotos   enable row level security;
alter table public.anuncios_config enable row level security;
alter table public.anuncios        enable row level security;
alter table public.ml_conexao      enable row level security;

drop policy if exists "Acesso total autenticados" on public.produto_fotos;
create policy "Acesso total autenticados" on public.produto_fotos
  for all to authenticated using (true) with check (true);
drop policy if exists "Acesso total autenticados" on public.anuncios_config;
create policy "Acesso total autenticados" on public.anuncios_config
  for all to authenticated using (true) with check (true);
drop policy if exists "Acesso total autenticados" on public.anuncios;
create policy "Acesso total autenticados" on public.anuncios
  for all to authenticated using (true) with check (true);
-- ml_conexao: RLS ligado e SEM policy (guarda tokens do ML; só service role acessa).
drop policy if exists "Acesso total autenticados" on public.ml_conexao;

-- 4. Seeds --------------------------------------------------------
insert into public.anuncios_config (id, canal_id)
values (1, (select id from public.canais where nome = 'Mercado Livre' limit 1))
on conflict (id) do nothing;

insert into public.produto_fotos (produto_id, url, uso, ordem)
select p.id, p.foto_url, 'frasco', 0
from public.produtos p
where p.foto_url is not null
  and not exists (select 1 from public.produto_fotos f where f.produto_id = p.id);
