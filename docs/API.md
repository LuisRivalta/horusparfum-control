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
| 14 | `GET` | `/api/mercadolivre/conexao` | ✅ | Estado da conexão com o ML | ✅ Completo |
| 15 | `GET` | `/api/mercadolivre/conectar` | ✅ | URL de autorização do ML | ✅ Completo |
| 16 | `GET` | `/api/mercadolivre/callback` | ❌ | Retorno do OAuth (redireciona ao frontend) | ✅ Completo |
| 17 | `POST` | `/api/mercadolivre/desconectar` | ✅ | Apaga a conexão | ✅ Completo |
| 18 | `GET` | `/api/anuncios/atributos` | ✅ | Atributos da categoria de perfumes | ✅ Completo |
| 19 | `POST` | `/api/anuncios/precos` | ✅ | Preço que fecha a margem | ✅ Completo |
| 20 | `POST` | `/api/anuncios/ia/ficha` | ✅ | IA sugere a ficha | ✅ Completo |
| 21 | `POST` | `/api/anuncios/ia/textos` | ✅ | IA gera título e descrição | ✅ Completo |
| 22 | `POST` | `/api/anuncios/publicar` | ✅ | Publica rascunhos no ML | ✅ Completo |
| 23 | `GET` | `/api/anuncios/{id}/qualidade` | ✅ | Nota de qualidade do ML | ✅ Completo |
| 24 | `POST` | `/api/anuncios/{id}/quantidade` | ✅ | Envia a quantidade ao ML | ✅ Completo |
| 25 | `POST` | `/api/anuncios/{id}/status` | ✅ | Pausa ou reativa | ✅ Completo |
| 26 | `POST` | `/api/anuncios/{id}/preco` | ✅ | Aplica um preço no ML | ✅ Completo |
| 27 | `GET` | `/api/anuncios/conta/itens` | ✅ | Anúncios que já existem na conta do ML | ✅ Completo |
| 28 | `POST` | `/api/anuncios/ligar` | ✅ | Liga um anúncio do ML a um perfume | ✅ Completo |

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
| `inicio` | `string` | ✅ | ISO-8601 | Início do período; aceita data ou datetime com fuso |
| `fim` | `string` | ✅ | ISO-8601 | Fim do período; aceita data ou datetime com fuso |

#### Validações

- Ambos os parâmetros `inicio` e `fim` são obrigatórios
- Os valores devem ser datas ou datetimes ISO-8601 válidos
- `inicio` não pode ser posterior a `fim`

#### Resposta de Sucesso — `200 OK`

```json
{
  "periodo": {
    "inicio": "2026-07-01T03:00:00+00:00",
    "fim": "2026-08-01T02:59:59+00:00"
  },
  "resumo": {
    "receita": 5240.5,
    "despesa": 2130.0,
    "lucro": 1710.5,
    "saldo_historico": 15420.75
  },
  "categorias": {
    "receitas": [{"categoria": "Vendas", "total": 4800.0}],
    "despesas": [{"categoria": "Compras", "total": 1800.0}]
  },
  "origens": [{"origem": "Venda", "qtd": 32}],
  "maiores": {"receitas": [], "despesas": []},
  "transacoes": [],
  "total_lancamentos": 47
}
```

#### Regras de Negócio Aplicadas

- Todos os valores monetários são calculados com `Decimal` no backend para evitar erros de ponto flutuante
- `saldo_historico` = soma acumulada de **todas** as entradas - **todas** as saídas desde o início do sistema (não apenas do período)
- `lucro` = receitas - despesas - `total_custo` das vendas concluídas no período
- O custo vendido é gerencial: não cria saída financeira e não altera `saldo_historico`
- Transações com `venda_id` usam `vendas.data_venda`; transações manuais usam `transacoes.created_at`
- Vendas canceladas não entram no custo vendido
- As consultas a `transacoes` e `vendas` são paginadas em lotes de 1.000 e ordenadas por `id`
- Categorização automática por tipo de origem da transação

#### Respostas de Erro

| Status | Condição | Resposta |
|---|---|---|
| `400` | Parâmetros ausentes | `{"detail": "Periodo invalido"}` |
| `400` | `inicio` > `fim` | `{"detail": "Periodo invalido"}` |
| `400` | Formato de data inválido | `{"detail": "Periodo invalido"}` |
| `401` | Token inválido/ausente | `{"detail": "Token invalido"}` |
| `502` | Falha ao consultar transações | `{"detail": "Erro ao consultar transacoes: ..."}` |
| `502` | Falha ao consultar vendas | `{"detail": "Erro ao consultar vendas: ..."}` |

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

### 14. Mercado Livre e Anúncios ✅

