from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.deps import get_current_user
from app.db.supabase import get_supabase
from app.services.financeiro_relatorios import (
    montar_relatorio_financeiro,
    parse_iso_datetime,
)
from app.services.financeiro_metas import montar_metas_financeiras

router = APIRouter()


@router.get("/transacoes")
def listar_transacoes(_user: dict = Depends(get_current_user)):
    return {"transacoes": []}


@router.get("/contas")
def listar_contas(_user: dict = Depends(get_current_user)):
    return {"contas": []}


@router.get("/relatorios")
def relatorios(
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
        result = (
            get_supabase()
            .table("transacoes")
            .select("id, descricao, tipo, valor, categoria, forma_pagamento, responsavel, origem, created_at")
            .lte("created_at", fim_dt.isoformat())
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Erro ao consultar transacoes: {exc}",
        )

    return montar_relatorio_financeiro(result.data or [], inicio_dt, fim_dt)


@router.get("/metas")
def listar_metas(_user: dict = Depends(get_current_user)):
    try:
        supabase = get_supabase()
        metas = (
            supabase
            .table("metas")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
        transacoes = (
            supabase
            .table("transacoes")
            .select("tipo, valor, created_at")
            .eq("tipo", "entrada")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Erro ao consultar metas: {exc}",
        )

    return {"metas": montar_metas_financeiras(metas.data or [], transacoes.data or [])}
