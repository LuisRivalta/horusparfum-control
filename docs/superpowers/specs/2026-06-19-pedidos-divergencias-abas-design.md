# Pedidos com abas (Pedidos + Divergências) — Design

> Data: 2026-06-19
> Tipo: frontend-only (sem migração de banco)

## Objetivo

Colocar **Divergências** dentro da aba **Pedidos**, reusando o padrão de abas já
existente na página **Cadastros** (`Cadastros.tsx`): rota-layout com `<Outlet/>`,
barra de abas com pílula dourada deslizante + contadores, e botão de ação
contextual via `createPortal` + `useOutletContext`.

Hoje Pedidos e Divergências são dois itens separados na sidebar, cada um com sua
própria rota/página. Depois desta mudança, Divergências deixa de ter item próprio
na sidebar e passa a ser uma aba dentro de Pedidos.

## Decisões

- **Padrão:** espelhar exatamente `frontend/src/pages/estoque/Cadastros.tsx`.
- **Título do layout:** "Pedidos" (combina com o item da sidebar e com o pedido do
  usuário). A primeira aba também se chama "Pedidos" — redundância leve aceita.
- **Sem migração de banco:** tabelas `pedidos` / `divergencias` e RPCs já existem.

## Rotas (`App.tsx`)

```
/estoque/pedidos                 → PedidosLayout (nova rota-layout)
    index                        → EstPedidos       (lista de pedidos)
    divergencias                 → EstDivergencias  (log + resumo por fornecedor)
/estoque/divergencias            → <Navigate to="/estoque/pedidos/divergencias" replace />
```

- `/estoque/pedidos` (match exato) renderiza a lista de pedidos como rota index —
  sem redirect (diferente do Cadastros, que redireciona o index para `produtos`).
- `/estoque/pedidos/divergencias` renderiza as divergências.
- A rota antiga `/estoque/divergencias` redireciona para a nova, então nenhum link
  ou bookmark existente quebra.

## Componente novo: `PedidosLayout.tsx`

Cópia adaptada de `Cadastros.tsx`, em `frontend/src/pages/estoque/`:

- Eyebrow `Estoque / Compras`, título `Pedidos`.
- Duas abas:
  - **Pedidos** — ícone `swap`, path `/estoque/pedidos`, tabela `pedidos`. Aba
    ativa por **match exato** (NavLink `end`), pois é a rota index.
  - **Divergências** — ícone `warn`, path `/estoque/pedidos/divergencias`, tabela
    `divergencias`. Aba ativa por `pathname.startsWith(path)`.
- Contadores por aba via `supabase.from(tabela).select('id', { count: 'exact', head: true })`,
  igual ao Cadastros.
- Divisor ornamental + `<Outlet context={{ actionSlot }} />`.
- `activeIndex` calculado de forma que a aba index (Pedidos) só fique ativa no
  match exato — caso contrário a pílula ficaria sempre na primeira aba. Detecção:
  Divergências ativa quando `pathname.startsWith('/estoque/pedidos/divergencias')`,
  senão Pedidos.

## Páginas-filhas (perdem o próprio cabeçalho)

Mesmo tratamento aplicado ao Cadastros (commits "sem cabeçalho"): o layout passa a
ser o dono do título; as filhas removem seu `<h1>`/eyebrow.

### `Pedidos.tsx` (`EstPedidos`)
- Remove o bloco de cabeçalho (`Estoque / Compras` + `<h1>Pedidos</h1>` + subtítulo).
- O botão **Novo pedido** é empurrado para o `actionSlot` do layout via
  `createPortal` + `useOutletContext` (aparece só na aba Pedidos).
- Tabela, modais (`NovoPedidoModal`, `ConferenciaModal`, cancelar) e lógica de
  fetch permanecem intactos.

### `Divergencias.tsx` (`EstDivergencias`)
- Remove o bloco de cabeçalho (`Estoque / Qualidade` + `<h1>Divergências</h1>` +
  subtítulo).
- Resumo por fornecedor, filtros (fornecedor/tipo) e tabela permanecem no corpo da
  aba. Sem botão de ação no topo.

## Sidebar (`Layout.tsx`)

- Remove o item **Divergências** (`{ id: 'divergencias', ... }`).
- Mantém **Pedidos** (`{ id: 'pedidos', icon: 'swap', path: '/estoque/pedidos' }`),
  que agora abre o layout com as duas abas.
- Grupo Estoque passa de 8 → 7 itens.

## Testes

- Novo `frontend/src/pages/estoque/__tests__/PedidosLayout.test.tsx`, espelhando
  `Cadastros.test.tsx`:
  - renderiza as duas abas
  - navega entre Pedidos e Divergências
  - exibe contadores
  - o portal do botão de ação funciona (slot recebe o botão da filha)
- Mockar `supabase` como nos testes existentes.

## Fora de escopo

- Nenhuma mudança em banco, RPCs ou regras de negócio.
- Sem alterar a lógica interna de fetch/CRUD das páginas filhas além da remoção do
  cabeçalho e (no caso de Pedidos) o portal do botão.
