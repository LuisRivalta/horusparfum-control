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

### `marcas`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| nome | text unique | Marca/fabricante do produto, ex: Lattafa, Armaf |
| created_at | timestamptz | — |

### `produtos`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| nome | text | Nome do perfume |
| volume_ml | int | Volume em ml |
| categoria_id | uuid (FK → categorias) | — |
| fornecedor_id | uuid (FK → fornecedores) | Nullable |
| marca_id | uuid (FK → marcas) | Nullable; marca/fabricante do produto |
| estoque_atual | int | Unidades em estoque |
| estoque_minimo | int | Alerta quando atual < mínimo |
| foto_url | text | URL da imagem (Supabase Storage) |
| custo_medio | numeric(12,2) | Custo médio ponderado (atualizado na confirmação de pedidos) |
| ultimo_custo | numeric(12,2) | Preço da última compra recebida |
| preco_referencia | numeric(12,2) | Preço de venda sugerido (exibido no modal de nova venda) |
| created_at | timestamptz | — |

### `movimentacoes`

> **Ledger interno** — desde o fluxo de pedidos, esta tabela não tem mais CRUD manual: entradas são gravadas pela RPC confirmar_recebimento e saídas pela RPC registrar_saida.

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

### `pedidos`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| numero | serial unique | Número sequencial do pedido |
| fornecedor_id | uuid (FK → fornecedores) | — |
| status | text | "aguardando", "recebido" ou "cancelado" |
| previsao_chegada | date | Data prevista de chegada |
| valor_total | numeric(12,2) | Total do pedido (itens + frete, calculado no frontend) |
| frete | numeric(12,2) | Frete do pedido de compra (default 0) |
| responsavel | text | Nome do usuário que criou o pedido |
| recebido_em | timestamptz | Data/hora do recebimento |
| recebido_por | text | Nome do usuário que fez a conferência |
| created_at | timestamptz | — |

### `pedido_itens`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| pedido_id | uuid (FK → pedidos) | Cascade delete |
| produto_id | uuid (FK → produtos) | — |
| qtd_pedida | int | Quantidade pedida (≥ 1) |
| qtd_recebida | int | Quantidade efetivamente recebida (nullable até conferência) |
| preco_unitario | numeric(12,2) | Preço de custo no momento do pedido (≥ 0) |

### `divergencias`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| pedido_id | uuid (FK → pedidos) | — |
| pedido_item_id | uuid (FK → pedido_itens) | — |
| fornecedor_id | uuid (FK → fornecedores) | Desnormalizado para facilitar relatórios |
| tipo | text | "faltou", "veio_a_mais", "avariado" ou "produto_errado" |
| qtd_pedida | int | Quantidade esperada |
| qtd_recebida | int | Quantidade efetivamente recebida |
| observacao | text | Detalhe opcional da divergência |
| created_at | timestamptz | — |

### `frascos_abertos`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| produto_id | uuid (FK → produtos) | Índice único parcial onde status='ativo' |
| ml_total | int | Volume copiado de produto.volume_ml ao abrir (> 0) |
| ml_restante | int | ML disponíveis (≥ 0) |
| status | text | 'ativo' ou 'esgotado' |
| aberto_em | timestamptz | — |

### `decants`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| frasco_id | uuid (FK → frascos_abertos, cascade) | — |
| produto_id | uuid (FK → produtos) | Desnormalizado para relatórios |
| ml | int | Quantidade do decant (> 0) |
| classificacao | text (nullable) | Tipo de consumo não-faturável: `perda`, `amostra`, `brinde`, `marketing`, `uso_interno` ou `outro`. Null para decants de venda (gerados via Vendas) |
| custo | numeric(12,2) | Custo total do consumo (perfume + embalagem). Default 0 |
| custo_embalagem | numeric(12,2) | Parcela de embalagem incluída no custo. Zero para `perda` (sem embalagem). Default 0 |
| created_at | timestamptz | — |

