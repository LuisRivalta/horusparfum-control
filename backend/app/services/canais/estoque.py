# [CLAUDE-CODE-AUDIT]
# ID                 : 20261124-104729-8322
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Canais: estoque.py
# Assunto            : Reserva e sincronizacao de estoque com a Shopify
# Origem             : solicitacao do usuario
# Motivo             : Dreno unico com lease, fila que avanca criado_em, reserva pela variante ligada depois e limpeza de produto desligado (revisao final)
# Criado em          : 2026-11-18 16:29:07
# Ultima modificacao : 2026-11-24 10:47:29
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


def sincronizar(db, cliente, produto_ids: list[str] | None, ate: str | None = None) -> dict:
    # Só drenar_fila chama (sob o lease). `ate`: só sai da fila o que entrou até esse instante;
    # mudança que chega durante o envio fica.
    ate = ate or datetime.now(timezone.utc).isoformat()
    if produto_ids is not None and not produto_ids:
        return {'enviados': 0, 'erros': []}
    ligados = db.table('canal_vinculos').select('*').eq('canal', 'shopify').execute().data
    vinculos = [v for v in ligados if produto_ids is None or v['produto_id'] in produto_ids]
    if not vinculos:
        if produto_ids:
            _limpar_fila(db, produto_ids, ate)
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

    # pedido de produto que não está mais ligado também sai (senão fica na fila para sempre)
    _limpar_fila(db, [p for p in (produto_ids or ids) if p not in falhos], ate)
    return {'enviados': enviados, 'erros': erros}


def _limpar_fila(db, produto_ids: list[str], ate: str) -> None:
    if produto_ids:
        db.table('canal_sync_fila').delete().in_('produto_id', produto_ids).lte('criado_em', ate).execute()


def enfileirar(db, produto_ids: list[str]) -> None:
    """Põe os produtos na fila e avança criado_em: um dreno em andamento não tira o pedido novo."""
    if produto_ids:
        agora = datetime.now(timezone.utc).isoformat()
        db.table('canal_sync_fila').upsert([{'produto_id': p, 'criado_em': agora} for p in dict.fromkeys(produto_ids)],
                                           on_conflict='produto_id').execute()


VOLTAS = 5


def drenar_fila(db, cliente) -> dict:
    """Único caminho de envio. Um dreno por vez (lease no banco); quem chega com o lease ocupado
    só deixa o produto na fila, e o dreno em andamento repete enquanto entrar mudança nova."""
    if db.rpc('pegar_lease_sync', {'p_segundos': 60}).execute().data is not True:
        return {'enviados': 0, 'erros': [], 'ocupado': True}
    total: dict = {'enviados': 0, 'erros': []}
    try:
        ultimo = None
        for _ in range(VOLTAS):
            q = db.table('canal_sync_fila').select('produto_id, criado_em')
            if ultimo:
                q = q.gt('criado_em', ultimo)  # falhas da volta anterior não repetem
            fila = q.execute().data
            if not fila:
                break
            # corte = o mais novo lido (relógio do banco, não o do servidor)
            ate = max((r['criado_em'] for r in fila), key=datetime.fromisoformat)
            r = sincronizar(db, cliente, [x['produto_id'] for x in fila], ate)
            total['enviados'] += r['enviados']
            total['erros'] += r['erros']
            ultimo = ate
    finally:
        db.rpc('soltar_lease_sync').execute()
    return total
