# Logs — Histórico de Sessões

## 2026-07-01 — Sessão 30: Preservar marca em callers legados

**Responsável:** Luis + Codex

### O que foi feito
- Corrigido `ProductDetailsModal` para não enviar `marca_id` no payload de update quando o produto recebido não possui a propriedade `marca_id`.
- Mantido o comportamento de edição de marca para callers que já enviam `marca_id` no produto.
- Adicionado teste de regressão cobrindo produto legado sem `marca_id` e sem `marcas`.

### Validação
- RED: `npm run test:run -- src/components/shared/__tests__/ProductDetailsModal.test.tsx` — falhou porque o payload ainda continha `marca_id`.
- GREEN: `npm run test:run -- src/components/shared/__tests__/ProductDetailsModal.test.tsx` — 9 testes passando.
- Frontend: `npm run build` — build passando, com aviso conhecido de chunk grande.

---
## 2026-06-30 — Sessão 29: Estoque mínimo sugerido por vendas

**Responsável:** Luis + Codex (subagent-driven development)

### O que foi feito
- Criado cálculo backend para sugestão de `estoque_minimo` baseada em vendas reais dos últimos 90 dias.
- Adicionado endpoint protegido `GET /api/estoque/produtos/{produto_id}/estoque-minimo-sugerido`.
- O cálculo usa 15 dias de reposição e 30% de margem, ignora vendas canceladas, ignora itens de decant e limita a janela pela data local de São Paulo.
- Modal de produto passou a exibir a sugestão, estado sem dados e erro de carregamento.
- Botão `Usar sugestao` preenche o campo `Estoque minimo` no modo edição sem salvar automaticamente.
- Sem migração de banco.

### Validação
- Backend: `.venv\Scripts\python.exe -m unittest discover tests -v` — 26 testes passando.
- Frontend: `npm run test:run` — 155 testes passando.
- Frontend: `npm run build` — build passando.

---
## 2026-06-29 — Sessão 28: Cadastro de produto sem estoque inicial

**Responsável:** Luis + Codex

### O que foi feito
- Removido o campo "Estoque atual" do modal Novo produto em Cadastros.
- Cadastro de produto agora sempre cria o item com `estoque_atual: 0`.
- Removido o campo "Estoque atual" da edição do produto no modal de detalhes.
- O saldo atual permanece visível nos detalhes do produto, mas não é editável pelo cadastro.
- A movimentação real de estoque permanece nos fluxos corretos: Pedidos/Confirmar chegada e Estoque/Registrar entrada.

### Validação
- RED/GREEN focado: `npm run test:run -- src/pages/estoque/__tests__/Produtos.test.tsx src/components/shared/__tests__/ProductDetailsModal.test.tsx` — 4 testes passando.
- Frontend: `npm run test:run` — 152 testes passando.
- Frontend: `npm run build` — build passando.

---
## 2026-06-27 — Sessão 27: Importação de pedido por PDF

**Responsável:** Luis + Codex (subagent-driven development)

### O que foi feito
- Criada importação de itens por PDF textual dentro do modal Novo pedido.
- Backend FastAPI ganhou endpoint protegido POST /api/estoque/pedidos/importar-pdf.
- Parser usa pypdf, extrai texto, interpreta linhas de item e normaliza quantidade/preços em formato brasileiro.
- Endpoint valida tipo, assinatura %PDF- e limite de 10 MB antes de chamar o parser.
- Frontend envia PDF com JWT, preenche itens encontrados por nome normalizado e marca itens sem match para seleção manual.
- Fornecedor continua manual e pedido só é salvo após revisão do usuário.
- Sem migração de banco; sem LLM/OCR no MVP.

### Validação
- Backend: .venv\Scripts\python.exe -m pytest tests -q — 20 testes passando.
- Frontend: npm run test:run — 149 testes passando.
- Frontend: npm run build — build passando, com aviso conhecido de chunk grande.

---

## 2026-06-26 — Sessão 26: Dashboard de vendas e ROI

**Responsável:** Luis + Codex (subagent-driven development)

