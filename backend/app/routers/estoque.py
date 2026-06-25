from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.deps import get_current_user
from app.db.supabase import get_supabase
from app.services.financeiro_relatorios import parse_iso_datetime
from app.services.vendas_dashboard import montar_dashboard_vendas

router = APIRouter()


@router.get("/produtos")
def listar_produtos():
    return {"produtos": []}


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
        venda_ids = [venda.get("id") for venda in (vendas_result.data or []) if venda.get("id") is not None]
        itens_result = []
        if venda_ids:
            itens_result = (
                supabase
                .table("venda_itens")
                .select("id, venda_id, tipo, produto_id, quantidade, ml, preco_unitario, custo_unitario, custo_embalagem, taxa_rateada, frete_rateado, lucro")
                .in_("venda_id", venda_ids)
                .execute()
            )
        canais_result = (
            supabase
            .table("canais")
            .select("id, nome")
            .execute()
        )
        produtos_result = (
            supabase
            .table("produtos")
            .select("id, nome")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Erro ao consultar vendas: {exc}",
        )

    return montar_dashboard_vendas(
        vendas_result.data or [],
        itens_result.data or [],
        canais_result.data or [],
        produtos_result.data or [],
        inicio_dt,
        fim_dt,
    )
