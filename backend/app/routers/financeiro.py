from fastapi import APIRouter

router = APIRouter()


@router.get("/transacoes")
def listar_transacoes():
    return {"transacoes": []}


@router.get("/contas")
def listar_contas():
    return {"contas": []}


@router.get("/relatorios")
def relatorios():
    return {"relatorios": []}


@router.get("/metas")
def listar_metas():
    return {"metas": []}
