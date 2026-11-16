# [CLAUDE-CODE-AUDIT]
# ID                 : 20261116-162842-bc79
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Anuncios: mercadolivre.py
# Assunto            : Modulo/teste do backend do modulo Anuncios (Mercado Livre) do Horus Parfum Control
# Origem             : solicitacao do usuario
# Motivo             : Implementar a Parte 2 do plano de Anuncios pedida pelo Luis
# Criado em          : 2026-11-16 14:51:14
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import logging
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse

from app.auth.deps import get_current_user
from app.config import settings
from app.db.supabase import get_supabase
from app.services.mercadolivre.conexao import (
    assinar_state,
    trocar_codigo,
    url_autorizacao,
    validar_state,
)

router = APIRouter()
log = logging.getLogger(__name__)


@router.get('/conexao')
def conexao(user: dict = Depends(get_current_user)):
    # Só colunas públicas: os tokens nunca saem do backend.
    dados = get_supabase().table('ml_conexao').select('nickname, user_product').eq('id', 1).execute().data
    linha = dados[0] if dados else None
    return {
        'conectado': linha is not None,
        'nickname': linha.get('nickname') if linha else None,
        'user_product': bool(linha.get('user_product')) if linha else False,
    }


@router.get('/conectar')
def conectar(user: dict = Depends(get_current_user)):
    if not (settings.ml_client_id and settings.ml_client_secret and settings.ml_redirect_uri):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail='Mercado Livre não configurado')
    return {'url': url_autorizacao(assinar_state(user['sub'], int(time.time())))}


@router.get('/callback')
def callback(code: str = '', state: str = ''):
    # Público: o ML redireciona o navegador para cá. A proteção é o state assinado.
    destino = f'{settings.frontend_url}/anuncios/config?ml='
    if not code or not validar_state(state, int(time.time())):
        return RedirectResponse(destino + 'erro', status_code=302)
    try:
        with httpx.Client(timeout=20) as http:
            trocar_codigo(code, http)
    except Exception as erro:
        log.warning('Falha ao conectar Mercado Livre: %s', type(erro).__name__)
        return RedirectResponse(destino + 'erro', status_code=302)
    return RedirectResponse(destino + 'ok', status_code=302)


@router.post('/desconectar')
def desconectar(user: dict = Depends(get_current_user)):
    get_supabase().table('ml_conexao').delete().eq('id', 1).execute()
    return {'conectado': False}
