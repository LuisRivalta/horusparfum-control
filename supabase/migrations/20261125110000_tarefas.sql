-- Kanban do módulo Gestão: uma linha por cartão.
-- Spec: docs/superpowers/specs/2026-11-25-kanban-gestao-design.md

create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (btrim(titulo) <> ''),
  descricao text,
  prazo date,
  status text not null default 'a_fazer' check (status in ('a_fazer', 'fazendo', 'feito')),
  ordem double precision not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists tarefas_status_ordem on public.tarefas (status, ordem);

alter table public.tarefas enable row level security;

drop policy if exists "Acesso total autenticados" on public.tarefas;
create policy "Acesso total autenticados" on public.tarefas
  for all to authenticated using (true) with check (true);
