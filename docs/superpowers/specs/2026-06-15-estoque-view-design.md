# Spec — Página de Estoque e Reestruturação de Produtos

**Data:** 2026-06-15
**Sessão:** 8

---

## Visão geral

Separação de responsabilidades entre as páginas **Estoque** e **Produtos**:

- **Estoque** (`/estoque`) — consulta e operações sobre o estoque atual: produtos com `estoque_atual > 0`, filtros, ordenação por quantidade, saída rápida.
- **Produtos** (`/estoque/produtos`) — gestão do catálogo: criar, editar, excluir produtos. Sem filtros de situação de estoque.

A página de Estoque vira o landing do módulo (primeiro item da sidebar). Produtos move de rota e vai para o terceiro lugar na nav.

---

## Rotas

| Página | Rota antiga | Rota nova | Componente |
|--------|-------------|-----------|------------|
| Estoque | — (nova) | `/estoque` | `EstEstoque` em `pages/estoque/EstoqueView.tsx` |
| Produtos | `/estoque` | `/estoque/produtos` | `EstProdutos` em `pages/estoque/Produtos.tsx` (move rota) |

---

## Navegação (sidebar `EST_NAV`)

Ordem dos itens após a mudança:

1. **Estoque** — ícone `box`, path `/estoque`
2. **Decants** — ícone `droplet`, path `/estoque/decants`
3. **Produtos** — ícone `tag` (novo, a adicionar em `Icon.tsx`), path `/estoque/produtos`
4. Pedidos — `/estoque/pedidos`
5. Divergências — `/estoque/divergencias`
6. Categorias — `/estoque/categorias`
7. Fornecedores — `/estoque/fornecedores`
8. Alertas — `/estoque/alertas`
9. Relatório de giro — `/estoque/relatorios`

---

## Página Estoque — `EstoqueView.tsx`

### Header

```
Estoque / Visão                     [Registrar saída]
Estoque
X produtos em estoque
```

### Filtros

Linha de controles abaixo do header:

| Controle | Tipo | Comportamento |
|----------|------|---------------|
| Busca | `input[type=text]` | Filtra por `nome` (case-insensitive, client-side) |
| Categoria | `<Select>` | Filtra por `categoria_id` |
| Fornecedor | `<Select>` | Filtra por `fornecedor_id` |
| Ordenação | `<Select>` | 4 opções (ver abaixo) |
| Limpar filtros | botão texto | Visível quando qualquer filtro ativo |

**Opções de ordenação:**

| Value | Label |
|-------|-------|
| `qty_desc` | Maior quantidade (padrão) |
| `qty_asc` | Menor quantidade |
| `az` | A → Z |
| `za` | Z → A |

### Grid de cards

Mesmo layout visual da página Produtos: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7`.

Cada card:
- Foto do produto (aspect-square) ou placeholder com ícone `box`
- Nome (truncado)
- Volume em mL
- **Badge de quantidade** no canto superior direito da foto:
  - Dourado (`bg-gold text-[#1A1407]`): `estoque_atual > estoque_minimo`
  - Laranja (`bg-orange-400 text-white`): `0 < estoque_atual ≤ estoque_minimo`
  - Vermelho (`bg-down text-white`): `estoque_atual ≤ Math.ceil(estoque_minimo * 0.5)` (crítico)
  - O badge mostra o número: ex. `3`

Clicar no card → abre `ProductDetailsModal` (reutiliza o modal existente com edição e saída rápida).

### Dados

```typescript
supabase
  .from('produtos')
  .select('*, categorias(nome), fornecedores(nome)')
  .gt('estoque_atual', 0)
  .order('estoque_atual', { ascending: false })  // ordem inicial; re-sorted client-side
```

Filtros e ordenação são aplicados client-side sobre os dados carregados.

### Estado vazio

Quando nenhum produto está em estoque (após filtros):
- Se sem filtros ativos: ícone `box` + "Nenhum produto em estoque" + texto secundário "Registre uma entrada via Pedidos para começar"
- Se com filtros ativos: "Nenhum produto encontrado com esses filtros"

### Loading / erro

- Loading: `"Carregando..."` centrado
- Erro: banner vermelho com mensagem

---

## Página Produtos (reestruturada)

**Rota muda:** `/estoque` → `/estoque/produtos`

**Remoções** (movidas para Estoque ou desnecessárias no catálogo):
- Botão "Registrar saída" do topbar
- Filtro "Situação" (disponível/baixo/crítico/sem estoque)
- Lógica de `filterSituacao` no `produtosFiltrados`

**Mantém:**
- Busca por nome
- Filtro de Categoria
- Filtro de Fornecedor
- Todos os produtos (inclusive `estoque_atual = 0`) — é catálogo completo
- Botões "Novo produto" e "Importar"
- `ProductDetailsModal` (edição de dados do produto)
- `SaidaRapidaModal` (acessível dentro do ProductDetailsModal via `onRegistrarSaida`)
- Breadcrumb: "Estoque / Catálogo" (já existia)

**Não muda:** lógica de criação, upload de foto, edição via modal.

---

## Mudanças em `App.tsx`

```tsx
// Rota existente de Produtos muda de path:
<Route path="/estoque" element={<EstProdutos />} />
// vira:
<Route path="/estoque/produtos" element={<EstProdutos />} />

// Nova rota de Estoque:
<Route path="/estoque" element={<EstEstoque />} />
```

---

## Lógica pura — `lib/estoque.ts`

Funções testáveis para badge de situação e ordenação:

```typescript
export type SituacaoEstoque = 'ok' | 'baixo' | 'critico'

export function situacaoEstoque(estoqueAtual: number, estoqueMinimo: number): SituacaoEstoque {
  if (estoqueAtual <= Math.ceil(estoqueMinimo * 0.5)) return 'critico'
  if (estoqueAtual <= estoqueMinimo) return 'baixo'
  return 'ok'
}

export type OrdemEstoque = 'qty_desc' | 'qty_asc' | 'az' | 'za'

export function ordenarProdutos<T extends { nome: string; estoque_atual: number }>(
  produtos: T[],
  ordem: OrdemEstoque
): T[] {
  return [...produtos].sort((a, b) => {
    if (ordem === 'qty_desc') return b.estoque_atual - a.estoque_atual
    if (ordem === 'qty_asc') return a.estoque_atual - b.estoque_atual
    if (ordem === 'az') return a.nome.localeCompare(b.nome)
    return b.nome.localeCompare(a.nome)
  })
}
```

---

## Testes

- `lib/__tests__/estoque.test.ts` — `situacaoEstoque` (4 casos) + `ordenarProdutos` (4 ordens)
- `pages/estoque/__tests__/EstoqueView.test.tsx` — renderiza cards com badge de quantidade, filtro de busca, estado vazio, ordenação

`ProductDetailsModal` e `SaidaRapidaModal` já têm testes existentes — não reescrever.

---

## Ícone `tag` a adicionar em `Icon.tsx`

```tsx
tag: <><path d="M4 4h7l9 9-7 7-9-9V4z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
```

---

## Fora de escopo

- "Registrar entrada" manual standalone (entradas continuam via Pedidos)
- Histórico de movimentações na página Estoque
- Custo médio visível no card
- Paginação (o projeto usa grid sem paginação em todas as páginas)