### O que foi feito
- Criado service backend `vendas_dashboard.py` para calcular dashboard de vendas com `Decimal`.
- Criado endpoint protegido `GET /api/estoque/vendas/dashboard` com JWT Supabase, consultas server-side e tratamento de períodos inválidos.
- Adicionada aba `Dashboard` dentro de `/estoque/vendas`, mantendo a aba `Lista` com o fluxo operacional de vendas.
- Dashboard exibe cards de faturamento, lucro, margem e ROI, linha auxiliar de ticket/volume/itens, gráfico mensal, ranking de produtos, ranking de canais e tabela de vendas do período.
- Vendas canceladas ficam fora de todos os indicadores.
- Ajustado isolamento do teste de auth para não depender do pacote real `supabase` durante a importação da suíte.

### Validação
- RED/GREEN backend focado: `python -m unittest tests.test_vendas_dashboard tests.test_estoque_vendas_dashboard_router -v` — **7 testes passando**.
- RED/GREEN frontend focado: `npm run test:run -- src/pages/estoque/__tests__/VendasDashboard.test.tsx src/pages/estoque/__tests__/Vendas.test.tsx` — **7 testes passando**.
- Suite backend completa: `python -m unittest discover -s tests -v` — **12 testes passando**.
- Suite frontend completa: `npm run test:run` — **141 testes passando**.
- Build frontend: `npm run build` — passando, com aviso conhecido de chunk grande.
- Whitespace: `git diff --check` — sem erros; apenas avisos CRLF do Windows.

### Observações
- Sem migração de banco.
- O endpoint usa as tabelas já existentes `vendas`, `venda_itens`, `canais` e `produtos`.
- O frontend envia datas locais (`YYYY-MM-DDT00:00:00` / `YYYY-MM-DDT23:59:59`) para evitar drift UTC em filtros sobre `data_venda`.

---

## 2026-06-22 — Sessão 25: Remover produto apenas do estoque

**Responsável:** Luis + Codex

### O que foi feito
- Ajustado o modal de detalhes quando aberto pela tela `/estoque`: o botão destrutivo agora aparece como **Remover do estoque**.
- A confirmação explica que o cadastro será mantido e que o estoque atual será zerado.
- Em vez de deletar o registro de `produtos`, a ação chama a RPC `registrar_saida` com a quantidade total em estoque e motivo `Removido do estoque`.
- O cadastro do produto continua disponível em `/estoque/cadastros/produtos`; nesse contexto, a exclusão permanente mantém o comportamento antigo com feedback de erro se houver histórico vinculado.
- Adicionado teste em `frontend/src/components/shared/__tests__/ProductDetailsModal.test.tsx` garantindo que o fluxo de estoque usa `registrar_saida` e não chama `delete` em `produtos`.

### Validação
- RED: o novo teste falhou inicialmente porque o modal ainda exibia apenas **Excluir** e não tinha o fluxo de remoção do estoque.
- GREEN: `npm run test:run -- src/components/shared/__tests__/ProductDetailsModal.test.tsx` — **2 testes passando**.
- Focused rerun dos testes que tinham falhado em lote: `npm run test:run -- src/pages/auth/__tests__/Login.test.tsx src/pages/estoque/__tests__/NovoPedidoModal.test.tsx` — **11 testes passando**.
- Frontend: `npm run test:run` — **136 testes passando**.
- Frontend: `npm run build` — build passando.
- Revalidação TDD solicitada: teste focado do modal novamente **2/2** e suíte frontend completa novamente **136/136**.

---

## 2026-06-22 — Sessão 24: Feedback ao excluir produto do estoque

**Responsável:** Luis + Codex

### O que foi feito
- Investigado o botão **Excluir** no modal de detalhes do produto.
- Raiz encontrada: quando o Supabase bloqueava a exclusão por FK/histórico vinculado, o componente ignorava o erro e fechava a confirmação, parecendo que o botão não fazia nada.
- `ProductDetailsModal` agora mantém a confirmação aberta e mostra uma mensagem explicando que o produto pode ter histórico de estoque, pedidos, vendas ou decants vinculados.
- Adicionado teste `frontend/src/components/shared/__tests__/ProductDetailsModal.test.tsx` cobrindo o erro de exclusão bloqueada.

### Validação
- RED: o novo teste falhou antes da correção porque a mensagem não existia.
- GREEN: teste específico passou.
- Frontend: `npm run test:run` — **135 testes passando**.
- Frontend: `npm run build` — build passando.

---

## 2026-06-22 — Sessão 23: Smoke test completo e auth do backend

**Responsável:** Luis + Codex

