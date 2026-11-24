# [CLAUDE-CODE-AUDIT]
# ID                 : 20261124-104730-3c28
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Shopify: rotas shopify.py
# Assunto            : Rotas de conexao, variantes, vinculos e webhook de pedidos da Shopify
# Origem             : solicitacao do usuario
# Motivo             : Webhook, vincular e publicar passam a enfileirar e drenar a fila em vez de sincronizar direto (revisao final)
# Criado em          : 2026-11-18 16:33:26
# Ultima modificacao : 2026-11-24 10:47:30
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import json
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.auth.deps import get_current_user
from app.config import settings
from app.db.supabase import get_supabase
from app.services.canais.estoque import drenar_fila, enfileirar
from app.services.canais.pedidos import ingerir, normalizar_webhook
from app.services.shopify.publicar import OPCAO, PRODUCT_SET, montar_produto
from app.services.shopify.cliente import (
    ShopifyCliente, ShopifyDesconectado, ShopifyErro, obter_token, verificar_hmac,
)

router = APIRouter()
log = logging.getLogger(__name__)
CANAL = 'shopify'
TOPICOS = ('ORDERS_CREATE', 'ORDERS_UPDATED')

LOCATIONS = '{ locations(first: 1) { nodes { id } } }'
WEBHOOK = '''
mutation($topic: WebhookSubscriptionTopic!, $uri: String!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: {uri: $uri, format: JSON}) {
    webhookSubscription { id }
    userErrors { field message }
  }
}'''
PRODUTOS = '''
query($cursor: String) {
  products(first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      legacyResourceId title
      variants(first: 100) { nodes { legacyResourceId title sku inventoryItem { id } } }
    }
  }
}'''


def obter_db():
    return get_supabase()


def obter_http():
    with httpx.Client(timeout=20) as http:
        yield http


def obter_cliente(db=Depends(obter_db), http: httpx.Client = Depends(obter_http)) -> ShopifyCliente:
    return ShopifyCliente(http=http, db=db)


async def shopify_desconectada(request: Request, exc: ShopifyDesconectado):
    return JSONResponse(status_code=409, content={'detail': 'Shopify não conectada'})


async def shopify_erro(request: Request, exc: ShopifyErro):
    return JSONResponse(status_code=502, content={'detail': exc.mensagem})


def _conexao(db) -> dict | None:
    dados = db.table('shopify_conexao').select('*').eq('id', 1).execute().data
    return dados[0] if dados else None


def conectado_em(db) -> datetime | None:
    linha = _conexao(db)
    if not linha or not linha.get('conectado_em'):
        return None
    valor = datetime.fromisoformat(str(linha['conectado_em']))
    return valor if valor.tzinfo else valor.replace(tzinfo=timezone.utc)


# --- conexão ------------------------------------------------------------------

@router.get('/conexao')
def conexao(user: dict = Depends(get_current_user), db=Depends(obter_db)):
    # Só o corte: token e location ficam no backend.
    linha = _conexao(db)
    em = linha.get('conectado_em') if linha else None
    return {'conectado': bool(em), 'loja': settings.shopify_loja or None, 'conectado_em': em}


@router.post('/conectar')
def conectar(request: Request, user: dict = Depends(get_current_user), db=Depends(obter_db),
             http: httpx.Client = Depends(obter_http)):
    if not (settings.shopify_loja and settings.shopify_client_id and settings.shopify_client_secret):
        raise HTTPException(status_code=503, detail='Shopify não configurada')
    token = obter_token(http)
    agora = datetime.now(timezone.utc)
    expira = agora.timestamp() + int(token.get('expires_in') or 0)
    # upsert só com o token: conectado_em e location_id de antes ficam
    db.table('shopify_conexao').upsert({
        'id': 1, 'access_token': token['access_token'],
        'expires_at': datetime.fromtimestamp(expira, timezone.utc).isoformat(),
        'updated_at': agora.isoformat(),
    }, on_conflict='id').execute()

    cliente = ShopifyCliente(http=http, db=db)
    locais = cliente.graphql(LOCATIONS)['locations']['nodes']
    if not locais:
        raise ShopifyErro('loja sem localização')
    # Vercel fica atrás de proxy: o host vale, o esquema não.
    uri = f'https://{request.url.hostname}/api/shopify/webhooks/pedidos'
    for topico in TOPICOS:
        try:
            cliente.graphql(WEBHOOK, {'topic': topico, 'uri': uri})
        except ShopifyErro as e:
            if 'already been taken' not in e.mensagem.lower():
                raise

    novos = {'location_id': locais[0]['id']}
    if not (_conexao(db) or {}).get('conectado_em'):
        novos['conectado_em'] = agora.isoformat()  # reconectar não muda o corte
    db.table('shopify_conexao').update(novos).eq('id', 1).execute()
    return conexao(user, db)


