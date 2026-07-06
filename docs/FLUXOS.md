# 🔄 Fluxos de Usuário — Horus Parfum Control

> [!NOTE]
> Este documento descreve os fluxos passo a passo de como os usuários realizam as principais tarefas no sistema. Cada fluxo é acompanhado de um diagrama Mermaid para facilitar a visualização.

---

## Índice

1. [Fluxo de Login](#1--fluxo-de-login)
2. [Fluxo de Venda Completa](#2--fluxo-de-venda-completa)
3. [Fluxo de Pedido de Compra](#3--fluxo-de-pedido-de-compra)
4. [Fluxo de Decant (Consumo)](#4--fluxo-de-decant-consumo)
5. [Fluxo de Relatório Financeiro](#5--fluxo-de-relatório-financeiro)
6. [Fluxo de Cancelamento de Venda](#6--fluxo-de-cancelamento-de-venda)
7. [Fluxo de Dados: Venda → Financeiro](#7--fluxo-de-dados-venda--financeiro)
8. [Fluxo de Dados: Pedido → Estoque](#8--fluxo-de-dados-pedido--estoque)

---

## 1. 🔐 Fluxo de Login

O fluxo de autenticação é o ponto de entrada do sistema. Toda interação começa aqui.

### Resumo

```
Usuário → /login → email + senha → Supabase Auth → JWT → / (Home)
```

### Passos Detalhados

| Passo | Ação                                      | Componente / Responsável     |
| ----- | ----------------------------------------- | ---------------------------- |
| 1     | Usuário acessa a aplicação                | Navegador                    |
| 2     | Sistema verifica se há sessão ativa (JWT) | Middleware Next.js           |
| 3     | Sem sessão → redireciona para `/login`    | Middleware Next.js           |
| 4     | Usuário preenche e-mail e senha           | Formulário de login          |
| 5     | Credenciais enviadas ao Supabase Auth     | `supabase.auth.signInWithPassword()` |
| 6     | Supabase valida e retorna JWT + refresh   | Supabase Auth                |
| 7     | Token armazenado em cookie HttpOnly       | Middleware / Client           |
| 8     | Usuário redirecionado para `/` (Home)     | Router Next.js               |

### Diagrama

```mermaid
flowchart TD
    A["👤 Usuário acessa a aplicação"] --> B{"Sessão ativa (JWT válido)?"}
    B -->|Sim| C["🏠 Redireciona para Home /"]
    B -->|Não| D["🔒 Redireciona para /login"]
    D --> E["📝 Preenche e-mail e senha"]
    E --> F["📤 Envia credenciais"]
    F --> G["🔑 Supabase Auth valida"]
    G -->|Credenciais válidas| H["✅ Retorna JWT + Refresh Token"]
    G -->|Credenciais inválidas| I["❌ Exibe erro de autenticação"]
    I --> E
    H --> J["🍪 Armazena token em cookie HttpOnly"]
    J --> C
```

### Regras de Negócio Aplicáveis

- O JWT possui validade configurada no Supabase (padrão: 1 hora).
- O refresh token renova a sessão automaticamente antes da expiração.
- Rotas protegidas verificam o JWT no middleware antes de renderizar.
- Após 3 tentativas falhas consecutivas, o Supabase pode aplicar rate limiting.

> [!TIP]
> Consulte [[features/AUTENTICACAO]] para detalhes completos sobre a implementação de autenticação, incluindo gerenciamento de sessão e proteção de rotas.

---

## 2. 🛒 Fluxo de Venda Completa

Este é o fluxo principal de receita do negócio. Uma venda registra a saída de produtos/decants, gera receita financeira e atualiza o estoque automaticamente.

### Resumo

```
Usuário abre modal → seleciona canal → adiciona itens (produto/decant) →
define preço, taxa, frete → confirma → RPC registrar_venda →
{cria venda + itens, reduz estoque, cria movimentação, cria transação financeira}
```

### Passos Detalhados

| Passo | Ação                                        | Componente / Responsável        |
| ----- | ------------------------------------------- | ------------------------------- |
| 1     | Usuário clica em "Nova Venda"               | Botão na página de vendas       |
| 2     | Modal de venda é aberto                     | Componente `NovaVendaModal`     |
| 3     | Seleciona o canal de venda                  | Dropdown (Shopee, ML, Direto…)  |
| 4     | Busca e adiciona itens (produto ou decant)  | Campo de busca com autocomplete |
| 5     | Define quantidade, preço unitário por item  | Campos numéricos por item       |
| 6     | Informa taxa da plataforma (%) e frete (R$) | Campos opcionais                |
| 7     | Sistema calcula total e lucro estimado      | Cálculo em tempo real           |
| 8     | Usuário confirma a venda                    | Botão "Registrar Venda"         |
| 9     | Chamada à RPC `registrar_venda`             | API Route → Supabase RPC        |
| 10    | RPC executa dentro de transação atômica     | Função PostgreSQL               |

### Diagrama

```mermaid
flowchart TD
    A["👤 Clica em 'Nova Venda'"] --> B["📋 Abre modal de venda"]
    B --> C["📡 Seleciona canal de venda"]
    C --> D["🔍 Busca e adiciona itens"]
    D --> E{"Tipo do item?"}
    E -->|Produto (frasco)| F["🧴 Adiciona produto com qtd e preço"]
    E -->|Decant (ml)| G["💧 Adiciona decant com ml e preço"]
    F --> H["💰 Define taxa (%) e frete (R$)"]
    G --> H
    H --> I["🧮 Sistema calcula total e lucro"]
    I --> J["✅ Usuário confirma a venda"]
    J --> K["📤 Chamada RPC registrar_venda"]
    K --> L["🔄 Transação atômica no PostgreSQL"]
    L --> M["📝 Cria registro da venda"]
    L --> N["📦 Cria itens da venda"]
    L --> O["📉 Reduz estoque dos produtos"]
    L --> P["🔀 Cria movimentação de estoque (saída)"]
    L --> Q["💵 Cria transação financeira (receita)"]
    M & N & O & P & Q --> R{"Transação bem-sucedida?"}
    R -->|Sim| S["✅ Venda registrada com sucesso"]
    R -->|Não| T["❌ Rollback — exibe erro"]
    T --> B
    S --> U["🔔 Notificação de sucesso ao usuário"]
```

### Operações da RPC `registrar_venda`

A RPC executa as seguintes operações dentro de uma **transação atômica** (tudo ou nada):

1. **Cria o registro da venda** na tabela `vendas` com status `concluida`.
2. **Cria os itens da venda** na tabela `venda_itens`, vinculados à venda.
3. **Reduz o estoque** de cada produto vendido na tabela `produtos` (campo `estoque_atual`).
4. **Cria movimentações de estoque** na tabela `movimentacoes` com tipo `saida` e origem `venda`.
5. **Cria uma transação financeira** na tabela `transacoes` com tipo `receita` e categoria `venda`.

> [!WARNING]
> Se o estoque de qualquer item for insuficiente, a RPC rejeita a venda inteira e faz rollback. Nenhuma operação parcial é persistida.

> [!IMPORTANT]
> O cálculo de lucro utiliza o **custo médio** do produto no momento da venda. Esse custo é atualizado automaticamente ao receber pedidos de compra. Consulte [[REGRAS_NEGOCIO]] para a fórmula de custo médio.

---

## 3. 📦 Fluxo de Pedido de Compra

Pedidos de compra são o mecanismo de entrada de estoque. Um pedido passa por vários estados até ser recebido e integrado ao estoque.

### Resumo

```
Criar pedido → adicionar itens (produto, qtd, preço) → enviar pedido →
aguardar chegada → conferência → {qtd ok → receber / qtd diferente → registrar divergência} →
RPC confirmar_recebimento → {atualiza estoque, custo médio, cria movimentações}
```

### Estados do Pedido

| Estado        | Descrição                                        |
| ------------- | ------------------------------------------------ |
| `rascunho`    | Pedido criado, itens sendo adicionados           |
| `enviado`     | Pedido confirmado e enviado ao fornecedor        |
| `em_transito` | Pedido em trânsito / aguardando chegada          |
| `recebido`    | Pedido recebido e conferido sem divergências     |
| `divergente`  | Pedido recebido com diferença de quantidade      |
| `cancelado`   | Pedido cancelado antes do recebimento            |

### Diagrama — Fluxo Principal

```mermaid
flowchart TD
    A["👤 Clica em 'Novo Pedido'"] --> B["📋 Cria pedido (status: rascunho)"]
    B --> C["➕ Adiciona itens manualmente"]
    B --> D["📄 Importa itens via PDF da nota"]
    C & D --> E["📝 Define produto, quantidade e preço por item"]
    E --> F["📤 Envia pedido (status: enviado)"]
    F --> G["⏳ Aguarda chegada (status: em_transito)"]
    G --> H["📦 Pedido chega — inicia conferência"]
    H --> I{"Quantidades conferem?"}
    I -->|Sim| J["✅ Receber pedido"]
    I -->|Não| K["⚠️ Registrar divergência"]
    K --> L["📝 Informar qtd recebida por item"]
    L --> J
    J --> M["📤 RPC confirmar_recebimento"]
    M --> N["🔄 Transação atômica no PostgreSQL"]
    N --> O["📈 Atualiza estoque_atual dos produtos"]
    N --> P["💰 Recalcula custo médio ponderado"]
    N --> Q["🔀 Cria movimentações de estoque (entrada)"]
    N --> R["📝 Atualiza status do pedido"]
    O & P & Q & R --> S{"Transação bem-sucedida?"}
    S -->|Sim| T["✅ Pedido recebido com sucesso"]
    S -->|Não| U["❌ Rollback — exibe erro"]
```

### Sub-fluxo: Importação de PDF da Nota Fiscal

O sistema permite importar itens de um pedido diretamente a partir do PDF da nota fiscal do fornecedor, agilizando o cadastro.

```mermaid
flowchart TD
    A["📄 Usuário faz upload do PDF"] --> B["🔍 Sistema extrai texto do PDF"]
    B --> C["🤖 Parser identifica itens, qtds e preços"]
    C --> D{"Itens reconhecidos com sucesso?"}
    D -->|Sim| E["📋 Exibe prévia dos itens extraídos"]
    D -->|Parcial| F["⚠️ Exibe itens encontrados + alertas"]
    D -->|Não| G["❌ Erro — PDF não reconhecido"]
    E --> H["👤 Usuário revisa e confirma"]
    F --> H
    H --> I{"Produtos já cadastrados?"}
    I -->|Sim| J["✅ Vincula automaticamente"]
    I -->|Não| K["🆕 Sugere cadastro de novo produto"]
    K --> J
    J --> L["📝 Itens adicionados ao pedido"]
    G --> M["📝 Usuário cadastra itens manualmente"]
    M --> L
```

> [!TIP]
> O parser de PDF foi otimizado para notas fiscais de fornecedores recorrentes. Para novos fornecedores, a primeira importação pode exigir revisão manual. Consulte [[features/PEDIDOS]] para detalhes da implementação do parser.

### Operações da RPC `confirmar_recebimento`

1. **Atualiza `estoque_atual`** de cada produto: `estoque_atual += qtd_recebida`.
2. **Recalcula custo médio ponderado**: `((estoque_anterior × custo_anterior) + (qtd_nova × custo_novo)) / estoque_total`.
3. **Cria movimentações** na tabela `movimentacoes` com tipo `entrada` e origem `pedido`.
4. **Atualiza status do pedido** para `recebido` ou `divergente`.
5. Em caso de divergência, registra a diferença para acompanhamento.

---

## 4. 💧 Fluxo de Decant (Consumo)

O fluxo de decant registra o consumo de perfume a partir de frascos abertos. Cada consumo gera um registro detalhado e impacta o financeiro como despesa.

### Resumo

```
Abrir frasco (validação: estoque > 0, sem frasco ativo) →
registrar consumo (ml, classificação) →
RPC registrar_consumo_decant →
{atualiza ml_restante, cria registro decant, gera despesa financeira}
```

### Passos Detalhados

| Passo | Ação                                              | Componente / Responsável           |
| ----- | ------------------------------------------------- | ---------------------------------- |
| 1     | Usuário seleciona produto para decantar           | Lista de produtos                  |
| 2     | Sistema verifica estoque e frasco ativo            | Validação no frontend + backend   |
| 3     | Se não há frasco ativo, abre novo frasco           | Modal "Abrir Frasco"               |
| 4     | Informa a quantidade consumida (ml)                | Campo numérico                     |
| 5     | Classifica o tipo de consumo                       | Dropdown (venda, uso pessoal, etc) |
| 6     | Confirma o registro de consumo                     | Botão "Registrar Consumo"          |
| 7     | Chamada à RPC `registrar_consumo_decant`           | API Route → Supabase RPC           |
| 8     | Sistema atualiza ml restante e gera financeiro     | Transação atômica PostgreSQL       |

### Diagrama

```mermaid
flowchart TD
    A["👤 Seleciona produto para decantar"] --> B{"Tem estoque > 0?"}
    B -->|Não| C["❌ Produto sem estoque disponível"]
    B -->|Sim| D{"Existe frasco ativo?"}
    D -->|Sim| F["📋 Exibe frasco ativo com ml restante"]
    D -->|Não| E["🆕 Abre novo frasco"]
    E --> E1{"Validação: sem outro frasco ativo?"}
    E1 -->|Não — já existe| E2["❌ Feche o frasco ativo antes"]
    E1 -->|Sim| E3["✅ Frasco aberto com ml total do produto"]
    E3 --> F
    F --> G["📝 Informa quantidade consumida (ml)"]
    G --> H{"ml consumido <= ml restante?"}
    H -->|Não| I["❌ Quantidade excede ml restante"]
    I --> G
    H -->|Sim| J["🏷️ Classifica o consumo"]
    J --> K["✅ Confirma registro de consumo"]
    K --> L["📤 RPC registrar_consumo_decant"]
    L --> M["🔄 Transação atômica no PostgreSQL"]
    M --> N["💧 Atualiza ml_restante do frasco"]
    M --> O["📝 Cria registro de consumo (decant)"]
    M --> P["💸 Gera despesa financeira proporcional"]
    N & O & P --> Q{"ml_restante == 0?"}
    Q -->|Sim| R["🔒 Fecha frasco automaticamente"]
    Q -->|Não| S["✅ Frasco continua ativo"]
    R & S --> T["🔔 Notificação de sucesso"]
```

### Operações da RPC `registrar_consumo_decant`

1. **Atualiza `ml_restante`** do frasco ativo: `ml_restante -= ml_consumido`.
2. **Cria registro de consumo** na tabela de decants com dados do consumo (ml, classificação, data).
3. **Gera despesa financeira** proporcional ao custo médio do produto: `despesa = (ml_consumido / ml_total_frasco) × custo_medio`.
4. **Fecha frasco** automaticamente se `ml_restante` chegar a zero.

> [!IMPORTANT]
> A despesa financeira gerada pelo consumo de decant é calculada com base no **custo médio** do produto no momento do consumo, garantindo precisão contábil. Veja [[features/DECANTS]] para detalhes.

---

## 5. 📊 Fluxo de Relatório Financeiro

Os relatórios financeiros agregam dados de vendas, despesas e decants para fornecer uma visão consolidada do desempenho do negócio.

### Resumo

```
Selecionar período → GET /api/financeiro/relatorios →
backend calcula com Decimal → exibe resumo + categorias + origens + top5 →
exportar PDF/CSV
```

### Passos Detalhados

| Passo | Ação                                                 | Componente / Responsável          |
| ----- | ---------------------------------------------------- | --------------------------------- |
| 1     | Usuário acessa a página de relatórios                | Página `/relatorios`              |
| 2     | Seleciona o período desejado (data início e fim)     | Date picker                       |
| 3     | Opcionalmente filtra por categoria ou origem         | Filtros adicionais                |
| 4     | Sistema faz `GET /api/financeiro/relatorios`         | API Route Next.js                 |
| 5     | Backend busca transações do período no Supabase      | Query com filtros de data         |
| 6     | Cálculos realizados com precisão `Decimal`           | Biblioteca de precisão decimal    |
| 7     | Retorna resumo, categorias, origens e top 5          | JSON response                     |
| 8     | Frontend renderiza dashboards e tabelas              | Componentes de visualização       |
| 9     | Usuário pode exportar para PDF ou CSV                | Botões de exportação              |

### Diagrama

```mermaid
flowchart TD
    A["👤 Acessa página de relatórios"] --> B["📅 Seleciona período"]
    B --> C["🔍 Aplica filtros opcionais"]
    C --> D["📤 GET /api/financeiro/relatorios"]
    D --> E["🗄️ Backend consulta transações no Supabase"]
    E --> F["🧮 Calcula com precisão Decimal"]
    F --> G["📊 Monta resposta com dados agregados"]
    G --> H["📋 Resumo geral"]
    G --> I["📂 Breakdown por categorias"]
    G --> J["📡 Breakdown por origens"]
    G --> K["🏆 Top 5 produtos/itens"]
    H & I & J & K --> L["🖥️ Renderiza dashboards e tabelas"]
    L --> M{"Usuário deseja exportar?"}
    M -->|Sim| N{"Formato?"}
    N -->|PDF| O["📄 Gera relatório PDF"]
    N -->|CSV| P["📊 Gera planilha CSV"]
    M -->|Não| Q["✅ Visualização concluída"]
    O & P --> Q
```

### Estrutura da Resposta da API

```json
{
  "resumo": {
    "receita_total": "15230.50",
    "despesa_total": "8420.00",
    "lucro_liquido": "6810.50",
    "margem_percentual": "44.72"
  },
  "por_categoria": [
    { "categoria": "venda", "total": "12500.00" },
    { "categoria": "decant", "total": "2730.50" }
  ],
  "por_origem": [
    { "origem": "shopee", "total": "8200.00" },
    { "origem": "mercado_livre", "total": "4300.00" },
    { "origem": "direto", "total": "2730.50" }
  ],
  "top5_produtos": [
    { "produto": "Sauvage EDP 100ml", "total": "3200.00", "qtd_vendida": 8 }
  ]
}
```

> [!WARNING]
> Todos os cálculos financeiros utilizam a biblioteca `Decimal` no backend para evitar erros de ponto flutuante. **Nunca** use `float` para valores monetários. Consulte [[features/FINANCEIRO]] e [[features/RELATORIOS]] para detalhes.

---

## 6. ❌ Fluxo de Cancelamento de Venda

O cancelamento de venda é uma operação de reversão que desfaz todos os efeitos de uma venda registrada.

### Resumo

```
Selecionar venda → confirmar cancelamento → RPC cancelar_venda →
{reverte estoque, remove transação financeira, marca venda como cancelada}
```

### Passos Detalhados

| Passo | Ação                                                | Componente / Responsável     |
| ----- | --------------------------------------------------- | ---------------------------- |
| 1     | Usuário localiza a venda na listagem                | Página de vendas             |
| 2     | Clica em "Cancelar Venda"                           | Botão de ação                |
| 3     | Sistema exibe modal de confirmação                  | Modal de confirmação         |
| 4     | Usuário confirma o cancelamento                     | Botão "Confirmar"            |
| 5     | Chamada à RPC `cancelar_venda`                      | API Route → Supabase RPC     |
| 6     | RPC executa reversão em transação atômica           | Função PostgreSQL            |

### Diagrama

```mermaid
flowchart TD
    A["👤 Localiza venda na listagem"] --> B["🔍 Clica em 'Cancelar Venda'"]
    B --> C["⚠️ Modal de confirmação"]
    C --> D{"Usuário confirma?"}
    D -->|Não| E["🔙 Retorna à listagem"]
    D -->|Sim| F["📤 RPC cancelar_venda"]
    F --> G["🔄 Transação atômica no PostgreSQL"]
    G --> H["📈 Reverte estoque dos produtos vendidos"]
    G --> I["🔀 Cria movimentação de estoque (estorno)"]
    G --> J["💸 Remove/anula transação financeira"]
    G --> K["🏷️ Marca venda como status: cancelada"]
    H & I & J & K --> L{"Transação bem-sucedida?"}
    L -->|Sim| M["✅ Venda cancelada com sucesso"]
    L -->|Não| N["❌ Rollback — exibe erro"]
    M --> O["🔔 Notificação de sucesso"]
```

### Operações da RPC `cancelar_venda`

1. **Reverte estoque**: `estoque_atual += qtd_vendida` para cada item da venda.
2. **Cria movimentação de estorno**: registro na tabela `movimentacoes` com tipo `entrada` e origem `estorno_venda`.
3. **Remove/anula transação financeira**: a transação de receita associada é marcada como anulada ou removida.
4. **Atualiza status da venda**: de `concluida` para `cancelada`.

> [!WARNING]
> O cancelamento de venda **não** recalcula o custo médio dos produtos. Se o custo médio foi alterado desde a venda original, o estoque retorna com o custo médio atual. Veja [[REGRAS_NEGOCIO]] para mais detalhes.

> [!IMPORTANT]
> Apenas vendas com status `concluida` podem ser canceladas. Vendas já canceladas não podem ser canceladas novamente.

---

## 7. 💰 Fluxo de Dados: Venda → Financeiro

Este diagrama de sequência mostra como uma venda impacta o módulo financeiro, desde o registro até a influência em metas e relatórios.

### Conceito

- **Venda gera transação de entrada (receita)**: ao registrar uma venda, uma transação financeira do tipo `receita` é criada automaticamente.
- **Receita contribui para metas financeiras**: metas de faturamento são auto-calculadas com base nas transações de receita do período.
- **Relatórios financeiros incluem vendas por origem**: o breakdown por origem nos relatórios é alimentado pela origem (canal) registrada em cada venda.

### Diagrama de Sequência

```mermaid
sequenceDiagram
    actor U as Usuário
    participant V as Módulo de Vendas
    participant DB as PostgreSQL (Supabase)
    participant F as Módulo Financeiro
    participant M as Módulo de Metas
    participant R as Módulo de Relatórios

    U->>V: Registra nova venda
    V->>DB: RPC registrar_venda (transação atômica)
    
    Note over DB: Dentro da transação:
    DB->>DB: INSERT venda + itens
    DB->>DB: UPDATE estoque (reduz)
    DB->>DB: INSERT movimentação (saída)
    DB->>DB: INSERT transação financeira (receita)
    
    DB-->>V: Venda registrada com sucesso
    V-->>U: Confirmação visual

    Note over F,M: Efeitos assíncronos / sob demanda:

    U->>F: Acessa dashboard financeiro
    F->>DB: SELECT transações do período
    DB-->>F: Retorna transações (incluindo receita da venda)
    F-->>U: Exibe saldo, receitas e despesas

    U->>M: Acessa módulo de metas
    M->>DB: SELECT receitas do mês
    DB-->>M: Retorna total de receitas
    M->>M: Calcula progresso vs. meta definida
    M-->>U: Exibe % da meta atingida

    U->>R: Gera relatório financeiro
    R->>DB: SELECT transações com filtros
    DB-->>R: Retorna dados agregados
    R->>R: Agrupa por categoria e origem
    R-->>U: Exibe relatório com vendas por canal
```

### Impacto Financeiro de uma Venda

| Campo                     | Origem                                      | Cálculo                                                     |
| ------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| Receita bruta              | Soma dos preços dos itens                   | `Σ (preço_unitário × quantidade)`                           |
| Taxa da plataforma         | Percentual do canal                         | `receita_bruta × (taxa / 100)`                              |
| Frete                      | Informado manualmente                       | Valor fixo                                                   |
| Receita líquida            | Receita menos custos                        | `receita_bruta - taxa - frete`                               |
| Custo dos produtos         | Custo médio no momento da venda             | `Σ (custo_medio × quantidade)`                              |
| Lucro líquido              | Receita menos custos                        | `receita_liquida - custo_produtos`                           |
| Transação financeira       | Gerada automaticamente                      | Tipo `receita`, valor = `receita_liquida`                    |

---

## 8. 📦 Fluxo de Dados: Pedido → Estoque

Este diagrama de sequência mostra como o recebimento de um pedido de compra atualiza o inventário, custos e gera as movimentações correspondentes.

### Conceito

- **Pedido recebido → custo médio atualizado**: ao confirmar o recebimento, o custo médio ponderado de cada produto é recalculado com base na nova entrada.
- **Movimentações criadas**: cada item recebido gera uma movimentação de estoque do tipo `entrada`.
- **Estoque atual incrementado**: a quantidade em estoque é somada à quantidade recebida.

### Diagrama de Sequência

```mermaid
sequenceDiagram
    actor U as Usuário
    participant P as Módulo de Pedidos
    participant DB as PostgreSQL (Supabase)
    participant E as Módulo de Estoque
    participant PR as Tabela Produtos

    U->>P: Confirma recebimento do pedido
    P->>DB: RPC confirmar_recebimento (transação atômica)

    Note over DB: Dentro da transação (por item):

    loop Para cada item do pedido
        DB->>PR: SELECT estoque_atual, custo_medio
        PR-->>DB: Retorna valores atuais
        
        DB->>DB: Calcula novo custo médio ponderado
        Note over DB: novo_custo = ((est_atual × custo_atual) +<br/>(qtd_recebida × custo_novo)) /<br/>(est_atual + qtd_recebida)
        
        DB->>PR: UPDATE estoque_atual += qtd_recebida
        DB->>PR: UPDATE custo_medio = novo_custo
        DB->>DB: INSERT movimentação (tipo: entrada, origem: pedido)
    end

    DB->>DB: UPDATE pedido.status = 'recebido'
    DB-->>P: Recebimento confirmado
    P-->>U: Confirmação visual

    Note over E: Efeitos visíveis imediatamente:

    U->>E: Acessa módulo de estoque
    E->>PR: SELECT produtos com estoque atualizado
    PR-->>E: Retorna dados atualizados
    E-->>U: Exibe novo estoque e custo médio
```

### Fórmula do Custo Médio Ponderado

```
novo_custo_medio = (estoque_anterior × custo_medio_anterior) + (qtd_recebida × custo_unitario_novo)
                   ─────────────────────────────────────────────────────────────────────────────────
                                          estoque_anterior + qtd_recebida
```

### Exemplo Prático

| Dado                   | Valor       |
| ---------------------- | ----------- |
| Estoque anterior       | 5 unidades  |
| Custo médio anterior   | R$ 120,00   |
| Quantidade recebida    | 3 unidades  |
| Custo unitário novo    | R$ 150,00   |
| **Novo estoque**       | **8 unid.** |
| **Novo custo médio**   | **(5 × 120 + 3 × 150) / 8 = R$ 131,25** |

> [!NOTE]
> O custo médio é fundamental para o cálculo de lucro nas vendas e para a valorização do estoque. Consulte [[features/ESTOQUE]] e [[REGRAS_NEGOCIO]] para mais detalhes sobre as regras de estoque e custo médio.

---

## 📋 Resumo dos Fluxos e RPCs

| Fluxo                   | RPC Principal              | Tabelas Impactadas                                         |
| ----------------------- | -------------------------- | ---------------------------------------------------------- |
| Venda Completa          | `registrar_venda`          | `vendas`, `venda_itens`, `produtos`, `movimentacoes`, `transacoes` |
| Pedido de Compra        | `confirmar_recebimento`    | `pedidos`, `pedido_itens`, `produtos`, `movimentacoes`      |
| Decant (Consumo)        | `registrar_consumo_decant` | `frascos`, `decants`, `transacoes`                          |
| Cancelamento de Venda   | `cancelar_venda`           | `vendas`, `produtos`, `movimentacoes`, `transacoes`         |
| Relatório Financeiro    | —                          | `transacoes` (leitura)                                      |

---

## 📎 Documentos Relacionados

- [[features/VENDAS]] — Detalhes da funcionalidade de vendas
- [[features/PEDIDOS]] — Detalhes da funcionalidade de pedidos de compra
- [[features/DECANTS]] — Detalhes da funcionalidade de decants e consumo
- [[features/FINANCEIRO]] — Módulo financeiro e transações
- [[features/RELATORIOS]] — Relatórios e exportações
- [[features/AUTENTICACAO]] — Autenticação e gerenciamento de sessão
- [[features/ESTOQUE]] — Gestão de estoque e movimentações
- [[features/METAS]] — Metas financeiras e acompanhamento
- [[REGRAS_NEGOCIO]] — Regras de negócio detalhadas (custo médio, validações, etc.)
- [[BANCO]] — Estrutura do banco de dados e tabelas
- [[API]] — Documentação das rotas de API
- [[ARQUITETURA]] — Visão geral da arquitetura do sistema
