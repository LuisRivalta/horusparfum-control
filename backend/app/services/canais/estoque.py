# [CLAUDE-CODE-AUDIT]
# ID                 : 20261124-105747-b226
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Canais: estoque.py
# Assunto            : Reserva e sincronizacao de estoque com a Shopify
# Origem             : solicitacao do usuario
# Motivo             : Mutation de estoque no formato exigido pela API 2026-04+, limpeza da fila pelo par lido e lease com dono (rodada 2 da revisao)
# Criado em          : 2026-11-18 16:29:07
# Ultima modificacao : 2026-11-24 10:57:47
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import math
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import httpx

from app.services.anuncios.publicar import ml_aberto
from app.services.shopify.cliente import ShopifyErro

STATUS_RESERVA = ('aguardando_pagamento', 'a_confirmar')
LOTE = 250
# Admin API 2026-04+: @idempotent obrigatório e changeFromQuantity em cada quantidade
# (null = sem conferência; o Horus é a fonte da verdade). Conferido no shopify.dev em 24/11/2026.
MUTATION = '''
mutation inventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
  inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
    userErrors { code field message }
  }
}'''
LEASE_SEGUNDOS = 60
VOLTAS = 5


def reservas(pedidos: list[dict], por_variante: dict[str, dict] | None = None) -> dict[str, tuple[int, Decimal]]:
    """Por produto: (unidades de frasco, ml de decant) dos pedidos que ainda reservam estoque.

    Item gravado sem produto (pedido chegou antes do vínculo) é resolvido pela variante ligada."""
    saida: dict[str, tuple[int, Decimal]] = {}
    for p in pedidos:
        if p.get('status') not in STATUS_RESERVA:
            continue
        for it in p.get('itens') or []:
            if not it.get('produto_id'):
                it = {**it, **(por_variante or {}).get(it.get('variante_id') or '', {})}
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


def sincronizar(db, cliente, fila: dict[str, str]) -> dict:
    """Envia os produtos da fila lida (produto_id -> criado_em lido). Só drenar_fila chama, sob o
    lease. Sai da fila só a linha que ainda tem o criado_em lido: reenfileirada no meio, fica."""
    if not fila:
        return {'enviados': 0, 'erros': []}
    ligados = db.table('canal_vinculos').select('*').eq('canal', 'shopify').execute().data
    vinculos = [v for v in ligados if v['produto_id'] in fila]
    if not vinculos:
        _limpar_fila(db, fila)
        return {'enviados': 0, 'erros': []}

    ids = sorted({v['produto_id'] for v in vinculos})
    produtos = {p['id']: p for p in db.table('produtos').select('id, estoque_atual, volume_ml').in_('id', ids).execute().data}
    pedidos = db.table('pedidos_canal').select('status, itens').in_('status', list(STATUS_RESERVA)).execute().data
    por_variante = {v['externo_variante_id']: {'produto_id': v['produto_id'], 'tipo': v['tipo'], 'ml': v['ml']}
                    for v in ligados if v.get('externo_variante_id')}
    reserva = reservas(pedidos, por_variante)
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
            'name': 'available', 'reason': 'correction',
            'quantities': [{'inventoryItemId': v['externo_estoque_id'], 'locationId': location, 'quantity': q,
                            'changeFromQuantity': None} for v, q in lote],
        }
        try:
            cliente.graphql(MUTATION, {'input': entrada, 'idempotencyKey': str(uuid.uuid4())})
        except (ShopifyErro, httpx.HTTPError) as e:
            falhar([v for v, _ in lote], str(e))
            continue
        agora = datetime.now(timezone.utc).isoformat()
        for v, q in lote:
            db.table('canal_vinculos').update({'ultima_qtd': q, 'sincronizado_em': agora, 'erro': None}).eq('id', v['id']).execute()
        enviados += len(lote)

    # pedido de produto que não está mais ligado também sai (senão fica na fila para sempre)
    _limpar_fila(db, {p: t for p, t in fila.items() if p not in falhos})
    return {'enviados': enviados, 'erros': erros}


def _limpar_fila(db, fila: dict[str, str]) -> None:
    # ponytail: um delete por linha; trocar por RPC com array se a fila passar de centenas
    for produto_id, criado_em in fila.items():
        db.table('canal_sync_fila').delete().eq('produto_id', produto_id).eq('criado_em', criado_em).execute()


def enfileirar(db, produto_ids: list[str]) -> None:
    """Põe os produtos na fila e avança criado_em: um dreno em andamento não tira o pedido novo."""
    if produto_ids:
        agora = datetime.now(timezone.utc).isoformat()
        db.table('canal_sync_fila').upsert([{'produto_id': p, 'criado_em': agora} for p in dict.fromkeys(produto_ids)],
                                           on_conflict='produto_id').execute()


def _pendentes(db, vistos: set) -> dict[str, str]:
    """Fila sem as linhas (produto_id, criado_em) já tentadas neste dreno (falhas não repetem)."""
    linhas = db.table('canal_sync_fila').select('produto_id, criado_em').execute().data
    return {r['produto_id']: r['criado_em'] for r in linhas if (r['produto_id'], r['criado_em']) not in vistos}


def _drenar(db, cliente, vistos: set) -> dict:
    dono = db.rpc('pegar_lease_sync', {'p_segundos': LEASE_SEGUNDOS}).execute().data
    if not dono:
        return {'enviados': 0, 'erros': [], 'ocupado': True}
    total: dict = {'enviados': 0, 'erros': []}
    try:
        for volta in range(VOLTAS):
            renovar = {'p_segundos': LEASE_SEGUNDOS, 'p_dono': dono}
            if volta and db.rpc('pegar_lease_sync', renovar).execute().data != dono:
                break  # o lease venceu e outro dreno pegou: ele segue com a fila
            fila = _pendentes(db, vistos)
            if not fila:
                break
            vistos.update(fila.items())
            r = sincronizar(db, cliente, fila)
            total['enviados'] += r['enviados']
            total['erros'] += r['erros']
    finally:
        db.rpc('soltar_lease_sync', {'p_dono': dono}).execute()
    return total


def drenar_fila(db, cliente) -> dict:
    """Único caminho de envio. Um dreno por vez (lease com dono no banco); quem chega com o lease
    ocupado só deixa o produto na fila, e o dreno em andamento repete enquanto entrar mudança nova."""
    vistos: set = set()
    total = _drenar(db, cliente, vistos)
    if not total.get('ocupado') and _pendentes(db, vistos):
        # quem enfileirou entre a última leitura e o soltar recebeu "ocupado": mais uma vez
        mais = _drenar(db, cliente, vistos)
        total['enviados'] += mais['enviados']
        total['erros'] += mais['erros']
    return total
