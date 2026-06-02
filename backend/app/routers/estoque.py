from fastapi import APIRouter

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
