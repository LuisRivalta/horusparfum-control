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


def _is_noise(line: str) -> bool:
    upper = line.upper()
    return (
        not line
        or upper.startswith("PEDIDO DE VENDA")
        or upper.startswith("ITEM ")
        or upper.startswith("NCM:")
        or upper == "UN"
        or bool(re.fullmatch(r"\d{8,14}", line))
    )


def _is_codigo(line: str) -> bool:
    return bool(re.match(r"^[A-Z]{1,4}-[A-Z0-9]+$", line.strip(), re.I))


def parse_pedido_pdf_text(texto: str) -> dict[str, Any]:
    linhas = [linha.strip() for linha in texto.splitlines()]
    itens: list[dict[str, Any]] = []
    avisos: list[str] = []
    buffer_nome: list[str] = []
    codigo: str | None = None

    for linha in linhas:
        if _is_noise(linha):
            continue

        row_match = ROW_TOTAL_RE.match(linha)
        if row_match:
            if not buffer_nome:
                avisos.append(f"Linha ignorada sem nome de produto: {linha}")
                codigo = None
                continue

            itens.append(
                {
                    "nome": " ".join(buffer_nome).strip(),
                    "codigo": codigo,
                    "qtd": normalizar_numero_br(row_match.group("qtd")),
                    "preco_unitario": normalizar_numero_br(row_match.group("preco")),
                    "total": normalizar_numero_br(row_match.group("total")),
                }
            )
            buffer_nome = []
            codigo = None
            continue

        if _is_codigo(linha):
            codigo = linha
            continue

        buffer_nome.append(linha)

    if not itens:
        raise PedidoPdfParseError("Nenhum item encontrado no PDF")

    return {"itens": itens, "avisos": avisos}


def parse_pedido_pdf_bytes(pdf_bytes: bytes) -> dict[str, Any]:
    return parse_pedido_pdf_text(extrair_texto_pdf(pdf_bytes))