# --- vínculos -----------------------------------------------------------------

@router.get('/variantes')
def variantes(cursor: str | None = None, user: dict = Depends(get_current_user), db=Depends(obter_db),
              cliente: ShopifyCliente = Depends(obter_cliente)):
    # ponytail: 100 variantes por produto; paginar variants se algum produto passar disso
    produtos = cliente.graphql(PRODUTOS, {'cursor': cursor})['products']
    itens = [
        {
            'produto_id_ext': p['legacyResourceId'], 'produto_titulo': p['title'],
            'variante_id': v['legacyResourceId'], 'variante_titulo': v['title'], 'sku': v.get('sku'),
            'estoque_id': (v.get('inventoryItem') or {}).get('id'),
        }
        for p in produtos['nodes'] for v in p['variants']['nodes']
    ]
    ids = [i['variante_id'] for i in itens]
    vinculos = {
        r['externo_variante_id']: {'produto_id': r['produto_id'], 'tipo': r['tipo'], 'ml': r['ml']}
        for r in (db.table('canal_vinculos').select('externo_variante_id, produto_id, tipo, ml')
                  .eq('canal', CANAL).in_('externo_variante_id', ids).execute().data if ids else [])
    }
    for i in itens:
        i['vinculo'] = vinculos.get(i['variante_id'])
    info = produtos['pageInfo']
    return {'itens': itens, 'proximo': info['endCursor'] if info['hasNextPage'] else None}


class VinculoIn(BaseModel):
    variante_id: str
    produto_ext_id: str | None = None
    estoque_id: str
    titulo: str | None = None
    produto_id: UUID
    tipo: Literal['frasco', 'decant']
    ml: Decimal | None = None


@router.post('/vinculos')
def vincular(body: VinculoIn, user: dict = Depends(get_current_user), db=Depends(obter_db),
             cliente: ShopifyCliente = Depends(obter_cliente)):
    decant = body.tipo == 'decant'
    if decant != bool(body.ml and body.ml > 0):
        raise HTTPException(status_code=422, detail='Decant precisa de ml maior que zero; frasco não leva ml')
    produto_id = str(body.produto_id)
    produto = db.table('produtos').select('tipo_id').eq('id', produto_id).execute().data
    if not produto:
        raise HTTPException(status_code=404, detail='Produto não encontrado')
    if decant:
        tipo = db.table('tipos_produto').select('vende_decant').eq('id', produto[0]['tipo_id']).execute().data
        if not (tipo and tipo[0].get('vende_decant')):
            raise HTTPException(status_code=422, detail='Este tipo de produto não é vendido em decant')
    db.table('canal_vinculos').upsert({
        'canal': CANAL, 'externo_variante_id': body.variante_id, 'produto_id': produto_id,
        'tipo': body.tipo, 'ml': float(body.ml) if decant else None,
        'externo_produto_id': body.produto_ext_id, 'externo_estoque_id': body.estoque_id,
        'titulo': body.titulo, 'erro': None,
    }, on_conflict='canal,externo_variante_id').execute()
    enfileirar(db, [produto_id])
    return drenar_fila(db, cliente)


@router.delete('/vinculos/{variante_id}')
def desvincular(variante_id: str, user: dict = Depends(get_current_user), db=Depends(obter_db)):
    db.table('canal_vinculos').delete().eq('canal', CANAL).eq('externo_variante_id', variante_id).execute()
    return {}


# --- webhook (público: a proteção é o HMAC) -----------------------------------

def _receber(db, cliente: ShopifyCliente, pedido: dict) -> None:
    ids = ingerir(db, CANAL, normalizar_webhook(pedido), conectado_em(db))  # RuntimeError → 500, a Shopify reenvia
    if not ids:
        return
    enfileirar(db, ids)  # se o envio falhar, o produto fica na fila
    try:
        drenar_fila(db, cliente)
    except Exception:
        log.exception('Sincronização após webhook falhou; produtos ficam na fila')


@router.post('/webhooks/pedidos')
async def webhook_pedidos(request: Request, db=Depends(obter_db), cliente: ShopifyCliente = Depends(obter_cliente)):
    corpo = await request.body()
    if not verificar_hmac(corpo, request.headers.get('X-Shopify-Hmac-Sha256')):
        raise HTTPException(status_code=401, detail='Assinatura inválida')
    await run_in_threadpool(_receber, db, cliente, json.loads(corpo))
    return {}


