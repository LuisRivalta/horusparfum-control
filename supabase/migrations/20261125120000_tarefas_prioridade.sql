-- Prioridade das tarefas do kanban (Gestão). As que já existem ficam 'media'.
-- Spec: docs/superpowers/specs/2026-11-25-kanban-cores-prioridade-design.md

alter table public.tarefas
  add column if not exists prioridade text not null default 'media'
  check (prioridade in ('alta', 'media', 'baixa'));
