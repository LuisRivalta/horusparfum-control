# Mobile responsivo 360px - Design

## Contexto

O Horus Parfum Control já possui uma base responsiva: sidebar desktop vira drawer mobile, grids usam breakpoints e modais têm altura limitada com scroll interno. A auditoria inicial encontrou riscos em fluxos operacionais usados no dia a dia: tabelas largas sem wrapper horizontal, cabeçalhos com ações que podem comprimir texto, modais com grids fixos de duas ou mais colunas e linhas de itens em pedidos/vendas com largura fixa.

## Objetivo

Deixar o frontend confortável e confiável para operação diária em celular pequeno, com alvo mínimo de 360px de largura, sem redesenhar a identidade visual existente.

## Escopo

- Layout geral, cabeçalhos de páginas e toolbars.
- Tabelas operacionais de Financeiro e Estoque.
- Modais compartilhados e formulários de criação/edição.
- Fluxos críticos: Novo pedido, Conferência de pedido, Nova venda, detalhes de venda, transações, contas, metas, produtos e relatórios.

## Fora de escopo

- Criar aplicativo mobile nativo.
- Reescrever todas as tabelas como cards mobile.
- Alterar regras de negócio, rotas, endpoints, schema do banco ou autenticação.
- Redesenhar paleta, tipografia ou componentes de marca.

## Decisões de design

1. **Híbrido pragmático:** tabelas permanecem tabelas, mas sempre dentro de `overflow-x-auto` com `min-w-*` quando tiverem muitas colunas.
2. **Formulários empilháveis:** grids de duas colunas viram uma coluna no mobile com `grid-cols-1 sm:grid-cols-2`.
3. **Linhas complexas como blocos no mobile:** itens de pedidos/vendas deixam de depender de grids fixos em 360px e passam a empilhar campos, preservando o grid compacto em telas maiores.
4. **Ações sem esmagamento:** cabeçalhos e grupos de botões usam `flex-col sm:flex-row`, `flex-wrap` e largura total em mobile quando necessário.
5. **Modal mobile-first:** o modal compartilhado mantém top layer nativo, mas ganha margem, padding e título adaptáveis para 360px.

## Critérios de aceite

- Nenhuma página crítica exige zoom horizontal do documento em 360px.
- Tabelas largas rolam horizontalmente dentro do próprio bloco, sem expandir a página.
- Modais longos continuam roláveis e seus botões principais ficam acessíveis.
- Formulários de pedidos e vendas podem ser preenchidos em 360px sem campos sobrepostos.
- A experiência desktop permanece equivalente à atual.
- Testes focados cobrem as classes responsivas nos componentes críticos.
- `npm run test:run` e `npm run build` passam no frontend.
