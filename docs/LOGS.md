# Logs — Histórico de Sessões

## 2026-06-15 — Sessão 8: Página de Estoque + Reestruturação de Produtos

**Responsável:** Luis + Claude (subagent-driven development)

### O que foi feito
- **`lib/estoque.ts`** (TDD): `situacaoEstoque` (critico = `<= ceil(min*0.5)`, baixo = `<= min`, ok acima) e `ordenarProdutos` (qty_desc/qty_asc/az/za, não-mutante) — 9 testes
- **`EstoqueView.tsx`**: nova página `/estoque` com grid de cards para produtos em estoque, badges de quantidade tipados via `Record<SituacaoEstoque, string>`, filtros cliente-side (busca+categoria+fornecedor+ordenação), estado vazio diferenciado, abre `ProductDetailsModal` + `SaidaRapidaModal` — 3 testes
- **`Produtos.tsx`** virou catálogo puro: removidos "Registrar saída" do topbar, filtro "Situação" e lógica de `filterSituacao`; mantém `SaidaRapidaModal` via `onRegistrarSaida`
- **Roteamento:** `/estoque` → `EstoqueView`, `/estoque/produtos` → `EstProdutos`
- **Nav:** Estoque (1º, `box`) → Decants (2º, `droplet`) → Produtos (3º, `tag`) — ícone `tag` adicionado em `Icon.tsx`
- **Exclusão de frasco com confirmação inline** (Sessão 7 extra): substituiu `window.confirm` por UI stateful "Excluir? ✓ ✕" com `stopPropagation`
- Push direto na main (padrão do projeto)
- 84 testes passando (eram 71)

### Decisões tomadas
- Estoque filtra `estoque_atual > 0` (só produtos em estoque); Produtos mostra catálogo completo
- Critério `critico` = `<= ceil(min * 0.5)` (não exatamente metade — arredonda para cima)
- Ordenação padrão `qty_desc` (maior quantidade primeiro)
- Ícone `grid` já usado por Categorias — Produtos usa `tag` para evitar conflito
- `BADGE_CLASSES` tipado como `Record<SituacaoEstoque, string>` (TypeScript pega key faltante)

### Pendências
- Migração `20260615_decants.sql` ainda pendente de aplicação manual no Supabase
- "Registrar entrada" manual na página Estoque (entradas atuais só via Pedidos)

---

## 2026-06-15 — Sessão 7: Módulo de Decants

**Responsável:** Luis + Claude (subagent-driven development)

### O que foi feito
- **Módulo de decants completo:** migração SQL (`frascos_abertos` com índice único parcial + `decants` com cascade delete), lógica pura TDD em `lib/decants.ts`, visualização 3D do frasco com Three.js (nível animado via lerp, dispose completo), página principal com grid de frascos, modal de abertura de frasco e modal de registro de decant
- **Qualidade:** rollback de estoque se insert do frasco falhar, tratamento de erro Supabase (`PostgrestError` não é `instanceof Error`), estado vazio não aparece junto com erro, exclusão de frasco com feedback
- Push direto na main (padrão do projeto)
- Migração SQL criada e commitada — **pendente aplicação manual no Supabase**

### Decisões tomadas
- Índice único PARCIAL `WHERE status='ativo'` (não UNIQUE na coluna) — permite reabrir o mesmo perfume após esgotamento/exclusão
- Rollback no frontend (não RPC) — operação de abertura é de baixíssima concorrência (3-4 usuários internos)
- Frasco esgotado fica visível com badge "Esgotado" e botão excluir (não reverte estoque)
- 700ms de pausa após confirmar decant para animação Three.js correr antes de fechar o modal

### Pendências
- Aplicar migração `supabase/migrations/20260615_decants.sql` no Supabase SQL Editor
- Dashboard/relatórios de decants (quais perfumes mais saem, etc.) — futuro
- Integração financeira do decant com venda — futuro

---

