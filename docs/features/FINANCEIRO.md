# 💰 Módulo Financeiro

## Visão Geral

O módulo Financeiro é o centro de controle monetário do **Horus Parfum Control**. Ele gerencia todos os fluxos de entrada e saída de recursos da perfumaria artesanal, oferecendo visibilidade completa sobre a saúde financeira do negócio.

O módulo é composto por cinco áreas principais:

| Área | Rota | Descrição |
|------|------|-----------|
| Dashboard | `/financeiro` | Painel com indicadores, gráficos e resumo financeiro |
| Transações | `/financeiro/transacoes` | CRUD completo de movimentações financeiras |
| Contas a Pagar | `/financeiro/contas-pagar` | Gestão de obrigações financeiras |
| Contas a Receber | `/financeiro/contas-receber` | Gestão de créditos a receber |
| Relatórios | `/financeiro/relatorios` | Relatórios consolidados com exportação |
| Metas | `/financeiro/metas` | Metas financeiras do negócio |

> [!NOTE]
> As transações financeiras podem ser criadas manualmente ou geradas automaticamente pelo sistema a partir de vendas ([[features/VENDAS]]) e decants ([[features/DECANTS]]).

---

## Funcionalidades

### 📊 Dashboard Financeiro (`/financeiro`)

O dashboard é a tela inicial do módulo e apresenta uma visão consolidada das finanças em um período selecionado.

#### Seletor de Período

O usuário pode escolher entre quatro modos de visualização:

| Modo | Descrição |
|------|-----------|
| **Mês** | Dados do mês corrente |
| **Trimestre** | Dados dos últimos 3 meses |
| **Ano** | Dados do ano corrente |
| **Personalizado** | Intervalo de datas definido pelo usuário |

#### Cards de Indicadores

O dashboard exibe quatro cards principais com os KPIs financeiros:

| Card | Cálculo | Descrição |
|------|---------|-----------|
| **Saldo Histórico** | Soma de todas as entradas − soma de todas as saídas | Saldo acumulado desde o início das operações |
| **Receita** | Soma das entradas no período | Total de receitas no intervalo selecionado |
| **Despesa** | Soma das saídas no período | Total de despesas no intervalo selecionado |
| **Lucro** | Receita − Despesa | Resultado líquido do período |

#### Gráfico de Evolução Mensal

- Gráfico de linhas implementado com **Recharts**
- Exibe a evolução de receita e despesa mês a mês
- Permite identificar tendências e sazonalidades

#### Gráfico de Categorias

- Gráfico de rosca (donut chart) implementado com **Recharts**
- Agrupa receitas e despesas por categoria
- Visualização proporcional dos tipos de gastos/receitas

#### Lógica de Negócio (`lib/financeiro.ts`)

As funções de cálculo do dashboard estão centralizadas em `lib/financeiro.ts`:

| Função | Descrição |
|--------|-----------|
| `calcularSaldoHistorico()` | Soma de todas as entradas menos a soma de todas as saídas, usando **Decimal.js** para precisão |
| `resumoPeriodo(inicio, fim)` | Calcula receita, despesa e lucro filtrados pelo intervalo de datas |
| `agruparPorCategoria(transacoes)` | Agrega valores por categoria para alimentar o gráfico de rosca |
| `evolucaoMensal(n)` | Retorna receita e despesa dos últimos `n` meses para o gráfico de linhas |

> [!IMPORTANT]
> Todos os cálculos financeiros utilizam a biblioteca **Decimal.js** para evitar erros de arredondamento em ponto flutuante. Nunca use operações aritméticas nativas do JavaScript para valores monetários.

---

### 📋 Transações (`/financeiro/transacoes`)

Tela de CRUD completo para gerenciar todas as movimentações financeiras do sistema.

#### Campos da Transação

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `descrição` | `text` | ✅ | Descrição da transação |
| `tipo` | `enum` | ✅ | `entrada` ou `saída` |
| `valor` | `numeric(10,2)` | ✅ | Valor em R$ |
| `categoria` | `text` | ✅ | Categoria da transação |
| `forma_pagamento` | `text` | ❌ | Método de pagamento utilizado |
| `responsável` | `text` | ❌ | Pessoa responsável pela transação |
| `origem` | `enum` | ✅ | `manual`, `venda` ou `decant` |
| `venda_id` | `uuid` | ❌ | Referência à venda que originou a transação |

