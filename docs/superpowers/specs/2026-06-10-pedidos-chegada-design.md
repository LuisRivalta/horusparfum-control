# Design — Pedidos de Compra com Conferência de Recebimento

> Data: 2026-06-10 · Status: aprovado pelo usuário · Substitui a tela "Movimentações"

## Resumo

A tela de Movimentações (entradas/saídas genéricas) será substituída por um fluxo de
**pedidos de compra**: o usuário registra um pedido ao fornecedor no momento da compra
(produtos, quantidades, preços), o pedido fica `aguardando`, e quando a mercadoria chega
fisicamente o usuário abre a **conferência de recebimento**, valida item a item e confirma —
dando entrada automática no estoque. Diferenças entre pedido e recebido viram registros
no **log de divergências**, analisável por fornecedor.

Saídas de estoque (venda, perda) passam a ser registradas por uma **saída rápida avulsa**
na tela de Produtos.

## Decisões tomadas (com o usuário)

1. **Saídas:** botão de saída rápida (produto + qtd + motivo) na tela de Produtos; sem tela própria
2. **Conferência:** item a item com campo "qtd recebida" pré-preenchido; alterar a qtd exige classificar a divergência
3. **Recebimento parcial:** não existe — pedido fecha na confirmação com o que chegou; falta vira divergência; restante = novo pedido
4. **Financeiro:** desacoplado (regra do PRD). Preços ficam só no estoque. Unificação futura (ERP) é aditiva: gerar conta a pagar/transação com `pedido_id` de referência — nenhuma migração necessária
5. **Produto novo no pedido:** atalho "+ Cadastrar produto" inline no formulário do pedido (cadastro rápido sem foto)
6. **Custeio:** custo médio ponderado + último custo ("C light"). FIFO por lote fica como evolução futura (ver seção própria)
7. **Arquitetura (Abordagem 1):** tabela `movimentacoes` vira ledger interno de auditoria — confirmações gravam entradas, saídas rápidas gravam saídas; nenhum CRUD manual sobre ela

## Modelo de dados

### Tabelas novas