## 2026-06-12 — Sessão 6: Edição de pedido aguardando + Dashboard financeiro com dados reais

**Responsável:** Luis + Claude (subagent-driven development)

### O que foi feito
- **Edição de pedido aguardando:** `NovoPedidoModal` ganhou prop `pedidoParaEditar` (pré-preenche fornecedor/previsão/itens e faz UPDATE+DELETE+INSERT com rollback manual completo, incluindo `valor_total`); botão "Editar" nas linhas `aguardando` da lista de pedidos
- **Dashboard financeiro com dados reais:** `lib/financeiro.ts` (lógica pura com decimal.js e TDD — saldo histórico, resumo por período, agrupar por categoria, evolução mensal, construtores de período mês/trimestre/ano/personalizado); seletor de período flexível; 4 cards; gráficos de evolução (6 meses) e categorias (toggle despesas/receitas) com recharts; saldo/lucro negativos em vermelho
- Migração de pedidos aplicada no Supabase pelo usuário
- Branch `feat/pedidos` mergeada na `main` e push feito; trabalho do dashboard direto na `main`
- 51 testes passando (eram 32); cada task passou por review de spec + qualidade

### Decisões tomadas
- Edição de pedido só para status `aguardando`; rollback manual é suficiente (sem movimentação de estoque envolvida)
- Dashboard calcula tudo em memória a partir de um único `select` de transações (loja pequena); agregação SQL fica como evolução futura
- Gráfico de evolução fixo em "últimos 6 meses" (independe do seletor); seletor controla cards e categorias
- Widgets de contas/metas no dashboard ficaram fora de escopo (já têm página própria)

### Pendências
- Período personalizado não valida início ≤ fim; query de transações sem `.limit()` (ver Handoff)

---

## 2026-06-11 — Sessão 5: Fluxo de Pedidos de compra com conferência de recebimento

**Responsável:** Luis + Claude (subagent-driven development)

### O que foi feito
- Migração SQL: tabelas `pedidos`, `pedido_itens`, `divergencias`, colunas `custo_medio`/`ultimo_custo` em produtos, RLS, índices e RPCs atômicas `confirmar_recebimento` / `registrar_saida` (com guardas de payload duplicado, item nulo e pedido sem itens)
- `lib/pedidos.ts`: custo médio ponderado (decimal.js, casa com ROUND do Postgres), totais e validação de conferência — TDD
- Tela Pedidos: lista com status, criação com itens dinâmicos + cadastro rápido de produto, total ao vivo
- Conferência de recebimento: qtd recebida item a item, divergência obrigatória quando difere, proteção contra divergência fantasma
- Tela Divergências: log filtrado + resumo geral por fornecedor
- Saída rápida na tela de Produtos via RPC (valida estoque, motivo e inteiro)
- Movimentações removida (tabela virou ledger interno)
- 32 testes passando; cada task passou por review de spec + review de qualidade com correções

### Decisões tomadas
- Custo: médio ponderado + último custo (FIFO documentado como evolução futura no spec)
- Recebimento parcial fora de escopo: pedido fecha com o que chegou, falta vira divergência
- Financeiro desacoplado (integração ERP futura é aditiva via pedido_id)

### Pendências
- Aplicar a migração SQL no Supabase (SQL Editor) — checkpoint manual
- Testar RPC manualmente com seed (roteiro no plano, Task 1 Step 4)

---

## 2026-06-10 — Sessão 4: Repaginada premium de design

**Responsável:** Luis + Claude

### O que foi feito

- **Design system global** (`globals.css`):
  - Grão (noise) sutil sobre toda a interface, scrollbar customizada, `::selection` dourada
  - `h1` serifado global (Cormorant Garamond), tabelas premium globais (thead mono uppercase + hover dourado nas linhas)
  - Keyframes: `rise`, `fade-in`, `scale-in`, `sheen`, `draw-line` + suporte a `prefers-reduced-motion`
  - Utilitários: `.glow-card` (spotlight que segue o mouse), `.gold-hairline`, `.sheen-hover`, `.ornament-divider`, `.stagger`, `.page-enter`, `.gold-gradient-text`
  - Novo token `--color-gold-bright` (dark e light)
