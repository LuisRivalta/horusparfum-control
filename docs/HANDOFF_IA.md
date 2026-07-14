# Handoff IA — Estado Atual

> Última atualização: 2026-07-14 (Sessão 58)

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
23. **Relatório de giro de estoque funcional (Sessão 15)**
    - `lib/giro.ts`: lógica pura TDD para giro/cobertura/parado por produto, cobertura/parado de decants, resumo (giro médio, cobertura média, valor encalhado) e ordenação
    - `/estoque/relatorios`: painel frontend-only com presets 30/60/90/180 dias + período customizado, 4 cards de resumo, tabela de frascos cheios ordenável, filtro "Só parados" e seção de decants
    - Cálculo reconstrói estoque inicial pelo ledger: `estoque_inicio = estoque_atual - entradas + saidas`; giro usa estoque médio do período
    - Testes: `giro.test.ts` e `Relatorios.test.tsx`; suite completa com 132 testes passando
    - Sem migração de banco
    - Spec: `docs/superpowers/specs/2026-06-19-relatorio-giro-design.md`
    - Plano: `docs/superpowers/plans/2026-06-19-relatorio-giro.md`
24. **Remoção da tela Alertas (Sessão 16)**
    - Item "Alertas" removido da sidebar do grupo Estoque
    - Rota `/estoque/alertas` e página placeholder `Alertas.tsx` removidas
    - Copy da Home e documentação viva ajustadas para não listar Alertas como tela atual
    - Frontend-only; sem migração de banco
25. **Relatórios financeiros funcionais (Sessão 17)**
    - `/financeiro/relatorios`: substituído stub por painel com seletor de período, 4 cards de resumo, análise por categoria, origem dos lançamentos, ranking de maiores receitas/despesas e tabela detalhada
    - Exportação PDF via janela de impressão do navegador, usando os dados filtrados do período atual
    - Cálculo migrado para o backend FastAPI: `GET /api/financeiro/relatorios?inicio=<iso>&fim=<iso>` calcula saldo histórico, resumo do período, categorias, origens e rankings com `Decimal`
    - Frontend consome o endpoint com `Authorization: Bearer <Supabase JWT>` e fica responsável só por renderização/exportação
    - Teste `financeiro/__tests__/Relatorios.test.tsx`; suite completa com 134 testes passando
    - Teste backend `backend/tests/test_financeiro_relatorios.py`; sem migração de banco
26. **Metas financeiras com progresso automático (Sessão 19)**
    - `/financeiro/metas` passou a consumir `GET /api/financeiro/metas`
    - Metas em R$ calculam `valor_atual` automaticamente pela soma das entradas financeiras (`transacoes.tipo='entrada'`) no período da meta
    - Período aceito: `YYYY-MM`, `YYYY-Qn`, `YYYY`; sem período usa mês atual
    - Metas em `%` continuam usando `valor_atual` manual
    - Teste backend `backend/tests/test_financeiro_metas.py`; sem migração de banco
27. **Scroll fluido com Lenis (Sessão 20)**
    - Dependência `lenis@1.3.23` adicionada ao frontend
    - Novo `SmoothScrollArea.tsx` aplica Lenis ao container scrollável principal do `Layout`
    - Respeita `prefers-reduced-motion`; nesse caso usa scroll nativo
    - Ao trocar de rota, o scroll volta ao topo imediatamente
    - Frontend-only; sem migração de banco
28. **Deploy do backend FastAPI (Sessão 21)**
    - Projeto Vercel criado: `horusparfum-control-api`
    - Backend publicado em produção: `https://horusparfum-control-api.vercel.app`
    - `backend/main.py` adicionado como entrypoint detectável pela Vercel
    - `backend/vercel.json` roteia todas as requisições para `main.py`
    - Variáveis de produção configuradas: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`
    - Frontend Vercel atualizado com `VITE_API_URL=https://horusparfum-control-api.vercel.app` e redeployado
    - Verificado: `/api/health` 200, CORS para `https://horusparfum-control.vercel.app` e bundle frontend com URL da API
