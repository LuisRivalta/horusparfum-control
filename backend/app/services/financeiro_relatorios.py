from datetime import datetime, time, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any


CENTAVOS = Decimal("0.01")


def parse_iso_datetime(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _money(value: Any) -> Decimal:
    return Decimal(str(value or 0))


def _to_float(value: Decimal) -> float:
    return float(value.quantize(CENTAVOS, rounding=ROUND_HALF_UP))


def _created_at(row: dict[str, Any]) -> datetime:
    return parse_iso_datetime(str(row["created_at"]))


def _data_venda(row: dict[str, Any]) -> datetime:
    value = str(row["data_venda"])
    if len(value) == 10:
        return datetime.combine(datetime.fromisoformat(value).date(), time(12), timezone.utc)
    return parse_iso_datetime(value)


def _data_efetiva(
    row: dict[str, Any],
    vendas_por_id: dict[str, dict[str, Any]],
) -> datetime:
    venda_id = row.get("venda_id")
    venda = vendas_por_id.get(str(venda_id)) if venda_id else None
    return _data_venda(venda) if venda else _created_at(row)


def _categoria(row: dict[str, Any]) -> str:
    categoria = row.get("categoria")
    if isinstance(categoria, str) and categoria.strip():
        return categoria.strip()
    return "Sem categoria"


def origem_label(origem: str | None) -> str:
    if origem == "venda":
        return "Venda"
    if origem == "decant":
        return "Decant"
    return "Manual"


def _transacao_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "descricao": row.get("descricao") or "",
        "tipo": row.get("tipo"),
        "valor": _to_float(_money(row.get("valor"))),
        "categoria": row.get("categoria"),
        "forma_pagamento": row.get("forma_pagamento"),
        "responsavel": row.get("responsavel"),
        "origem": row.get("origem"),
        "created_at": row.get("created_at"),
    }


def _agrupar_por_categoria(
    transacoes: list[dict[str, Any]],
    tipo: str,
) -> list[dict[str, Any]]:
    totais: dict[str, Decimal] = {}
    for row in transacoes:
        if row.get("tipo") != tipo:
            continue
        categoria = _categoria(row)
        totais[categoria] = totais.get(categoria, Decimal(0)) + _money(row.get("valor"))
    return [
        {"categoria": categoria, "total": _to_float(total)}
        for categoria, total in sorted(totais.items(), key=lambda item: item[1], reverse=True)
    ]


def montar_relatorio_financeiro(
    transacoes: list[dict[str, Any]],
    inicio: datetime,
    fim: datetime,
    vendas: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if inicio > fim:
        raise ValueError("Periodo invalido")

    vendas = vendas or []
    vendas_por_id = {str(venda["id"]): venda for venda in vendas}
    data_efetiva = lambda row: _data_efetiva(row, vendas_por_id)
    ate_fim = [row for row in transacoes if data_efetiva(row) <= fim]
    no_periodo = [row for row in ate_fim if inicio <= data_efetiva(row)]

    receita = sum((_money(row.get("valor")) for row in no_periodo if row.get("tipo") == "entrada"), Decimal(0))
    despesa = sum((_money(row.get("valor")) for row in no_periodo if row.get("tipo") == "saida"), Decimal(0))
    custo_vendido = sum(
        (
            _money(venda.get("total_custo"))
            for venda in vendas
            if venda.get("status") == "concluida" and inicio <= _data_venda(venda) <= fim
        ),
        Decimal(0),
    )
    saldo_entradas = sum((_money(row.get("valor")) for row in ate_fim if row.get("tipo") == "entrada"), Decimal(0))
    saldo_saidas = sum((_money(row.get("valor")) for row in ate_fim if row.get("tipo") == "saida"), Decimal(0))

    origens: dict[str, int] = {}
    for row in no_periodo:
        label = origem_label(row.get("origem"))
        origens[label] = origens.get(label, 0) + 1

    origem_ordem = {"Manual": 0, "Venda": 1, "Decant": 2}
    maiores_receitas = sorted(
        [row for row in no_periodo if row.get("tipo") == "entrada"],
        key=lambda row: _money(row.get("valor")),
        reverse=True,
    )[:5]
    maiores_despesas = sorted(
        [row for row in no_periodo if row.get("tipo") == "saida"],
        key=lambda row: _money(row.get("valor")),
        reverse=True,
    )[:5]
    transacoes_ordenadas = sorted(no_periodo, key=data_efetiva, reverse=True)

    return {
        "periodo": {"inicio": inicio.isoformat(), "fim": fim.isoformat()},
        "resumo": {
            "receita": _to_float(receita),
            "despesa": _to_float(despesa),
            "lucro": _to_float(receita - despesa - custo_vendido),
            "saldo_historico": _to_float(saldo_entradas - saldo_saidas),
        },
        "categorias": {
            "receitas": _agrupar_por_categoria(no_periodo, "entrada"),
            "despesas": _agrupar_por_categoria(no_periodo, "saida"),
        },
        "origens": [
            {"origem": origem, "qtd": qtd}
            for origem, qtd in sorted(origens.items(), key=lambda item: origem_ordem.get(item[0], 99))
        ],
        "maiores": {
            "receitas": [_transacao_payload(row) for row in maiores_receitas],
            "despesas": [_transacao_payload(row) for row in maiores_despesas],
        },
        "transacoes": [_transacao_payload(row) for row in transacoes_ordenadas],
        "total_lancamentos": len(no_periodo),
    }