# Handoff IA — Estado Atual

> Última atualização: 2026-06-17 (Sessão 13)

## O que já foi feito

1. **Protótipo visual** — HTML + JSX com Babel standalone (removido da pasta, preservado no histórico git)
2. **Scaffold frontend** — React + Vite + TypeScript + Tailwind CSS configurado
   - Tema dark com cores do protótipo (gold, surface, bg)
   - Layout shell (Sidebar, Header, toggle Financeiro/Estoque)
   - Página Home com cards de navegação (rota autônoma, sem sidebar)
   - 11 páginas completas com CRUDs (financeiro + estoque)
   - Componentes: Icon, Mark (logo SVG), Modal, FormControls, AnimatedButton, DayNightSwitch, UserMenu, ImageCropper, ProductDetailsModal
   - Componentes visuais: ColorBends (shader animado), ModelViewer (Three.js 3D)
   - Libs: supabase client, utils (cn, formatBRL), react-easy-crop
3. **Scaffold backend** — FastAPI (Python)
   - Estrutura: routers, models, services, auth, db
   - CORS configurado para frontend
   - Endpoints placeholder (retornam listas vazias)
   - Auth dependency (JWT validation via Supabase)
4. **Supabase configurado**
   - Projeto: `wyobbztexoofhqdttxzq`
   - 7 tabelas criadas: categorias, fornecedores, produtos, movimentacoes, transacoes, contas, metas
   - RLS habilitado com policies para `authenticated`
   - Bucket `produtos` no Storage (leitura pública, upload autenticado)
   - `.env` configurado no frontend e backend
5. **Autenticação implementada**
   - AuthContext com sessão Supabase (signIn, signOut, onAuthStateChange)
   - ProtectedRoute (redireciona para /login se não autenticado)
   - Tela de login: modelo 3D à esquerda, formulário à direita, fundo ColorBends animado, botão Entrar com hover animado
   - UserMenu dropdown (clique no avatar mostra email e logout)
6. **CRUDs completos no frontend** (conectados ao Supabase)
   - Produtos: criar/editar/excluir, upload de foto com cropper, grid de cards com busca e filtros, modal de detalhes
   - Movimentações (atualiza estoque automaticamente)
   - Transações financeiras
   - Contas a pagar/receber
   - Categorias
   - Fornecedores
   - Metas financeiras
7. **Tema dark + light**
   - ThemeContext com persistência em localStorage
   - Cores claras via `:root.light` em globals.css
   - DayNightSwitch no header (sol/lua)
   - Transições suaves em todas as cores
   - Logo adapta automaticamente via `mix-blend-mode`
8. **UI/UX**
   - Holographic hover effect nos cards de produtos
   - Botões animados (entrar, salvar)
   - Busca em tempo real e filtros por categoria/fornecedor/situação na tela de produtos
9. **Testes (TDD)** — Vitest + Testing Library
   - 6 testes passando para a página de Login
   - Documentação em `docs/TESTING.md`
10. **Documentação** — docs/ com PRD, Arquitetura, Banco, este Handoff, Logs, Testing
11. **Git + GitHub** — repo em https://github.com/LuisRivalta/horusparfum-control
12. **Repaginada premium de design (Sessão 4)**
    - Design system global em `globals.css`: grão sutil em toda a UI, scrollbar customizada, seleção dourada, h1 serifado global, tabelas premium (thead mono + hover dourado), keyframes (rise, scale-in, sheen)
    - Classes utilitárias: `.glow-card` (spotlight segue o mouse), `.gold-hairline`, `.sheen-hover`, `.ornament-divider`, `.stagger`, `.page-enter`
    - Layout: header sticky com glass blur, toggle Financeiro/Estoque com indicador deslizante animado, sidebar com rail dourado gradiente, drawer mobile com hamburger (responsivo lg:)
    - Home: fundo ColorBends (Three.js) sutil, entrada escalonada, cards com spotlight + cantos ornamentais
    - FormControls: botão primary com gradiente dourado + sheen no hover, inputs/selects com glow de foco e chevron customizado
    - Modal: animação de entrada, backdrop blur, título serifado
    - Dashboard financeiro: stat cards premium responsivos
    - Login: título serifado, ornamento, inputs com glow, animação do card
    - Fix: `vite.config.ts` migrado para `vitest/config` (build estava quebrado)
