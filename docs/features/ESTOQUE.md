# 📦 Módulo de Estoque

## Visão Geral

O módulo de Estoque é o coração operacional do **Horus Parfum Control**. Ele gerencia todo o catálogo de produtos, níveis de estoque, movimentações, categorias, fornecedores e marcas da perfumaria artesanal.

A visão principal do módulo exibe os produtos em formato de cards com **badges coloridos** que indicam a situação do estoque de forma visual e imediata.

### Áreas do Módulo

| Área | Rota | Descrição |
|------|------|-----------|
| Visão Geral | `/estoque` | Grid de produtos com badges de situação |
| Produtos | `/estoque/cadastros/produtos` | CRUD completo de produtos |
| Categorias | `/estoque/cadastros/categorias` | Gestão de categorias |
| Fornecedores | `/estoque/cadastros/fornecedores` | Gestão de fornecedores |
| Marcas | `/estoque/cadastros/marcas` | Gestão de marcas |
| Vendas | `/estoque/vendas` | Módulo de vendas (ver [[features/VENDAS]]) |
| Relatórios | `/estoque/relatorios` | Relatórios de giro de estoque |

---

## Funcionalidades

### 🏠 Visão Geral do Estoque (`/estoque`)

A tela principal do estoque apresenta todos os produtos em um grid de cards com informações visuais rápidas.

#### Cards de Produto

Cada card exibe:

| Elemento | Descrição |
|----------|-----------|
| **Foto** | Imagem do produto (Supabase Storage) |
| **Nome** | Nome do perfume/produto |
| **Volume** | Volume em ml |
| **Badge de Estoque** | Indicador colorido da situação do estoque |

#### Lógica de Situação do Estoque (`lib/estoque.ts`)

A cor do badge é determinada pela função de situação do estoque:

| Situação | Condição | Cor do Badge |
|----------|----------|:------------:|
| **Crítico** | `estoque_atual ≤ 50%` do `estoque_minimo` | 🔴 Vermelho |
| **Baixo** | `estoque_atual ≤ estoque_minimo` | 🟠 Laranja |
| **OK** | `estoque_atual > estoque_minimo` | 🟡 Dourado |

> [!WARNING]
> Produtos com estoque **crítico** devem ser priorizados para reposição. A cor vermelha indica risco iminente de ruptura de estoque.

#### Filtros e Ordenação

**Filtros disponíveis:**

| Filtro | Tipo | Descrição |
|--------|------|-----------|
| Busca textual | `text` | Pesquisa por nome do produto |
| Categoria | `select` | Filtra por categoria |
| Fornecedor | `select` | Filtra por fornecedor |
| Marca | `select` | Filtra por marca |

**Ordenação:**

| Opção | Descrição |
|-------|-----------|
| Quantidade (crescente) | Menor estoque primeiro |
| Quantidade (decrescente) | Maior estoque primeiro |
| Alfabética (A-Z) | Por nome do produto |

#### Ações Rápidas

| Ação | Descrição |
|------|-----------|
| **Entrada Rápida** | Modal para registrar entrada de estoque sem navegar para outra tela |
| **Saída Rápida** | Modal para registrar saída de estoque sem navegar para outra tela |

Ambas as ações rápidas criam registros na tabela `movimentacoes` automaticamente.

#### Modal de Detalhes do Produto (`ProductDetailsModal`)

Ao clicar em um card de produto, abre-se um modal com:

- Visualização completa dos dados do produto
- Edição inline dos campos
- Exclusão com confirmação
- **Estoque mínimo sugerido** calculado via API backend (veja seção dedicada abaixo)

---

### 🛍️ Cadastro de Produtos (`/estoque/cadastros/produtos`)

CRUD completo para gerenciar o catálogo de produtos.

#### Campos do Produto

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `nome` | `text` | ✅ | Nome do produto |
| `volume_ml` | `numeric` | ✅ | Volume em mililitros |
| `preço_referência` | `numeric(10,2)` | ❌ | Preço de referência em R$ |
| `categoria` | `uuid` (FK) | ❌ | Categoria do produto |
| `fornecedor` | `uuid` (FK) | ❌ | Fornecedor do produto |
| `marca` | `uuid` (FK) | ❌ | Marca do produto |
| `estoque_mínimo` | `integer` | ❌ | Quantidade mínima desejada em estoque |

#### Upload de Imagem

O sistema oferece três formas de adicionar a foto do produto:

| Método | Descrição |
|--------|-----------|
| **Upload de arquivo** | Seleção de arquivo via explorador |
| **Colar da área de transferência** | Atalho `Ctrl+V` para colar imagem copiada |
| **Recorte de imagem** | Cropper integrado para ajustar a foto |

As imagens são armazenadas no **Supabase Storage**, no bucket `produtos`.

#### Funcionalidades Especiais

> [!TIP]
> - **Cadastro sem estoque inicial** (Session 28): Produtos podem ser registrados sem quantidade inicial de estoque. O estoque começa zerado e pode ser ajustado via Entrada Rápida.
> - **Exclusão com feedback** (Session 24): Ao excluir um produto, o sistema exibe confirmação visual do resultado.
> - **Remover apenas do estoque** (Session 25): Opção para zerar o estoque de um produto sem excluí-lo do catálogo.

