from __future__ import annotations

import io
import re
from typing import Any

from pypdf import PdfReader


class PedidoPdfParseError(ValueError):
    pass


MONEY_RE = r"\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}"
ROW_TOTAL_RE = re.compile(
    rf"^(?P<qtd>{MONEY_RE})\s+(?P<un>[A-Za-z]+)\s+(?P<preco>{MONEY_RE})\s+(?P<total>{MONEY_RE})$"
)
INLINE_ROW_RE = re.compile(
    rf"^(?P<prefix>.+?)\s+(?P<qtd>{MONEY_RE})\s+(?P<un>[A-Za-z]+)\s+(?P<preco>{MONEY_RE})\s+(?P<total>{MONEY_RE})$"
)
DECLARED_ITEMS_RE = re.compile(r"N[uú]mero de itens:\s*(?P<count>\d+)", re.I)
NCM_RE = re.compile(r"\bNCM:\s*\d{4}\.\d{2}\.\d{2}\b", re.I)
GTIN_RE = re.compile(r"^\d{8,14}$")
CODE_RE = re.compile(r"^[A-Z]{1,4}-[A-Z0-9]+$", re.I)
TRAILING_CODE_RE = re.compile(r"^(?P<nome>.+?)\s+(?P<codigo>[A-Z]{1,4}-[A-Z0-9]+)$", re.I)


def normalizar_numero_br(valor: str) -> float:
    limpo = valor.strip().replace(".", "").replace(",", ".")
    return float(limpo)


def extrair_texto_pdf(pdf_bytes: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except Exception as exc:
        raise PedidoPdfParseError("PDF inválido ou ilegível") from exc

    partes = []
    for page in reader.pages:
        partes.append(page.extract_text() or "")

    texto = "\n".join(partes).strip()
    if not texto:
        raise PedidoPdfParseError("PDF sem texto extraível")
    return texto


def _is_table_header(line: str) -> bool:
    upper = line.upper()
    return (
        upper.startswith("ITEM ")
        or "QTD" in upper and "PRE" in upper and "TOTAL" in upper
        or upper.startswith("GTIN / NCM")
    )


def _is_footer(line: str) -> bool:
    upper = line.upper()
    return (
        upper.startswith("NÚMERO DE ITENS")
        or upper.startswith("NUMERO DE ITENS")
        or upper.startswith("SOMA DAS QUANTIDADES")
        or upper.startswith("TOTAL DE PRODUTOS")
        or upper.startswith("FRETE")
        or upper.startswith("TOTAL DO PEDIDO")
        or upper.startswith("DIAS DATA VENCIMENTO")
        or upper.startswith("PESO BRUTO")
        or upper.startswith("OBSERVAÇÕES")
        or upper.startswith("OBSERVACOES")
    )


def _is_noise(line: str) -> bool:
    upper = line.upper()
    return (
        not line
        or _is_table_header(line)
        or upper.startswith("PEDIDO DE VENDA")
        or upper.startswith("NCM:")
        or upper == "UN"
        or bool(GTIN_RE.fullmatch(line))
    )


def _is_codigo(line: str) -> bool:
    return bool(CODE_RE.match(line.strip()))


def _clean_name(value: str) -> str:
    cleaned = NCM_RE.sub("", value)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -")
    return cleaned


def _build_item(nome: str, codigo: str | None, match: re.Match[str]) -> dict[str, Any]:
    nome_limpo = _clean_name(nome)
    trailing_code = TRAILING_CODE_RE.match(nome_limpo)
    if codigo is None and trailing_code:
        nome_limpo = trailing_code.group("nome").strip()
        codigo = trailing_code.group("codigo")

    return {
        "nome": nome_limpo,
        "codigo": codigo,
        "qtd": normalizar_numero_br(match.group("qtd")),
        "preco_unitario": normalizar_numero_br(match.group("preco")),
        "total": normalizar_numero_br(match.group("total")),
    }


def _parse_inline_row(line: str) -> dict[str, Any] | None:
    match = INLINE_ROW_RE.match(line)
    if not match:
        return None

    prefix = _clean_name(match.group("prefix"))
    codigo = None
    trailing_code = TRAILING_CODE_RE.match(prefix)
    if trailing_code:
        prefix = trailing_code.group("nome").strip()
        codigo = trailing_code.group("codigo")

    if not prefix:
        return None

    return _build_item(prefix, codigo, match)


def parse_pedido_pdf_text(texto: str) -> dict[str, Any]:
    linhas = [linha.strip() for linha in texto.splitlines()]
    itens: list[dict[str, Any]] = []
    avisos: list[str] = []
    buffer_nome: list[str] = []
    codigo: str | None = None
    in_items = False
    declared_count: int | None = None

    for linha in linhas:
        declared_match = DECLARED_ITEMS_RE.search(linha)
        if declared_match:
            declared_count = int(declared_match.group("count"))

        if not in_items:
            if _is_table_header(linha):
                in_items = True
            continue

        if _is_footer(linha):
            buffer_nome = []
            codigo = None
            continue

        if _is_noise(linha):
            continue

        row_match = ROW_TOTAL_RE.match(linha)
        if row_match:
            if not buffer_nome:
                avisos.append(f"Linha ignorada sem nome de produto: {linha}")
                codigo = None
                continue

            itens.append(_build_item(" ".join(buffer_nome), codigo, row_match))
            buffer_nome = []
            codigo = None
            continue

        inline_item = _parse_inline_row(linha)
        if inline_item:
            itens.append(inline_item)
            buffer_nome = []
            codigo = None
            continue

        if _is_codigo(linha):
            codigo = linha
            continue

        buffer_nome.append(linha)

    if not itens:
        raise PedidoPdfParseError("Nenhum item encontrado no PDF")

    if declared_count is not None and declared_count != len(itens):
        avisos.append(f"PDF declara {declared_count} itens, mas {len(itens)} foram extraídos")

    return {"itens": itens, "avisos": avisos}


def parse_pedido_pdf_bytes(pdf_bytes: bytes) -> dict[str, Any]:
    return parse_pedido_pdf_text(extrair_texto_pdf(pdf_bytes))
