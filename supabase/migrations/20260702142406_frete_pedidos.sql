-- Adiciona frete separado em pedidos de compra.
-- Aplicar no Supabase SQL Editor antes de usar em producao.

alter table pedidos
  add column if not exists frete numeric(12,2) not null default 0 check (frete >= 0);