### O que foi feito
- Repetido smoke test após aplicação da migração `20260622142718_fix_cancelar_venda_decant_fk.sql` no Supabase.
- Validado que `cancelar_venda` agora cancela venda de decant sem violação de FK, restaura `ml_restante` do frasco e limpa `venda_itens.decant_id`.
- Corrigida autenticação do backend: `get_current_user` passou a validar o JWT pelo Supabase Auth (`auth.get_user(token)`) em vez de validar localmente por `JWT_SECRET`.
- Removido uso de `JWT_SECRET` da configuração/documentação e removida dependência `python-jose`.
- Backend redeployado em produção na Vercel.

### Validação
- Smoke de estoque/vendas passou até o fim dos fluxos: cadastro, entrada, saída, pedido + recebimento, venda de produto + cancelamento, abertura de frasco, consumo de decant e venda de decant + cancelamento.
- Smoke dos endpoints protegidos passou em produção:
  - `GET /api/financeiro/relatorios` com JWT temporário retornou receita esperada.
  - `GET /api/financeiro/metas` calculou meta em R$ a partir de receitas.
- Cleanup verificado com contagem zero para registros temporários (`categorias`, `fornecedores`, `produtos`, `vendas`, `transacoes`, `metas`) e usuário temporário removido.
- Backend: `python -m unittest discover -s tests` — **5 testes passando**.

### Pendências
- Próximo passo de produto: dashboards de ROI/análise de vendas.

---

## 2026-06-22 — Sessão 22: Smoke test operacional e correção pendente de cancelamento de decant

**Responsável:** Luis + Codex

### O que foi feito
- Iniciado smoke test operacional em produção usando registros temporários com prefixo `SMOKE-CODEX-20260622142403`.
- Validados com sucesso antes da falha: cadastro de categoria/fornecedor/produto, entrada manual, saída manual, pedido + recebimento, venda de produto + cancelamento, abertura de frasco, consumo de decant e venda de decant.
- Encontrado bug no cancelamento de venda com decant: a RPC `cancelar_venda` tentava apagar o registro em `decants` enquanto `venda_itens.decant_id` ainda tinha FK apontando para ele.
- Criada a migração `supabase/migrations/20260622142718_fix_cancelar_venda_decant_fk.sql`, que zera `venda_itens.decant_id` antes de apagar o registro de `decants`.
- Artefatos temporários do smoke test foram removidos da produção em ordem segura de FK.

### Validação
- Smoke test falhou no passo `cancelar_venda` de decant com erro de FK `venda_itens_decant_id_fkey`.
- Cleanup verificado por contagem zero para `categorias`, `fornecedores`, `produtos`, `vendas` e `transacoes` com prefixo `SMOKE-CODEX-20260622142403`.
- `npx supabase db query --linked` e `npx supabase db push --linked --dry-run` travaram até timeout; `Test-NetConnection` para host direto/pooler Postgres retornou falha, então a migração não foi aplicada remotamente nesta sessão.

### Pendências
- Aplicar `supabase/migrations/20260622142718_fix_cancelar_venda_decant_fk.sql` no Supabase SQL Editor.
- Repetir o smoke test operacional completo após aplicar a migração.

---

## 2026-06-22 — Sessão 21: Deploy do backend FastAPI

**Responsável:** Luis + Codex

### O que foi feito
- Criado projeto Vercel `horusparfum-control-api`.
- Publicado backend FastAPI em `https://horusparfum-control-api.vercel.app`.
- Adicionado `backend/main.py` como entrypoint para a Vercel (`from app.main import app`).
- Adicionado `backend/vercel.json` para empacotar `main.py` com `@vercel/python` e rotear `/(.*)` para a API.
- Adicionado `backend/.vercelignore` para excluir `.env`, `.venv`, caches e testes do bundle.
- Configuradas variáveis de produção do backend: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `FRONTEND_URL`.
- Linkado o projeto frontend `horusparfum-control` e atualizado `VITE_API_URL` de produção para `https://horusparfum-control-api.vercel.app`.
- Redeployado o frontend em produção para incorporar o novo `VITE_API_URL`.

### Validação
- `backend`: `python -m unittest discover -s tests` — **3 testes passando**.
- `backend`: import do entrypoint `from main import app` passando.
- Produção API: `GET /api/health` retornou `{"status":"ok"}`.
- CORS: preflight com origem `https://horusparfum-control.vercel.app` e header `authorization` retornou 200.
- Produção frontend: bundle publicado contém `https://horusparfum-control-api.vercel.app`.

