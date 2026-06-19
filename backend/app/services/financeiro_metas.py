from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any


CENTAVOS = Decimal("0.01")


def _money(value: Any) -> Decimal:
    return Decimal(str(value or 0))


def _to_float(value: Decimal) -> float:
    return float(value.quantize(CENTAVOS, rounding=ROUND_HALF_UP))


def _parse_created_at(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _periodo_atual_mensal(referencia: datetime) -> tuple[datetime, datetime]:
    inicio = datetime(referencia.year, referencia.month, 1, tzinfo=timezone.utc)
    if referencia.month == 12:
        fim = datetime(referencia.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        fim = datetime(referencia.year, referencia.month + 1, 1, tzinfo=timezone.utc)
    return inicio, fim


def periodo_meta(periodo: str | None, referencia: datetime | None = None) -> tuple[datetime, datetime]:
    ref = referencia or datetime.now(timezone.utc)
    texto = (periodo or "").strip()
    if not texto:
        return _periodo_atual_mensal(ref)

    try:
        if len(texto) == 7 and texto[4] == "-":
            ano = int(texto[:4])
            mes = int(texto[5:7])
            return _periodo_atual_mensal(datetime(ano, mes, 1, tzinfo=timezone.utc))

        if len(texto) == 4 and texto.isdigit():
            ano = int(texto)
            return datetime(ano, 1, 1, tzinfo=timezone.utc), datetime(ano + 1, 1, 1, tzinfo=timezone.utc)

        upper = texto.upper()
        if len(upper) == 7 and upper[4:6] == "-Q":
            ano = int(upper[:4])
            tri = int(upper[6])
            if tri not in (1, 2, 3, 4):
                raise ValueError
            mes = (tri - 1) * 3 + 1
            inicio = datetime(ano, mes, 1, tzinfo=timezone.utc)
            fim_mes = mes + 3
            fim = datetime(ano + 1, 1, 1, tzinfo=timezone.utc) if fim_mes > 12 else datetime(ano, fim_mes, 1, tzinfo=timezone.utc)
            return inicio, fim
    except ValueError:
        pass

    return _periodo_atual_mensal(ref)


def _meta_percentual(meta: dict[str, Any]) -> bool:
    return str(meta.get("sufixo") or "").strip() == "%"


def _receita_no_periodo(
    transacoes: list[dict[str, Any]],
    inicio: datetime,
    fim_exclusivo: datetime,
) -> Decimal:
    total = Decimal(0)
    for row in transacoes:
        if row.get("tipo") != "entrada":
            continue
        created_at = _parse_created_at(str(row["created_at"]))
        if inicio <= created_at < fim_exclusivo:
            total += _money(row.get("valor"))
    return total


def montar_metas_financeiras(
    metas: list[dict[str, Any]],
    transacoes: list[dict[str, Any]],
    referencia: datetime | None = None,
) -> list[dict[str, Any]]:
    resultado: list[dict[str, Any]] = []
    for meta in metas:
        valor_alvo = _money(meta.get("valor_alvo"))
        manual = _money(meta.get("valor_atual"))
        calculada = manual
        fonte = "manual"

        if not _meta_percentual(meta):
            inicio, fim = periodo_meta(meta.get("periodo"), referencia)
            calculada = _receita_no_periodo(transacoes, inicio, fim)
            fonte = "receita"

        progresso = Decimal(0) if valor_alvo == 0 else min((calculada / valor_alvo) * Decimal(100), Decimal(100))
        item = dict(meta)
        item["valor_atual"] = _to_float(calculada)
        item["valor_manual"] = _to_float(manual)
        item["valor_alvo"] = _to_float(valor_alvo)
        item["progresso"] = _to_float(progresso)
        item["fonte"] = fonte
        resultado.append(item)
    return resultado