13. **Fluxo de Pedidos de compra (Sessão 5)** — substitui a tela Movimentações
    - Tabelas `pedidos`, `pedido_itens`, `divergencias` + colunas `custo_medio`/`ultimo_custo` em produtos
    - RPCs atômicas: `confirmar_recebimento` (entrada + custo médio + ledger + divergências) e `registrar_saida`
    - Telas: Pedidos (lista + criar com cadastro rápido de produto + conferência de recebimento), Divergências (log + resumo por fornecedor)
    - Saída rápida na tela de Produtos
    - `movimentacoes` virou ledger interno (sem CRUD manual)
    - Spec: docs/superpowers/specs/2026-06-10-pedidos-chegada-design.md
14. **Edição de pedido aguardando (Sessão 6)** — botão "Editar" nas linhas `aguardando`
    - `NovoPedidoModal` ganhou prop `pedidoParaEditar`: pré-preenche e faz UPDATE+DELETE+INSERT com rollback manual
    - Spec: docs/superpowers/specs/2026-06-12-editar-pedido-aguardando-design.md
15. **Dashboard financeiro com dados reais (Sessão 6)**
    - `lib/financeiro.ts`: lógica pura (saldo histórico, resumo por período, agrupar por categoria, evolução mensal) + construtores de período (mês/trimestre/ano/personalizado), com decimal.js e testes TDD
    - Seletor de período flexível, 4 cards (saldo histórico/receita/despesa/lucro), gráfico de evolução (6 meses) e de categorias (toggle despesas/receitas), via recharts
    - Saldo e lucro negativos destacados em vermelho
    - Spec: docs/superpowers/specs/2026-06-12-dashboard-financeiro-design.md
21. **Página Cadastros — unificação Produtos/Categorias/Fornecedores (Sessão 13)**
    - Rota-layout `Cadastros.tsx` em `/estoque/cadastros` com `<Outlet/>` hospedando três rotas aninhadas: `/estoque/cadastros/produtos`, `/cadastros/categorias`, `/cadastros/fornecedores`
    - Barra de abas premium: indicador dourado deslizante (CSS `transform: translateX`) + contadores por aba (head-count via query Supabase) + divisor ornamental abaixo
    - Botão de ação contextual via `createPortal` + `useOutletContext`: cada página-filha empurra seu próprio botão para o slot de ação do layout (`actionSlot`) sem quebrar encapsulamento
    - Redirects das rotas antigas: `/estoque/produtos`, `/estoque/categorias`, `/estoque/fornecedores` → novas rotas via `<Navigate replace />`
    - Sidebar enxugada de 10 → 8 itens: item único "Cadastros" substitui os três itens individuais (Produtos, Categorias, Fornecedores)
    - Teste de componente (`Cadastros.test.tsx`): renderização das abas, navegação, contadores e portal do botão
    - Frontend-only; sem migração de banco de dados
    - Spec: `docs/superpowers/specs/2026-06-17-cadastros-page-design.md`
    - Plano: `docs/superpowers/plans/2026-06-17-cadastros-page.md`

20. **Decants não-faturáveis — consumo com classificação e custo (Sessão 12)**
    - Classificações suportadas: `perda`, `amostra`, `brinde`, `marketing`, `uso_interno`, `outro`
    - Custo gerencial = custo do perfume (`ml × custo_medio ÷ ml_total`) + custo de embalagem, exceto `perda` (sem embalagem)
    - RPC atômica `registrar_consumo_decant` (atômica: debita ml do frasco, insere em `decants` com custo, lança despesa em `transacoes` com `origem='decant'`)
    - Ação "Esgotar frasco" na página Decants: registra ml restante como `perda` (custo de perfume apenas) e marca frasco `esgotado`
    - Card de resumo mensal por tipo na página Decants (via função pura `resumoConsumo` em `lib/decants.ts`, com testes TDD)
    - Badge "decant" nas linhas de `transacoes` geradas por este fluxo
    - Migração: `supabase/migrations/20260617_consumo_decant.sql` — **pendente de aplicação no Supabase SQL Editor**
    - Spec: `docs/superpowers/specs/2026-06-16-decants-nao-faturaveis-design.md`

