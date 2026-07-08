from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import admin, financeiro, estoque

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


@app.get('/api/health')
def health():
    return {'status': 'ok'}
