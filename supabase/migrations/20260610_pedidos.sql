-- =============================================================
-- Pedidos de compra + conferência de recebimento + divergências
-- Aplicar no SQL Editor do Supabase (project wyobbztexoofhqdttxzq)
-- =============================================================

-- 1. Tabelas -----------------------------------------------------

create table if not exists pedidos (
  id uuid primary key default uuid_generate_v4(),
  numero serial unique,
  fornecedor_id uuid not null references fornecedores(id),
  status text not null default 'aguardando'
    check (status in ('aguardando', 'recebido', 'cancelado')),
  previsao_chegada date,
  valor_total numeric(12,2) not null default 0,
  responsavel text,
  recebido_em timestamptz,
  recebido_por text,
  created_at timestamptz not null default now()
);

create table if not exists pedido_itens (
  id uuid primary key default uuid_generate_v4(),
  pedido_id uuid not null references pedidos(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  qtd_pedida int not null check (qtd_pedida >= 1),
  qtd_recebida int check (qtd_recebida >= 0),
  preco_unitario numeric(12,2) not null check (preco_unitario >= 0)
);

create table if not exists divergencias (
  id uuid primary key default uuid_generate_v4(),
  pedido_id uuid not null references pedidos(id),
  pedido_item_id uuid not null references pedido_itens(id),
  fornecedor_id uuid not null references fornecedores(id),
  tipo text not null
    check (tipo in ('faltou', 'veio_a_mais', 'avariado', 'produto_errado')),
  qtd_pedida int not null,
  qtd_recebida int not null,
  observacao text,
  created_at timestamptz not null default now()
);

alter table produtos add column if not exists custo_medio numeric(12,2);
alter table produtos add column if not exists ultimo_custo numeric(12,2);

create index if not exists idx_pedido_itens_pedido on pedido_itens(pedido_id);
create index if not exists idx_divergencias_fornecedor on divergencias(fornecedor_id);

-- 2. RLS ---------------------------------------------------------

alter table pedidos enable row level security;
alter table pedido_itens enable row level security;
alter table divergencias enable row level security;

drop policy if exists "Acesso total autenticados" on pedidos;
create policy "Acesso total autenticados" on pedidos
  for all to authenticated using (true) with check (true);
drop policy if exists "Acesso total autenticados" on pedido_itens;
create policy "Acesso total autenticados" on pedido_itens
  for all to authenticated using (true) with check (true);
drop policy if exists "Acesso total autenticados" on divergencias;
create policy "Acesso total autenticados" on divergencias
  for all to authenticated using (true) with check (true);

-- 3. RPC: confirmação atômica do recebimento ---------------------
-- p_itens: [{"item_id": uuid, "qtd_recebida": int,
--            "divergencia_tipo": text|null, "divergencia_obs": text|null}]

create or replace function confirmar_recebimento(
  p_pedido_id uuid,
  p_itens jsonb,
  p_recebido_por text
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_pedido pedidos%rowtype;
  v_item pedido_itens%rowtype;
  v_produto produtos%rowtype;
  v_entrada jsonb;
  v_qtd int;
  v_div_tipo text;
  v_novo_estoque int;
  v_novo_custo numeric(12,2);
begin
  select * into v_pedido from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado';
  end if;
  if v_pedido.status <> 'aguardando' then
    raise exception 'Pedido já está com status %', v_pedido.status;
  end if;

  if (select count(*) from pedido_itens where pedido_id = p_pedido_id) = 0 then
    raise exception 'Pedido sem itens não pode ser confirmado';
  end if;

  -- todo item do pedido precisa vir na conferência
  if (select count(*) from pedido_itens where pedido_id = p_pedido_id)
     <> jsonb_array_length(p_itens) then
    raise exception 'Conferência incompleta: todos os itens devem ser informados';
  end if;

  if (select count(distinct e->>'item_id') from jsonb_array_elements(p_itens) e)
     <> jsonb_array_length(p_itens) then
    raise exception 'Payload contém item duplicado';
  end if;

  for v_entrada in select * from jsonb_array_elements(p_itens) loop
    select * into v_item from pedido_itens
      where id = (v_entrada->>'item_id')::uuid and pedido_id = p_pedido_id;
    if not found then
      raise exception 'Item % não pertence ao pedido', v_entrada->>'item_id';
    end if;

    v_qtd := (v_entrada->>'qtd_recebida')::int;
    v_div_tipo := v_entrada->>'divergencia_tipo';

    if v_qtd is null then
      raise exception 'qtd_recebida é obrigatória para todos os itens';
    end if;

    if v_qtd <> v_item.qtd_pedida and v_div_tipo is null then
      raise exception 'Item com quantidade divergente exige tipo de divergência';
    end if;

    update pedido_itens set qtd_recebida = v_qtd where id = v_item.id;

    -- divergência (se houver)
    if v_div_tipo is not null and v_qtd <> v_item.qtd_pedida then
      insert into divergencias
        (pedido_id, pedido_item_id, fornecedor_id, tipo,
         qtd_pedida, qtd_recebida, observacao)
      values
        (p_pedido_id, v_item.id, v_pedido.fornecedor_id, v_div_tipo,
         v_item.qtd_pedida, v_qtd, v_entrada->>'divergencia_obs');
    end if;

    -- entrada no estoque (só se chegou algo)
    if v_qtd > 0 then
      select * into v_produto from produtos
        where id = v_item.produto_id for update;

      v_novo_estoque := coalesce(v_produto.estoque_atual, 0) + v_qtd;

      if v_produto.custo_medio is null or coalesce(v_produto.estoque_atual, 0) <= 0 then
        v_novo_custo := v_item.preco_unitario;
      else
        v_novo_custo := round(
          (v_produto.estoque_atual * v_produto.custo_medio
           + v_qtd * v_item.preco_unitario)
          / (v_produto.estoque_atual + v_qtd), 2);
      end if;

      update produtos set
        estoque_atual = v_novo_estoque,
        custo_medio = v_novo_custo,
        ultimo_custo = v_item.preco_unitario
      where id = v_produto.id;

      insert into movimentacoes
        (produto_id, tipo, quantidade, motivo, responsavel, saldo_resultante)
      values
        (v_item.produto_id, 'entrada', v_qtd,
         'Pedido #' || v_pedido.numero, p_recebido_por, v_novo_estoque);
    end if;
  end loop;

  update pedidos set
    status = 'recebido',
    recebido_em = now(),
    recebido_por = p_recebido_por
  where id = p_pedido_id;

  update fornecedores set ultima_compra = current_date
  where id = v_pedido.fornecedor_id;
end;
$$;

-- 4. RPC: saída rápida atômica ------------------------------------

create or replace function registrar_saida(
  p_produto_id uuid,
  p_qtd int,
  p_motivo text,
  p_responsavel text
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_produto produtos%rowtype;
  v_novo_estoque int;
begin
  if p_qtd < 1 then
    raise exception 'Quantidade deve ser maior que zero';
  end if;

  select * into v_produto from produtos where id = p_produto_id for update;
  if not found then
    raise exception 'Produto não encontrado';
  end if;
  if coalesce(v_produto.estoque_atual, 0) < p_qtd then
    raise exception 'Estoque insuficiente: % unidades disponíveis', coalesce(v_produto.estoque_atual, 0);
  end if;

  v_novo_estoque := coalesce(v_produto.estoque_atual, 0) - p_qtd;

  update produtos set estoque_atual = v_novo_estoque where id = p_produto_id;

  insert into movimentacoes
    (produto_id, tipo, quantidade, motivo, responsavel, saldo_resultante)
  values
    (p_produto_id, 'saida', p_qtd, p_motivo, p_responsavel, v_novo_estoque);
end;
$$;
