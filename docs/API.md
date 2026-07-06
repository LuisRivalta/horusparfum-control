# 🔌 API — Referência Completa

> Documentação completa da API REST do **Horus Parfum Control**.
> Backend construído com **FastAPI (Python)** e deployado na **Vercel** como serverless functions.

---

## 📋 Visão Geral

| Propriedade | Valor |
|---|---|
| **Framework** | FastAPI (Python) |
| **Deploy** | Vercel (Serverless Functions) |
| **Base URL (prod)** | `https://horusparfum-control-api.vercel.app` |
| **Base URL (dev)** | `http://localhost:8000` |
| **Formato** | JSON |
| **Autenticação** | JWT Bearer Token (Supabase Auth) |

> [!IMPORTANT]
> Todos os endpoints, **exceto** `/api/health`, exigem autenticação via JWT Bearer Token no header da requisição.

---

## 🔐 Autenticação

A API utiliza tokens JWT emitidos pelo **Supabase Auth**. O token é obtido automaticamente quando o usuário faz login no frontend.

### Header de Autenticação

```http
Authorization: Bearer <supabase_jwt_token>
```

### Obtenção do Token

O token JWT é obtido a partir da sessão do Supabase Auth no frontend:

```typescript
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;
```

### Respostas de Erro de Autenticação

| Cenário | Status | Resposta |
|---|---|---|
| Token ausente | `401` | `{"detail": "Token invalido"}` |
| Token expirado | `401` | `{"detail": "Token invalido"}` |
| Token malformado | `401` | `{"detail": "Token invalido"}` |

> [!TIP]
> O frontend renova o token automaticamente via `supabase.auth.onAuthStateChange()`. Caso o token expire durante uma requisição, o interceptor do Axios tenta renovar e repetir a chamada.

---

## 📊 Tabela de Endpoints

| # | Método | Caminho | Auth | Descrição | Status |
|---|--------|---------|:----:|-----------|:------:|
| 1 | `GET` | `/api/health` | ❌ | Health check | ✅ Completo |
| 2 | `GET` | `/api/financeiro/transacoes` | ✅ | Listar transações | 🔶 Stub |
| 3 | `GET` | `/api/financeiro/contas` | ✅ | Listar contas | 🔶 Stub |
| 4 | `GET` | `/api/financeiro/relatorios` | ✅ | Relatórios financeiros | ✅ Completo |
| 5 | `GET` | `/api/financeiro/metas` | ✅ | Metas financeiras com progresso | ✅ Completo |
| 6 | `GET` | `/api/estoque/produtos` | ✅ | Listar produtos | 🔶 Stub |
| 7 | `GET` | `/api/estoque/produtos/{id}/estoque-minimo-sugerido` | ✅ | Estoque mínimo sugerido | ✅ Completo |
| 8 | `GET` | `/api/estoque/movimentacoes` | ✅ | Listar movimentações | 🔶 Stub |
| 9 | `GET` | `/api/estoque/categorias` | ✅ | Listar categorias | 🔶 Stub |
| 10 | `GET` | `/api/estoque/fornecedores` | ✅ | Listar fornecedores | 🔶 Stub |
| 11 | `GET` | `/api/estoque/alertas` | ✅ | Listar alertas de estoque | 🔶 Stub |
| 12 | `POST` | `/api/estoque/pedidos/importar-pdf` | ✅ | Importar pedido via PDF | ✅ Completo |
| 13 | `GET` | `/api/estoque/vendas/dashboard` | ✅ | Dashboard de vendas | ✅ Completo |

**Legenda:**
- ✅ **Completo** — Endpoint totalmente funcional com lógica de negócio
- 🔶 **Stub** — Endpoint implementado mas retornando dados vazios (placeholder para futura integração)

---

## 📖 Endpoints Detalhados

---

### 1. Health Check

```
GET /api/health
```

Verifica se a API está operacional. **Não requer autenticação.**

#### Resposta de Sucesso — `200 OK`

```json
{
  "status": "ok"
}
```

> [!NOTE]
> Este endpoint é utilizado para monitoramento e verificação de disponibilidade da API. Ideal para health checks de infraestrutura.

---