29. **Smoke test operacional completo em producao (Sessao 23)**
    - Migração corretiva aplicada no Supabase SQL Editor: `supabase/migrations/20260622142718_fix_cancelar_venda_decant_fk.sql`
    - Fluxos validados: cadastro de categoria/fornecedor/produto, entrada manual, saida manual, pedido + recebimento, venda de produto + cancelamento, abertura de frasco, consumo de decant, venda de decant + cancelamento, financeiro, metas e relatorios
    - Corrigido backend auth: endpoints protegidos agora validam JWT chamando Supabase Auth (`auth.get_user(token)`) em vez de depender de `JWT_SECRET`
    - Backend redeployado em producao na Vercel
    - Artefatos temporarios dos smoke tests removidos da producao
30. **Feedback ao excluir produto do estoque (Sessao 24)**
    - `ProductDetailsModal` agora mostra erro quando o banco bloqueia exclusao de produto por historico vinculado (estoque, pedidos, vendas ou decants)
    - O modal de confirmacao permanece aberto apos falha, evitando a sensacao de que o botao nao fez nada
    - Teste `ProductDetailsModal.test.tsx` cobre erro de exclusao bloqueada por FK
31. **Remover produto apenas do estoque (Sessao 25)**
    - Na tela `/estoque`, o botao destrutivo do modal de detalhes virou "Remover do estoque"
    - A acao registra uma saida via RPC `registrar_saida` com a quantidade total em estoque, zerando `produtos.estoque_atual`
    - O cadastro do produto permanece em `/estoque/cadastros/produtos`; exclusao permanente continua disponivel apenas no contexto de cadastro
    - Teste `ProductDetailsModal.test.tsx` cobre que o fluxo de estoque usa `registrar_saida` e nao executa `delete` em `produtos`
    - Revalidacao TDD em 2026-06-22: teste focado do modal 2/2 e suite frontend completa 136/136 passando

32. **Dashboard de vendas e ROI (Sessão 26)**
    - `/estoque/vendas` ganhou abas `Lista` e `Dashboard`, mantendo o fluxo operacional de registro/cancelamento na aba Lista
    - `GET /api/estoque/vendas/dashboard` calcula faturamento, lucro, margem, ROI, ticket medio, evolucao mensal, rankings de produtos/canais e tabela de vendas do periodo
    - Calculo roda no backend FastAPI com `Decimal`, ignora vendas canceladas e consulta Supabase via service role
    - Frontend consome o endpoint com JWT Supabase, seletor de periodo igual ao financeiro e datas locais para evitar drift UTC em `data_venda`
    - Sem migracao de banco; usa `vendas`, `venda_itens`, `canais` e `produtos`
    - Testes: backend completo 12/12, frontend completo 141/141, build frontend passando

33. **Importação de itens de pedido por PDF (Sessão 27)**
    - POST /api/estoque/pedidos/importar-pdf recebe PDF textual, valida tamanho/assinatura, extrai itens e retorna JSON sem gravar banco
    - Parser backend em pedido_pdf_import.py usa pypdf, normaliza números brasileiros e cobre PDFs no padrão Onun
    - NovoPedidoModal ganhou botão Importar PDF na seção de itens; fornecedor segue manual
    - Frontend casa itens por nome normalizado com produtos já cadastrados e deixa pendências para seleção manual
    - Sem migração de banco; não usa LLM/OCR no MVP
    - Testes: backend completo 20/20, frontend completo 149/149, build frontend passando


34. **Cadastro de produto sem movimentar estoque (Sessão 28)**
    - Modal "Novo produto" em Cadastros não exibe mais campo "Estoque atual"
    - Cadastro de produto passa a gravar sempre `estoque_atual: 0`, preservando cadastro como catálogo
    - Edição de produto também não permite alterar `estoque_atual`; o saldo continua visível apenas como leitura nos detalhes
    - Entradas reais continuam centralizadas em Pedidos/Confirmar chegada ou Estoque/Registrar entrada
    - Frontend-only; sem migração de banco
    - Testes: frontend completo 152/152, build frontend passando

