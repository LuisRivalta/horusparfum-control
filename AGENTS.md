# AGENTS.md

## AI Agent Workflow

Ao iniciar uma sessão neste projeto:
1. **Leia `docs/HANDOFF_IA.md`** para saber o estado atual e próximos passos
2. **Consulte `docs/PRD.md`** para regras de negócio
3. **Use `docs/ARQUITETURA.md`** para navegação de código
4. **Ao finalizar:** atualize `docs/HANDOFF_IA.md` e adicione entrada em `docs/LOGS.md`

## Comandos

```bash
# Frontend
cd frontend
npm install
npm run dev           # dev server → http://localhost:5173
npm run build         # production build

# Backend
cd backend
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload   # → http://localhost:8000
```

## Arquitetura resumida

- **Frontend:** React + Vite + TypeScript + Tailwind CSS (SPA)
- **Backend:** FastAPI (Python)
- **Banco:** PostgreSQL via Supabase
- **Auth:** Supabase Auth (JWT validado no backend)

Frontend chama backend via REST (`VITE_API_URL`). Backend acessa Supabase com service role key.

## Convenções

- TypeScript no frontend, Python no backend
- Componentes em PascalCase, arquivos em PascalCase (ex: `Dashboard.tsx`)
- Endpoints REST em snake_case (ex: `/api/financeiro/transacoes`)
- Formatação monetária: sempre `formatBRL()` de `src/lib/utils.ts`
- Cores via CSS variables do Tailwind (definidas em `src/styles/globals.css`)
- Imports com alias `@/` apontando para `src/`

## Documentação

Toda documentação contextual vive em `docs/`:
- `00-INDEX.md` — índice geral
- `PRD.md` — produto e regras de negócio
- `ARQUITETURA.md` — stack, pastas, como rodar
- `BANCO.md` — schema do banco de dados
- `HANDOFF_IA.md` — estado atual e próximos passos
- `LOGS.md` — histórico de sessões