### Pendências
- Fazer smoke test operacional completo em produção.

---

## 2026-06-19 — Sessão 20: Scroll fluido com Lenis

**Responsável:** Luis + Codex

### O que foi feito
- Adicionado `lenis@1.3.23` ao frontend.
- Criado `frontend/src/components/layout/SmoothScrollArea.tsx`.
- Aplicado Lenis no container scrollável principal do `Layout`, porque o app usa `h-screen` com conteúdo interno `overflow-auto` em vez de scroll direto no `window`.
- Mantido respeito a `prefers-reduced-motion`: usuários com redução de movimento seguem com scroll nativo.
- Scroll volta ao topo ao trocar de rota.

### Validação
- `npm run build` — build de produção passando.
- `npm run test:run` — **134 testes passando**.
- Dev server local iniciado em `http://127.0.0.1:5173`.

### Observação
- `npm install lenis` reportou 1 vulnerabilidade alta no audit, mas não foi aplicado `npm audit fix` automaticamente para evitar mudanças fora de escopo.

---

## 2026-06-19 — Sessão 19: Metas financeiras calculadas pelo financeiro

**Responsável:** Luis + Codex

### O que foi feito
- Corrigida a página `/financeiro/metas`: antes ela usava apenas `metas.valor_atual` manual, por isso uma meta de R$ 10k ficava 0% mesmo com vendas faturadas.
- Criado `backend/app/services/financeiro_metas.py` para calcular metas em R$ pela soma de entradas financeiras (`transacoes.tipo='entrada'`).
- Atualizada a rota `GET /api/financeiro/metas` para retornar metas com `valor_atual`, `progresso`, `fonte` e `valor_manual`.
- Atualizada a tela `Metas.tsx` para consumir o backend e exibir badge "Receita" quando a meta for calculada automaticamente.
- Metas em `%` continuam manuais.

### Regras
- `periodo = YYYY-MM` calcula o mês.
- `periodo = YYYY-Qn` calcula o trimestre.
- `periodo = YYYY` calcula o ano.
- Sem período, usa o mês atual.

### Validação
- Frontend: `npm run test:run` — **134 testes passando**.
- Frontend: `npm run build` — build de produção passando.
- Backend: `python -m unittest discover -s tests` — **3 testes passando**.

### Pendências
- Fazer deploy/configuração do FastAPI em produção continua necessário, pois Metas e Relatórios financeiros agora dependem de `VITE_API_URL`.

---

## 2026-06-19 — Sessão 18: Relatório financeiro calculado no backend

**Responsável:** Luis + Codex

### O que foi feito
- Migrado o cálculo de `/financeiro/relatorios` para o FastAPI.
- Criado `backend/app/services/financeiro_relatorios.py` com agregação usando `Decimal`: receita, despesa, lucro, saldo histórico até o fim do período, categorias, origens, maiores lançamentos e lançamentos do período.
- Atualizada a rota `GET /api/financeiro/relatorios?inicio=<iso>&fim=<iso>` para consultar `transacoes` no Supabase via service role e exigir JWT do Supabase no header `Authorization`.
- Atualizada a tela React para consumir o endpoint backend e renderizar o payload pronto, mantendo exportação PDF por impressão do navegador.
- Adicionado teste backend `backend/tests/test_financeiro_relatorios.py` e ajustado o teste frontend para mockar `fetch` + sessão Supabase.
- Atualizada a arquitetura para remover o status de backend dormente no fluxo de relatórios.

### Validação
- Frontend: `npm run test:run` — **134 testes passando**.
- Frontend: `npm run build` — build de produção passando.
- Backend: `python -m unittest discover -s tests` — **1 teste passando**.
- Backend: import do FastAPI (`from app.main import app`) passando.

### Decisões tomadas
- O frontend não recalcula o relatório; ele envia período + JWT e renderiza o agregado do backend.
- O saldo histórico do relatório é calculado até o fim do período selecionado.
- A página agora depende de backend disponível em `VITE_API_URL`.

### Pendências
- Fazer deploy do FastAPI e configurar `VITE_API_URL` em produção.
- Configurar `JWT_SECRET` do Supabase nas variáveis do backend.

---

## 2026-06-19 — Sessão 17: Relatórios financeiros funcionais

