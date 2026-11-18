# [CLAUDE-CODE-AUDIT]
# ID                 : 20261118-162017-8d95
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Shopify: cliente.py
# Assunto            : Cliente Admin GraphQL Shopify com token e HMAC
# Origem             : solicitacao do usuario
# Motivo             : Luis pediu a integracao Shopify dos canais
# Criado em          : 2026-11-18 16:20:04
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import base64
import hashlib
import hmac
from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings
from app.db.supabase import get_supabase

API_VERSAO = '2026-10'  # conferir a versão estável vigente
MARGEM_RENOVACAO = timedelta(minutes=5)


class ShopifyErro(Exception):
    def __init__(self, mensagem: str):
        super().__init__(f'Shopify: {mensagem}')
        self.mensagem = mensagem


class ShopifyDesconectado(Exception):
    pass


def verificar_hmac(corpo: bytes, assinatura: str | None) -> bool:
    if not settings.shopify_client_secret or not assinatura:
        return False
    esperado = base64.b64encode(
        hmac.new(settings.shopify_client_secret.encode(), corpo, hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(esperado, assinatura)


def obter_token(http: httpx.Client) -> dict:
    """Troca client_id/secret por um access_token (client_credentials). Devolve o JSON."""
    resp = http.post(
        f'https://{settings.shopify_loja}/admin/oauth/access_token',
        data={
            'client_id': settings.shopify_client_id,
            'client_secret': settings.shopify_client_secret,
            'grant_type': 'client_credentials',
        },
        headers={'Accept': 'application/json'},
    )
    if resp.status_code >= 400:
        raise ShopifyErro(f'token recusado (HTTP {resp.status_code})')
    try:
        token = resp.json()
    except ValueError:
        token = {}
    if not isinstance(token, dict) or not token.get('access_token'):
        raise ShopifyErro('resposta de token sem access_token')
    return token


def _vencendo(linha: dict) -> bool:
    try:
        expira = datetime.fromisoformat(str(linha.get('expires_at')))
    except ValueError:
        return True
    if expira.tzinfo is None:
        expira = expira.replace(tzinfo=timezone.utc)
    return expira < datetime.now(timezone.utc) + MARGEM_RENOVACAO


class ShopifyCliente:
    """Admin GraphQL autenticada, com o token salvo em shopify_conexao renovado quando vence."""

    def __init__(self, http: httpx.Client | None = None, db=None):
        self.http = http or httpx.Client(timeout=20)
        self.db = db or get_supabase()
        self._linha = None

    def _conexao(self) -> dict:
        if self._linha is None:
            dados = self.db.table('shopify_conexao').select('*').eq('id', 1).execute().data
            if not dados:
                raise ShopifyDesconectado()
            self._linha = dados[0]
        if not self._linha.get('access_token') or _vencendo(self._linha):
            self._renovar()
        return self._linha

    def _renovar(self) -> None:
        token = obter_token(self.http)
        novos = {
            'access_token': token['access_token'],
            'expires_at': (
                datetime.now(timezone.utc) + timedelta(seconds=int(token.get('expires_in') or 0))
            ).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }
        self.db.table('shopify_conexao').update(novos).eq('id', 1).execute()
        self._linha = {**self._linha, **novos}

    def graphql(self, query: str, variables: dict | None = None) -> dict:
        linha = self._conexao()
        resp = self.http.post(
            f'https://{settings.shopify_loja}/admin/api/{API_VERSAO}/graphql.json',
            headers={'X-Shopify-Access-Token': linha['access_token']},
            json={'query': query, 'variables': variables or {}},
        )
        if resp.status_code >= 400:
            raise ShopifyErro(f'HTTP {resp.status_code}')
        try:
            corpo = resp.json()
        except ValueError:
            raise ShopifyErro('resposta inválida') from None
        if corpo.get('errors'):
            erros = corpo['errors']
            if isinstance(erros, list):
                raise ShopifyErro('; '.join(str(e.get('message', e)) if isinstance(e, dict) else str(e) for e in erros))
            raise ShopifyErro(str(erros))
        data = corpo.get('data') or {}
        for valor in data.values():
            if isinstance(valor, dict) and valor.get('userErrors'):
                raise ShopifyErro('; '.join(str(e.get('message')) for e in valor['userErrors']))
        return data

    @property
    def location_id(self) -> str:
        return self._conexao().get('location_id')
