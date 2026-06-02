# Arquitetura — Horus Parfum Control

## Stack

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Frontend | React + Vite + TypeScript | React 19, Vite 8 |
| Estilo | Tailwind CSS + shadcn/ui | Tailwind 4 |
| Gráficos | Recharts | — |
| Roteamento | React Router | v6+ |
| Data fetching | TanStack Query + Supabase JS | — |
| Backend | FastAPI (Python) | Python 3.14 |
| Banco | PostgreSQL | Supabase (cloud) |
| Auth | Supabase Auth | JWT |

## Estrutura de pastas

```
C:\Horus\
├── docs\                  → Documentação (este diretório)
├── frontend\
│   └── src\
│       ├── components/
│       │   ├── ui/        → shadcn/ui (Button, Card, Input, Table, Dialog)
│       │   ├── charts/    → Wrappers Recharts
│       │   ├── layout/    → Layout.tsx (sidebar + header + outlet)
│       │   └── shared/    → Icon.tsx, Mark.tsx (Eye of Horus)
│       ├── pages/
│       │   ├── home/      → Home.tsx (tela inicial com cards)
│       │   ├── financeiro/→ Dashboard, Transacoes, Contas, Relatorios, Metas
│       │   └── estoque/   → Produtos, Movimentacoes, Categorias, Fornecedores, Alertas, Relatorios
│       ├── lib/           → utils.ts (cn, formatBRL), supabase.ts
│       ├── hooks/         → useAuth, hooks customizados
│       ├── styles/        → globals.css (Tailwind + tema)
│       ├── App.tsx        → Rotas
│       └── main.tsx       → Entry point
└── backend\
    └── app\
        ├── main.py        → FastAPI app + CORS
        ├── config.py      → Settings via pydantic-settings (.env)
        ├── auth/          → deps.py (JWT validation)
        ├── routers/       → financeiro.py, estoque.py
        ├── models/        → Pydantic schemas (request/response)
        ├── services/      → Lógica de negócio
        └── db/            → supabase.py (client com service role)
```

## Como rodar

### Frontend
```bash
cd C:\Horus\frontend
npm install
npm run dev         # → http://localhost:5173
```

### Backend
```bash
cd C:\Horus\backend
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload   # → http://localhost:8000
```

### Variáveis de ambiente

**frontend/.env**
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=http://localhost:8000
```

**backend/.env**
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJ... (anon)
SUPABASE_SERVICE_ROLE_KEY=eyJ... (service role)
JWT_SECRET=your-jwt-secret
FRONTEND_URL=http://localhost:5173
```

## Fluxo de dados

```
Browser (React SPA)
    │
    ├── Supabase JS SDK (auth, queries simples via anon key + RLS)
    │
    └── fetch → FastAPI (lógica complexa, relatórios, validações)
                    │
                    └── Supabase (service role key, sem RLS)
```

## Deploy (futuro)

| Serviço | Plataforma sugerida |
|---------|-------------------|
| Frontend | Vercel |
| Backend | Railway ou Render |
| Banco | Supabase (já cloud) |

## Tema / Design tokens

| Token | Valor | Uso |
|-------|-------|-----|
| --color-bg | #0A0A0A | Fundo principal |
| --color-surface | #131312 | Cards, sidebar |
| --color-gold | #C9A84C | Destaque, ações primárias |
| --color-text | #F1EDE2 | Texto principal |
| --color-muted | #7C766A | Texto secundário |
| --color-up | #8FBE96 | Entradas, positivo |
| --color-down | #D08C7A | Saídas, negativo |
| --font-sans | Inter | Corpo |
| --font-serif | Cormorant Garamond | Títulos, wordmark |
| --font-mono | JetBrains Mono | Dados, tags, mono |