**Responsável:** Luis + Codex

### O que foi feito
- Substituído o stub de `/financeiro/relatorios` por um painel real com seletor de período, cards de Receita/Despesas/Lucro/Saldo histórico, tabelas por categoria, origem dos lançamentos, ranking de maiores receitas/despesas e tabela detalhada.
- Adicionada exportação PDF via impressão do navegador, respeitando o período selecionado.
- Reutilizada a lógica pura de `lib/financeiro.ts` para saldo histórico, resumo por período e agrupamento por categoria.
- Adicionado teste `frontend/src/pages/financeiro/__tests__/Relatorios.test.tsx` cobrindo renderização do resumo/categorias e fluxo de exportação.
- Atualizado o handoff para refletir que as migrações atuais do Supabase foram verificadas como aplicadas.

### Validação
- `npm run test:run` — **134 testes passando**.
- `npm run build` — build de produção passando.

### Decisões tomadas
- PDF financeiro usa a janela de impressão do navegador por enquanto, sem adicionar dependência nova.
- O relatório financeiro calcula em memória com os dados de `transacoes`, seguindo o padrão atual do dashboard financeiro.

### Pendências
- Avaliar exportação PDF do relatório de giro de estoque.
- Dashboards de ROI/análise de vendas continuam como próximo passo relevante.

---

## 2026-06-19 — Sessão 16: Remoção da tela Alertas

**Responsável:** Luis + Codex

### O que foi feito
- Removido o item **Alertas** da sidebar do grupo Estoque.
- Removida a rota `/estoque/alertas` do `App.tsx`.
- Removida a página placeholder `frontend/src/pages/estoque/Alertas.tsx`.
- Atualizada a copy da Home e a documentação viva (`PRD`, `ARQUITETURA`, `HANDOFF`, `LOGS`) para não listar Alertas como tela atual.

### Decisões tomadas
- A remoção foi frontend-only; `estoque_minimo` permanece no modelo de produtos para uso em relatórios ou reposição futura.
- Specs e planos históricos não foram alterados.

### Pendências
- Nenhuma pendência nova.

---

## 2026-06-19 — Sessão 15: Relatório de giro de estoque funcional

**Responsável:** Luis + Codex

### O que foi feito
- **`lib/giro.ts`** — lógica pura para calcular giro/cobertura/parado por produto, cobertura/parado de decants, resumo do painel e ordenação. Usa `decimal.js` no valor encalhado.
- **`Relatorios.tsx`** — substituído o stub de `/estoque/relatorios` por um painel frontend-only com período selecionável (30/60/90/180 dias + custom), 4 cards de resumo, tabela de frascos cheios ordenável, filtro "Só parados" e seção de decants.
- **Testes:** novo `giro.test.ts` cobrindo cálculos e ordenação; novo `Relatorios.test.tsx` com Supabase mockado cobrindo renderização, badge "Parado", preset padrão 90 dias e seção Decants.
- **Validação:** `npm run test:run` com **132 testes passando**; `npm run build` passando.
- Frontend-only — sem alteração de banco ou migrações.

### Decisões tomadas
- O giro usa estoque médio aproximado do período, reconstruindo o estoque inicial a partir do estoque atual e das movimentações: `estoque_inicio = estoque_atual - entradas + saidas`.
- Decants ficam em seção separada por eixo de ml; não entram no giro de unidades de frasco cheio.
- Exportação PDF ficou fora desta entrega e permanece como próximo passo para relatórios.

### Pendências
- Exportação PDF dos relatórios.
- Limitação conhecida: queries de `movimentacoes` e `decants` não paginam; se o volume do período passar de 1.000 linhas, migrar para agregação SQL/RPC.

### Specs e planos
- Spec: `docs/superpowers/specs/2026-06-19-relatorio-giro-design.md`
- Plano: `docs/superpowers/plans/2026-06-19-relatorio-giro.md`

---

## 2026-06-19 — Sessão 14: Divergências como aba dentro de Pedidos

**Responsável:** Luis + Claude (subagent-driven development)