### `canais`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| nome | text | Ex: "Shopee", "Loja física", "Instagram/WhatsApp" |
| taxa_padrao | numeric(5,2) | Percentual padrão de taxa do canal (≥ 0) |
| ativo | boolean | Se o canal aparece nas opções de nova venda |
| created_at | timestamptz | — |

### `embalagens_decant`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| tamanho_ml | int | Volume da embalagem em ml (único, > 0) |
| custo | numeric(12,2) | Custo da embalagem em BRL (≥ 0) |
| ativo | boolean | Se a embalagem está disponível para seleção |

### `vendas`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| numero | serial unique | Número sequencial da venda |
| canal_id | uuid (FK → canais) | Canal de venda |
| data_venda | date | Data da venda (default: hoje) |
| forma_pagamento | text | Ex: "Pix", "Cartão" |
| cliente | text | Nome do cliente (opcional) |
| taxa_total | numeric(12,2) | Valor total de taxa do canal (≥ 0) |
| frete | numeric(12,2) | Custo de frete (≥ 0) |
| total_bruto | numeric(12,2) | Soma dos preços de venda dos itens |
| total_custo | numeric(12,2) | Soma dos custos (produto + embalagem) dos itens |
| lucro_bruto | numeric(12,2) | total_bruto − taxa_total − frete − total_custo |
| responsavel | text | Nome do usuário |
| observacao | text | Observação livre (opcional) |
| status | text | "concluida" ou "cancelada" |
| created_at | timestamptz | — |