19. **Módulo de Vendas — integração Estoque ↔ Financeiro (Sessão 11)**
    - Tabelas: `canais` (taxa_padrao %), `vendas` (header com total_bruto/total_custo/lucro_bruto), `venda_itens` (linhas com snapshot de custo + rateio proporcional de taxa/frete + lucro por item), `embalagens_decant` (custo por tamanho)
    - Colunas adicionadas: `produtos.preco_referencia` (preço sugerido), `transacoes.venda_id` + `transacoes.origem` ('manual'|'venda')
    - RPCs atômicas: `registrar_venda` (baixa estoque de produto/decant + snapshot de custo + lança receita/taxa/frete em `transacoes`) e `cancelar_venda` (estorno completo: devolve estoque/ml, remove lançamentos, marca status='cancelada')
    - `lib/vendas.ts` com testes TDD (Vitest): custo de decant, rateio proporcional, lucro por item, ROI, margem, resumo da venda
    - Telas: `Vendas.tsx` (lista + cancelamento), `vendas/NovaVendaModal.tsx` (multi-item + prévia ao vivo), `vendas/VendaDetalheModal.tsx`, `vendas/VendasConfig.tsx` (CRUD canais e embalagens)
    - Nav: item "Vendas" adicionado ao grupo Estoque (ícone `cart`)
    - Badge "venda" nas linhas de `transacoes` geradas por RPC
    - **Decisão contábil:** receita bruta + taxa + frete lançados no caixa; custo do produto NÃO relançado (já foi despesa na compra — evita dupla contagem); lucro gerencial vive no módulo de Vendas
    - Migração: `supabase/migrations/20260616_vendas.sql` — **pendente de aplicação no Supabase SQL Editor**
    - Spec: `docs/superpowers/specs/2026-06-16-vendas-erp-design.md`
18. **Registrar entrada manual + FrascoViewer retangular (Sessão 10)**
    - `EntradaRapidaModal.tsx`: modal para adicionar estoque diretamente (produto + qtd + motivo) sem Pedidos
    - `EstoqueView.tsx`: botão "Registrar entrada" ao lado de "Registrar saída" no cabeçalho
    - Migração `20260616_registrar_entrada.sql`: RPC `registrar_entrada` (incrementa estoque + ledger)
    - `FrascoViewer.tsx`: novo formato retangular com cantos arredondados (silhueta LV Imagination) via ExtrudeGeometry + Shape; fix `depthWrite: false` (líquido visível a 100%); fix `replaceChildren()` (remove espelhamento do canvas órfão); cleanup de `preserveDrawingBuffer` de debug
    - Removido harness temporário `FrascoTest.tsx` e rota `/frasco-test`
    - **Migração pendente:** aplicar `supabase/migrations/20260616_registrar_entrada.sql` no Supabase SQL Editor

17. **Página de Estoque + Reestruturação de Produtos (Sessão 8)**
    - Nova página `EstoqueView.tsx` em `/estoque` — grid de cards só com produtos em estoque (`estoque_atual > 0`), badges de quantidade (dourado/laranja/vermelho por situação), filtros busca+categoria+fornecedor+ordenação, estado vazio diferenciado com/sem filtros
    - `lib/estoque.ts`: lógica pura TDD — `situacaoEstoque` (critico/baixo/ok) e `ordenarProdutos` (qty_desc/qty_asc/az/za)
    - `Produtos.tsx` virou catálogo puro: removidos "Registrar saída" do topbar, filtro "Situação" e lógica de `filterSituacao`
    - Rota `/estoque` agora serve `EstoqueView`; `Produtos` move para `/estoque/produtos`
    - Nav reordenada: Estoque (1º) → Decants (2º) → Produtos (3º, ícone `tag` novo)
    - Ícone `tag` adicionado em `Icon.tsx`
    - Spec: `docs/superpowers/specs/2026-06-15-estoque-view-design.md`
    - 84 testes passando