---

### 🏷️ Categorias (`/estoque/cadastros/categorias`)

Gestão de categorias para classificação dos produtos.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `nome` | `text` | ✅ | Nome da categoria |
| `ícone` | `text` | ❌ | Ícone representativo da categoria |

- Tabela: `categorias`
- Operações: CRUD completo

---

### 🏢 Fornecedores (`/estoque/cadastros/fornecedores`)

Gestão de fornecedores dos produtos.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `nome` | `text` | ✅ | Nome do fornecedor |
| `contato` | `text` | ❌ | Informações de contato |
| `status` | `text` | ✅ | Status do fornecedor (ativo/inativo) |
| `ultima_compra` | `date` | ❌ | Data da última compra realizada |

- Tabela: `fornecedores`
- Operações: CRUD completo

---

### 🏅 Marcas (`/estoque/cadastros/marcas`)

Gestão de marcas dos perfumes.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `nome` | `text` | ✅ | Nome da marca (único) |

- Tabela: `marcas`
- Operações: CRUD completo
- Adicionado na **Session 30**

> [!NOTE]
> O nome da marca deve ser único no sistema. O banco de dados possui constraint `UNIQUE` na coluna `nome`.

---

### 📊 Movimentações

O histórico de movimentações funciona como um **livro-razão interno** do estoque. Não há CRUD manual — todos os registros são gerados automaticamente pelo sistema.

#### Campos do Registro de Movimentação

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `produto_id` | `uuid` (FK) | Produto movimentado |
| `tipo` | `text` | Tipo da movimentação (entrada/saída) |
| `quantidade` | `integer` | Quantidade movimentada |
| `motivo` | `text` | Razão da movimentação |
| `responsável` | `text` | Quem realizou a operação |
| `saldo_resultante` | `integer` | Saldo do produto após a movimentação |

#### Gatilhos de Criação

As movimentações são geradas automaticamente por:

| Origem | Tipo | Descrição |
|--------|------|-----------|
| Entrada Rápida | `entrada` | Adição manual de estoque |
| Saída Rápida | `saída` | Remoção manual de estoque |
| Venda registrada | `saída` | Redução via RPC `registrar_venda` |
| Venda cancelada | `entrada` | Reversão via RPC `cancelar_venda` |
| Decant realizado | `saída` | Redução de ml do frasco original |

> [!IMPORTANT]
> Todas as movimentações são realizadas via **RPCs atômicas** no Supabase para garantir consistência entre estoque, vendas e financeiro.

---

### 📈 Relatórios de Giro (`/estoque/relatorios`)

Os relatórios de giro de estoque estão documentados em:

→ [[features/RELATORIOS]]

---

### 🤖 Estoque Mínimo Sugerido

O sistema calcula automaticamente uma sugestão de estoque mínimo para cada produto com base no histórico de vendas.

#### Endpoint da API

```
GET /api/estoque/produtos/{id}/estoque-minimo-sugerido
```

#### Fórmula de Cálculo

```
estoque_minimo = média_diária × dias_reposição × (1 + margem_segurança)
```

O resultado é **arredondado para cima** (`Math.ceil`).

#### Parâmetros Padrão

| Parâmetro | Valor Padrão | Descrição |
|-----------|:------------:|-----------|
| `periodo` | 90 dias | Período de análise do histórico de vendas |
| `dias_reposicao` | 15 dias | Tempo estimado para reposição do produto |
| `margem_seguranca` | 30% (0.3) | Margem de segurança adicional |

#### Fonte de Dados

O cálculo utiliza dados das tabelas `vendas` e `venda_itens` para determinar a **média diária de vendas** do produto no período especificado.

#### Resposta

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `estoque_minimo_sugerido` | `integer` | Valor calculado e arredondado |
| `media_diaria` | `number` | Média de unidades vendidas por dia |
| `tem_dados` | `boolean` | Se há histórico de vendas suficiente |

> [!TIP]
> Quando `tem_dados` retorna `false`, significa que o produto não possui histórico de vendas no período analisado. Nesse caso, o estoque mínimo deve ser definido manualmente pelo usuário com base em sua experiência.

---

## Tabelas do Banco de Dados

| Tabela | Descrição |
|--------|-----------|
| `produtos` | Catálogo de produtos com informações completas |
| `categorias` | Categorias para classificação dos produtos |
| `fornecedores` | Fornecedores dos produtos |
| `marcas` | Marcas dos perfumes |
| `movimentacoes` | Histórico de movimentações de estoque |

> [!NOTE]
> Para o schema completo de todas as tabelas com tipos, constraints e relacionamentos, consulte [[BANCO]].

---

## Documentos Relacionados

- [[PRD]] — Documento de requisitos do produto
- [[BANCO]] — Schema completo do banco de dados
- [[features/VENDAS]] — Módulo de vendas (consome estoque)
- [[features/PEDIDOS]] — Módulo de pedidos
- [[features/DECANTS]] — Módulo de decants (consome estoque de frascos)
- [[features/RELATORIOS]] — Relatórios de giro e desempenho
- [[REGRAS_NEGOCIO]] — Regras de negócio globais
- [[API]] — Documentação da API backend
