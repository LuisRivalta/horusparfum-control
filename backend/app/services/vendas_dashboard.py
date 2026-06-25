from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from app.services.financeiro_relatorios import parse_iso_datetime

CENTAVOS=Decimal('0.01')

def _money(value: Any) -> Decimal:
    return Decimal(str(value or 0))

def _f(value: Decimal | None) -> float | None:
    if value is None:
        return None
    return float(value.quantize(CENTAVOS, rounding=ROUND_HALF_UP))

def _data(value: Any) -> date | None:
    if value is None or value == '':
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).date()
    if isinstance(value, date):
        return value
    text = str(value)
    if 'T' in text or text.endswith('Z'):
        return parse_iso_datetime(text).date()
    return datetime.fromisoformat(text).date()

def _nome(rows: list[dict[str, Any]], key: str, value: Any, fallback: str) -> str:
    lookup = {str(row.get(key)): row.get('nome') for row in rows}
    nome = lookup.get(str(value))
    if isinstance(nome, str) and nome.strip():
        return nome.strip()
    return fallback if value is None else str(value)

def _mes_label(ano: int, mes: int) -> str:
    return {1:'Jan',2:'Fev',3:'Mar',4:'Abr',5:'Mai',6:'Jun',7:'Jul',8:'Ago',9:'Set',10:'Out',11:'Nov',12:'Dez'}[mes] + f'/{str(ano)[2:]}'

def _is_cancelada(venda: dict[str, Any]) -> bool:
    return str(venda.get('status') or '').strip().lower().startswith('cancel')

def _in_periodo(venda: dict[str, Any], inicio: date, fim: date) -> bool:
    d = _data(venda.get('data_venda'))
    return d is not None and inicio <= d <= fim

def _margem(lucro: Decimal, faturamento: Decimal) -> Decimal:
    return Decimal(0) if faturamento == 0 else (lucro / faturamento) * Decimal(100)

def _month_iter(inicio: date, fim: date):
    ano, mes = inicio.year, inicio.month
    while (ano, mes) <= (fim.year, fim.month):
        yield ano, mes
        if mes == 12:
            ano += 1; mes = 1
        else:
            mes += 1

