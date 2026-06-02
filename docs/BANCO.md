# Banco de Dados — Horus Parfum Control

## Visão geral

PostgreSQL hospedado no **Supabase**. Todas as tabelas ficam no schema `public` (padrão do Supabase).

> **Status:** Schema criado e funcional no Supabase (project ref: wyobbztexoofhqdttxzq).

## Tabelas

### `categorias`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| nome | text | Ex: Masculino, Feminino, Unissex |
| icone | text | Nome do ícone (ex: "box") |
| created_at | timestamptz | — |

### `fornecedores`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| nome | text | Razão social / nome fantasia |
| contato | text | Email ou telefone |
| status | text | "ativo" ou "inativo" |
| ultima_compra | date | Data da última compra |
| created_at | timestamptz | — |

### `produtos`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| nome | text | Nome do perfume |
| volume_ml | int | Volume em ml |
| categoria_id | uuid (FK → categorias) | — |
| fornecedor_id | uuid (FK → fornecedores) | Nullable |
| estoque_atual | int | Unidades em estoque |
| estoque_minimo | int | Alerta quando atual < mínimo |
| foto_url | text | URL da imagem (Supabase Storage) |
| created_at | timestamptz | — |

### `movimentacoes`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| produto_id | uuid (FK → produtos) | — |
| tipo | text | "entrada" ou "saida" |
| quantidade | int | Unidades movimentadas |
| motivo | text | Ex: "Venda balcão", "Reposição" |
| responsavel | text | Nome do usuário |
| saldo_resultante | int | Estoque após a movimentação |
| created_at | timestamptz | — |

### `transacoes`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| descricao | text | Ex: "Venda balcão — Kit Trio Karnak" |
| tipo | text | "entrada" ou "saida" |
| valor | numeric(12,2) | Em BRL |
| categoria | text | Ex: "Vendas", "Fornecedores", "Marketing" |
| forma_pagamento | text | "Pix", "Cartão", "Boleto", "Transferência" |
| responsavel | text | Nome do usuário |
| created_at | timestamptz | — |

### `contas`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| tipo | text | "pagar" ou "receber" |
| entidade | text | Fornecedor ou cliente |
| descricao | text | Detalhe da conta |
| valor | numeric(12,2) | — |
| vencimento | date | — |
| status | text | "a_vencer", "vencida", "paga", "recebida" |
| created_at | timestamptz | — |

### `metas`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| label | text | Ex: "Receita mensal" |
| valor_atual | numeric(12,2) | — |
| valor_alvo | numeric(12,2) | — |
| sufixo | text | "", "%" — para exibição |
| periodo | text | Ex: "2026-Q2" |
| created_at | timestamptz | — |

## Relações

```
categorias ←── produtos
fornecedores ←── produtos
produtos ←── movimentacoes
```

`transacoes`, `contas` e `metas` são independentes (módulo financeiro não vincula ao estoque — ver [[PRD]]).

## Row Level Security (RLS)

Como são apenas 3-4 usuários internos, o RLS é simples:
- Todos os usuários autenticados têm acesso total (leitura e escrita)
- Policy: `TO authenticated USING (true) WITH CHECK (true)` em todas as tabelas

## Supabase Storage

Bucket `produtos` para fotos dos perfumes.
- Leitura pública (SELECT sem restrição)
- Upload e delete apenas para `authenticated`

## SQL de criação

Schema já aplicado no Supabase. Para recriar, use os scripts em duas partes:

**Parte 1 — Tabelas:**
```sql
create extension if not exists "uuid-ossp";
-- (ver LOGS sessão 2 para SQL completo)
```

**Parte 2 — RLS + Storage:**
```sql
alter table <tabela> enable row level security;
create policy "Acesso total autenticados" on <tabela> for all to authenticated using (true) with check (true);
-- (ver LOGS sessão 2 para SQL completo)
```