# --- publicar produto ---------------------------------------------------------

class VarianteIn(BaseModel):
    tipo: Literal['frasco', 'decant']
    ml: Decimal | None = None
    preco: Decimal


class ProdutoIn(BaseModel):
    produto_id: UUID
    titulo: str
    descricao: str = ''
    fotos: list[str] = []
    variantes: list[VarianteIn]


@router.post('/produtos')
def publicar(body: ProdutoIn, user: dict = Depends(get_current_user), db=Depends(obter_db),
             cliente: ShopifyCliente = Depends(obter_cliente)):
    produto_id = str(body.produto_id)
    produto = db.table('produtos').select('tipo_id, volume_ml').eq('id', produto_id).execute().data
    if not produto:
        raise HTTPException(status_code=404, detail='Produto não encontrado')
    if db.table('canal_vinculos').select('id').eq('canal', CANAL).eq('produto_id', produto_id).execute().data:
        raise HTTPException(status_code=409, detail='Produto já está na Shopify: use Ligar produtos')
    tipo = db.table('tipos_produto').select('nome, vende_decant').eq('id', produto[0]['tipo_id']).execute().data
    tipo = tipo[0] if tipo else {}
    if not body.titulo.strip():
        raise HTTPException(status_code=422, detail='Informe o título')
    if not body.variantes:
        raise HTTPException(status_code=422, detail='Informe ao menos uma variante')
    for v in body.variantes:
        if v.preco <= 0:
            raise HTTPException(status_code=422, detail='Preço deve ser maior que zero')
        if (v.tipo == 'decant') != bool(v.ml and v.ml > 0):
            raise HTTPException(status_code=422, detail='Decant precisa de ml maior que zero; frasco não leva ml')
        if v.tipo == 'decant' and not tipo.get('vende_decant'):
            raise HTTPException(status_code=422, detail='Este tipo de produto não é vendido em decant')
        if v.tipo == 'frasco' and not produto[0].get('volume_ml'):
            raise HTTPException(status_code=422, detail='Produto sem volume (ml) para o frasco')
    dados = {
        'titulo': body.titulo, 'descricao': body.descricao, 'fotos': body.fotos,
        'tipo_produto': tipo.get('nome'), 'volume_ml': produto[0].get('volume_ml'),
        'variantes': [{'tipo': v.tipo, 'ml': v.ml, 'preco': v.preco} for v in body.variantes],
    }
    entrada = montar_produto(dados, cliente.location_id)
    rotulos = [x['optionValues'][0]['name'] for x in entrada['variants']]
    if len(set(rotulos)) != len(rotulos):
        raise HTTPException(status_code=422, detail='Variantes repetidas')
    try:
        criado = cliente.graphql(PRODUCT_SET, {'input': entrada})['productSet']['product']
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail='Falha de rede: confira na Shopify antes de tentar de novo') from None

    por_rotulo = {}
    for n in criado['variants']['nodes']:
        for o in n.get('selectedOptions') or []:
            if o['name'] == OPCAO:
                por_rotulo[o['value']] = n
    linhas = []
    for v, rotulo in zip(body.variantes, rotulos):
        n = por_rotulo.get(rotulo)
        if not n:
            raise ShopifyErro(f'variante "{rotulo}" não voltou na resposta; confira na Shopify')
        linhas.append({
            'canal': CANAL, 'externo_variante_id': n['legacyResourceId'], 'produto_id': produto_id,
            'tipo': v.tipo, 'ml': float(v.ml) if v.tipo == 'decant' else None,
            'externo_produto_id': criado['legacyResourceId'], 'externo_estoque_id': n['inventoryItem']['id'],
            'titulo': rotulo, 'erro': None,
        })
    try:
        db.table('canal_vinculos').upsert(linhas, on_conflict='canal,externo_variante_id').execute()
        enfileirar(db, [produto_id])
    except Exception:
        log.exception('Produto criado na Shopify, mas os vínculos não foram salvos')
        raise HTTPException(
            status_code=502, detail='Produto criado na Shopify, mas não foi ligado: use Ligar produtos') from None
    try:
        drenar_fila(db, cliente)
    except Exception:
        log.exception('Sincronização após publicar falhou; produto fica na fila')
    return {'produto_ext_id': criado['legacyResourceId'], 'variantes': len(linhas)}
