# [CLAUDE-CODE-AUDIT]
# ID                 : 20261118-163833-cfac
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Canais: rotas canais.py
# Assunto            : Rotas de conferencia de pedidos e sincronizacao de estoque dos canais
# Origem             : solicitacao do usuario
# Motivo             : Conferencia passa a reler 7 dias para nao perder pedido cujo webhook falhou (achado da revisao)
# Criado em          : 2026-11-18 16:33:36
# Ultima modificacao : 2026-11-18 16:38:33
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import hmac
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException

from app.auth.deps import get_current_user
from app.config import settings
from app.routers.shopify import CANAL, conectado_em, obter_cliente, obter_db
from app.services.canais.estoque import drenar_fila, enfileirar, sincronizar
from app.services.canais.pedidos import ingerir, normalizar_graphql
from app.services.shopify.cliente import ShopifyCliente, ShopifyDesconectado

router = APIRouter()

PEDIDOS = '''
query($q: String!, $cursor: String) {
  orders(first: 50, after: $cursor, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes {
      legacyResourceId name createdAt displayFinancialStatus cancelledAt
      customer { displayName }
      totalPriceSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      totalRefundedSet { shopMoney { amount } }
      lineItems(first: 100) {
        nodes {
          title variantTitle quantity
          variant { legacyResourceId }
          discountedUnitPriceAfterAllDiscountsSet { shopMoney { amount } }
        }
      }
    }
  }
}'''


JANELA = timedelta(days=7)  # relê a semana toda: ingerir é idempotente e webhook perdido volta


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _existentes(db, ids: list[str]) -> set[str]:
    if not ids:
        return set()
    return {r['externo_id'] for r in db.table('pedidos_canal').select('externo_id')
            .eq('canal', CANAL).in_('externo_id', ids).execute().data}


@router.post('/pedidos/conferir')
def conferir(user: dict = Depends(get_current_user), db=Depends(obter_db),
             cliente: ShopifyCliente = Depends(obter_cliente)):
    corte = conectado_em(db)
    if corte is None:
        raise ShopifyDesconectado()
    filtro = f"updated_at:>='{max(corte, _agora() - JANELA).astimezone(timezone.utc):%Y-%m-%dT%H:%M:%SZ}'"
    novos, cursor = 0, None
    while True:
        pagina = cliente.graphql(PEDIDOS, {'q': filtro, 'cursor': cursor})['orders']
        pedidos = [normalizar_graphql(n) for n in pagina['nodes']]
        ids = [p['externo_id'] for p in pedidos]
        antes = _existentes(db, ids)
        for p in pedidos:
            enfileirar(db, ingerir(db, CANAL, p, corte))
        novos += len(_existentes(db, ids) - antes)
        if not pagina['pageInfo']['hasNextPage']:
            break
        cursor = pagina['pageInfo']['endCursor']
    drenar_fila(db, cliente)
    return {'novos': novos}


@router.post('/sincronizar')
def sincronizar_tudo(user: dict = Depends(get_current_user), db=Depends(obter_db),
                     cliente: ShopifyCliente = Depends(obter_cliente)):
    return sincronizar(db, cliente, None)


@router.post('/sync')
def sync(x_horus_sync: str = Header(default=''), db=Depends(obter_db),
         cliente: ShopifyCliente = Depends(obter_cliente)):
    # Público (chamado pelo gatilho do banco): a proteção é o segredo compartilhado.
    segredo = settings.horus_sync_secret
    if not segredo or not hmac.compare_digest(x_horus_sync.encode(), segredo.encode()):
        raise HTTPException(status_code=401, detail='Não autorizado')
    return drenar_fila(db, cliente)
