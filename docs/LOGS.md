# Logs — Histórico de Sessões

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
