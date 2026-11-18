# [CLAUDE-CODE-AUDIT]
# ID                 : 20261118-163444-3a12
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : main.py
# Assunto            : 
# Origem             : solicitacao do usuario
# Motivo             : Registrar as rotas /api/shopify e /api/canais e os erros da Shopify (409/502)
# Ultima modificacao : 2026-11-18 16:34:44
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import admin, anuncios, canais, financeiro, estoque, mercadolivre, shopify
from app.services.mercadolivre import MLDesconectado, MLErro
from app.services.shopify.cliente import ShopifyDesconectado, ShopifyErro

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
app.include_router(shopify.router, prefix='/api/shopify', tags=['shopify'])
app.include_router(canais.router, prefix='/api/canais', tags=['canais'])
app.add_exception_handler(ShopifyDesconectado, shopify.shopify_desconectada)
app.add_exception_handler(ShopifyErro, shopify.shopify_erro)


@app.get('/api/health')
def health():
    return {'status': 'ok'}