### 2. Listar Transações 🔶

```
GET /api/financeiro/transacoes
```

> [!WARNING]
> **Endpoint Stub** — Retorna array vazio. Implementação completa pendente.

#### Resposta — `200 OK`

```json
[]
```

---

### 3. Listar Contas 🔶

```
GET /api/financeiro/contas
```

> [!WARNING]
> **Endpoint Stub** — Retorna array vazio. Implementação completa pendente.

#### Resposta — `200 OK`

```json
[]
```

---

### 4. Relatórios Financeiros ✅

```
GET /api/financeiro/relatorios?inicio={data_inicio}&fim={data_fim}
```

Retorna relatório financeiro consolidado para o período especificado, com cálculos de alta precisão usando `Decimal` no backend.

#### Query Parameters

| Parâmetro | Tipo | Obrigatório | Formato | Descrição |
|---|---|:---:|---|---|
| `inicio` | `string` | ✅ | `YYYY-MM-DD` | Data de início do período |
| `fim` | `string` | ✅ | `YYYY-MM-DD` | Data final do período |

#### Validações

- Ambos os parâmetros `inicio` e `fim` são obrigatórios
- O formato deve ser `YYYY-MM-DD` (ISO 8601 date)
- `inicio` não pode ser posterior a `fim`

#### Resposta de Sucesso — `200 OK`

```json
{
  "periodo": {
    "inicio": "2025-01-01",
    "fim": "2025-01-31"
  },
  "resumo": {
    "total_receitas": "5240.50",
    "total_despesas": "2130.00",
    "saldo_periodo": "3110.50",
    "saldo_historico": "15420.75",
    "total_transacoes": 47
  },
  "por_categoria": [
    {
      "categoria": "vendas",
      "tipo": "entrada",
      "total": "4800.00",
      "quantidade": 32
    },
    {
      "categoria": "compras",
      "tipo": "saida",
      "total": "1800.00",
      "quantidade": 8
    }
  ],
  "evolucao_mensal": [
    {
      "mes": "2025-01",
      "receitas": "5240.50",
      "despesas": "2130.00",
      "saldo": "3110.50"
    }
  ]
}
```

#### Regras de Negócio Aplicadas

- Todos os valores monetários são calculados com `Decimal` no backend para evitar erros de ponto flutuante
- Valores retornados como strings para preservar precisão decimal
- `saldo_historico` = soma acumulada de **todas** as entradas - **todas** as saídas desde o início do sistema (não apenas do período)
- `saldo_periodo` = receitas - despesas apenas do período filtrado
- Transações de vendas canceladas são **excluídas** do cálculo
- Categorização automática por tipo de origem da transação

#### Respostas de Erro

| Status | Condição | Resposta |
|---|---|---|
| `400` | Parâmetros ausentes | `{"detail": "Periodo invalido"}` |
| `400` | `inicio` > `fim` | `{"detail": "Periodo invalido"}` |
| `400` | Formato de data inválido | `{"detail": "Periodo invalido"}` |
| `401` | Token inválido/ausente | `{"detail": "Token invalido"}` |
| `502` | Falha na consulta ao Supabase | `{"detail": "Erro ao consultar Supabase"}` |

---

### 5. Metas Financeiras ✅

```
GET /api/financeiro/metas
```

Retorna todas as metas financeiras com cálculo automático de progresso.

#### Resposta de Sucesso — `200 OK`

