-- supabase/migrations/20261125100000_anuncio_marcas.sql
-- Controle de anúncios: marcas manuais de "anúncio criado" por perfume,
-- canal (ml/shopify) e tipo (frasco ou decant de N ml). Marcar = insert; desmarcar = delete.

create table if not exists public.anuncio_marcas (
  id         uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete cascade,
  canal      text not null check (canal in ('ml','shopify')),
  tipo       text not null check (tipo in ('frasco','decant')),
  ml         numeric(6,1),
  created_at timestamptz not null default now(),
  check ((tipo = 'decant') = (ml is not null))
);

create unique index if not exists anuncio_marcas_unq
  on public.anuncio_marcas (produto_id, canal, tipo, coalesce(ml, 0));

alter table public.anuncio_marcas enable row level security;
drop policy if exists "Acesso total autenticados" on public.anuncio_marcas;
create policy "Acesso total autenticados" on public.anuncio_marcas
  for all to authenticated using (true) with check (true);
