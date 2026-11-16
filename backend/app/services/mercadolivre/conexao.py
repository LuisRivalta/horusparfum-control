# [CLAUDE-CODE-AUDIT]
# ID                 : 20261116-162845-fa7c
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Anuncios: conexao.py
# Assunto            : Modulo/teste do backend do modulo Anuncios (Mercado Livre) do Horus Parfum Control
# Origem             : solicitacao do usuario
# Motivo             : Implementar a Parte 2 do plano de Anuncios pedida pelo Luis
# Criado em          : 2026-11-16 14:50:57
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx

from app.config import settings
from app.db.supabase import get_supabase

API = 'https://api.mercadolibre.com'
AUTH_URL = 'https://auth.mercadolivre.com.br/authorization'
STATE_VALIDADE = 600  # segundos


class MLErro(Exception):
    def __init__(self, status: int, mensagem: str, corpo=None):
        super().__init__(f'ML {status}: {mensagem}')
        self.status = status
        self.mensagem = mensagem
        self.corpo = corpo


class MLDesconectado(Exception):
    pass


def checar(resp: httpx.Response) -> dict:
    """Devolve o JSON da resposta ou lança MLErro com a mensagem do ML."""
    try:
        corpo = resp.json() if resp.content else {}
    except ValueError:
        corpo = {}
    if resp.status_code < 400:
        return corpo
    if not isinstance(corpo, dict):
        corpo = {}
    causas = [c.get('message') for c in corpo.get('cause') or [] if isinstance(c, dict) and c.get('message')]
    mensagem = '; '.join(causas) or corpo.get('message') or corpo.get('error') or f'HTTP {resp.status_code}'
    raise MLErro(resp.status_code, mensagem, corpo)


def _assinatura(texto: str) -> str:
    return hmac.new(settings.ml_client_secret.encode(), texto.encode(), hashlib.sha256).hexdigest()


def assinar_state(user_sub: str, agora: int) -> str:
    if not settings.ml_client_secret:
        raise RuntimeError('ML_CLIENT_SECRET não configurado')
    texto = f'{user_sub}.{agora}'
    return f'{texto}.{_assinatura(texto)}'


def validar_state(state: str, agora: int) -> bool:
    if not settings.ml_client_secret or not state:
        return False
    partes = state.rsplit('.', 2)
    if len(partes) != 3:
        return False
    user_sub, ts, assinatura = partes
    if not hmac.compare_digest(assinatura, _assinatura(f'{user_sub}.{ts}')):
        return False
    try:
        idade = agora - int(ts)
    except ValueError:
        return False
    return 0 <= idade <= STATE_VALIDADE


def url_autorizacao(state: str) -> str:
    return AUTH_URL + '?' + urlencode({
        'response_type': 'code',
        'client_id': settings.ml_client_id,
        'redirect_uri': settings.ml_redirect_uri,
        'state': state,
    })


def pedir_token(dados: dict, http: httpx.Client) -> dict:
    form = {'client_id': settings.ml_client_id, 'client_secret': settings.ml_client_secret, **dados}
    return checar(http.post(f'{API}/oauth/token', data=form, headers={'Accept': 'application/json'}))


def campos_token(token: dict) -> dict:
    expira = datetime.now(timezone.utc) + timedelta(seconds=int(token.get('expires_in') or 0))
    return {
        'access_token': token['access_token'],
        'refresh_token': token['refresh_token'],
        'expires_at': expira.isoformat(),
    }


def trocar_codigo(code: str, http: httpx.Client, db=None) -> dict:
    token = pedir_token({
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': settings.ml_redirect_uri,
    }, http)
    me = checar(http.get(f'{API}/users/me', headers={'Authorization': f"Bearer {token['access_token']}"}))
    publico = {
        'ml_user_id': me.get('id'),
        'nickname': me.get('nickname'),
        'user_product': 'user_product_seller' in (me.get('tags') or []),
    }
    linha = {
        'id': 1,
        **campos_token(token),
        **publico,
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }
    (db or get_supabase()).table('ml_conexao').upsert(linha).execute()
    return publico
