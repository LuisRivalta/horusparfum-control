# Controle de anúncios — design

> 2026-11-25. Tamanho: pequeno (1 tabela, 1 tela, 1 lib pura com testes).

## Por quê

O Luis cria anúncios na mão (ML, Shopify) enquanto o criador automático não está ativo e não sabe o que já foi criado sem abrir a plataforma e olhar um por um. Quer uma tela que mostre, por plataforma, o que já existe e o que falta. Quando o criador estiver ativo, ele preenche a mesma tela sozinho, sem retrabalho.

## Objetivos

- Grade perfume × variante (frasco, decants) por plataforma, com estado visual de cada célula e de cada perfume.
- Marcar/desmarcar à mão; o que o Horus já sabe (anúncio publicado, produto ligado) aparece verde sozinho.
- Filtrar por plataforma, situação e nome.

## Fora do escopo

- Criar ou editar anúncio nesta tela (é só controle).
- Plataformas além de ML e Shopify (Loja física e outros canais de venda não têm anúncio).
- Sincronizar estoque/preço: a marca manual não toca na fila de sincronização.
- Kanban e aba de Fotos: são trabalhos separados, depois deste.

## Abordagens consideradas

1. **Tabela nova só para marcas manuais + cálculo no frontend** — escolhida. Não mexe em nada que funciona; o automático entra pelas tabelas que já existem.
2. Gravar marca manual em `canal_vinculos` — descartada: os gatilhos de estoque enfileirariam o produto e o dreno tentaria mandar quantidade para um vínculo sem id externo.
3. Gravar em `anuncios` com status `manual` — descartada: a lista de Anúncios mostraria essas linhas com ações de preço/quantidade que falham.

## Decidido com o Luis

- Colunas por variante, só as que o perfume tem: frasco sempre; decants (tamanhos de `anuncios_config.tamanhos_decant`) só se `tipos_produto.vende_decant`.
- Célula: 🟢 bolinha verde com ✓ = criado; 🔴 bolinha vermelha com ✗ = falta criar; ⚪ cinza = sem estoque para anunciar.
- Estados do perfume: **Completo**, **Aguardando estoque**, **Incompleto**, **Sem anúncio**.
- Completo: checkbox com ✓ **à direita** da linha e a linha com coloração levemente diferente.
- Filtros: plataforma, situação (os quatro estados + todos), busca por nome.
- Botão "marcar todas" por perfume; exceções se desmarcam depois.
- Tela nova "Controle" no módulo Anúncios (sidebar), rota `/anuncios/controle`.

## Regras (calls do Claude, marcadas)

**Célula verde** se qualquer um:
- existe linha em `anuncio_marcas` para (produto, canal, tipo, ml);
- (só ML) `anuncios` com o mesmo produto/tipo/ml e `status in ('publicado','pausado')`;
- `canal_vinculos` com o mesmo canal/produto/tipo/ml.

Verde automático (não vem de `anuncio_marcas`) não é desmarcável na tela; tooltip "vem do Horus". *(call do Claude)*

**Célula cinza** (se não for verde) *(call do Claude)*:
- frasco: `produtos.estoque_atual = 0`;
- decant de X ml: sem `frascos_abertos` ativo com `ml_restante >= X` **e** `estoque_atual = 0` (sem lacrado para abrir).

Senão, **vermelha**.

**Estado do perfume** (conta só as células da plataforma escolhida):
- tem vermelha e nenhuma verde → Sem anúncio;
- tem vermelha e alguma verde → Incompleto;
- sem vermelha, com cinza → Aguardando estoque;
- tudo verde → Completo.

"Marcar todas" grava marca só nas **vermelhas** (as cinzas são justamente as que ficam de fora por estoque). *(call do Claude)*

O checkbox da direita é indicador, não clicável. *(call do Claude)*

## Banco

Migration nova `supabase/migrations/20261125100000_anuncio_marcas.sql` (aplicada pelo Luis no SQL Editor; o MCP do Supabase aponta para outro projeto e não deve ser usado):

```sql
create table anuncio_marcas (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id) on delete cascade,
  canal text not null check (canal in ('ml','shopify')),
  tipo text not null check (tipo in ('frasco','decant')),
  ml numeric(6,1),
  created_at timestamptz not null default now(),
  check ((tipo = 'decant') = (ml is not null))
);
create unique index anuncio_marcas_unq on anuncio_marcas (produto_id, canal, tipo, coalesce(ml, 0));
alter table anuncio_marcas enable row level security;
-- policy padrão do projeto para authenticated (mesma das demais tabelas)
```

Marcar = insert; desmarcar = delete. Sem gatilho.

## Frontend

- `src/lib/controleAnuncios.ts`: lógica pura (células, estado do perfume, filtro), TDD com Vitest.
- `src/pages/anuncios/ControleAnuncios.tsx`: lê via cliente Supabase `produtos` (+ `tipos_produto`), `frascos_abertos` ativos, `anuncios_config.tamanhos_decant`, `anuncios`, `canal_vinculos`, `anuncio_marcas`. Sem backend novo.
- Item "Controle" no `ANU_NAV` de `Layout.tsx` e rota em `App.tsx`.

## Para o construtor

Layout fino da tabela, ícones (usar `Icon` existente), tom da linha completa (variável CSS do tema, funcionar em dark e light), ordem padrão (nome), responsivo.