35. **Estoque mínimo sugerido por vendas (Sessão 29)**
    - Backend `GET /api/estoque/produtos/{produto_id}/estoque-minimo-sugerido` calcula sugestão por vendas reais dos últimos 90 dias
    - Sugestão usa 15 dias de reposição e 30% de margem de segurança, ignorando vendas canceladas e itens de decant
    - Janela de cálculo usa data local de São Paulo e limita vendas futuras
    - Modal de detalhes/edição do produto exibe a sugestão e permite aplicar manualmente no campo `Estoque mínimo`
    - Sem vendas suficientes, o sistema não sugere zero artificialmente
    - Sem migração de banco
    - Testes: backend completo 26/26, frontend completo 155/155, build frontend passando


36. **Marcas em produtos (Sessão 30)**
    - Nova tabela marcas e coluna nullable produtos.marca_id
    - Cadastros ganhou aba Marcas com criação simples
    - Cadastro e edição de produto permitem marca opcional
    - Catálogo e Estoque filtram por marca
    - Migração: supabase/migrations/20260630_marcas_produtos.sql — aplicar manualmente no Supabase SQL Editor antes de usar em produção
    - Testes: frontend completo 162/162, backend completo 26/26, build frontend passando

37. **Limpeza de placeholders da interface (Sessão 32)**
    - Removidos exemplos fixos com marcas/produtos reais de placeholders visíveis, incluindo Marcas, Categorias, Metas, Transações, Divergências e Decants
    - Placeholder de Marcas agora usa texto neutro "Nome da marca"
    - Teste `Marcas.test.tsx` cobre que exemplos como Lattafa/Armaf não voltem como placeholder
    - Frontend: 163 testes passando e build passando

38. **Edição de marcas (Sessão 33)**
    - Aba Marcas ganhou ação Editar por item
    - O modal reutiliza o formulário de marca, alternando entre Nova marca e Editar marca
    - Salvamento de edição faz `update` em `marcas` pelo id, mantendo produtos vinculados à mesma marca
    - Teste `Marcas.test.tsx` cobre abertura, preenchimento e chamada `update().eq('id', ...)`
    - Frontend: 164 testes passando

39. **Fechamento do modal ao editar produto (Sessão 34)**
    - Corrigido `ProductDetailsModal`: após salvar edição com sucesso, o modal fecha e a lista é atualizada
    - Mantido `preventDefault` do formulário e atualização via callback, sem reload real da página
    - Teste `ProductDetailsModal.test.tsx` cobre fechamento (`onClose`) e atualização (`onUpdated`) após salvar
    - Frontend: 165 testes passando e build passando



42. **Hardening de segurança inicial (Sessão 37)**
    - Endpoints placeholder do backend passaram a exigir JWT Supabase via `get_current_user`, evitando rotas públicas que poderiam vazar dados se fossem preenchidas futuramente
    - Nova migração `supabase/migrations/20260702_harden_registrar_entrada.sql` recria `registrar_entrada` com `set search_path = public`, revoga execução de `PUBLIC` e concede execução apenas a `authenticated`
    - `npm audit fix` atualizou `undici` transitivo do ambiente de testes (`jsdom`) para remover vulnerabilidade alta reportada pelo audit
    - RLS por papéis/ownership não foi alterado neste ciclo porque muda o modelo de acesso do ERP; continua como próximo passo de segurança caso o app passe a ter perfis ou signup aberto
    - Testes adicionados: autenticação dos endpoints placeholder e verificação estática da migração de hardening
    - Migração aplicada no Supabase SQL Editor pelo Luis em 2026-07-02

