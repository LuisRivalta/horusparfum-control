# Página "Cadastros" — unificar Produtos · Categorias · Fornecedores

> Spec de design — 2026-06-17. Produto: Horus Parfum Control.

## Objetivo

Reduzir a poluição da sidebar de Estoque (10 itens) juntando **Produtos**, **Categorias** e **Fornecedores** numa única página **Cadastros**, com um seletor de aba premium no topo. A sidebar passa de **10 → 8** itens. Nenhuma mudança de funcionalidade nas três telas — só reorganização e um cabeçalho desenhado de propósito.

## Contexto

- `EstProdutos` (catálogo com busca/filtros/grid + modais), `EstCategorias` e `EstFornecedores` são três páginas independentes, cada uma com seu próprio cabeçalho (breadcrumb mono "Estoque" + `<h1>` + subtítulo + botão de ação) e conteúdo.
- Nav em `Layout.tsx` (`EST_NAV`) lista as três como itens separados.
- O app já tem o padrão de **controle segmentado com indicador deslizante** (toggle Financeiro/Estoque no header) e a tripla tipográfica Inter (sans) / Cormorant Garamond (serif, `--font-serif`) / JetBrains Mono (mono). Ícones via componente `Icon` (`tag`, `grid`, `supplier`, `plus`, etc. já existem).

## Decisões (travadas no brainstorming)

1. Nome: **Cadastros** (item da sidebar + título da página).
2. **Rotas aninhadas** com `Outlet`; aba refletida na URL; **redirects** das rotas antigas.
3. Cada página-filha **perde só o bloco de cabeçalho** (breadcrumb + h1 + subtítulo); mantém botão de ação, filtros, grid e modais.
4. Visual **diferenciado** (nível sênior) — ver seção "Design visual".

## Arquitetura

Rota-layout pai + `Outlet` para a aba ativa, reaproveitando os componentes existentes como filhos.

```
/estoque/cadastros               → redireciona (index) para .../produtos
/estoque/cadastros/produtos      → <EstProdutos/>
/estoque/cadastros/categorias    → <EstCategorias/>
/estoque/cadastros/fornecedores  → <EstFornecedores/>

# redirects de compatibilidade:
/estoque/produtos      → /estoque/cadastros/produtos
/estoque/categorias    → /estoque/cadastros/categorias
/estoque/fornecedores  → /estoque/cadastros/fornecedores
```

`Cadastros.tsx` renderiza: breadcrumb + título + a barra de abas (esquerda) e um **slot de ação** (direita), o divisor ornamental, e `<Outlet/>`. A aba ativa vem de `useLocation()` (qual sub-rota casa).

### Slot de ação contextual (botão no nível da barra de abas)

O botão primário ("Novo produto/categoria/fornecedor") aparece **na mesma linha da barra de abas**, à direita — mas continua pertencendo à página-filha (que controla seu próprio modal). Padrão:

- `Cadastros.tsx` mantém um elemento DOM como alvo de portal, exposto via callback ref → state:
  ```tsx
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null)
  // ...na linha das abas, à direita:
  <div ref={setActionSlot} />
  // passa para os filhos:
  <Outlet context={{ actionSlot }} />
  ```
- Cada filha renderiza **só o seu botão** no slot via portal:
  ```tsx
  const { actionSlot } = useOutletContext<{ actionSlot: HTMLElement | null }>() ?? {}
  // ...
  {actionSlot && createPortal(
    <Button onClick={() => setModalOpen(true)}><Icon name="plus" size={16}/> Novo produto</Button>,
    actionSlot
  )}
  ```
- O callback ref (`ref={setActionSlot}`) guarda o elemento em state, então os filhos re-renderizam quando o slot existe (sem bug de timing). Se `actionSlot` for null (filha renderizada fora do layout), o botão simplesmente não aparece — guard seguro.
- Os **filtros/busca** do Produtos **não** vão para o slot; ficam como a primeira linha do conteúdo (controles de conteúdo, não ação primária).

## Design visual

Tudo dentro do `Layout` existente (sidebar + header). O cabeçalho do Cadastros, de cima pra baixo:

1. **Breadcrumb** — `font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold`, precedido de um losango `span` `w-1 h-1 bg-gold rotate-45`. Texto: "Estoque / Cadastros".
2. **Título** — `<h1 className="text-4xl tracking-tight mt-1.5">Cadastros</h1>` (serif global, Cormorant).
3. **Linha de navegação** (`flex items-center justify-between gap-4 flex-wrap`, `mt-5`):
   - **Esquerda — controle segmentado:**
     - Container: `relative inline-flex bg-surface-2 border border-line-2 rounded-xl p-1`.
     - **Três abas de largura fixa igual** (cada `flex items-center justify-center gap-2 px-4 py-2.5 w-[160px] text-sm`, z-10 acima do indicador). Largura fixa (não `min-w`) garante que o "Fornecedores" não estoure e que o indicador case com qualquer aba.
     - **Indicador deslizante:** `absolute top-1 bottom-1 w-[160px] rounded-lg bg-gold shadow-[0_3px_14px_rgba(201,168,76,0.34)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]`, com `transform: translateX(activeIndex * 160px)` (ou `calc(activeIndex * 100%)` já que a largura do indicador = largura da aba). Como as abas têm largura fixa igual, o índice basta — sem medir o DOM.
     - **Aba ativa:** texto `text-[#1A1407] font-semibold` (escuro sobre dourado). **Inativa:** `text-text-2 font-medium hover:text-gold transition-colors`.
     - Cada aba: `<Icon>` (Produtos `tag`, Categorias `grid`, Fornecedores `supplier`, size 17) + label + **badge de contagem** (mono `text-[11px] px-1.5 py-px rounded-full`): na ativa `bg-[#1A1407]/15 text-[#1A1407]`, na inativa `bg-line text-muted`.
   - **Direita — slot de ação:** `<div ref={setActionSlot} />` (recebe o `<Button>` da filha via portal; o `Button` é o primário dourado padrão do `FormControls`).