- **Layout**: header sticky com glass blur, toggle Financeiro/Estoque com indicador deslizante, sidebar com rail dourado em gradiente + ícones com glow no hover, **drawer mobile** com hamburger e backdrop, transição de página por rota
- **Home**: fundo ColorBends (Three.js) sutil + véu, entrada escalonada, cards com spotlight, cantos ornamentais e seta animada
- **FormControls**: botão primary com gradiente dourado + varredura de brilho + press feedback; inputs/selects com glow de foco e chevron SVG customizado
- **Modal**: animação scale-in, backdrop blur, título serifado, botão fechar com rotação
- **Dashboard financeiro**: stat cards premium com ícones, responsivos (1/2/4 colunas)
- **Login**: título serifado maior, ornamento, inputs com glow, sombra e animação no card
- **Fontes**: Cormorant Garamond ampliado (400–700 + itálicos)
- **Fix**: `vite.config.ts` migrado para `vitest/config` (o `tsc -b` do build falhava na propriedade `test`)

### Validação
- `npm run build` ✓ · `npm run test:run` 6/6 ✓ · screenshot do login no preview ✓

### Próximo
- Dashboard financeiro/estoque com dados reais
- Relatórios + PDF
- Deploy

---

## 2026-06-03 — Sessão 3: Tema dark/light, UI polish e testes

**Responsável:** Luis + Claude

### O que foi feito

- **Sistema de tema dark/light** completo:
  - `ThemeContext` com persistência em localStorage
  - Variáveis CSS no `@theme` + overrides em `:root.light`
  - `DayNightSwitch` (sol/lua) no header alterna entre modos
  - Logo adapta automaticamente via `mix-blend-mode` (sem flicker)
- **UI/UX**:
  - `AnimatedButton` (botão com efeito shine/glow no hover) — usado em Login e Salvar
  - `UserMenu` dropdown no avatar (clique abre menu com email e logout)
  - Efeito holographic nos cards de produtos (shine dourado)
  - Filtros funcionais na tela de produtos (busca, categoria, fornecedor, situação)
  - `ProductDetailsModal` com foto maior, edição e exclusão
  - `ImageCropper` ao adicionar foto (drag, zoom, crop)
  - Ctrl+V para colar imagem no upload
  - Logo "PRINCIPAL.svg" como favicon (fundo transparente via `mix-blend-mode`)
- **Proteção de formulário**: double-submit prevented com `submitting` state
- **Cores ajustadas**: bg `#1A1A19`, surface `#1F1F1D` (levemente mais claros)
- **Testes (TDD)**:
  - Setup completo: Vitest + Testing Library + jsdom
  - 6 testes passando para Login
  - Documentação em `docs/TESTING.md`
- **Documentação**: HANDOFF_IA, ARQUITETURA e LOGS atualizados

### Decisões tomadas

- Light mode: paleta off-white com tom dourado (`#F5F1E8`) e dourado mais escuro (`#B08D2E`) para contraste
- Cores da sidebar/inputs levemente mais claras (`#1F1F1D`) para reduzir contraste excessivo
- Mix-blend-mode para logo (screen no dark, multiply no light) ao invés de filter: invert

### Próximo
- Dashboard financeiro com gráficos
- Edição e exclusão nos outros CRUDs
- Relatórios
- Deploy

---

## 2026-06-02 — Sessão 2: Supabase + Auth + CRUDs + UI

**Responsável:** Claude + Luis

