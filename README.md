# Horus Parfum — Painel Administrativo

Painel interno para gestão financeira e de estoque. Uso restrito (3-4 usuários).

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + Vite 8 + Tailwind CSS 4 + Three.js + Recharts |
| Backend | FastAPI (Python) |
| Banco | PostgreSQL (Supabase) |
| Auth | Supabase Auth (email + senha) |

## Setup

### Frontend

```bash
cd frontend
cp .env.example .env    # preencha com suas credenciais
npm install
npm run dev             # http://localhost:5173
```

### Backend

```bash
cd backend
cp .env.example .env    # preencha com suas credenciais
pip install fastapi "uvicorn[standard]" pydantic pydantic-settings "python-jose[cryptography]" httpx
pip install supabase --no-deps
pip install postgrest storage3 gotrue --no-deps
uvicorn app.main:app --reload  # http://localhost:8000
```

> Nota: `pip install -r requirements.txt` pode falhar no Windows (pyiceberg). Use os comandos acima.

## Funcionalidades

- Login/logout com Supabase Auth
- Gestão de produtos (com upload de foto)
- Movimentações de estoque (entrada/saída com atualização automática)
- Transações financeiras
- Contas a pagar e receber
- Categorias e fornecedores
- Metas financeiras com barra de progresso
- Tela de login com modelo 3D interativo e fundo animado

## Estrutura

```
frontend/src/
├── components/    → UI (layout, shared: Modal, FormControls, ColorBends, ModelViewer)
├── contexts/      → AuthContext (sessão Supabase)
├── pages/         → Telas (auth, home, financeiro, estoque)
├── lib/           → Supabase client, utils
└── styles/        → Tailwind globals + tema

backend/app/
├── routers/       → Endpoints (financeiro, estoque)
├── models/        → Pydantic schemas
├── services/      → Lógica de negócio
├── auth/          → JWT validation
└── db/            → Conexão Supabase
```

## Documentação

Ver `docs/` para documentação detalhada:
- `HANDOFF_IA.md` — Estado atual e próximos passos
- `ARQUITETURA.md` — Stack, pastas, como rodar
- `BANCO.md` — Schema do banco
- `PRD.md` — Produto e regras de negócio
- `LOGS.md` — Histórico de sessões
