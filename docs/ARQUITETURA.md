# Arquitetura — Horus Parfum Control

## Stack

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Frontend | React + Vite + TypeScript | React 19, Vite 8 |
| Estilo | Tailwind CSS 4 | @tailwindcss/vite |
| 3D/Visual | Three.js | 0.184 |
| Gráficos | Recharts | — |
| Roteamento | React Router | v7 |
| Data fetching | TanStack Query + Supabase JS | — |
| Imagem | react-easy-crop | — |
| Testes | Vitest + Testing Library | — |
| Backend | FastAPI (Python) | Python 3.14 |
| Banco | PostgreSQL | Supabase (cloud) |
| Auth | Supabase Auth | JWT |

## Estrutura de pastas

```
C:\Horus\
├── docs\                  → Documentação
├── frontend\
│   ├── public\images\     → Logo SVG, assets estáticos
│   └── src\
│       ├── components/
│       │   ├── layout/    → Layout.tsx (sidebar + header + outlet)
│       │   └── shared/    → Icon, Mark, Modal, FormControls, AnimatedButton,
│       │                  → DayNightSwitch, UserMenu, ImageCropper,
│       │                  → ProductDetailsModal, ColorBends, ModelViewer
│       ├── contexts/      → AuthContext.tsx, ThemeContext.tsx
│       ├── pages/
│       │   ├── auth/      → Login.tsx
│       │   ├── home/      → Home.tsx
│       │   ├── financeiro/→ Dashboard, Transacoes, Contas, Relatorios, Metas
│       │   └── estoque/   → Produtos, Movimentacoes, Categorias,
│       │                  → Fornecedores, Alertas, Relatorios
│       ├── lib/           → utils.ts, supabase.ts
│       ├── hooks/         → Custom hooks
│       ├── test/          → setup.ts
│       ├── __tests__/     → Test files
│       ├── styles/        → globals.css (Tailwind + tema dark/light)
│       ├── App.tsx        → Rotas
│       └── main.tsx       → Entry point (ThemeProvider + AuthProvider +
│                            QueryClient + Router)
└── backend\
    └── app\
        ├── main.py        → FastAPI app + CORS
        ├── config.py      → Settings via pydantic-settings
        ├── auth/          → deps.py (JWT validation)
        ├── routers/       → financeiro.py, estoque.py
        ├── models/        → Pydantic schemas
        ├── services/      → Lógica de negócio
        └── db/            → supabase.py (service role client)
```

## Como rodar

### Frontend
```bash
cd C:\Horus\frontend
npm install
npm run dev         # → http://localhost:5173
npm test            # → roda os testes em watch mode
npm run test:run    # → roda os testes uma vez
```

### Backend
```bash
cd C:\Horus\backend
pip install fastapi "uvicorn[standard]" pydantic pydantic-settings "python-jose[cryptography]" httpx
pip install supabase --no-deps
pip install postgrest storage3 gotrue --no-deps
uvicorn app.main:app --reload   # → http://localhost:8000
```

> Nota: `pip install -r requirements.txt` falha no Windows por causa do `pyiceberg`. Use os comandos acima.

## Variáveis de ambiente

**frontend/.env**
```
VITE_SUPABASE_URL=https://wyobbztexoofhqdttxzq.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
VITE_API_URL=http://localhost:8000
```

**backend/.env**
```
SUPABASE_URL=https://wyobbztexoofhqdttxzq.supabase.co
SUPABASE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
JWT_SECRET=<copiar de Supabase > Settings > API > JWT Secret>
FRONTEND_URL=http://localhost:5173
```

## Fluxo de dados

```
Browser (React SPA)
    │
    ├── Supabase JS SDK (auth + CRUDs via anon key + RLS)
    │
    └── fetch → FastAPI (lógica complexa, relatórios, validações)
                    │
                    └── Supabase (service role key, sem RLS)
```

## Autenticação

- Login via Supabase Auth (email + senha)
- Frontend gerencia sessão via `AuthContext` (onAuthStateChange)
- Token JWT é automaticamente incluído pelo Supabase JS SDK
- RLS no banco exige role `authenticated` para todas as operações
- Backend valida JWT via `python-jose` (para endpoints que passam pelo backend)
- ThemeContext gerencia dark/light mode com persistência em localStorage

## Rotas

| Rota | Componente | Layout |
|------|-----------|--------|
| /login | Login | Sem layout (tela cheia) |
| / | Home | Sem layout (tela cheia, protegida) |
| /financeiro/* | Páginas financeiro | Layout com sidebar |
| /estoque/* | Páginas estoque | Layout com sidebar |

## Temas (dark + light)

- Variáveis CSS no `@theme` em `globals.css` (escuro por padrão)
- `:root.light` sobrescreve com cores claras
- ThemeContext aplica classe `.light` no `<html>` e persiste em `localStorage`
- DayNightSwitch (sol/lua) no header alterna entre os temas
- Transição suave de 0.2s em cores

## Deploy (futuro)

| Serviço | Plataforma sugerida |
|---------|-------------------|
| Frontend | Vercel |
| Backend | Railway ou Render |
| Banco | Supabase (já cloud) |

## Design tokens

### Dark mode (padrão)
| Token | Valor | Uso |
|-------|-------|-----|
| --color-bg | #1A1A19 | Fundo principal |
| --color-surface | #1F1F1D | Cards, sidebar |
| --color-surface-2 | #1A1A18 | Cards elevados, formulários |
| --color-raise | #201F1C | Inputs |
| --color-line | rgba(231, 225, 208, 0.09) | Bordas sutis |
| --color-line-2 | rgba(231, 225, 208, 0.15) | Bordas médias |
| --color-gold | #C9A84C | Destaque, ações primárias |
| --color-text | #F1EDE2 | Texto principal |
| --color-text-2 | #B7B1A2 | Texto secundário |
| --color-muted | #7C766A | Texto terciário |
| --color-faint | #534E45 | Texto muito sutil |
| --color-up | #8FBE96 | Entradas, positivo |
| --color-down | #D08C7A | Saídas, negativo |
| --color-warn | #D9BE6A | Alertas |

### Light mode (`.light`)
| Token | Valor |
|-------|-------|
| --color-bg | #F5F1E8 (off-white com tom dourado) |
| --color-surface | #FFFFFF (cards/sidebar brancos) |
| --color-text | #1A1407 (preto profundo) |
| --color-gold | #B08D2E (dourado mais escuro para contraste) |
| (demais variáveis análogas invertidas) |

### Fontes
| Token | Família |
|-------|--------|
| --font-sans | Inter |
| --font-serif | Cormorant Garamond |
| --font-mono | JetBrains Mono |