Detalhes de negócio em [[features/ANUNCIOS]]. Todas as rotas exigem JWT, exceto `/api/mercadolivre/callback` (protegida pelo `state` assinado). Erros comuns às rotas que falam com o ML: `409 {"detail": "Conecte a conta do Mercado Livre"}` (sem conexão) e `502 {"detail": "<mensagem do ML>"}` (o ML recusou).

**Conexão (`/api/mercadolivre`)**

| Rota | Body | Resposta | Erros |
|---|---|---|---|
| `GET /conexao` | — | `{"conectado": bool, "nickname": str\|null, "user_product": bool}` (nunca devolve token) | — |
| `GET /conectar` | — | `{"url": "<autorização do ML>"}` | `503` ML não configurado (faltam variáveis) |
| `GET /callback?code=&state=` | — | Redireciona (302) para `{FRONTEND_URL}/anuncios/config?ml=ok` ou `?ml=erro` | — |
| `POST /desconectar` | — | `{"conectado": false}` | — |

**Preço e catálogo (`/api/anuncios`)**

| Rota | Body | Resposta | Erros |
|---|---|---|---|
| `GET /atributos` | — | Lista de atributos visíveis da categoria `MLB6284` (cache de 1 h) | `502` |
| `POST /precos` | `{"itens": [{"chave", "custo", "margem", "tipo": "frasco"\|"decant"}], "pacotes": {"frasco": Pacote, "decant": Pacote}}` (Pacote: `peso_g`, `altura_cm`, `largura_cm`, `comprimento_cm`, todos opcionais) | `{"itens": [{"chave", "gold_special": {preco, comissao, taxa_fixa, frete, lucro} \| {"erro"}, "gold_pro": {...}}]}` | `409`, `502` |

**IA (`/api/anuncios/ia`)**

| Rota | Body | Resposta | Erros |
|---|---|---|---|
| `POST /ficha` | `{"produto_id"}` | `{"ficha": {ATRIBUTO: {value_id\|value_name}}}` | `409` IA desligada, `404` perfume não encontrado |
| `POST /textos` | `{"produto_id", "anuncios": [{"chave", "tipo", "ml"?}]}` | `{"textos": ...}` por anúncio | `409`, `404`, `502` |

**Publicar e gerir (`/api/anuncios`)**

| Rota | Body | Resposta | Erros |
|---|---|---|---|
| `POST /publicar` | `{"ids": [anuncio_id]}` | `{"resultados": [{"id", "status", "ml_item_id"?, "erro"?}]}`; um anúncio com problema não derruba os outros | `409` sem conexão |
| `GET /{id}/qualidade` | — | `{"score": int\|null, "nivel", "pendencias": [{"titulo", "texto", "link"}]}` | `404`, `400` ainda não publicado, `409`, `502` |
| `POST /{id}/quantidade` | — | `{"quantidade": int}` (calculada pela regra de estoque e enviada ao ML) | `404`, `400`, `409`, `502` |
| `POST /{id}/status` | `{"status": "paused"\|"active"}` | `{"status": "pausado"\|"publicado"}` | `404`, `400`, `409`, `502` |
| `POST /{id}/preco` | `{"preco": float > 0}` | `{"preco": float}` | `404`, `400`, `422`, `409`, `502` |

**Ligar anúncios existentes (`/api/anuncios`)**

| Rota | Body | Resposta | Erros |
|---|---|---|---|
| `GET /conta/itens` | — | `{"itens": [{"ml_item_id", "titulo", "preco", "quantidade", "status", "permalink", "volume_ml", "ligado"}]}` (para em 1000 itens) | `409`, `502` |
| `POST /ligar` | `{"ml_item_id", "produto_id", "tipo", "ml"?}` | `{"status": "publicado"\|"pausado"}` | `400` (decant sem ml, frasco com ml, perfume inexistente, anúncio encerrado, tipo de anúncio não suportado), `409` já ligado, `502` |

---

## ⚠️ Tratamento de Erros — Referência Geral

A API segue um padrão consistente de respostas de erro:

### Códigos de Erro

| Código | Significado | Quando Ocorre |
|---|---|---|
| `400` | Bad Request | Parâmetros inválidos, período inválido, `inicio` > `fim`, arquivo não é PDF |
| `401` | Unauthorized | Token JWT ausente, expirado ou inválido |
| `404` | Not Found | Recurso não encontrado (ex: produto inexistente) |
| `409` | Conflict | Mercado Livre desconectado, IA desligada, anúncio já ligado |
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
> As rotas de Anúncios (`/api/anuncios`, `/api/mercadolivre`) devolvem mensagens em português **com acentos**.

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
- [[features/ANUNCIOS]] — Anúncios no Mercado Livre
- [[features/PEDIDOS]] — Gestão de pedidos de compra
- [[features/METAS]] — Sistema de metas financeiras
- [[features/RELATORIOS]] — Relatórios e dashboards
- [[DEPLOY]] — Configuração de deploy e ambientes
