from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from app.services.financeiro_relatorios import parse_iso_datetime


CENTAVOS = Decimal("0.01")
PERCENTUAL = Decimal("0.01")


def _money(value: Any) -> Decimal:
    return Decimal(str(value or 0))


def _to_float(value: Decimal | None) -> float | None:
    if value is None:
        return None
    return float(value.quantize(CENTAVOS, rounding=ROUND_HALF_UP))


def _date_from_value(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).date()
    if isinstance(value, date):
        return value
    text = str(value)
    if "T" in text or text.endswith("Z"):
        return parse_iso_datetime(text).date()
    return datetime.fromisoformat(text).date()


def _month_label(year: int, month: int) -> str:
    nomes = {
        1: "Jan",
        2: "Fev",
        3: "Mar",
        4: "Abr",
        5: "Mai",
        6: "Jun",
        7: "Jul",
        8: "Ago",
        9: "Set",
        10: "Out",
        11: "Nov",
        12: "Dez",
    }
    return f"{nomes[month]}/{str(year)[2:]}"


def _month_iter(inicio: date, fim: date) -> list[tuple[int, int]]:
    meses: list[tuple[int, int]] = []
    ano, mes = inicio.year, inicio.month
    while (ano, mes) <= (fim.year, fim.month):
        meses.append((ano, mes))
        if mes == 12:
            ano += 1
            mes = 1
        else:
            mes += 1
    return meses


def _is_cancelada(venda: dict[str, Any]) -> bool:
    status = str(venda.get("status") or "").strip().lower()
    return status.startswith("cancel")


def _venda_no_periodo(venda: dict[str, Any], inicio: date, fim: date) -> bool:
    data_venda = _date_from_value(venda.get("data_venda"))
    return data_venda is not None and inicio <= data_venda <= fim


def _produto_nome(produtos: list[dict[str, Any]], produto_id: Any) -> str:
    if produto_id is None:
        return "Sem produto"
    lookup = {str(row.get("id")): row.get("nome") for row in produtos}
    nome = lookup.get(str(produto_id))
    if isinstance(nome, str) and nome.strip():
        return nome.strip()
    return str(produto_id)


def _canal_nome(canais: list[dict[str, Any]], canal_id: Any) -> str:
    if canal_id is None:
        return "Sem canal"
    lookup = {str(row.get("id")): row.get("nome") for row in canais}
    nome = lookup.get(str(canal_id))
    if isinstance(nome, str) and nome.strip():
        return nome.strip()
    return str(canal_id)


def _sale_payload(venda: dict[str, Any], canal_nome: str | None = None) -> dict[str, Any]:
    payload = {
        "id": venda.get("id"),
        "numero": venda.get("numero"),
        "status": venda.get("status"),
        "data_venda": venda.get("data_venda"),
        "total_bruto": _to_float(_money(venda.get("total_bruto"))) or 0.0,
        "total_custo": _to_float(_money(venda.get("total_custo"))) or 0.0,
        "lucro_bruto": _to_float(_money(venda.get("lucro_bruto"))) or 0.0,
        "taxa_total": _to_float(_money(venda.get("taxa_total"))) or 0.0,
        "frete": _to_float(_money(venda.get("frete"))) or 0.0,
        "canal_id": venda.get("canal_id"),
        "created_at": venda.get("created_at"),
    }
    if canal_nome is not None:
        payload["canal_nome"] = canal_nome
    return payload