### O que foi feito
- **`PedidosLayout.tsx`** — nova rota-layout com `<Outlet/>`, espelhando o padrão do `Cadastros.tsx`: barra de abas com indicador dourado deslizante, contadores por aba (head-count ao Supabase nas tabelas `pedidos` e `divergencias`), divisor ornamental e slot de ação (`actionSlot`).
- **Duas abas:** **Pedidos** (ícone `swap`, rota index `/estoque/pedidos`) e **Divergências** (ícone `warn`, `/estoque/pedidos/divergencias`).
- **Rotas aninhadas** no `App.tsx`: `EstPedidos` vira a rota index e `EstDivergencias` a filha `divergencias`, ambas sob o layout. A rota antiga `/estoque/divergencias` redireciona com `<Navigate replace />` para a nova — bookmarks e deep links continuam funcionando.
- **Páginas-filhas sem cabeçalho próprio:** `Pedidos.tsx` e `Divergencias.tsx` perderam seus blocos de header (o layout é o dono do título). O botão "Novo pedido" agora é injetado no `actionSlot` do layout via `createPortal` + `useOutletContext` (aparece só na aba Pedidos).
- **Sidebar 8 → 7 itens (grupo Estoque):** item "Divergências" removido; sobra "Pedidos", que abre o layout com as duas abas.
- **Testes:** novo `PedidosLayout.test.tsx` (abas, active-tab por rota index/filha com prefixo compartilhado, contadores). `Pedidos.test.tsx` ajustado para renderizar o botão "Novo pedido" via slot do layout-pai. Suite: **114 testes passando**.
- Frontend-only — sem alteração de banco ou migrações (tabelas `pedidos`/`divergencias` e RPCs já existiam).

### Decisões tomadas
- A aba index ("Pedidos") usa `NavLink end` + lógica explícita `isDiv`/`activeIndex` em vez do `startsWith` genérico do Cadastros, porque `/estoque/pedidos` é prefixo de `/estoque/pedidos/divergencias` — sem isso a pílula ficaria sempre na primeira aba.
- Título do layout mantido como "Pedidos" (combina com a sidebar e o pedido do usuário), apesar da leve redundância com a primeira aba.

### Pendências
- Nenhuma pendência nova. Smoke no browser ficou gated pelo login do Supabase (sem credenciais no ambiente da sessão); cobertura garantida pelos testes automatizados.

### Specs e planos
- Spec: `docs/superpowers/specs/2026-06-19-pedidos-divergencias-abas-design.md`
- Plano: `docs/superpowers/plans/2026-06-19-pedidos-divergencias-abas.md`

---

## 2026-06-17 — Sessão 13: Página Cadastros (unificação Produtos/Categorias/Fornecedores)

**Responsável:** Luis + Claude (subagent-driven development)

### O que foi feito
- **`Cadastros.tsx`** — rota-layout com `<Outlet/>`: barra de abas premium com indicador dourado deslizante (`transform: translateX` animado), contadores por aba (queries de head-count ao Supabase), divisor ornamental (`.ornament-divider`) e slot de ação (`actionSlot`) preenchido por cada página-filha.
- **Rotas aninhadas:** `/estoque/cadastros` (index redireciona para `/produtos`) + `/estoque/cadastros/produtos`, `/estoque/cadastros/categorias`, `/estoque/cadastros/fornecedores`. Registradas no `App.tsx` como filhas do layout `Cadastros`.
- **Botão de ação via portal:** cada página-filha usa `createPortal` + `useOutletContext` para injetar seu botão primário ("+ Novo Produto", "+ Nova Categoria", "+ Novo Fornecedor") no slot do layout pai — sem prop drilling nem re-renderização do layout.
- **Redirects:** `<Navigate replace />` em `/estoque/produtos`, `/estoque/categorias` e `/estoque/fornecedores` apontando para as novas rotas — deep links e bookmarks antigos continuam funcionando.
- **Sidebar 10 → 8 itens:** os três itens individuais (Produtos, Categorias, Fornecedores) foram removidos e substituídos por um único item "Cadastros" (ícone `tag`) que navega para `/estoque/cadastros` (ativo via `startsWith` em qualquer sub-rota).
- **Teste de componente** (`Cadastros.test.tsx`): cobre renderização das abas, active-tab highlight, contadores e portal do botão de ação.
- Frontend-only — sem alteração de banco de dados ou migrações.

