from __future__ import annotations

from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
from typing import Any

MEDIA_DECIMAIS = Decimal("0.01")
PERIODO_PADRAO_DIAS = 90
DIAS_REPOSICAO_PADRAO = 15
MARGEM_SEGURANCA_PADRAO = Decimal("0.3")


def _decimal(value: Any) -> Decimal:
    return Decimal(str(value or 0))


def _float_2(value: Decimal) -> float:
    return float(value.quantize(MEDIA_DECIMAIS, rounding=ROUND_HALF_UP))


def sugerir_estoque_minimo(
    produto_id: str,
    unidades_vendidas: int | Decimal,
    periodo_dias: int = PERIODO_PADRAO_DIAS,
    dias_reposicao: int = DIAS_REPOSICAO_PADRAO,
    margem_seguranca: float | Decimal = MARGEM_SEGURANCA_PADRAO,
) -> dict[str, Any]:
    if periodo_dias <= 0:
        raise ValueError("periodo_dias deve ser maior que zero")

    unidades = _decimal(unidades_vendidas)
    margem = _decimal(margem_seguranca)
    media_diaria = unidades / Decimal(periodo_dias)

    if unidades <= 0:
        return {
            "produto_id": produto_id,
            "periodo_dias": periodo_dias,
            "unidades_vendidas": 0,
            "media_diaria": 0,
            "dias_reposicao": dias_reposicao,
            "margem_seguranca": float(margem),
            "estoque_minimo_sugerido": None,
            "tem_dados": False,
        }

    bruto = media_diaria * Decimal(dias_reposicao) * (Decimal(1) + margem)
    sugerido = int(bruto.to_integral_value(rounding=ROUND_CEILING))
    if sugerido < 1:
        sugerido = 1

    return {
        "produto_id": produto_id,
        "periodo_dias": periodo_dias,
        "unidades_vendidas": int(unidades),
        "media_diaria": _float_2(media_diaria),
        "dias_reposicao": dias_reposicao,
        "margem_seguranca": float(margem),
        "estoque_minimo_sugerido": sugerido,
        "tem_dados": True,
    }
