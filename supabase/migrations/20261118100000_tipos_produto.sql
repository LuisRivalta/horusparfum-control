-- supabase/migrations/20261118100000_tipos_produto.sql
-- Tipo de produto (Perfume, Creme, Body splash...) e se ele pode ser vendido em decant.

-- 1. Tabela e sementes ---------------------------------------------
create table if not exists public.tipos_produto (
  id           uuid        primary key default gen_random_uuid(),
  nome         text        not null unique,
  vende_decant boolean     not null default false,
  created_at   timestamptz default now()
);

insert into public.tipos_produto (nome, vende_decant) values
  ('Perfume', true),
  ('Creme', false),
  ('Body splash', false)
on conflict (nome) do nothing;

alter table public.tipos_produto enable row level security;
drop policy if exists "Acesso total autenticados" on public.tipos_produto;
create policy "Acesso total autenticados" on public.tipos_produto
  for all to authenticated using (true) with check (true);

-- 2. Coluna no produto ---------------------------------------------
alter table public.produtos add column if not exists tipo_id uuid references public.tipos_produto(id);

update public.produtos
   set tipo_id = (select id from public.tipos_produto where nome = 'Perfume')
 where tipo_id is null;

alter table public.produtos alter column tipo_id set not null;

-- 3. Insert sem tipo recebe Perfume --------------------------------
-- (default de coluna não aceita subselect, por isso o trigger)
create or replace function public.produtos_tipo_padrao()
returns trigger
language plpgsql
as $$
begin
  if new.tipo_id is null then
    select id into new.tipo_id from public.tipos_produto where nome = 'Perfume';
  end if;
  return new;
end;
$$;

drop trigger if exists produtos_tipo_padrao on public.produtos;
create trigger produtos_tipo_padrao
  before insert on public.produtos
  for each row execute function public.produtos_tipo_padrao();
