# [CLAUDE-CODE-AUDIT]
# ID                 : 20261118-162312-e89a
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Canais: pedidos.py
# Assunto            : Normalizacao e ingestao de pedidos da Shopify
# Origem             : solicitacao do usuario
# Motivo             : Nenhuma venda da Shopify pode se perder nem duplicar no Horus
# Criado em          : 2026-11-18 16:22:57
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
"""Pedidos dos canais: normaliza o pedido da Shopify (webhook REST ou nó GraphQL)
e grava em pedidos_canal sem duplicar e sem regredir o status."""
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal, TypedDict

CENTAVO = Decimal('0.01')
PAGAMENTO = {
    'pending': 'pendente',
    'paid': 'pago', 'authorized': 'pago', 'partially_paid': 'pago',
    'refunded': 'reembolsado',
    'partially_refunded': 'reembolso_parcial',
    'voided': 'anulado', 'expired': 'anulado',
}
ABERTOS = (None, 'aguardando_pagamento', 'a_confirmar')
ITENS_TRAVADOS = ('confirmado', 'cancelado_pos_confirmacao')


class ItemNorm(TypedDict):
    variante_id: str
    titulo: str
    quantidade: int
    preco_unitario: Decimal


class PedidoNorm(TypedDict):
    externo_id: str
    numero: str
    criado_em: str
    pagamento: Literal['pendente', 'pago', 'reembolsado', 'reembolso_parcial', 'anulado']
    cancelado: bool
    cliente: str | None
    total: Decimal
    frete: Decimal
    reembolsado: Decimal
    itens: list[ItemNorm]


def _dec(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(CENTAVO, ROUND_HALF_UP)


def _utc(iso: str) -> str:
    return datetime.fromisoformat(iso).astimezone(timezone.utc).isoformat()


def _titulo(titulo: str, variante: str | None) -> str:
    return f'{titulo} — {variante}' if variante else titulo


def _pagamento(status: str | None) -> str:
    # status desconhecido conta como pendente: reserva, mas não vai para "a confirmar"
    return PAGAMENTO.get((status or '').lower(), 'pendente')


def _brl(v: Decimal) -> str:
    return f'{v:,.2f}'.replace(',', '_').replace('.', ',').replace('_', '.')


def normalizar_webhook(p: dict) -> PedidoNorm:
    cliente = p.get('customer') or {}
    nome = ' '.join(filter(None, [cliente.get('first_name'), cliente.get('last_name')])) or None
    itens = []
    for li in p.get('line_items') or []:
        qtd = int(li['quantity'])
        desconto = sum(Decimal(str(d['amount'])) for d in li.get('discount_allocations') or [])
        itens.append({
            'variante_id': str(li['variant_id']) if li.get('variant_id') else '',
            'titulo': _titulo(li['title'], li.get('variant_title')),
            'quantidade': qtd,
            'preco_unitario': _dec((Decimal(str(li['price'])) * qtd - desconto) / qtd),
        })
    return {
        'externo_id': str(p['id']),
        'numero': p['name'],
        'criado_em': _utc(p['created_at']),
        'pagamento': _pagamento(p.get('financial_status')),
        'cancelado': bool(p.get('cancelled_at')),
        'cliente': nome,
        'total': _dec(p.get('total_price')),
        'frete': _dec(sum(Decimal(str(s['price'])) for s in p.get('shipping_lines') or [])),
        'reembolsado': _dec(sum(Decimal(str(t['amount']))
                                for r in p.get('refunds') or [] for t in r.get('transactions') or [])),
        'itens': itens,
    }


def _money(n: dict, campo: str) -> Decimal:
    return _dec(((n.get(campo) or {}).get('shopMoney') or {}).get('amount'))


def normalizar_graphql(n: dict) -> PedidoNorm:
    itens = []
    for li in (n.get('lineItems') or {}).get('nodes') or []:
        variante = li.get('variant') or {}
        itens.append({
            'variante_id': str(variante.get('legacyResourceId') or ''),
            'titulo': _titulo(li['title'], li.get('variantTitle')),
            'quantidade': int(li['quantity']),
            'preco_unitario': _money(li, 'discountedUnitPriceAfterAllDiscountsSet'),
        })
    return {
        'externo_id': str(n['legacyResourceId']),
        'numero': n['name'],
        'criado_em': _utc(n['createdAt']),
        'pagamento': _pagamento(n.get('displayFinancialStatus')),
        'cancelado': bool(n.get('cancelledAt')),
        'cliente': (n.get('customer') or {}).get('displayName') or None,
        'total': _money(n, 'currentTotalPriceSet'),
        'frete': _money(n, 'totalShippingPriceSet'),
        'reembolsado': _money(n, 'totalRefundedSet'),
        'itens': itens,
    }


def proximo_status(atual: str | None, p: PedidoNorm) -> tuple[str, str | None]:
    """Alerta None = manter o alerta que já está gravado."""
    cancelou = p['cancelado'] or p['pagamento'] in ('anulado', 'reembolsado')
    if atual in ABERTOS:
        if cancelou:
            return 'cancelado', None
        if p['pagamento'] == 'pendente':
            return atual or 'aguardando_pagamento', None  # a_confirmar não regride
        return 'a_confirmar', None
    if atual == 'confirmado':
        if cancelou:
            return 'cancelado_pos_confirmacao', 'Cancelado na Shopify — desfazer venda?'
        if p['pagamento'] == 'reembolso_parcial':
            return 'confirmado', f"Reembolso parcial de R$ {_brl(p['reembolsado'])} na Shopify"
        return 'confirmado', None
    return atual, None


def _vinculo(db, canal: str, variante_id: str) -> dict:
    if not variante_id:
        return {}
    r = (db.table('canal_vinculos').select('produto_id,tipo,ml')
         .eq('canal', canal).eq('externo_variante_id', variante_id).execute())
    return r.data[0] if r.data else {}


def ingerir(db, canal: str, p: PedidoNorm, conectado_em: datetime | None) -> list[str]:
    """Grava o pedido; devolve os produto_id dos itens antigos e novos (para sincronizar)."""
    if conectado_em is None or datetime.fromisoformat(p['criado_em']) < conectado_em:
        return []
    r = (db.table('pedidos_canal').select('status,alerta,itens')
         .eq('canal', canal).eq('externo_id', p['externo_id']).execute())
    atual = r.data[0] if r.data else {}
    status, alerta = proximo_status(atual.get('status'), p)
    antigos = atual.get('itens') or []

    if atual.get('status') in ITENS_TRAVADOS:
        itens = antigos
    else:
        itens = []
        for it in p['itens']:
            v = _vinculo(db, canal, it['variante_id'])
            itens.append({
                'variante_id': it['variante_id'], 'titulo': it['titulo'],
                'quantidade': it['quantidade'], 'preco_unitario': float(it['preco_unitario']),
                'produto_id': v.get('produto_id'), 'tipo': v.get('tipo'),
                'ml': float(v['ml']) if v.get('ml') is not None else None,
            })

    db.table('pedidos_canal').upsert({
        'canal': canal, 'externo_id': p['externo_id'], 'numero': p['numero'],
        'status': status, 'alerta': alerta or atual.get('alerta'),
        'cliente': p['cliente'], 'criado_em': p['criado_em'],
        'total': float(p['total']), 'frete': float(p['frete']), 'itens': itens,
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }, on_conflict='canal,externo_id').execute()

    return list(dict.fromkeys(i['produto_id'] for i in antigos + itens if i.get('produto_id')))