def montar_dashboard_vendas(vendas, itens, canais, produtos, inicio, fim):
    if inicio > fim:
        raise ValueError('Periodo invalido')
    inicio_dia = inicio.astimezone(timezone.utc).date()
    fim_dia = fim.astimezone(timezone.utc).date()
    vendas_validas = [v for v in vendas if not _is_cancelada(v) and _in_periodo(v, inicio_dia, fim_dia)]
    vendas_por_id = {str(v.get('id')): v for v in vendas_validas if v.get('id') is not None}
    itens_validos = [i for i in itens if str(i.get('venda_id')) in vendas_por_id]
    faturamento_bruto = sum((_money(v.get('total_bruto')) for v in vendas_validas), Decimal(0))
    total_custo = sum((_money(v.get('total_custo')) for v in vendas_validas), Decimal(0))
    lucro_bruto = sum((_money(v.get('lucro_bruto')) for v in vendas_validas), Decimal(0))
    qtd_vendas = len(vendas_validas)
    itens_vendidos = sum((int(i.get('quantidade') or 0) for i in itens_validos), 0)
    margem_media = _f(_margem(lucro_bruto, faturamento_bruto)) if faturamento_bruto != 0 else 0.0
    roi_medio = _f((lucro_bruto / total_custo) * Decimal(100)) if total_custo != 0 else None
    ticket_medio = _f(faturamento_bruto / Decimal(qtd_vendas)) if qtd_vendas else 0.0

    produtos_totais = {}
    for item in itens_validos:
        pid = item.get('produto_id')
        key = str(pid)
        qtd = Decimal(int(item.get('quantidade') or 0))
        custo_unit = _money(item.get('custo_unitario'))
        custo_emb = _money(item.get('custo_embalagem'))
        agg = produtos_totais.setdefault(key, {'produto_id': pid, 'nome': _nome(produtos, 'id', pid, 'Sem produto'), 'quantidade': Decimal(0), 'faturamento_bruto': Decimal(0), 'total_custo': Decimal(0), 'lucro_bruto': Decimal(0)})
        agg['quantidade'] += qtd
        agg['faturamento_bruto'] += _money(item.get('preco_unitario')) * qtd
        agg['total_custo'] += (custo_unit + custo_emb) * qtd
        agg['lucro_bruto'] += _money(item.get('lucro'))
    produtos_ordenados = sorted(produtos_totais.values(), key=lambda r: (r['lucro_bruto'], r['quantidade'], str(r['nome']).lower()), reverse=True)[:10]

    canais_totais = {}
    for venda in vendas_validas:
        cid = venda.get('canal_id')
        key = str(cid)
        agg = canais_totais.setdefault(key, {'canal_id': cid, 'nome': _nome(canais, 'id', cid, 'Sem canal'), 'qtd_vendas': 0, 'faturamento_bruto': Decimal(0), 'total_custo': Decimal(0), 'lucro_bruto': Decimal(0)})
        agg['qtd_vendas'] += 1
        agg['faturamento_bruto'] += _money(venda.get('total_bruto'))
        agg['total_custo'] += _money(venda.get('total_custo'))
        agg['lucro_bruto'] += _money(venda.get('lucro_bruto'))
    canais_ordenados = sorted(canais_totais.values(), key=lambda r: (r['lucro_bruto'], r['qtd_vendas'], str(r['nome']).lower()), reverse=True)

    evolucao_map = {}
    for venda in vendas_validas:
        d = _data(venda.get('data_venda'))
        if d is None:
            continue
        bucket = evolucao_map.setdefault((d.year, d.month), {'faturamento_bruto': Decimal(0), 'lucro_bruto': Decimal(0)})
        bucket['faturamento_bruto'] += _money(venda.get('total_bruto'))
        bucket['lucro_bruto'] += _money(venda.get('lucro_bruto'))
    evolucao = []
    for ano, mes in _month_iter(inicio_dia, fim_dia):
        bucket = evolucao_map.get((ano, mes), {'faturamento_bruto': Decimal(0), 'lucro_bruto': Decimal(0)})
        evolucao.append({'periodo': f'{ano:04d}-{mes:02d}', 'label': _mes_label(ano, mes), 'faturamento_bruto': _f(bucket['faturamento_bruto']) or 0.0, 'lucro_bruto': _f(bucket['lucro_bruto']) or 0.0})

    vendas_ordenadas = sorted(vendas_validas, key=lambda v: (_data(v.get('data_venda')) or date.min, int(v.get('numero') or 0)), reverse=True)
    itens_por_venda = {}
    for item in itens_validos:
        itens_por_venda[str(item.get('venda_id'))] = itens_por_venda.get(str(item.get('venda_id')), 0) + int(item.get('quantidade') or 0)

    return {
        'periodo': {'inicio': inicio.isoformat(), 'fim': fim.isoformat()},
        'resumo': {'qtd_vendas': qtd_vendas, 'itens_vendidos': itens_vendidos, 'faturamento_bruto': _f(faturamento_bruto) or 0.0, 'total_custo': _f(total_custo) or 0.0, 'lucro_bruto': _f(lucro_bruto) or 0.0, 'margem_media': margem_media, 'roi_medio': roi_medio, 'ticket_medio': ticket_medio},
        'produtos': [{'produto_id': r['produto_id'], 'nome': r['nome'], 'quantidade': int(r['quantidade']), 'faturamento_bruto': _f(r['faturamento_bruto']) or 0.0, 'total_custo': _f(r['total_custo']) or 0.0, 'lucro_bruto': _f(r['lucro_bruto']) or 0.0, 'margem': _f(_margem(r['lucro_bruto'], r['faturamento_bruto']))} for r in produtos_ordenados],
        'canais': [{'canal_id': r['canal_id'], 'nome': r['nome'], 'qtd_vendas': int(r['qtd_vendas']), 'faturamento_bruto': _f(r['faturamento_bruto']) or 0.0, 'total_custo': _f(r['total_custo']) or 0.0, 'lucro_bruto': _f(r['lucro_bruto']) or 0.0, 'margem': _f(_margem(r['lucro_bruto'], r['faturamento_bruto'])), 'roi': _f((r['lucro_bruto'] / r['total_custo']) * Decimal(100)) if r['total_custo'] != 0 else None} for r in canais_ordenados],
        'evolucao': evolucao,
        'vendas': [{'id': v.get('id'), 'numero': v.get('numero'), 'data_venda': v.get('data_venda'), 'canal': _nome(canais, 'id', v.get('canal_id'), 'Sem canal'), 'itens': itens_por_venda.get(str(v.get('id')), 0), 'faturamento_bruto': _f(_money(v.get('total_bruto'))) or 0.0, 'total_custo': _f(_money(v.get('total_custo'))) or 0.0, 'lucro_bruto': _f(_money(v.get('lucro_bruto'))) or 0.0, 'margem': _f(_margem(_money(v.get('lucro_bruto')), _money(v.get('total_bruto')))), 'roi': _f((_money(v.get('lucro_bruto')) / _money(v.get('total_custo'))) * Decimal(100)) if _money(v.get('total_custo')) != 0 else None} for v in vendas_ordenadas],
    }
