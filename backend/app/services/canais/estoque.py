# [CLAUDE-CODE-AUDIT]
# ID                 : 20261118-162907-45ef
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Canais: estoque.py
# Assunto            : Reserva e sincronizacao de estoque com a Shopify
# Origem             : solicitacao do usuario
# Motivo             : Task 5: publicar na Shopify o estoque do Horus menos reservas de pedidos nao confirmados
# Criado em          : 2026-11-18 16:29:07
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import math
from datetime import datetime, timezone
from decimal import Decimal

import httpx

from app.services.anuncios.publicar import ml_aberto
from app.services.shopify.cliente import ShopifyErro

STATUS_RESERVA = ('aguardando_pagamento', 'a_confirmar')
LOTE = 250
MUTATION = '''
mutation($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    userErrors { field message }
  }
}'''


def reservas(pedidos: list[dict]) -> dict[str, tuple[int, Decimal]]:
    """Por produto: (unidades de frasco, ml de decant) dos pedidos que ainda reservam estoque."""
    saida: dict[str, tuple[int, Decimal]] = {}
    for p in pedidos:
        if p.get('status') not in STATUS_RESERVA:
            continue
        for it in p.get('itens') or []:
            pid = it.get('produto_id')
            if not pid:
                continue
            un, ml = saida.get(pid, (0, Decimal(0)))
            qtd = int(it.get('quantidade') or 0)
            if it.get('tipo') == 'decant':
                ml += Decimal(str(it.get('ml') or 0)) * qtd
            else:
                un += qtd
            saida[pid] = (un, ml)
    return saida


def quantidade_canal(estoque_atual, volume_ml, ml_aberto: Decimal, tipo: str, ml, reserva: tuple[int, Decimal]) -> int:
    unid, ml_res = reserva
    if tipo == 'frasco':
        return max(int(estoque_atual or 0) - unid, 0)
    volume = Decimal(str(volume_ml or 0))
    saldo = Decimal(str(ml_aberto)) + int(estoque_atual or 0) * volume - ml_res - unid * volume
    return max(math.floor(saldo / Decimal(str(ml))), 0)


def sincronizar(db, cliente, produto_ids: list[str] | None, ate: str | None = None) -> dict:
    # `ate`: só sai da fila o que entrou até esse instante; mudança que chega durante o envio fica.
    ate = ate or datetime.now(timezone.utc).isoformat()
    q = db.table('canal_vinculos').select('*').eq('canal', 'shopify')
    if produto_ids is not None:
        if not produto_ids:
            return {'enviados': 0, 'erros': []}
        q = q.in_('produto_id', produto_ids)
    vinculos = q.execute().data
    if not vinculos:
        if produto_ids:
            _limpar_fila(db, produto_ids, ate)
        return {'enviados': 0, 'erros': []}

    ids = sorted({v['produto_id'] for v in vinculos})
    produtos = {p['id']: p for p in db.table('produtos').select('id, estoque_atual, volume_ml').in_('id', ids).execute().data}
    pedidos = db.table('pedidos_canal').select('status, itens').in_('status', list(STATUS_RESERVA)).execute().data
    reserva = reservas(pedidos)
    abertos = {pid: Decimal(str(ml_aberto(db, pid))) for pid in ids}

    erros: list[str] = []
    falhos: set[str] = set()
    enviados = 0

    def falhar(lote, msg):
        for v in lote:
            db.table('canal_vinculos').update({'erro': msg}).eq('id', v['id']).execute()
            falhos.add(v['produto_id'])
        erros.append(msg)

    location = cliente.location_id
    if not location:
        falhar(vinculos, 'Loja sem localização: reconecte a Shopify')
        return {'enviados': 0, 'erros': erros}

    calculo = []
    for v in vinculos:
        p = produtos.get(v['produto_id'])
        if not p or not v.get('externo_estoque_id'):
            falhar([v], 'Vínculo sem produto ou sem item de estoque na Shopify')
            continue
        qtd = quantidade_canal(p['estoque_atual'], p['volume_ml'], abertos[v['produto_id']], v['tipo'], v['ml'],
                               reserva.get(v['produto_id'], (0, Decimal(0))))
        calculo.append((v, qtd))

    for i in range(0, len(calculo), LOTE):
        lote = calculo[i:i + LOTE]
        entrada = {
            'name': 'available', 'reason': 'correction', 'ignoreCompareQuantity': True,
            'quantities': [{'inventoryItemId': v['externo_estoque_id'], 'locationId': location, 'quantity': q} for v, q in lote],
        }
        try:
            cliente.graphql(MUTATION, {'input': entrada})
        except (ShopifyErro, httpx.HTTPError) as e:
            falhar([v for v, _ in lote], str(e))
            continue
        agora = datetime.now(timezone.utc).isoformat()
        for v, q in lote:
            db.table('canal_vinculos').update({'ultima_qtd': q, 'sincronizado_em': agora, 'erro': None}).eq('id', v['id']).execute()
        enviados += len(lote)

    _limpar_fila(db, [p for p in ids if p not in falhos], ate)
    return {'enviados': enviados, 'erros': erros}


def _limpar_fila(db, produto_ids: list[str], ate: str) -> None:
    if produto_ids:
        db.table('canal_sync_fila').delete().in_('produto_id', produto_ids).lte('criado_em', ate).execute()


def drenar_fila(db, cliente) -> dict:
    ate = datetime.now(timezone.utc).isoformat()
    ids = [r['produto_id'] for r in db.table('canal_sync_fila').select('produto_id').lte('criado_em', ate).execute().data]
    if not ids:
        return {'enviados': 0, 'erros': []}
    return sincronizar(db, cliente, ids, ate)