4. **Divisor ornamental** (`flex items-center gap-3 my-5`): duas hairlines em gradiente dourado + losango central —
   ```tsx
   <div className="flex-1 h-px bg-gradient-to-r from-transparent to-gold/30" />
   <span className="w-1.5 h-1.5 bg-gold rotate-45" />
   <div className="flex-1 h-px bg-gradient-to-l from-transparent to-gold/30" />
   ```
5. **Conteúdo** — `<Outlet/>` (a página-filha ativa).

### Contagens das abas

`Cadastros.tsx` busca as três contagens no mount (head count, leve):
```tsx
supabase.from('produtos').select('id', { count: 'exact', head: true })
supabase.from('categorias').select('id', { count: 'exact', head: true })
supabase.from('fornecedores').select('id', { count: 'exact', head: true })
```
Exibe nos badges. Em loading, badge mostra "—".

### Animação da troca de aba

Trocar de aba navega para a sub-rota (NavLink/navigate); `activeIndex` deriva da URL; o indicador desliza (transição CSS). O conteúdo troca via `Outlet` (o `Layout` já tem `page-enter` por `key={pathname}` — aqui o pathname muda, mantendo a transição suave de entrada).

## O que muda em cada página-filha

`EstProdutos`, `EstCategorias`, `EstFornecedores`:
- **Remover** o bloco de cabeçalho (o `<div>` com breadcrumb mono + `<h1>` + subtítulo + o botão de ação no topo).
- **Mover** o botão de ação para o slot via `createPortal` + `useOutletContext` (ver acima).
- **Manter** intactos: estado, fetch, filtros/busca (Produtos), grid/tabela, modais e toda a lógica.
- O conteúdo da filha começa direto (sem o cabeçalho), logo abaixo do divisor ornamental do pai.

## Sidebar (`Layout.tsx`)

No `EST_NAV`: remover os itens `produtos`, `categorias`, `fornecedores`; adicionar **`{ id: 'cadastros', label: 'Cadastros', icon: 'tag', path: '/estoque/cadastros' }`** na posição onde estava Produtos (após `vendas`/`decants`). A nav vai de 10 → 8 itens.

> Detalhe: a nav marca o item ativo por `location.pathname === item.path`. Como as sub-rotas são `/estoque/cadastros/...`, o item "Cadastros" deve ficar ativo em qualquer sub-rota — ajustar a checagem desse item para `location.pathname.startsWith('/estoque/cadastros')` (ou usar `startsWith` para o grupo).

## Arquivos

**Criar:**
- `frontend/src/pages/estoque/Cadastros.tsx` — layout com breadcrumb + título + barra de abas + slot + divisor + Outlet; busca de contagens.
- `frontend/src/pages/estoque/__tests__/Cadastros.test.tsx` — teste de componente.

**Modificar:**
- `frontend/src/App.tsx` — rota aninhada `/estoque/cadastros` com filhas index/produtos/categorias/fornecedores + redirects das rotas antigas.
- `frontend/src/components/layout/Layout.tsx` — `EST_NAV` (remover 3, add Cadastros) + ativação por `startsWith` para o grupo cadastros.
- `frontend/src/pages/estoque/Produtos.tsx` — remover cabeçalho, portar botão.
- `frontend/src/pages/estoque/Categorias.tsx` — idem.
- `frontend/src/pages/estoque/Fornecedores.tsx` — idem.

## Tratamento de erros

- Contagens que falham → badge "—" (não quebra a página; `console.error`).
- Sub-rota desconhecida sob `/estoque/cadastros` → redirect para a aba Produtos (index).
- Filha sem `actionSlot` (ex: renderizada fora do layout) → botão não renderiza; resto funciona.

## Testes

- `Cadastros.test.tsx` (Vitest + Testing Library, MemoryRouter com rota inicial `/estoque/cadastros/produtos`): renderiza as três abas (Produtos/Categorias/Fornecedores) e o título "Cadastros"; a aba correspondente à rota inicial está ativa. Mockar `@/lib/supabase` (contagens) e `@/contexts/AuthContext` (as filhas usam supabase/auth — mockar para não quebrar o render aninhado, ou renderizar só o layout).
- Rodar a suíte completa + `tsc -b` + `npm run build` ao final (o `tsc -b` é o typecheck real).

## Documentação

- **ARQUITETURA**: atualizar a tabela de Rotas (Cadastros + sub-rotas) e a estrutura de pastas (novo `Cadastros.tsx`).
- **HANDOFF/LOGS**: registrar a sessão.

## Escopo

**Dentro:** unificação das três páginas sob `/estoque/cadastros` com a barra de abas premium (indicador deslizante, contadores, breadcrumb mono, título serif, divisor ornamental, botão de ação contextual via portal), redirects, ajuste da sidebar, contagens, teste e docs.

**Fora (futuro):**
- Mexer em outros itens da sidebar (Pedidos, Divergências, Alertas, Relatório de giro).
- Mudar a funcionalidade interna de Produtos/Categorias/Fornecedores.
- Persistir a última aba visitada entre sessões.
