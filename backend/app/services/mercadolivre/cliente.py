# [CLAUDE-CODE-AUDIT]
# ID                 : 20261116-145141-3b12
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Cliente API Mercado Livre
# Assunto            : Chamadas autenticadas ao ML com renovacao do token
# Origem             : solicitacao do usuario
# Motivo             : Brief da Task 2 do plano de Anuncios pede a conexao do backend com o Mercado Livre.
# Criado em          : 2026-11-16 14:51:06
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
from datetime import datetime, timedelta, timezone

import httpx

from app.db.supabase import get_supabase
from app.services.mercadolivre.conexao import (
    API,
    MLDesconectado,
    MLErro,
    campos_token,
    checar,
    pedir_token,
)

MARGEM_RENOVACAO = timedelta(minutes=5)


def _vencendo(linha: dict) -> bool:
    try:
        expira = datetime.fromisoformat(str(linha.get('expires_at')))
    except ValueError:
        return True
    if expira.tzinfo is None:
        expira = expira.replace(tzinfo=timezone.utc)
    return expira < datetime.now(timezone.utc) + MARGEM_RENOVACAO


class MLCliente:
    """Chamadas autenticadas à API do ML, com renovação do token salvo em ml_conexao."""

    def __init__(self, http: httpx.Client | None = None, db=None):
        self.http = http or httpx.Client(timeout=20)
        self.db = db or get_supabase()
        self._linha = None

    def _ler(self) -> dict | None:
        dados = self.db.table('ml_conexao').select('*').eq('id', 1).execute().data
        return dados[0] if dados else None

    def _conexao(self) -> dict:
        if self._linha is None:
            self._linha = self._ler()
        if not self._linha or not self._linha.get('refresh_token'):
            raise MLDesconectado()
        if _vencendo(self._linha):
            self._renovar()
        return self._linha

    def _renovar(self) -> None:
        antigo = self._linha['refresh_token']
        try:
            token = pedir_token({'grant_type': 'refresh_token', 'refresh_token': antigo}, self.http)
        except MLErro as erro:
            # Outro processo pode ter usado o refresh (é de uso único) e salvo um novo.
            relida = self._ler()
            if relida and relida.get('refresh_token') and relida['refresh_token'] != antigo:
                self._linha = relida
                return
            if erro.status in (400, 401) or (erro.corpo or {}).get('error') == 'invalid_grant':
                raise MLDesconectado() from None
            raise

        novos = {**campos_token(token), 'updated_at': datetime.now(timezone.utc).isoformat()}
        resultado = (
            self.db.table('ml_conexao').update(novos)
            .eq('id', 1).eq('refresh_token', antigo).execute()
        )
        if resultado.data:
            self._linha = {**self._linha, **novos}
            return
        # 0 linhas: outro processo já renovou (ou desconectou) entre a leitura e o update.
        relida = self._ler()
        if not relida or not relida.get('refresh_token'):
            raise MLDesconectado()
        self._linha = relida

    def _chamar(self, metodo: str, path: str, **kwargs) -> dict:
        linha = self._conexao()
        resp = self.http.request(
            metodo,
            f'{API}{path}',
            headers={'Authorization': f"Bearer {linha['access_token']}"},
            **kwargs,
        )
        return checar(resp)

    def get(self, path: str, params=None) -> dict:
        return self._chamar('GET', path, params=params)

    def post(self, path: str, json) -> dict:
        return self._chamar('POST', path, json=json)

    def put(self, path: str, json) -> dict:
        return self._chamar('PUT', path, json=json)

    @property
    def ml_user_id(self):
        return self._conexao().get('ml_user_id')

    @property
    def user_product(self) -> bool:
        return bool(self._conexao().get('user_product'))
