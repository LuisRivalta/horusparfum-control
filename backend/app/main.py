# [CLAUDE-CODE-AUDIT]
# ID                 : 20261116-152623-b8fe
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : main.py
# Assunto            : 
# Origem             : solicitacao do usuario
# Motivo             : Brief da Task 7 pede registrar o router /api/anuncios e mapear erros do ML para 409/502.
# Ultima modificacao : 2026-11-16 15:26:23
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import admin, anuncios, financeiro, estoque, mercadolivre
from app.services.mercadolivre import MLDesconectado, MLErro

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
app.include_router(anuncios.router, prefix='/api/anuncios', tags=['anuncios'])
app.add_exception_handler(MLDesconectado, anuncios.ml_desconectado)
app.add_exception_handler(MLErro, anuncios.ml_erro)


@app.get('/api/health')
def health():
    return {'status': 'ok'}
