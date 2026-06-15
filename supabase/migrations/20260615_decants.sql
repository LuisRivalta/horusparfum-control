-- supabase/migrations/20260615_decants.sql

-- Frascos abertos
create table public.frascos_abertos (
  id          uuid        primary key default gen_random_uuid(),
  produto_id  uuid        not null references public.produtos(id),
  ml_total    int         not null,
  ml_restante int         not null check (ml_restante >= 0),
  status      text        not null default 'ativo' check (status in ('ativo', 'esgotado')),
  aberto_em   timestamptz not null default now()
);

-- Só pode haver 1 frasco ATIVO por produto (permite reabrir após esgotado/excluído)
create unique index frascos_abertos_ativo_unico
  on public.frascos_abertos (produto_id)
  where status = 'ativo';

-- Decants
create table public.decants (
  id         uuid        primary key default gen_random_uuid(),
  frasco_id  uuid        not null references public.frascos_abertos(id) on delete cascade,
  produto_id uuid        not null references public.produtos(id),
  ml         int         not null check (ml > 0),
  created_at timestamptz not null default now()
);

-- RLS
alter table public.frascos_abertos enable row level security;
create policy "Acesso total autenticados" on public.frascos_abertos
  for all to authenticated using (true) with check (true);

alter table public.decants enable row level security;
create policy "Acesso total autenticados" on public.decants
  for all to authenticated using (true) with check (true);