43. **Redeploy da API com parser atual de PDF (Sessão 38)**
    - Investigado novo print em produção mostrando cabeçalho/cliente misturado no primeiro item importado do PDF
    - Reproduzido localmente com PEDIDO RINALDO ROMEU (1).pdf: o código atual extrai 33/33 itens corretamente, sem misturar cabeçalho
    - Causa raiz: produção ainda estava em deploy antigo da API; OpenAPI publicada não refletia o hardening mais recente
    - Executado npx vercel --prod --yes em backend/, atualizando o alias https://horusparfum-control-api.vercel.app
    - Verificação: /api/health retornou 200 e OpenAPI publicada passou a refletir endpoints placeholder com HTTPBearer

44. **Frete em pedidos de compra (Sessão 39)**
    - Pedidos ganharam campo de frete separado, persistido em pedidos.frete e somado ao valor_total
    - Modal Novo pedido e modo de edição exibem Frete (R$); valor vazio equivale a zero
    - Importação por PDF continua preenchendo apenas os itens; frete permanece manual
    - Nova migration: supabase/migrations/20260702142406_frete_pedidos.sql - aplicar manualmente no Supabase SQL Editor antes de usar em produção
    - Testes: frontend completo 170/170, backend completo 32/32, build frontend passando

45. **Correção do modal de Novo pedido (Sessão 40)**
    - Modal compartilhado agora limita a altura à viewport e deixa o corpo interno rolável, mantendo o cabeçalho visível
    - NovoPedidoModal agora mostra orientação clara quando o Supabase ainda não tem pedidos.frete, apontando para supabase/migrations/20260702142406_frete_pedidos.sql
    - Causa provável em produção: migration de frete pendente no Supabase; sem ela o insert falha e parecia que o botão não fazia nada
    - Testes: frontend completo 172/172, backend completo 32/32, build frontend passando

46. **Correção de posicionamento do Modal (Sessão 41)**
    - Removido flex/flex-col direto do elemento dialog, preservando o comportamento nativo de top layer e centralização
    - Corpo interno do modal mantém altura máxima e scroll próprio para formulários longos
    - Teste Modal.test.tsx cobre que o dialog não volta a receber flex/flex-col
    - Testes: frontend completo 172/172 e build frontend passando

47. **Correção do submit do Novo pedido (Sessão 42)**
    - Formulário de NovoPedidoModal agora usa noValidate para impedir que validação nativa do navegador bloqueie o React submit sem feedback visível
    - Validação de fornecedor/item fica centralizada em handleSubmit, exibindo erro dentro do modal quando faltam dados
    - Teste NovoPedidoModal.test.tsx cobre clique em Criar pedido sem fornecedor e garante mensagem visível
    - Testes: frontend completo 173/173 e build frontend passando

48. **Correção do scroll interno de modais com Lenis (Sessão 43)**
    - Modal compartilhado agora marca dialog e corpo rolável com data-lenis-prevent
    - Causa raiz: Lenis interceptava eventos de wheel sobre o modal, impedindo o scroll nativo da área interna
    - Teste Modal.test.tsx cobre que o modal mantém data-lenis-prevent no dialog e no corpo rolável
    - Testes: frontend completo 173/173 e build frontend passando

49. **Feedback ao criar pedido com produto repetido (Sessão 44)**
    - NovoPedidoModal não desabilita mais o botão Criar pedido apenas por haver produto repetido
    - Clique no botão agora executa validação e mostra erro visível orientando unir/remover linhas duplicadas
    - Teste NovoPedidoModal.test.tsx cobre o clique com produtos repetidos e garante que nada é salvo no banco
    - Testes: frontend completo 174/174 e build frontend passando