```json
[
  {
    "id": "uuid-da-meta",
    "titulo": "Faturamento Mensal",
    "tipo": "monetaria",
    "valor_alvo": "10000.00",
    "valor_atual": "7500.00",
    "progresso": 75.0,
    "periodo_inicio": "2025-01-01",
    "periodo_fim": "2025-01-31",
    "status": "em_andamento",
    "created_at": "2025-01-01T00:00:00Z"
  },
  {
    "id": "uuid-da-meta-2",
    "titulo": "Margem de Lucro",
    "tipo": "percentual",
    "valor_alvo": "40.00",
    "valor_atual": "35.00",
    "progresso": 87.5,
    "periodo_inicio": "2025-01-01",
    "periodo_fim": "2025-03-31",
    "status": "em_andamento",
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

#### Regras de Negócio Aplicadas

- **Metas monetárias** (`tipo: "monetaria"`): o `valor_atual` e o `progresso` são calculados **automaticamente** com base nas receitas (transações de entrada) do período da meta
- **Metas percentuais** (`tipo: "percentual"`): o `valor_atual` requer **atualização manual** pelo usuário
- `progresso` = (`valor_atual` / `valor_alvo`) × 100, limitado a 100%
- Valores monetários calculados com `Decimal` para precisão
- Status possíveis: `em_andamento`, `concluida`, `nao_atingida`

#### Respostas de Erro

| Status | Condição | Resposta |
|---|---|---|
| `401` | Token inválido/ausente | `{"detail": "Token invalido"}` |
| `502` | Falha na consulta ao Supabase | `{"detail": "Erro ao consultar Supabase"}` |

---

### 6. Listar Produtos 🔶

```
GET /api/estoque/produtos
```

> [!WARNING]
> **Endpoint Stub** — Retorna array vazio. Implementação completa pendente.

#### Resposta — `200 OK`

```json
[]
```

---

### 7. Estoque Mínimo Sugerido ✅

```
GET /api/estoque/produtos/{id}/estoque-minimo-sugerido
```

Calcula uma sugestão de estoque mínimo para um produto com base em seu histórico de vendas.

#### Path Parameters

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `id` | `UUID` | ID do produto |

#### Resposta de Sucesso — `200 OK`

```json
{
  "produto_id": "uuid-do-produto",
  "estoque_minimo_sugerido": 12,
  "media_diaria": 0.8,
  "dias_reposicao": 10,
  "margem_seguranca": 0.5,
  "dados_utilizados": {
    "periodo_dias": 90,
    "total_vendido": 72
  }
}
```

#### Regras de Negócio Aplicadas

A fórmula para cálculo do estoque mínimo sugerido é:

```
estoque_mínimo = média_diária × dias_reposição × (1 + margem_segurança)
```

Onde:
- **`média_diária`** = total vendido nos últimos 90 dias ÷ 90
- **`dias_reposição`** = tempo médio estimado para receber novo pedido do fornecedor (padrão: 10 dias)
- **`margem_segurança`** = fator adicional para imprevistos (padrão: 0.5 = 50%)

O resultado é arredondado para cima (ceiling) pois não é possível ter fração de unidade.

#### Respostas de Erro

| Status | Condição | Resposta |
|---|---|---|
| `401` | Token inválido/ausente | `{"detail": "Token invalido"}` |
| `404` | Produto não encontrado | `{"detail": "Produto nao encontrado"}` |
| `502` | Falha na consulta ao Supabase | `{"detail": "Erro ao consultar Supabase"}` |

---

### 8. Listar Movimentações 🔶

```
GET /api/estoque/movimentacoes
```

> [!WARNING]
> **Endpoint Stub** — Retorna array vazio. Implementação completa pendente.

#### Resposta — `200 OK`

```json
[]
```

---

### 9. Listar Categorias 🔶

```
GET /api/estoque/categorias
```

> [!WARNING]
> **Endpoint Stub** — Retorna array vazio. Implementação completa pendente.

#### Resposta — `200 OK`

```json
[]
```

---

### 10. Listar Fornecedores 🔶

```
GET /api/estoque/fornecedores
```

> [!WARNING]
> **Endpoint Stub** — Retorna array vazio. Implementação completa pendente.

#### Resposta — `200 OK`

```json
[]
```

---

### 11. Listar Alertas de Estoque 🔶

```
GET /api/estoque/alertas
```

> [!WARNING]
> **Endpoint Stub** — Retorna array vazio. Implementação completa pendente.

#### Resposta — `200 OK`

```json
[]
```

---

### 12. Importar Pedido via PDF ✅

```
POST /api/estoque/pedidos/importar-pdf
```

Recebe um arquivo PDF de pedido de compra de fornecedor, extrai os itens usando IA e realiza fuzzy matching com os produtos cadastrados no sistema.

#### Request Body — `multipart/form-data`

| Campo | Tipo | Obrigatório | Descrição |
|---|---|:---:|---|
| `file` | `File (PDF)` | ✅ | Arquivo PDF do pedido de compra |

#### Validações do Upload

| Validação | Regra | Erro |
|---|---|---|
| Tipo do arquivo | Apenas PDF (magic bytes `%PDF-`) | `400 — Arquivo nao e um PDF valido` |
| Tamanho máximo | 10 MB (10.485.760 bytes) | `413 — PDF excede o tamanho maximo de 10MB` |

#### Resposta de Sucesso — `200 OK`

```json
{
  "fornecedor_detectado": "Essência do Brasil Ltda",
  "data_pedido": "2025-06-15",
  "itens": [
    {
      "descricao_pdf": "Sauvage EDP 100ml",
      "produto_match": {
        "id": "uuid-do-produto",
        "nome": "Dior Sauvage",
        "similaridade": 0.92
      },
      "quantidade": 5,
      "preco_unitario": "89.90",
      "preco_total": "449.50",
      "status": "matched"
    },
    {
      "descricao_pdf": "Bleu de Channel 50ml",
      "produto_match": null,
      "quantidade": 3,
      "preco_unitario": "120.00",
      "preco_total": "360.00",
      "status": "not_found"
    }
  ],
  "total_itens": 2,
  "total_matched": 1,
  "total_not_found": 1,
  "valor_total": "809.50"
}
```

#### Regras de Negócio Aplicadas

- **Extração via IA**: O conteúdo do PDF é processado para extrair dados estruturados (fornecedor, itens, quantidades, preços)
- **Fuzzy Matching**: Cada item extraído é comparado com os produtos cadastrados no banco de dados
  - **Threshold de similaridade**: `0.78` — matches abaixo desse valor são descartados
  - **Delta de ambiguidade**: `0.03` — se dois matches tiverem diferença de similaridade menor que esse valor, o resultado é considerado ambíguo
  - Termos como "EDP", "EDT", "Parfum" são **ignorados** no matching (stopwords de perfumaria)
- Status do item: `matched` (produto encontrado), `not_found` (sem match), `ambiguous` (múltiplos matches próximos)

#### Respostas de Erro

| Status | Condição | Resposta |
|---|---|---|
| `400` | Arquivo não é PDF | `{"detail": "Arquivo nao e um PDF valido"}` |
| `401` | Token inválido/ausente | `{"detail": "Token invalido"}` |
| `413` | PDF > 10MB | `{"detail": "PDF excede o tamanho maximo de 10MB"}` |
| `502` | Falha na consulta ao Supabase | `{"detail": "Erro ao consultar Supabase"}` |

#### Exemplo com cURL

```bash
curl -X POST \
  https://horusparfum-control-api.vercel.app/api/estoque/pedidos/importar-pdf \
  -H "Authorization: Bearer <token>" \
  -F "file=@pedido_fornecedor.pdf"