### O que foi feito
- Configurado projeto Supabase (project ref: wyobbztexoofhqdttxzq)
- Criado `.env` no frontend e backend com credenciais
- Criadas 7 tabelas no Supabase via SQL Editor (categorias, fornecedores, produtos, movimentacoes, transacoes, contas, metas)
- Habilitado RLS em todas as tabelas com policy para `authenticated`
- Criado bucket `produtos` no Storage com policies de leitura pública e upload autenticado
- Implementado sistema de autenticação completo:
  - AuthContext (sessão, signIn, signOut, onAuthStateChange)
  - ProtectedRoute (redireciona se não autenticado)
  - Tela de Login (modelo 3D + formulário + fundo animado ColorBends)
- Implementadas todas as páginas com CRUD funcional:
  - Produtos (tabela + modal + upload de foto)
  - Movimentações (tabela + modal, atualiza estoque do produto)
  - Transações (tabela + modal)
  - Contas a pagar/receber (tabela + modal)
  - Categorias (grid de cards + modal)
  - Fornecedores (tabela + modal)
  - Metas financeiras (cards com barra de progresso + modal)
- Criados componentes compartilhados: Modal, FormControls (Button, Input, Select)
- Criado componente ColorBends (shader Three.js animado para fundo)
- Criado componente ModelViewer (visualizador 3D com OrbitControls)
- Corrigida rota Home para ficar fora do Layout (página autônoma)
- Tentativa de integrar logo SVG do cliente (pendente ajuste fino)
- Instalado Three.js e @types/three no frontend
- Backend: instaladas dependências (fastapi, uvicorn, supabase, etc.)
- Contornado bug do pyiceberg no Windows (install --no-deps)

### Decisões tomadas
- Auth 100% no frontend via Supabase Auth (sem backend no fluxo de login)
- CRUDs chamam Supabase direto do frontend (anon key + RLS authenticated)
- Login com layout split: modelo 3D à esquerda, formulário à direita
- ColorBends como fundo animado da tela de login
- Home é rota protegida mas sem Layout (sem sidebar)
- Fotos de produtos vão direto para Supabase Storage via frontend

### Problemas encontrados
- `pyiceberg` não compila no Windows (contornado com --no-deps)
- THREE.Clock deprecated na v0.184 (substituído por performance.now())
- ColorBends não renderizava por problema de altura do container (resolvido com CSS)
- SVG da logo usa técnica de "knockout" (retângulo + recortes) — dificulta uso direto

### Próximo
- Ajustar logo definitiva
- Dashboard com dados reais (gráficos)
- Edição e exclusão nos CRUDs
- Relatórios
- Deploy

---

## 2026-06-02 — Sessão 1: Setup inicial

**Responsável:** Claude + Luis

### O que foi feito
- Removido protótipo HTML/JSX (arquivos soltos na raiz)
- Criado projeto frontend: React + Vite + TypeScript + Tailwind CSS
  - Tema dark configurado (gold #C9A84C, bg #0A0A0A)
  - Layout shell (Sidebar, Header, toggle áreas)
  - Página Home, 11 páginas placeholder
  - Componentes Icon (set completo) e Mark (Eye of Horus)
- Criado projeto backend: FastAPI (Python 3.14)
  - Estrutura de routers, models, services, auth, db
  - Endpoints placeholder para financeiro e estoque
  - CORS configurado, health check funcional
- Push para GitHub: https://github.com/LuisRivalta/horusparfum-control
- Criada documentação em `docs/` (PRD, Arquitetura, Banco, Handoff, Logs)

### Decisões tomadas
- Stack: React + Vite (frontend) + FastAPI (backend) + Supabase (banco)
- Sem Next.js — SPA pura, frontend e backend separados
- Recharts no lugar de Tremor (incompatibilidade com React 19)
- Tailwind 4 com @tailwindcss/vite plugin
- Áreas Financeiro e Estoque são independentes (sem vínculo automático)

### Próximo
- Configurar Supabase (criar tabelas)
- Implementar autenticação
- Primeiro CRUD (transações financeiras)
