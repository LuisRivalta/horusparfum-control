from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.auth.deps import get_current_user
from app.db.supabase import get_supabase
from app.services.estoque_minimo import PERIODO_PADRAO_DIAS, sugerir_estoque_minimo
from app.services.financeiro_relatorios import parse_iso_datetime
from app.services.pedido_pdf_import import PedidoPdfParseError, parse_pedido_pdf_bytes
from app.services.vendas_dashboard import montar_dashboard_vendas

router = APIRouter()

MAX_PEDIDO_PDF_BYTES = 10 * 1024 * 1024


@router.get("/produtos")
def listar_produtos():
    return {"produtos": []}


@router.get("/produtos/{produto_id}/estoque-minimo-sugerido")
def estoque_minimo_sugerido(
    produto_id: str,
    _user: dict = Depends(get_current_user),
):
    hoje = datetime.now(timezone.utc).date()
    inicio = hoje - timedelta(days=PERIODO_PADRAO_DIAS - 1)

    try:
        supabase = get_supabase()
        vendas = (
            supabase
            .table("vendas")
            .select("id, status, data_venda")
            .gte("data_venda", inicio.isoformat())
            .neq("status", "cancelada")
            .execute()
            .data or []
        )
        venda_ids = [venda.get("id") for venda in vendas if venda.get("id") is not None]
        if not venda_ids:
            return sugerir_estoque_minimo(produto_id, unidades_vendidas=0)

        itens = (
            supabase
            .table("venda_itens")
            .select("id, venda_id, produto_id, quantidade")
            .in_("venda_id", venda_ids)
            .eq("produto_id", produto_id)
            .execute()
            .data or []
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Erro ao calcular estoque minimo sugerido: {exc}",
        )

    unidades_vendidas = sum(int(item.get("quantidade") or 0) for item in itens)
    return sugerir_estoque_minimo(produto_id, unidades_vendidas=unidades_vendidas)

@router.get("/movimentacoes")
def listar_movimentacoes():
    return {"movimentacoes": []}


@router.get("/categorias")
def listar_categorias():
    return {"categorias": []}


@router.get("/fornecedores")
def listar_fornecedores():
    return {"fornecedores": []}


@router.get("/alertas")
def listar_alertas():
    return {"alertas": []}


@router.post("/pedidos/importar-pdf")
async def importar_pedido_pdf(
    file: UploadFile = File(...),
    _user: dict = Depends(get_current_user),
):
    content_type = (file.content_type or "").lower()
    filename = (file.filename or "").lower()
    if content_type != "application/pdf" and not filename.endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Envie um arquivo PDF",
        )

    pdf_bytes = await file.read(MAX_PEDIDO_PDF_BYTES + 1)
    if len(pdf_bytes) > MAX_PEDIDO_PDF_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="PDF excede o limite de 10 MB",
        )

    if not pdf_bytes.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Envie um arquivo PDF válido",
        )

    try:
        return parse_pedido_pdf_bytes(pdf_bytes)
    except PedidoPdfParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Erro ao ler PDF: {exc}",
        )


@router.get("/vendas/dashboard")
def vendas_dashboard(
    inicio: str = Query(..., description="Inicio do periodo em ISO-8601"),
    fim: str = Query(..., description="Fim do periodo em ISO-8601"),
    _user: dict = Depends(get_current_user),
):
    try:
        inicio_dt = parse_iso_datetime(inicio)
        fim_dt = parse_iso_datetime(fim)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Periodo invalido",
        )

    if inicio_dt > fim_dt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inicio deve ser menor ou igual ao fim",
        )

    try:
        supabase = get_supabase()
        vendas_result = (
            supabase
            .table("vendas")
            .select("id, numero, status, data_venda, total_bruto, total_custo, lucro_bruto, taxa_total, frete, canal_id, created_at")
            .gte("data_venda", inicio_dt.date().isoformat())
            .lte("data_venda", fim_dt.date().isoformat())
            .execute()
        )
        vendas = vendas_result.data or []
        venda_ids = [venda.get("id") for venda in vendas if venda.get("id") is not None]
        itens = []
        if venda_ids:
            itens = (
                supabase
                .table("venda_itens")
                .select("id, venda_id, tipo, produto_id, quantidade, ml, preco_unitario, custo_unitario, custo_embalagem, taxa_rateada, frete_rateado, lucro")
                .in_("venda_id", venda_ids)
                .execute()
                .data or []
            )
        canais = (
            supabase
            .table("canais")
            .select("id, nome")
            .execute()
            .data or []
        )
        produtos = (
            supabase
            .table("produtos")
            .select("id, nome")
            .execute()
            .data or []
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Erro ao consultar vendas: {exc}",
        )

    return montar_dashboard_vendas(
        vendas,
        itens,
        canais,
        produtos,
        inicio_dt,
        fim_dt,
    )