### `venda_itens`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | — |
| venda_id | uuid (FK → vendas, cascade) | Venda à qual o item pertence |
| tipo | text | "produto" (frasco cheio) ou "decant" |
| produto_id | uuid (FK → produtos) | Produto vendido |
| frasco_id | uuid (FK → frascos_abertos) | Frasco origem (apenas decants) |
| decant_id | uuid (FK → decants) | Registro do decant gerado (apenas decants) |
| ml | int | Volume do decant em ml (apenas decants, > 0) |
| quantidade | int | Quantidade de unidades vendidas (≥ 1) |
| preco_unitario | numeric(12,2) | Preço de venda por unidade (≥ 0) |
| custo_unitario | numeric(12,2) | Custo do produto por unidade (snapshot no momento da venda) |
| custo_embalagem | numeric(12,2) | Custo da embalagem por unidade (apenas decants) |
| taxa_rateada | numeric(12,2) | Parcela da taxa do canal rateada proporcionalmente neste item |
| frete_rateado | numeric(12,2) | Parcela do frete rateada proporcionalmente neste item |
| lucro | numeric(12,2) | Lucro líquido deste item (bruto − taxa − frete − custo) |

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
| venda_id | uuid (FK → vendas) | Venda de origem (nullable; preenchido por RPCs de venda) |
| origem | text | `"manual"` (padrão), `"venda"` (gerado pela RPC `registrar_venda`) ou `"decant"` (gerado pela RPC `registrar_consumo_decant` para consumo não-faturável) |
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
marcas ←── produtos
produtos ←── movimentacoes
fornecedores ←── pedidos ←── pedido_itens ──→ produtos
pedidos ←── divergencias ──→ fornecedores
produtos ←── frascos_abertos ←── decants ──→ produtos
canais ←── vendas ←── venda_itens ──→ produtos
vendas ←── transacoes (origem='venda')
decants ──→ transacoes (origem='decant', consumo não-faturável)
```

`contas` é independente (módulo financeiro puro). `metas` armazena o cadastro da meta, mas metas em R$ têm progresso calculado pelo backend a partir de `transacoes.tipo='entrada'` no período informado. `transacoes` pode ser: inserida **manualmente** (`origem='manual'`), gerada pela RPC de **venda** (`origem='venda'`) ou pela RPC de **consumo de decant** (`origem='decant'`, despesa de perda/brinde/amostra/marketing/uso interno).

## Row Level Security (RLS)

Como são apenas 3-4 usuários internos, o RLS é simples:
- Todos os usuários autenticados têm acesso total (leitura e escrita)
- Policy: `TO authenticated USING (true) WITH CHECK (true)` em todas as tabelas

## Supabase Storage

Bucket `produtos` para fotos dos perfumes.
- Leitura pública (SELECT sem restrição)
- Upload e delete apenas para `authenticated`

## Funções (RPCs)

Lógica de negócio atômica em PL/pgSQL, chamada via `supabase.rpc(...)`. Cada uma roda numa transação única (rollback em falha). Ver `docs/ARQUITETURA.md` para o porquê.

| Função | Resumo | Migração |
|--------|--------|----------|
| `confirmar_recebimento(p_pedido_id, p_itens, p_recebido_por)` | Confere o recebimento: entrada de estoque, custo médio ponderado, ledger e divergências | 20260610_pedidos |
| `registrar_saida(p_produto_id, p_qtd, p_motivo, p_responsavel)` | Saída rápida de estoque + ledger | 20260610_pedidos |
| `registrar_entrada(p_produto_id, p_qtd, p_motivo, p_responsavel)` | Entrada manual de estoque + ledger | 20260616_registrar_entrada |
| `registrar_venda(p_canal_id, p_data_venda, p_forma_pagamento, p_cliente, p_taxa_total, p_frete, p_responsavel, p_observacao, p_itens)` | Baixa estoque (produto/decant), grava `vendas`/`venda_itens` com snapshot de custo e rateio de taxa/frete, lança receita/taxa/frete em `transacoes`. Retorna `{id, numero}` | 20260616_vendas |
| `cancelar_venda(p_venda_id)` | Estorno completo: devolve estoque/ml, apaga decant, remove `transacoes` da venda, marca `status='cancelada'` | 20260616_vendas |
| `registrar_consumo_decant(p_frasco_id, p_ml, p_classificacao, p_custo_embalagem, p_responsavel)` | Consumo não-faturável: baixa ml do frasco, grava decant com custo (perfume + embalagem, exceto perda), lança despesa em `transacoes` (`origem='decant'`). Retorna `{id, custo, esgotado}` | 20260617_consumo_decant |

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

Migração de pedidos: `supabase/migrations/20260610_pedidos.sql` (tabelas + RLS + RPCs `confirmar_recebimento` e `registrar_saida`).

Migração de vendas: `supabase/migrations/20260616_vendas.sql` (tabelas `canais`, `embalagens_decant`, `vendas`, `venda_itens`; colunas `preco_referencia` em `produtos` e `venda_id`/`origem` em `transacoes`; RLS; RPCs `registrar_venda` e `cancelar_venda`; seeds de canais e embalagens). Aplicar manualmente no Supabase SQL Editor.

Correção de cancelamento de decant: `supabase/migrations/20260622142718_fix_cancelar_venda_decant_fk.sql` atualiza `cancelar_venda` para limpar `venda_itens.decant_id` antes de apagar o registro em `decants`, evitando violação de FK no estorno de vendas de decant. Aplicar manualmente no Supabase SQL Editor.

Migração de consumo de decant não-faturável: `supabase/migrations/20260617_consumo_decant.sql` (colunas `classificacao`, `custo`, `custo_embalagem` em `decants`; estende constraint `transacoes_origem_check` para incluir `'decant'`; RPC atômica `registrar_consumo_decant(p_frasco_id, p_ml, p_classificacao, p_custo_embalagem, p_responsavel)`). Pré-requisito: migração de vendas aplicada. Aplicar manualmente no Supabase SQL Editor.

Migração de marcas: `supabase/migrations/20260630_marcas_produtos.sql` (tabela `marcas`, coluna nullable `produtos.marca_id`, índice e RLS para `authenticated`). Aplicar manualmente no Supabase SQL Editor.

Migração de frete em pedidos: supabase/migrations/20260702142406_frete_pedidos.sql (coluna pedidos.frete com default 0 e check não negativo). Aplicar manualmente no Supabase SQL Editor.
