# Horus Parfum — Painel Administrativo

Painel interno para gestão financeira e de estoque. Uso restrito (3-4 usuários).

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React + Vite + Tailwind CSS + shadcn/ui + Recharts |
| Backend | FastAPI (Python) |
| Banco | PostgreSQL (Supabase) |
| Auth | Supabase Auth |

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
python -m venv .venv
.venv/Scripts/activate  # Windows
pip install -r requirements.txt
cp .env.example .env    # preencha com suas credenciais
uvicorn app.main:app --reload  # http://localhost:8000
```

## Estrutura

```
frontend/src/
├── components/    → UI components (layout, shared, charts)
├── pages/         → Telas (home, financeiro, estoque)
├── lib/           → Supabase client, utils, api helpers
├── hooks/         → Custom hooks
└── styles/        → Tailwind globals + theme

backend/app/
├── routers/       → Endpoints (financeiro, estoque)
├── models/        → Pydantic schemas
├── services/      → Lógica de negócio
├── auth/          → JWT validation
└── db/            → Conexão Supabase/PostgreSQL
```