### Decisões tomadas
- Indicador deslizante via CSS `transform: translateX(activeIndex × 160px)` num único elemento absoluto (abas de largura fixa 160px) — evita reflow e mantém a animação suave.
- `useOutletContext<{ actionSlot }>` tipado para type-safety no portal entre layout e filhas; o `actionSlot` é guardado via callback ref + state (sem bug de timing).
- Contadores carregados independentemente por aba (queries baratas de `count`) para não bloquear a renderização da aba ativa.
- Redirects com `replace` para não poluir o histórico do browser.

### Pendências
- Nenhuma pendência nova introduzida nesta sessão.

---

## 2026-06-17 — Sessão 12: Decants não-faturáveis (perda/brinde/amostra/marketing)

**Responsável:** Luis + Claude (subagent-driven development)

### O que foi feito
- **Migração SQL** (`supabase/migrations/20260617_consumo_decant.sql`): colunas `classificacao` (text, nullable, check constraint), `custo` e `custo_embalagem` (numeric(12,2)) em `decants`; estende constraint `transacoes_origem_check` para incluir `'decant'`; RPC atômica `registrar_consumo_decant(p_frasco_id, p_ml, p_classificacao, p_custo_embalagem, p_responsavel)`.
- **Classificações suportadas:** `perda`, `amostra`, `brinde`, `marketing`, `uso_interno`, `outro`.
- **Custo gerencial:** `custo_perfume = ml × custo_medio ÷ ml_total`; `custo_embalagem` incluído exceto para `perda` (sem embalagem). RPC soma os dois e lança despesa em `transacoes` com `origem='decant'` e `categoria` = label da classificação.
- **"Esgotar frasco":** ação na página Decants que registra o ml restante como `perda` (custo de perfume apenas, sem embalagem) e marca o frasco como `esgotado` via a mesma RPC.
- **Card de resumo mensal:** na página Decants, exibe breakdown do custo de consumo por classificação no mês corrente. Alimentado pela função pura `resumoConsumo` em `lib/decants.ts` (TDD — Vitest).
- **Badge "decant"** nas linhas de `transacoes` (`Transacoes.tsx`) para consumos gerados via este fluxo.
- **Documentação:** PRD, BANCO, HANDOFF e LOGS atualizados.

### Decisões tomadas
- **Contabilidade:** custo é gerencial, mas sempre lançado no caixa como despesa (`saida`) — o usuário concilia. Não há receita envolvida; o fluxo de receita de decants fica exclusivamente no módulo de Vendas.
- `perda` não inclui custo de embalagem (perfume vaza/evapora; não foi usada embalagem).
- Se `custo_total = 0` (produto sem custo médio e sem embalagem), a transação **não** é lançada (evita ruído no caixa).
- A RPC usa `FOR UPDATE` nos dois selects (frasco e produto) para garantir atomicidade sob concorrência.

### Pendências
- **Aplicar `supabase/migrations/20260617_consumo_decant.sql` no Supabase SQL Editor** — pré-requisito: `20260616_vendas.sql` já aplicada.

---

## 2026-06-16 — Sessão 11: Módulo de Vendas (integração Estoque ↔ Financeiro)

**Responsável:** Luis + Claude (subagent-driven development)

### O que foi feito
- **Migração SQL** (`supabase/migrations/20260616_vendas.sql`): tabelas `canais`, `embalagens_decant`, `vendas`, `venda_itens`; coluna `preco_referencia` em `produtos`; colunas `venda_id` e `origem` em `transacoes`; RLS; seeds de canais (Loja física, Shopee, Mercado Livre, Site próprio, Instagram/WhatsApp) e embalagens de decant (2ml/5ml/10ml).
- **RPCs atômicas:** `registrar_venda` (baixa estoque de produto/decant com `FOR UPDATE`, faz snapshot de custo, insere venda e itens, rateio proporcional de taxa/frete no segundo loop, lança receita + taxa + frete em `transacoes`) e `cancelar_venda` (estorno completo: devolve estoque ou ml, apaga registro de decant, remove transações da venda, marca status='cancelada').
- **`lib/vendas.ts`** (TDD — Vitest): funções puras `custoDecantUnitario`, `brutoItem`, `custoItem`, `ratearProporcional`, `lucroItem`, `resumoVenda`, `roi`, `margem`. Cobre rateio exato no último item (anti penny-gap).
- **Telas frontend:** `Vendas.tsx` (tabela de vendas com Nº/data/canal/itens/bruto/lucro/ROI/status, clique abre detalhe, botão cancelar com confirmação, link "Canais e embalagens"), `vendas/NovaVendaModal.tsx` (multi-item com seleção tipo produto/decant, prévia ao vivo de lucro/ROI/margem), `vendas/VendaDetalheModal.tsx` (detalhes da venda e seus itens), `vendas/VendasConfig.tsx` (CRUD de canais com taxa_padrao e CRUD de embalagens de decant com custo por tamanho).
- **Nav:** item "Vendas" com ícone `cart` adicionado ao grupo Estoque na sidebar.
- **Badge no Financeiro:** `Transacoes.tsx` exibe badge "venda" nas linhas com `origem='venda'`.
- **Campo preço de referência:** coluna `preco_referencia` adicionada a `produtos` e exposta no modal de novo produto e na prévia da nova venda.
- **Documentação:** PRD, BANCO, HANDOFF e LOGS atualizados.