**`pedidos`**
| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | — |
| numero | serial (unique) | número legível do pedido (ex: #42) — usado na UI e no ledger |
| fornecedor_id | uuid FK → fornecedores | obrigatório (1 pedido = 1 fornecedor) |
| status | text | `aguardando` \| `recebido` \| `cancelado` |
| previsao_chegada | date | opcional |
| valor_total | numeric(12,2) | soma dos itens, persistido |
| responsavel | text | quem criou |
| recebido_em | timestamptz | preenchido na confirmação |
| recebido_por | text | quem conferiu |
| created_at | timestamptz | — |

**`pedido_itens`**
| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | — |
| pedido_id | uuid FK → pedidos | on delete cascade |
| produto_id | uuid FK → produtos | sempre produto cadastrado |
| qtd_pedida | int | ≥ 1 |
| qtd_recebida | int | null até a conferência |
| preco_unitario | numeric(12,2) | preço de compra — histórico permanente de custos |

**`divergencias`**
| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | — |
| pedido_id | uuid FK → pedidos | — |
| pedido_item_id | uuid FK → pedido_itens | — |
| fornecedor_id | uuid FK → fornecedores | desnormalizado para análise por fornecedor |
| tipo | text | `faltou` \| `veio_a_mais` \| `avariado` \| `produto_errado` |
| qtd_pedida | int | snapshot |
| qtd_recebida | int | snapshot |
| observacao | text | livre |
| created_at | timestamptz | — |

### Mudanças em tabelas existentes

- `produtos` ganha `custo_medio numeric(12,2)` e `ultimo_custo numeric(12,2)` (ambos nullable)
- `movimentacoes`: sem mudança de schema; vira ledger interno (motivo = `"Pedido #<n>"` nas entradas; motivo da saída rápida nas saídas). Dados antigos preservados.
- RLS: mesmas policies (`TO authenticated USING (true) WITH CHECK (true)`) nas 3 tabelas novas

## Telas e fluxo

**Navegação (sidebar Estoque):** sai "Movimentações"; entram **Pedidos** e **Divergências**:
`Produtos · Pedidos · Divergências · Categorias · Fornecedores · Alertas · Relatório de giro`

### Pedidos (lista)
Tabela: nº, fornecedor, qtd de itens, valor total, previsão, status (badge), responsável.
Filtros por status e fornecedor. Botão "Novo pedido".

### Criar pedido (modal grande)
- Fornecedor (obrigatório) + previsão de chegada (opcional)
- Lista de itens: busca de produto + qtd + preço unitário; subtotal por linha e total geral ao vivo
- "+ Cadastrar produto" abre cadastro rápido inline (nome, volume, categoria — sem foto)
- Pedido `aguardando` pode ser editado ou cancelado

### Conferência de recebimento
- Acessada pelo botão "Confirmar chegada" de um pedido `aguardando`
- Cada item: foto, nome, qtd pedida, campo **qtd recebida** (pré-preenchido com a pedida)
- Qtd alterada → linha expande exigindo tipo de divergência + observação
- Rodapé: resumo ("2 itens ok, 1 divergência") + botão "Confirmar recebimento"
- Efeitos da confirmação (atômicos, ver RPC):
  1. `produtos.estoque_atual += qtd_recebida` (por item)
  2. Recalcula `custo_medio` e atualiza `ultimo_custo`
  3. Grava divergências no log
  4. Grava entradas no ledger `movimentacoes`
  5. Atualiza `fornecedores.ultima_compra`
  6. `pedidos.status = 'recebido'`, `recebido_em/por` preenchidos

### Divergências (log)
Tabela: data, pedido, fornecedor, produto, tipo, pedida × recebida, observação.
Filtros por fornecedor e tipo. Resumo no topo: % de pedidos com divergência por fornecedor.

### Saída rápida
Botão "Registrar saída" na tela de Produtos (+ atalho no modal de detalhes do produto):
produto, quantidade, motivo (`venda` | `perda` | `uso_interno` | `outro`).
Grava saída no ledger e baixa o estoque. Bloqueia estoque negativo.

## Regras de negócio

- **Status:** `aguardando → recebido` (confirmação) | `aguardando → cancelado`. Pedido `recebido` é imutável (correções = entrada/saída avulsa). `cancelado` nunca mexe em estoque.
- **Validações:** fornecedor e ≥ 1 item obrigatórios; qtd ≥ 1 e preço ≥ 0 por item; produto não repete no mesmo pedido; qtd recebida ≥ 0; qtd recebida ≠ pedida exige tipo de divergência.
- **Custo médio:** `novo = (estoque_atual × custo_medio + qtd_recebida × preco_unitario) ÷ (estoque_atual + qtd_recebida)`. Se `custo_medio` é null (primeiro custo), assume o preço do pedido. Saídas não alteram custo médio.
- **Atomicidade:** confirmação roda em função RPC Postgres `confirmar_recebimento(p_pedido_id uuid, p_itens jsonb, p_recebido_por text)` — com divergências embutidas por item em p_itens (tipo + observação) — transação tudo-ou-nada; valida `status = 'aguardando'` com lock (proteção contra dupla confirmação). Em falha, pedido permanece `aguardando` e a operação é re-tentável sem duplicar entrada.
- **Saída rápida:** valida estoque suficiente antes de gravar (também pode ser RPC simples para atomicidade ledger+estoque).

## Testes

- **Unitários** (`lib/pedidos.ts`, lógica pura): custo médio (estoque zerado, custo null, qtd zero), validação de conferência (divergência obrigatória, tipos), totais do pedido
- **Componente** (Supabase mockado): criar pedido (itens, total ao vivo, duplicado bloqueado); conferência (alterar qtd expande divergência; confirmar chama RPC com payload correto)
- **RPC:** teste manual no SQL Editor com seed (caso feliz, dupla confirmação, falha no meio)

## Evolução futura

- **FIFO por lote:** `pedido_itens` já registra cada lote (preço + qtd) permanentemente. Migração aditiva: adicionar `qtd_restante` aos itens + backfill + lógica de consumo FIFO na saída. Entra quando estoque e financeiro forem unificados (margem por venda passa a ter consumidor).
- **Unificação com financeiro (ERP):** ao confirmar chegada, gerar conta a pagar/transação com referência ao `pedido_id`. Aditivo, sem migração.

## Fora de escopo

- Recebimento parcial (pedido multi-entrega)
- Nota fiscal / anexos no pedido
- Integração financeira automática
- Edição de pedido `recebido`