16. **Módulo de Decants (Sessão 7)** — `/estoque/decants`
    - Tabelas `frascos_abertos` (índice único parcial por produto/ativo, rollback de estoque se frasco falhar) e `decants`
    - `lib/decants.ts`: lógica pura TDD — `podeFrasco`, `calcularNovoML`, `statusAposDecant`
    - `FrascoViewer.tsx`: frasco 3D em Three.js com nível de líquido animado (lerp), dispose completo no cleanup
    - Página `Decants.tsx`: grid de frascos ativos/esgotados, estado vazio, exclusão com feedback de erro
    - `AbrirFrascoModal.tsx`: filtra produtos com estoque e sem frasco ativo, rollback se insert falhar
    - `DecantModal.tsx`: botões rápidos (2/5/10ml) + input customizado, validação, animação do nível antes de fechar (700ms)
    - Migração: `supabase/migrations/20260615_decants.sql` — **aplicar no Supabase SQL Editor**
    - Spec: docs/superpowers/specs/2026-06-15-decants-design.md

## Estado atual

- **Deploy em produção:** https://horusparfum-control.vercel.app (Vercel, branch main, auto-deploy a cada push)
- Frontend compila e roda (`npm run dev`) — http://localhost:5173
- Backend importa e roda (`uvicorn app.main:app --reload`) — http://localhost:8000
- Banco de dados configurado no Supabase com todas as tabelas (migrações de decants, entrada manual e vendas pendentes de aplicação manual)
- Autenticação funcional (login/logout via Supabase Auth)
- CRUDs funcionais para todas as entidades: produtos, pedidos, divergências, categorias, fornecedores, alertas, transações, contas, metas
- Dark/light theme funcional
- Migração de pedidos (20260610_pedidos.sql) já aplicada no Supabase
- 84 testes automatizados passando

## Próximos passos imediatos

1. **Aplicar migração `supabase/migrations/20260617_consumo_decant.sql` no Supabase SQL Editor** (pendente — requer que `20260616_vendas.sql` já esteja aplicada; o consumo não-faturável de decants não funciona sem isso)
2. **Aplicar migração `supabase/migrations/20260616_vendas.sql` no Supabase SQL Editor** (pendente — o módulo de Vendas não funciona sem isso)
3. **Aplicar migração `supabase/migrations/20260615_decants.sql` no Supabase SQL Editor** (pendente — módulo de decants não funciona sem isso)
4. **Aplicar migração `supabase/migrations/20260616_registrar_entrada.sql` no Supabase SQL Editor** (pendente — botão "Registrar entrada" não funciona sem isso)
5. Dashboards de ROI/análise de vendas (os dados já são gerados e armazenados por venda/item — canal mais lucrativo, perfume com maior margem, evolução de receita de vendas)
6. Remover policies temporárias de `anon` (se foram criadas para testes)
7. Copiar JWT Secret do Supabase para o `.env` do backend
8. Dashboard estoque com dados reais (alertas de estoque baixo)
9. Relatórios (PDF ou tela)
10. Importação em massa de produtos (botão "Importar" na topbar)

### Melhorias futuras conhecidas (dashboard financeiro)
- `Dashboard.tsx`: query `transacoes` sem `.limit()` — pode truncar em 1.000 linhas se o histórico crescer muito (migrar para agregação SQL)
- `PeriodSelector`: período personalizado não valida `início <= fim` (resultado zera silenciosamente)
- Bundle do recharts é pesado (~445 kB gzip) — considerar code splitting

## Decisões pendentes

- Definir se relatórios PDF serão gerados no backend (reportlab/weasyprint) ou no frontend (jspdf)

## Para a IA

Ao iniciar sessão neste projeto:
- Leia este arquivo primeiro
- Trabalhe nos "Próximos passos imediatos" em ordem
- Ao finalizar, atualize este arquivo e registre em [[LOGS]]