### Decisões tomadas
- **Contabilidade:** a venda lança no caixa apenas receita bruta + taxa + frete. O custo do produto NÃO é relançado (ele já foi registrado como despesa na compra via Pedidos), evitando dupla contagem. Lucro e ROI gerenciais vivem no módulo de Vendas e nos campos de `vendas`/`venda_itens`.
- Custo do decant = (ml_decant / ml_total_frasco) × custo_medio do produto — snapshot no momento da venda.
- Rateio de taxa/frete proporcional ao bruto de cada item; o último item absorve os centavos restantes.
- Cancelamento apaga as transações do caixa (`origem='venda'`) e devolve estoque/ml integralmente.

### Pendências
- **Aplicar `supabase/migrations/20260616_vendas.sql` no Supabase SQL Editor** — o módulo não funciona sem isso.
- Dashboards de ROI/análise de vendas (dados já gravados por venda e item).

---

## 2026-06-16 — Sessão 10: Registrar entrada manual + FrascoViewer retangular

**Responsável:** Luis + Claude

### O que foi feito
- **FrascoViewer — novo formato:** frasco 3D refeito com `ExtrudeGeometry` sobre `THREE.Shape` (rounded-rect). Silhueta retangular com cantos arredondados (inspiração LV Imagination), pescoço curto e tampa dourada robusta.
- **FrascoViewer — fix líquido a 100%:** `glassMat.depthWrite = false` impede a casca de vidro de ocluir o líquido via depth buffer.
- **FrascoViewer — fix espelhamento:** `mountRef.current.replaceChildren()` antes de `appendChild` elimina canvas órfão que o StrictMode empilhava.
- **Registrar entrada manual:** `EntradaRapidaModal.tsx` (produto + qtd + motivo) + botão "Registrar entrada" no cabeçalho do `EstoqueView`. Chama RPC `registrar_entrada` (incrementa `estoque_atual` + insere em `movimentacoes`).
- **Migração SQL:** `supabase/migrations/20260616_registrar_entrada.sql` — precisa ser aplicada no Supabase SQL Editor.
- **Limpeza:** removidos `preserveDrawingBuffer: true` (era só para debug via `readPixels`), `FrascoTest.tsx` e rota `/frasco-test`.

### Decisões tomadas
- Entrada manual não cria pedido: vai direto na tabela `movimentacoes` via RPC, mantendo o ledger consistente.

### Pendências
- Aplicar `supabase/migrations/20260615_decants.sql` (decants) e `20260616_registrar_entrada.sql` (entrada manual) no Supabase SQL Editor.

---

## 2026-06-15 — Sessão 9: Deploy Vercel + fix de testes

**Responsável:** Luis + Claude

### O que foi feito
- **Deploy em produção no Vercel:** `frontend/vercel.json` criado com rewrite SPA, env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`) configuradas, Supabase URL Configuration atualizada com redirect `https://horusparfum-control.vercel.app/**`
- **Fix de teste flaky:** `Pedidos.test.tsx` — removido `waitFor` desnecessário do teste "renderiza o botão Novo pedido" (botão aparece no render inicial, não depende de dados async)
- 84 testes passando

### Decisões tomadas
- Backend (FastAPI) não vai pro Vercel — todo o app funciona direto com Supabase; backend fica para quando houver lógica real (email, PDF, integrações externas)
- `vercel.json` fica em `frontend/` (root directory do Vercel aponta para `frontend/`)

### Pendências
- Migração `20260615_decants.sql` ainda pendente de aplicação manual no Supabase

---

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
