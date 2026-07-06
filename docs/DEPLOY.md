# 🚀 Deploy e Infraestrutura

> Detalhes sobre o deploy em produção e a infraestrutura de banco de dados e hospedagem do **Horus Parfum Control**.

---

## 📋 Visão Geral da Infraestrutura

O projeto adota uma arquitetura Serverless e Cloud, hospedado inteiramente na **Vercel** e integrado ao **Supabase**.

| Módulo | Tecnologia | Ambiente de Hospedagem | URL de Produção |
|---|---|---|---|
| **Frontend** | React 19 + Vite 8 | Vercel (Frontend Hosting) | `https://horusparfum-control.vercel.app` |
| **Backend** | FastAPI (Python 3.14) | Vercel (Serverless Functions) | `https://horusparfum-control-api.vercel.app` |
| **Banco de Dados** | PostgreSQL | Supabase Cloud | *Gerenciado via console do Supabase* |
| **Autenticação** | Supabase Auth (GoTrue) | Supabase Cloud | *Integrado ao frontend/backend* |
| **Storage (Arquivos)** | Supabase Storage | Supabase Cloud (S3) | *Bucket `produtos`* |

---

## 💻 Desenvolvimento Local

Para rodar e testar o projeto localmente:

### Pré-requisitos
- Node.js (v18 ou superior)
- Python (3.11 ou superior)
- Pip e venv (ambiente virtual)

### Frontend (Local)
```bash
cd frontend
npm install
npm run dev
```
O servidor de desenvolvimento frontend estará disponível em `http://localhost:5173`.

### Backend (Local)
1. Crie e ative o ambiente virtual:
   ```bash
   cd backend
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # Linux/macOS:
   source .venv/bin/activate
   ```
2. Instale as dependências:
   ```bash
   pip install -r requirements.txt
   ```
   > [!NOTE]
   > Em alguns ambientes Windows, a biblioteca `pyiceberg` dentro de requirements.txt pode apresentar problemas de instalação. Se falhar, instale as dependências necessárias manualmente:
   > `pip install fastapi uvicorn supabase pydantic pydantic-settings httpx pypdf python-multipart`

3. Inicie o servidor:
   ```bash
   uvicorn app.main:app --reload
   ```
O backend estará disponível em `http://localhost:8000`.

---

## 🎨 Deploy do Frontend (Vercel)

O deploy do frontend é gerenciado automaticamente pela integração git da Vercel ao repositório GitHub.

- **Comando de Build:** `npm run build`
- **Diretório de Output:** `dist/`
- **Variáveis de Ambiente Necessárias:**
  - `VITE_SUPABASE_URL`: URL do projeto do Supabase (ex: `https://wyobbztexoofhqdttxzq.supabase.co`)
  - `VITE_SUPABASE_ANON_KEY`: Chave anônima pública do Supabase (segura para o client-side)
  - `VITE_API_URL`: URL de produção do backend (ex: `https://horusparfum-control-api.vercel.app`)

---

## ⚙️ Deploy do Backend (Vercel Serverless)

O backend Python é implantado na Vercel usando o runtime de Serverless Functions da Vercel. A configuração está definida no arquivo `vercel.json` na raiz do projeto ou na pasta `backend/`.

### Configuração `vercel.json`
```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "backend/main.py" },
    { "source": "/(.*)", "destination": "frontend/dist/$1" }
  ]
}
```
Isso redireciona todas as chamadas iniciadas com `/api/` para o arquivo `main.py` do backend Python, e o restante para o build do frontend React.

### Variáveis de Ambiente Necessárias (Backend)
Configuradas no painel da Vercel:
- `supabase_url`: URL do projeto do Supabase.
- `supabase_key`: Chave anônima do Supabase.
- `supabase_service_role_key`: **Chave de serviço superprivada (Service Role Key)**.
  > [!CAUTION]
  > A `supabase_service_role_key` dá bypass total nas regras de RLS (Row Level Security). Ela **nunca** deve ser exposta no frontend e deve ser mantida estritamente como segredo no backend.
- `frontend_url`: URL do frontend autorizada para CORS (ex: `https://horusparfum-control.vercel.app` ou `http://localhost:5173` em dev).

---

## 🗄️ Banco de Dados (Supabase)

### Projeto
- **Project ID:** `wyobbztexoofhqdttxzq`
- **Hospedagem:** Supabase Cloud AWS

### Tabelas e Migrações
A estrutura do banco é documentada em [[BANCO]]. As migrações estão localizadas em `supabase/migrations/` e são aplicadas na ordem de data de criação.

Em produção, novas migrações e RPCs são aplicadas diretamente pelo editor SQL ou através do CLI do Supabase.

### Storage
Existe um bucket de armazenamento configurado para guardar as imagens de produtos:
- **Nome do Bucket:** `produtos`
- **Acesso:** Público para leitura, escrita permitida apenas para usuários autenticados.

### Políticas de Segurança (RLS)
Todas as tabelas possuem Row Level Security (RLS) habilitadas. A política padrão garante acesso total de leitura e escrita para qualquer usuário devidamente autenticado:
```sql
ALTER TABLE tabela ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total para autenticados" ON tabela TO authenticated USING (true) WITH CHECK (true);
```

---

## 🔗 Documentos Relacionados
- [[ARQUITETURA]] — Detalhes da arquitetura de software e stack técnica.
- [[BANCO]] — Estrutura de dados e schema do banco de dados.
- [[API]] — Especificação dos endpoints e comunicação frontend-backend.
- [[features/AUTENTICACAO]] — Fluxo de segurança e autenticação Supabase Auth.