```

---

### 13. Dashboard de Vendas ✅

```
GET /api/estoque/vendas/dashboard?inicio={data_inicio}&fim={data_fim}
```

Retorna dados consolidados para o dashboard de vendas no período especificado.

#### Query Parameters

| Parâmetro | Tipo | Obrigatório | Formato | Descrição |
|---|---|:---:|---|---|
| `inicio` | `string` | ✅ | `YYYY-MM-DD` | Data de início do período |
| `fim` | `string` | ✅ | `YYYY-MM-DD` | Data final do período |

#### Validações

- Ambos os parâmetros `inicio` e `fim` são obrigatórios
- O formato deve ser `YYYY-MM-DD` (ISO 8601 date)
- `inicio` não pode ser posterior a `fim`

#### Resposta de Sucesso — `200 OK`

```json
{
  "periodo": {
    "inicio": "2025-01-01",
    "fim": "2025-01-31"
  },
  "resumo": {
    "total_vendas": 45,
    "faturamento_bruto": "12500.00",
    "custo_total": "6200.00",
    "lucro_bruto": "6300.00",
    "margem_media": "50.40",
    "roi_medio": "101.61",
    "ticket_medio": "277.78"
  },
  "por_canal": [
    {
      "canal": "shopee",
      "total_vendas": 20,
      "faturamento": "5500.00",
      "lucro": "2800.00"
    },
    {
      "canal": "mercado_livre",
      "total_vendas": 15,
      "faturamento": "4200.00",
      "lucro": "2100.00"
    }
  ],
  "top_produtos": [
    {
      "produto_id": "uuid",
      "nome": "Dior Sauvage",
      "quantidade_vendida": 12,
      "faturamento": "3600.00",
      "lucro": "1800.00"
    }
  ],
  "evolucao_diaria": [
    {
      "data": "2025-01-01",
      "vendas": 3,
      "faturamento": "750.00"
    }
  ]
}
```

#### Regras de Negócio Aplicadas

- **Vendas canceladas são excluídas** — Apenas vendas com status ativo são consideradas
- **ROI** = (lucro ÷ custo) × 100 — Retorna `null` se custo total = 0
- **Margem** = (lucro ÷ faturamento bruto) × 100 — Retorna `0` se faturamento = 0
- **Ticket Médio** = faturamento bruto ÷ número de vendas
- Valores calculados com `Decimal` para precisão
- Dados de `por_canal` agrupam vendas pelo canal de venda registrado
- `top_produtos` ordenados por faturamento (desc), limitado aos 10 maiores

#### Respostas de Erro

| Status | Condição | Resposta |
|---|---|---|
| `400` | Parâmetros ausentes | `{"detail": "Periodo invalido"}` |
| `400` | `inicio` > `fim` | `{"detail": "Periodo invalido"}` |
| `401` | Token inválido/ausente | `{"detail": "Token invalido"}` |
| `502` | Falha na consulta ao Supabase | `{"detail": "Erro ao consultar Supabase"}` |

---

## ⚠️ Tratamento de Erros — Referência Geral

A API segue um padrão consistente de respostas de erro:

### Códigos de Erro

| Código | Significado | Quando Ocorre |
|---|---|---|
| `400` | Bad Request | Parâmetros inválidos, período inválido, `inicio` > `fim`, arquivo não é PDF |
| `401` | Unauthorized | Token JWT ausente, expirado ou inválido |
| `404` | Not Found | Recurso não encontrado (ex: produto inexistente) |
| `413` | Payload Too Large | Upload de PDF excede 10MB |
| `502` | Bad Gateway | Falha na comunicação com o Supabase |

### Formato Padrão de Erro

```json
{
  "detail": "Mensagem descritiva do erro"
}
```

> [!NOTE]
> Todas as mensagens de erro são retornadas **sem acentos** para evitar problemas de encoding em diferentes ambientes.

---

## 🧪 Testando a API

### Com cURL

```bash
# Health check (sem auth)
curl https://horusparfum-control-api.vercel.app/api/health