def montar_dashboard_vendas(
    vendas: list[dict[str, Any]],
    itens: list[dict[str, Any]],
    canais: list[dict[str, Any]],
    produtos: list[dict[str, Any]],
    inicio: datetime,
    fim: datetime,
) -> dict[str, Any]:
    if inicio > fim:
        raise ValueError("Periodo invalido")

    inicio_dia = inicio.astimezone(timezone.utc).date()
    fim_dia = fim.astimezone(timezone.utc).date()

    vendas_validas = [
        venda
        for venda in vendas
        if not _is_cancelada(venda) and _venda_no_periodo(venda, inicio_dia, fim_dia)
    ]

    vendas_por_id = {str(venda.get("id")): venda for venda in vendas_validas if venda.get("id") is not None}
    canais_por_id = {str(canal.get("id")): canal for canal in canais if canal.get("id") is not None}

    itens_validos = [
        item
        for item in itens
        if str(item.get("venda_id")) in vendas_por_id
    ]

    faturamento_bruto = sum((_money(venda.get("total_bruto")) for venda in vendas_validas), Decimal(0))
    total_custo = sum((_money(venda.get("total_custo")) for venda in vendas_validas), Decimal(0))
    lucro_bruto = sum((_money(venda.get("lucro_bruto")) for venda in vendas_validas), Decimal(0))
    qtd_vendas = len(vendas_validas)
    itens_vendidos = sum((int(item.get("quantidade") or 0) for item in itens_validos), 0)

    margem_media = None
    if faturamento_bruto:
        margem_media = (lucro_bruto / faturamento_bruto) * Decimal(100)

    roi_medio = None
    if total_custo:
        roi_medio = (lucro_bruto / total_custo) * Decimal(100)

    ticket_medio = None
    if qtd_vendas:
        ticket_medio = faturamento_bruto / Decimal(qtd_vendas)

    produtos_totais: dict[str, dict[str, Decimal | str]] = {}
    for item in itens_validos:
        produto_id = str(item.get("produto_id"))
        nome = _produto_nome(produtos, item.get("produto_id"))
        agregado = produtos_totais.setdefault(
            produto_id,
            {
                "id": produto_id,
                "nome": nome,
                "quantidade": Decimal(0),
                "faturamento_bruto": Decimal(0),
                "total_custo": Decimal(0),
                "lucro_bruto": Decimal(0),
            },
        )
        agregado["quantidade"] = Decimal(str(agregado["quantidade"])) + Decimal(int(item.get("quantidade") or 0))
        agregado["faturamento_bruto"] = Decimal(str(agregado["faturamento_bruto"])) + _money(item.get("preco_unitario")) * Decimal(int(item.get("quantidade") or 0))
        agregado["total_custo"] = Decimal(str(agregado["total_custo"])) + _money(item.get("custo_unitario")) * Decimal(int(item.get("quantidade") or 0)) + _money(item.get("custo_embalagem"))
        agregado["lucro_bruto"] = Decimal(str(agregado["lucro_bruto"])) + _money(item.get("lucro"))

    produtos_ordenados = sorted(
        produtos_totais.values(),
        key=lambda row: (
            Decimal(str(row["quantidade"])),
            Decimal(str(row["lucro_bruto"])),
            str(row["nome"]).lower(),
        ),
        reverse=True,
    )

    canais_totais: dict[str, dict[str, Decimal | str | int | None]] = {}
    for venda in vendas_validas:
        canal_id = str(venda.get("canal_id")) if venda.get("canal_id") is not None else "None"
        nome = _canal_nome(canais, venda.get("canal_id"))
        agregado = canais_totais.setdefault(
            canal_id,
            {
                "id": venda.get("canal_id"),
                "nome": nome,
                "qtd_vendas": 0,
                "faturamento_bruto": Decimal(0),
                "total_custo": Decimal(0),
                "lucro_bruto": Decimal(0),
            },
        )
        agregado["qtd_vendas"] = int(agregado["qtd_vendas"]) + 1
        agregado["faturamento_bruto"] = Decimal(str(agregado["faturamento_bruto"])) + _money(venda.get("total_bruto"))
        agregado["total_custo"] = Decimal(str(agregado["total_custo"])) + _money(venda.get("total_custo"))
        agregado["lucro_bruto"] = Decimal(str(agregado["lucro_bruto"])) + _money(venda.get("lucro_bruto"))

    canais_ordenados = sorted(
        canais_totais.values(),
        key=lambda row: (
            Decimal(str(row["faturamento_bruto"])),
            int(row["qtd_vendas"]),
            str(row["nome"]).lower(),
        ),
        reverse=True,
    )

    evolucao_por_mes: dict[tuple[int, int], dict[str, Any]] = {}
    for venda in vendas_validas:
        data_venda = _date_from_value(venda.get("data_venda"))
        if data_venda is None:
            continue
        chave = (data_venda.year, data_venda.month)
        if chave not in evolucao_por_mes:
            evolucao_por_mes[chave] = {
                "faturamento_bruto": Decimal(0),
                "lucro_bruto": Decimal(0),
            }
        evolucao_por_mes[chave]["faturamento_bruto"] += _money(venda.get("total_bruto"))
        evolucao_por_mes[chave]["lucro_bruto"] += _money(venda.get("lucro_bruto"))

    evolucao = []
    for ano, mes in _month_iter(inicio_dia, fim_dia):
        totais = evolucao_por_mes.get((ano, mes), {"faturamento_bruto": Decimal(0), "lucro_bruto": Decimal(0)})
        evolucao.append(
            {
                "periodo": f"{ano:04d}-{mes:02d}",
                "label": _month_label(ano, mes),
                "faturamento_bruto": _to_float(totais["faturamento_bruto"]) or 0.0,
                "lucro_bruto": _to_float(totais["lucro_bruto"]) or 0.0,
            }
        )

    vendas_ordenadas = sorted(
        vendas_validas,
        key=lambda venda: (
            _date_from_value(venda.get("created_at")) or datetime.min.date(),
            int(venda.get("numero") or 0),
        ),
        reverse=True,
    )

    return {
        "resumo": {
            "qtd_vendas": qtd_vendas,
            "itens_vendidos": itens_vendidos,
            "faturamento_bruto": _to_float(faturamento_bruto) or 0.0,
            "total_custo": _to_float(total_custo) or 0.0,
            "lucro_bruto": _to_float(lucro_bruto) or 0.0,
            "margem_media": _to_float(margem_media),
            "roi_medio": _to_float(roi_medio),
            "ticket_medio": _to_float(ticket_medio),
        },
        "produtos": [
            {
                "id": row["id"],
                "nome": row["nome"],
                "quantidade": int(Decimal(str(row["quantidade"]))),
                "faturamento_bruto": _to_float(Decimal(str(row["faturamento_bruto"]))) or 0.0,
                "total_custo": _to_float(Decimal(str(row["total_custo"]))) or 0.0,
                "lucro_bruto": _to_float(Decimal(str(row["lucro_bruto"]))) or 0.0,
            }
            for row in produtos_ordenados
        ],
        "canais": [
            {
                "id": row["id"],
                "nome": row["nome"],
                "qtd_vendas": int(row["qtd_vendas"]),
                "faturamento_bruto": _to_float(Decimal(str(row["faturamento_bruto"]))) or 0.0,
                "total_custo": _to_float(Decimal(str(row["total_custo"]))) or 0.0,
                "lucro_bruto": _to_float(Decimal(str(row["lucro_bruto"]))) or 0.0,
                "roi": _to_float((Decimal(str(row["lucro_bruto"])) / Decimal(str(row["total_custo"]))) * Decimal(100))
                if Decimal(str(row["total_custo"]))
                else None,
            }
            for row in canais_ordenados
        ],
        "evolucao": evolucao,
        "vendas": [
            _sale_payload(venda, _canal_nome(canais, venda.get("canal_id")))
            for venda in vendas_ordenadas
        ],
    }
