# Handoff IA — Estado Atual

> Última atualização: 2026-06-02

## O que já foi feito

1. **Protótipo visual** — HTML + JSX com Babel standalone (removido da pasta, preservado no histórico git)
2. **Scaffold frontend** — React + Vite + TypeScript + Tailwind CSS configurado
   - Tema dark com cores do protótipo (gold, surface, bg)
   - Layout shell (Sidebar, Header, toggle Financeiro/Estoque)
   - Página Home com cards de navegação
   - 11 páginas placeholder (financeiro + estoque)
   - Componentes: Icon (set completo), Mark (Eye of Horus)
   - Libs: supabase client, utils (cn, formatBRL)
3. **Scaffold backend** — FastAPI (Python)
   - Estrutura: routers, models, services, auth, db
   - CORS configurado para frontend
   - Endpoints placeholder (retornam listas vazias)
   - Auth dependency (JWT validation via Supabase)
4. **Documentação** — docs/ com PRD, Arquitetura, Banco, este Handoff, Logs
5. **Git + GitHub** — repo em https://github.com/LuisRivalta/horusparfum-control

## Estado atual

- Frontend compila e roda (`npm run dev`)
- Backend importa e roda (`uvicorn app.main:app --reload`)
- **Não há banco de dados** — Supabase ainda não foi configurado
- **Não há autenticação** — telas são acessíveis sem login
- **Não há dados reais** — tudo é placeholder

## Próximos passos imediatos

1. Criar projeto no Supabase e configurar `.env` (front + back)
2. Criar tabelas conforme [[BANCO]]
3. Implementar auth (login/logout com Supabase Auth)
4. Configurar script unificado para rodar front+back com um comando
5. Popular o Dashboard financeiro com dados reais (primeiro CRUD)

## Decisões pendentes

- Definir se relatórios PDF serão gerados no backend (reportlab/weasyprint) ou no frontend (jspdf)
- Definir se fotos de produtos usam upload direto para Supabase Storage ou passam pelo backend

## Para a IA

Ao iniciar sessão neste projeto:
- Leia este arquivo primeiro
- Trabalhe nos "Próximos passos imediatos" em ordem
- Ao finalizar, atualize este arquivo e registre em [[LOGS]]