#### Operações

- **Criar**: Inserção direta na tabela `transacoes` via Supabase
- **Listar**: Select com filtros por período, tipo, categoria e origem
- **Editar**: Atualização direta na tabela `transacoes`
- **Excluir**: Remoção com confirmação

> [!WARNING]
> Transações com `origem='venda'` ou `origem='decant'` são geradas automaticamente pelo sistema. Editá-las ou excluí-las manualmente pode causar inconsistências entre o módulo financeiro e os módulos de vendas/decants. Utilize as RPCs de cancelamento ([[features/VENDAS#RPCs]]) para reverter operações.

#### Vinculação com Outros Módulos

O campo `origem` identifica como a transação foi criada:

| Origem | Descrição |
|--------|-----------|
| `manual` | Transação criada manualmente pelo usuário |
| `venda` | Transação gerada automaticamente ao registrar uma venda |
| `decant` | Transação gerada automaticamente ao registrar um decant |

---

### 📅 Contas a Pagar (`/financeiro/contas-pagar`)

Gestão de obrigações financeiras (contas que a empresa precisa pagar).

#### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `entidade` | `text` | ✅ | Fornecedor ou credor |
| `descrição` | `text` | ✅ | Descrição da conta |
| `valor` | `numeric(10,2)` | ✅ | Valor a pagar em R$ |
| `vencimento` | `date` | ✅ | Data de vencimento |
| `status` | `enum` | ✅ | Status atual da conta |

#### Status Possíveis

| Status | Descrição | Cor |
|--------|-----------|-----|
| `a_vencer` | Conta dentro do prazo de vencimento | 🟡 Amarelo |
| `vencida` | Conta com vencimento ultrapassado | 🔴 Vermelho |
| `paga` | Conta quitada | 🟢 Verde |

#### Armazenamento

- CRUD direto na tabela `contas` via Supabase
- Filtro fixo: `tipo = 'pagar'`

---

### 📅 Contas a Receber (`/financeiro/contas-receber`)

Gestão de créditos a receber (valores que a empresa tem direito de receber).

> [!TIP]
> O componente de Contas a Receber reutiliza a mesma estrutura de Contas a Pagar, variando apenas o filtro de tipo e o status final.

#### Campos

Os campos são idênticos aos de Contas a Pagar (veja acima).

#### Status Possíveis

| Status | Descrição | Cor |
|--------|-----------|-----|
| `a_vencer` | Conta dentro do prazo de vencimento | 🟡 Amarelo |
| `vencida` | Conta com vencimento ultrapassado | 🔴 Vermelho |
| `recebida` | Valor recebido | 🟢 Verde |

#### Armazenamento

- CRUD direto na tabela `contas` via Supabase
- Filtro fixo: `tipo = 'receber'`

---

### 📈 Relatórios Financeiros (`/financeiro/relatorios`)

Tela de geração de relatórios consolidados com dados calculados no backend para garantir precisão financeira.

#### Chamada à API

```
GET /api/financeiro/relatorios?inicio={data_inicio}&fim={data_fim}
```

#### Validações

- `inicio` ≤ `fim`
- Ambas as datas devem ser strings **ISO-8601** válidas; o frontend envia datetimes com fuso para preservar os limites locais do período
- Em caso de erro, retorna HTTP 400 com mensagem descritiva

#### Dados Retornados

O backend calcula todos os valores com precisão **Decimal** do Python:

| Campo | Cálculo |
|-------|---------|
| `receita` | Soma de todas as transações do tipo `entrada` no período |
| `despesa` | Soma de todas as transações do tipo `saída` no período |
| `lucro` | `receita - despesa - custo das vendas concluídas no período` |
| `saldo_historico` | Saldo acumulado desde o início até a data `fim` |
| `por_categoria_receitas` | Agrupamento de receitas por categoria |
| `por_categoria_despesas` | Agrupamento de despesas por categoria |
| `por_origem` | Contagem de transações por origem (Manual / Venda / Decant) |
| `top5_receitas` | As 5 maiores receitas no período |
| `top5_despesas` | As 5 maiores despesas no período |

#### Regras temporais e de consulta

- Transações vinculadas por `venda_id` usam `vendas.data_venda` para entrar no período; lançamentos manuais usam `transacoes.created_at`.
- O custo vendido considera somente vendas com `status = 'concluida'`; vendas canceladas não reduzem o lucro.
- O custo é gerencial e não gera uma nova saída no caixa. Por isso, o `saldo_historico` continua sendo apenas entradas menos saídas reais.
- O backend pagina `transacoes` e `vendas` em lotes de 1.000, com ordem estável por `id`.

#### Exportação

| Formato | Método |
|---------|--------|
| **PDF** | Via `window.print()` com CSS otimizado para impressão |
| **CSV** | Download direto com dados tabulados |

---

### 🎯 Metas Financeiras (`/financeiro/metas`)

O gerenciamento de metas financeiras está documentado em detalhes na página dedicada:

→ [[features/METAS]]

---

## Tabelas do Banco de Dados

### `transacoes`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | `uuid` | Identificador único (PK) |
| `descrição` | `text` | Descrição da transação |
| `tipo` | `text` | `entrada` ou `saída` |
| `valor` | `numeric(10,2)` | Valor em R$ |
| `categoria` | `text` | Categoria da transação |
| `forma_pagamento` | `text` | Método de pagamento |
| `responsável` | `text` | Responsável pela transação |
| `venda_id` | `uuid` | FK para `vendas` (nullable) |
| `origem` | `text` | `manual`, `venda` ou `decant` |
| `created_at` | `timestamptz` | Data de criação |

### `contas`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | `uuid` | Identificador único (PK) |
| `tipo` | `text` | `pagar` ou `receber` |
| `entidade` | `text` | Fornecedor ou credor |
| `descrição` | `text` | Descrição da conta |
| `valor` | `numeric(10,2)` | Valor em R$ |
| `vencimento` | `date` | Data de vencimento |
| `status` | `text` | Status atual |
| `created_at` | `timestamptz` | Data de criação |

### `metas`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | `uuid` | Identificador único (PK) |
| `label` | `text` | Nome/rótulo da meta |
| `valor_atual` | `numeric(10,2)` | Valor atual atingido |
| `valor_alvo` | `numeric(10,2)` | Valor objetivo |
| `sufixo` | `text` | Sufixo para exibição (ex: `%`, `un`) |
| `periodo` | `text` | Período da meta |

> [!NOTE]
> Para o schema completo de todas as tabelas, consulte [[BANCO]].

---

## Regras de Negócio

1. **Moeda**: Todos os valores monetários são em **BRL (R$)** com exatamente **2 casas decimais**
2. **Formatação**: Utilizar `formatBRL()` de `lib/utils.ts` para exibição de valores monetários na interface
3. **Precisão**: Toda aritmética financeira deve usar **Decimal.js** — nunca operações nativas de ponto flutuante
4. **Transações automáticas**: Vendas com `origem='venda'` e decants com `origem='decant'` geram transações financeiras automaticamente
5. **Transações manuais**: Transações criadas pelo usuário têm `origem='manual'`
6. **Consistência**: Cancelamento de vendas deve reverter tanto o estoque quanto a transação financeira correspondente (via RPC atômica)

> [!WARNING]
> Nunca realizar cálculos financeiros usando `Number` do JavaScript. Sempre importar e utilizar `Decimal` da biblioteca `decimal.js` para garantir precisão monetária.

---

## Documentos Relacionados

- [[PRD]] — Documento de requisitos do produto
- [[BANCO]] — Schema completo do banco de dados
- [[features/METAS]] — Detalhamento das metas financeiras
- [[features/RELATORIOS]] — Módulo de relatórios
- [[features/VENDAS]] — Módulo de vendas (gera transações financeiras)
- [[features/DECANTS]] — Módulo de decants (gera transações financeiras)
- [[REGRAS_NEGOCIO]] — Regras de negócio globais
- [[API]] — Documentação da API backend