50. **Responsividade mobile 360px (Sessão 50)**
    - Frontend ajustado para operação diária em celular pequeno (alvo mínimo 360px), mantendo o visual premium existente
    - Modal compartilhado ganhou margem/padding/título responsivos sem perder o comportamento nativo de `dialog`
    - Tabelas largas em Vendas, Pedidos, Transações, Contas, Divergências, Fornecedores, Relatório de giro e Detalhe de venda agora rolam horizontalmente dentro do próprio bloco
    - Formulários e modais críticos passaram a empilhar campos no mobile: Novo pedido, Conferência, Nova venda, Produto, Transações, Contas, Metas, Entrada/Saída rápida e Decants
    - Grids de produtos/estoque usam 1 coluna em 360px e 2 colunas a partir de 420px
    - Spec: `docs/superpowers/specs/2026-07-03-mobile-responsivo-360-design.md`
    - Plano: `docs/superpowers/plans/2026-07-03-mobile-responsivo-360.md`
    - Testes: frontend completo 178/178 e build frontend passando

51. **Documentação rica e interconectada (Sessão 51)**
    - Criação de documentação detalhada por módulo no diretório `docs/features/`: `FINANCEIRO.md`, `ESTOQUE.md`, `VENDAS.md`, `PEDIDOS.md`, `DECANTS.md` e `AUTENTICACAO.md`.
    - Criação de guias globais do sistema: `API.md` (especificação de endpoints e stubs), `REGRAS_NEGOCIO.md` (regras e validações consolidadas), `DEPLOY.md` (Vercel, Supabase, RLS, storage), `DESIGN_SYSTEM.md` (tipografia, paletas de cores, Three.js) e `GLOSSARIO.md` (termos técnicos e de domínio).
    - Criação de `FLUXOS.md` mapeando todas as principais rotinas (Login, Venda, Pedido, Decant, Relatórios, etc.) usando fluxogramas e diagramas de sequência em Mermaid.
    - Todos os arquivos utilizam links no formato wiki link do Obsidian (`[[Nome do Arquivo]]`) para interconexão e navegação suave no Obsidian.
    - O arquivo `00-INDEX.md` foi atualizado para atuar como o painel central (MOC) de navegação da documentação.
    - Testes frontend revalidados com sucesso (178/178 passando).

41. **Importação de PDF com parser robusto e match inteligente (Sessão 36)**
    - Parser backend de pedidos agora ignora cabeçalho/cliente/rodapé e começa a leitura na tabela de itens
    - Suporte a itens Onuh com linhas separadas e também a linhas inline com `NCM + qtd + preço + total`
    - Backend valida `Número de itens` declarado no PDF e retorna aviso se divergir da quantidade extraída
    - Matching frontend mantém igualdade exata como prioridade e adiciona fallback fuzzy por tokens, com peso de volume em ml
    - Matches fortes são selecionados automaticamente; matches fracos, volumes divergentes ou ambíguos ficam pendentes para seleção manual
    - PDF real `PEDIDO RINALDO ROMEU (1).pdf` validado localmente: 33/33 itens extraídos, sem avisos
    - Sem LLM/OCR neste ciclo; LLM fica como fallback futuro para PDFs escaneados ou layouts muito diferentes
    - Testes: backend completo 28/28, frontend completo 168/168, build frontend passando
40. **Redeploy da API para importação de PDF (Sessão 35)**
    - Investigado erro 404 ao importar PDF em Pedidos
    - Causa raiz: produção do backend estava rodando um deploy antigo sem `/api/estoque/pedidos/importar-pdf`, apesar da rota existir em `origin/main`
    - API `horusparfum-control-api` redeployada via Vercel CLI a partir de `backend/`
    - Verificação: `/api/health` retornou 200; `GET /api/estoque/pedidos/importar-pdf` passou de 404 para 405 com `Allow: POST`; OpenAPI publicado lista a rota de importação