# Relatórios financeiros (com auth)
curl -H "Authorization: Bearer <token>" \
  "https://horusparfum-control-api.vercel.app/api/financeiro/relatorios?inicio=2025-01-01&fim=2025-01-31"

# Metas financeiras
curl -H "Authorization: Bearer <token>" \
  https://horusparfum-control-api.vercel.app/api/financeiro/metas

# Dashboard de vendas
curl -H "Authorization: Bearer <token>" \
  "https://horusparfum-control-api.vercel.app/api/estoque/vendas/dashboard?inicio=2025-01-01&fim=2025-01-31"
```

### Com a Documentação Interativa

O FastAPI gera documentação interativa automaticamente:

- **Swagger UI**: `https://horusparfum-control-api.vercel.app/docs`
- **ReDoc**: `https://horusparfum-control-api.vercel.app/redoc`

---

## 📎 Documentos Relacionados

- [[ARQUITETURA]] — Visão geral da arquitetura do sistema
- [[features/FINANCEIRO]] — Módulo financeiro no frontend
- [[features/ESTOQUE]] — Módulo de estoque no frontend
- [[features/VENDAS]] — Funcionalidades de vendas
- [[features/PEDIDOS]] — Gestão de pedidos de compra
- [[features/METAS]] — Sistema de metas financeiras
- [[features/RELATORIOS]] — Relatórios e dashboards
- [[DEPLOY]] — Configuração de deploy e ambientes
