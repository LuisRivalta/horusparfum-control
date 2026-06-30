# Marcas de produtos

Data: 2026-06-30

## Contexto

O cadastro de produtos hoje possui categoria e fornecedor. Categoria descreve o agrupamento comercial do produto; fornecedor descreve de quem a loja compra. Falta uma entidade para representar a marca/fabricante/linha comercial do perfume, como Lattafa, Armaf, Maison Alhambra ou Isabelle La Belle.

Marca nao deve ser confundida com fornecedor: o mesmo produto pode ser comprado de fornecedores diferentes, mas continua pertencendo a uma marca.

## Objetivo

Criar a opcao de cadastrar marcas e vincular produtos a uma marca opcional, mantendo os produtos atuais funcionando sem preenchimento obrigatorio.

## Escopo

- Criar tabela `marcas`.
- Adicionar `produtos.marca_id` como FK nullable para `marcas`.
- Adicionar aba `Marcas` em `/estoque/cadastros`.
- Permitir criar marcas pelo app.
- Exibir contador da aba `Marcas` no layout de Cadastros.
- Adicionar campo opcional `Marca` no modal `Novo produto`.
- Exibir e editar marca no modal de detalhes do produto.
- Adicionar filtro por marca no catalogo de produtos.
- Adicionar filtro por marca na tela principal de estoque.
- Atualizar selects/queries de produtos para carregar `marcas(nome)`.

## Fora de escopo

- Tornar marca obrigatoria.
- Importacao em massa de marcas.
- Merge/deduplicacao automatica de marcas duplicadas.
- Logo, imagem ou pais de origem da marca.
- Relatorios especificos por marca.
- Alterar o fluxo de pedidos/PDF para exigir marca.

## Modelo de dados

Nova tabela:

```sql
create table if not exists public.marcas (
  id uuid primary key default uuid_generate_v4(),
  nome text not null unique,
  created_at timestamptz not null default now()
);
```

Nova coluna:

```sql
alter table public.produtos
  add column if not exists marca_id uuid references public.marcas(id) on delete set null;
```

RLS:

```sql
alter table public.marcas enable row level security;

create policy "Acesso total autenticados"
on public.marcas
for all
to authenticated
using (true)
with check (true);
```

Produtos antigos ficam com `marca_id = null`.

## Frontend

### Cadastros

`Cadastros.tsx` ganha uma quarta aba:

```txt
Produtos | Categorias | Fornecedores | Marcas
```

A aba usa a tabela `marcas` para contagem. Como o layout atual usa largura fixa por aba, a implementacao deve ajustar a largura/indicador para comportar quatro abas sem quebrar em telas menores.

### Pagina Marcas

Criar `Marcas.tsx` espelhando o nivel de complexidade de `Categorias.tsx`:

- Lista/grid simples de marcas.
- Estado carregando.
- Estado vazio.
- Botao `Nova marca` no `actionSlot`.
- Modal com campo `Nome`.
- Insert em `supabase.from('marcas')`.
- Ordenacao por `nome`.

Nao ha edicao/exclusao nesta primeira entrega, seguindo o padrao simples atual de Categorias.

### Produtos

`Produtos.tsx` passa a:

- Buscar marcas junto de categorias e fornecedores.
- Selecionar produtos com `marcas(nome)`.
- Manter `marca_id` no estado do formulario.
- Enviar `marca_id: form.marca_id || null` no insert.
- Resetar `marca_id` apos salvar.
- Mostrar select `Marca` opcional no modal `Novo produto`.
- Adicionar filtro por marca na barra de filtros.
- Limpar tambem `filterMarca` no botao `Limpar filtros`.
- Passar `marcas` para `ProductDetailsModal`.

### Detalhes do produto

`ProductDetailsModal.tsx` passa a:

- Receber lista de marcas.
- Tipar `marca_id` e `marcas?: { nome: string } | null` em `Produto`.
- Mostrar `Marca` no modo leitura.
- Permitir editar `Marca` no modo edicao.
- Enviar `marca_id` no update.

### Estoque

`EstoqueView.tsx` deve:

- Carregar `marcas(nome)` nos produtos.
- Carregar lista de marcas.
- Adicionar filtro por marca.
- Aplicar o filtro em memoria, como categorias/fornecedores.
- Limpar `filterMarca` no limpar filtros.

## Rotas

Adicionar rota aninhada:

```txt
/estoque/cadastros/marcas
```

Nao e necessario criar redirect legado, porque a rota nao existia antes.

## Migração

Criar migration SQL em `supabase/migrations/` usando o padrao datado do projeto.

O SQL deve ser idempotente onde possivel:

- `create table if not exists`
- `add column if not exists`
- `create index if not exists`
- politica criada de forma segura para nao falhar se ja existir

Como as migracoes do projeto sao aplicadas manualmente no Supabase SQL Editor, a entrega deve informar claramente qual arquivo aplicar antes de usar a feature em producao.

## Testes

Frontend:

- `Cadastros.test.tsx`: aba `Marcas` aparece e navega para `/estoque/cadastros/marcas`.
- Novo teste para `Marcas.tsx`: renderiza marcas existentes e cria nova marca pelo modal.
- `Produtos.test.tsx`: novo produto envia `marca_id` quando marca selecionada e permite cadastro sem marca.
- `ProductDetailsModal.test.tsx`: edicao envia `marca_id` e leitura exibe marca.
- `EstoqueView.test.tsx`: filtro por marca reduz a lista exibida.

Banco/migração:

- Revisar SQL para RLS habilitado em `marcas`.
- Confirmar FK `produtos.marca_id -> marcas(id)` com `on delete set null`.

## Critérios de aceite

- Usuario consegue cadastrar uma marca em Cadastros.
- Produto pode ser salvo sem marca.
- Produto pode ser salvo com marca.
- Produto existente sem marca continua abrindo/editando normalmente.
- Detalhes do produto mostram a marca quando preenchida.
- Catalogo e estoque conseguem filtrar por marca.
- Nova tabela `marcas` tem RLS habilitado para `authenticated`.
- Feature nao altera estoque, vendas, pedidos ou financeiro.
- Testes frontend passam.
- Documentacao viva e `docs/BANCO.md` sao atualizados na implementacao.