22. **Divergências como aba dentro de Pedidos (Sessão 14)**
    - Nova rota-layout `PedidosLayout.tsx` (espelha `Cadastros.tsx`): abas **Pedidos** (rota index `/estoque/pedidos`) e **Divergências** (`/estoque/pedidos/divergencias`), indicador dourado deslizante + contadores por aba
    - `EstPedidos` (index) e `EstDivergencias` (filha) aninhadas sob o layout no `App.tsx`; rota antiga `/estoque/divergencias` redireciona com `<Navigate replace />`
    - Páginas-filhas sem cabeçalho próprio (o layout é dono do título); botão "Novo pedido" no `actionSlot` via `createPortal` + `useOutletContext`
    - Aba index usa `NavLink end` + `isDiv`/`activeIndex` explícito (o path index é prefixo do path da filha)
    - Sidebar do grupo Estoque: 8 → 7 itens (item "Divergências" removido)
    - Teste `PedidosLayout.test.tsx`; `Pedidos.test.tsx` ajustado para o botão via slot. 114 testes passando
    - Frontend-only; sem migração de banco
    - Spec: `docs/superpowers/specs/2026-06-19-pedidos-divergencias-abas-design.md`
    - Plano: `docs/superpowers/plans/2026-06-19-pedidos-divergencias-abas.md`

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

52. **Ajuste local do Codex CLI (Sessão 53)**
    - Diagnosticado que codex update falhava no Windows ao baixar o instalador oficial, redirecionado para GitHub Releases, por erro TLS/revogacao CRYPT_E_NO_REVOCATION_CHECK e reset de conexao em github.com.
    - Instalado @openai/codex@0.143.0 via npm install -g @openai/codex@latest, pois o registry npm estava acessivel.
    - PATH do usuario ajustado para priorizar C:\Users\luisgfr\AppData\Roaming\npm antes do executavel standalone antigo em C:\Users\luisgfr\AppData\Local\Programs\OpenAI\Codex\bin.
    - A sessao atual ainda pode enxergar codex-cli 0.142.5 por PATH ja carregado; abrir um novo terminal deve ativar codex-cli 0.143.0.

53. **Painel administrativo simples (Sessão 54)**
    - Acesso restrito no frontend e backend ao email `byhorusco@gmail.com`
    - Gestão de logins Supabase Auth: listar, criar com email confirmado e remover usuários; o admin principal não pode ser removido
    - Exclusões destrutivas por endpoints predefinidos para produtos, pedidos, vendas, transações, contas, metas, categorias, marcas, fornecedores, canais e embalagens
    - Exclusões relacionadas de produtos, pedidos e vendas tratam os registros dependentes em ordem controlada
    - Tela `/admin` com abas Logins e Exclusões, busca por entidade e confirmação obrigatória digitando `EXCLUIR`
    - Link no menu do usuário exibido somente para o admin autorizado
    - Specs: `docs/superpowers/specs/2026-07-08-admin-panel-design.md`
    - Plano: `docs/superpowers/plans/2026-07-08-admin-panel.md`
    - Testes: backend 45/45, frontend 184/184 e build passando

54. **Correções finais do Dashboard Financeiro (Sessão 56)**
    - resumoPeriodo usa data_venda para receita, taxa e frete vinculados a uma venda, mantendo created_at para transações manuais
    - Vendas são carregadas com paginação explícita em lotes de 1.000, sem truncamento na primeira página do Supabase
    - Mensagem de erro abrange todos os dados financeiros carregados pelo Dashboard
    - Testes TDD cobrem venda retroativa e paginação; suíte e build passaram na sessão

55. **Alinhamento temporal e paginação estável do Dashboard Financeiro (Sessão 57)**
    - Resumo, categorias e evolução mensal usam `vendas.data_venda` para transações com `venda_id`; transações manuais mantêm `created_at`
    - `agruparPorCategoria` e `evolucaoMensal` aceitam vendas como parâmetro opcional, preservando compatibilidade
    - Dashboard passa vendas aos dois gráficos e pagina vendas com ordenação ascendente estável por `id` antes de cada `range`
    - Mocks dos testes não mantêm parâmetros ociosos e passam no ESLint sem desabilitar regras
    - Frontend completo com 192/192 testes e build passando

