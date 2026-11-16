# [CLAUDE-CODE-AUDIT]
# ID                 : 20261116-145142-eeca
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : main.py
# Assunto            : 
# Origem             : solicitacao do usuario
# Motivo             : Brief da Task 2 pede as variaveis do ML/Anthropic e o registro do router mercadolivre.
# Ultima modificacao : 2026-11-16 14:51:42
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import admin, financeiro, estoque, mercadolivre

app = FastAPI(title='Horus Parfum API', version='0.1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(financeiro.router, prefix='/api/financeiro', tags=['financeiro'])
app.include_router(estoque.router, prefix='/api/estoque', tags=['estoque'])
app.include_router(admin.router, prefix='/api/admin', tags=['admin'])
app.include_router(mercadolivre.router, prefix='/api/mercadolivre', tags=['mercadolivre'])


@app.get('/api/health')
def health():
    return {'status': 'ok'}
