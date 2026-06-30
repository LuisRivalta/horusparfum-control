create extension if not exists "uuid-ossp";

create table if not exists public.marcas (
  id uuid primary key default uuid_generate_v4(),
  nome text not null unique,
  created_at timestamptz not null default now()
);

alter table public.marcas enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'marcas'
      and policyname = 'Acesso total autenticados'
  ) then
    create policy "Acesso total autenticados"
    on public.marcas
    for all
    to authenticated
    using (true)
    with check (true);
  end if;
end $$;

alter table public.produtos
  add column if not exists marca_id uuid references public.marcas(id) on delete set null;

create index if not exists idx_produtos_marca_id on public.produtos(marca_id);