56. **Correcao unificada de transacoes - fundacao de banco (Sessao 58)**
    - Definida a decisao de produto: a aba Financeiro > Transacoes sera o ponto visual unico para corrigir lancamentos, mas mantendo modais e regras diferentes por origem.
    - Transacoes manuais poderao ser editadas/excluidas diretamente com confirmacao.
    - Transacoes de venda devem abrir edicao da venda no mesmo contexto visual; a regra precisa recomputar estoque, itens, ROI/lucro e lancamentos financeiros de forma atomica.
    - Transacoes de decant devem usar correcao/reversao propria, preservando ml e custo gerencial.
    - Criada spec em docs/superpowers/specs/2026-07-13-transacoes-correcao-unificada-design.md.
    - Criado plano em docs/superpowers/plans/2026-07-13-transacoes-correcao-unificada.md.
    - Criada migration supabase/migrations/20260713_correcao_unificada_transacoes.sql com transacoes.decant_id, RPC editar_venda e RPC corrigir_consumo_decant.
    - Criado teste estatico backend/tests/test_correcao_transacoes_migration.py para proteger a migration.
    - Commit ja existente: 6866eb4 feat: adiciona correcao atomica de transacoes.
    - A migration ainda nao foi aplicada no Supabase de producao.

## Estado atual

- **Deploy frontend produção:** https://horusparfum-control.vercel.app (Vercel, branch main, auto-deploy a cada push)
- **Deploy backend produção:** https://horusparfum-control-api.vercel.app (Vercel Python Runtime)
- Frontend compila e roda (`npm run dev`) — http://localhost:5173
- Backend importa e roda (`uvicorn app.main:app --reload`) — http://localhost:8000; relatório financeiro depende dele
- Banco de dados configurado no Supabase com todas as tabelas/RPCs atuais verificadas no projeto (`decants`, entrada manual, vendas e consumo de decants aplicados)
- Autenticação funcional (login/logout via Supabase Auth)
- CRUDs funcionais para todas as entidades: produtos, pedidos, divergências, categorias, fornecedores, transações, contas, metas
- Dark/light theme funcional
- Migração de pedidos (20260610_pedidos.sql) já aplicada no Supabase
- Smoke test operacional de producao passou em 2026-06-22
- 192 testes frontend passando; backend 49 testes passando na ultima verificacao completa conhecida
- Ha trabalho de implementacao parcial em andamento para a UI de edicao de vendas/transacoes; nao considerar concluido ate nova validacao e commit proprios

## Próximos passos imediatos

1. Concluir a UI de correcao unificada em Financeiro > Transacoes:
   - editar/excluir transacoes manuais com confirmacao;
   - abrir edicao de venda a partir de transacoes de venda;
   - abrir correcao/reversao propria para transacoes de decant.
2. Revalidar frontend/backend e aplicar supabase/migrations/20260713_correcao_unificada_transacoes.sql no Supabase SQL Editor antes de usar a feature em producao.
3. Publicar frontend/backend e executar smoke test do painel admin em producao.
4. Remover policies temporarias de anon (se foram criadas para testes).
5. Dashboard estoque com dados reais (estoque baixo e reposicao).
6. Evolucao da importacao por PDF: OCR/LLM fallback para layouts diferentes, se necessario.

### Melhorias futuras conhecidas (dashboard financeiro)
- `Dashboard.tsx`: query `transacoes` sem `.limit()` — pode truncar em 1.000 linhas se o histórico crescer muito (migrar para agregação SQL)
- `PeriodSelector`: período personalizado não valida `início <= fim` (resultado zera silenciosamente)
- Bundle do recharts é pesado (~445 kB gzip) — considerar code splitting

## Decisões pendentes

- Definir o momento de aplicar a migration 20260713_correcao_unificada_transacoes.sql no Supabase de producao.

## Para a IA

Ao iniciar sessão neste projeto:
- Leia este arquivo primeiro
- Trabalhe nos "Próximos passos imediatos" em ordem
- Ao finalizar, atualize este arquivo e registre em [[LOGS]]
