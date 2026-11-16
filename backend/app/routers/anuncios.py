# [CLAUDE-CODE-AUDIT]
# ID                 : 20261116-152622-c644
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Rotas de anuncios
# Assunto            : Atributos, precos, IA, publicar, qualidade, quantidade, status e preco no ML
# Origem             : solicitacao do usuario
# Motivo             : Brief da Task 7 pede as rotas de anuncios usadas pela tela Anuncios.
# Criado em          : 2026-11-16 15:25:55
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import time
from decimal import Decimal
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.auth.deps import get_current_user
from app.config import settings
from app.db.supabase import get_supabase
from app.services.anuncios import ia
from app.services.anuncios.preco import Pacote, calcular_preco, consulta_ml
from app.services.anuncios.publicar import (
    agora, carregar_anuncio, carregar_produto, gravar, ml_aberto, publicar_um, quantidade_disponivel,
)
from app.services.mercadolivre import MLCliente, MLDesconectado, MLErro
from app.services.mercadolivre.conexao import API, checar

router = APIRouter(dependencies=[Depends(get_current_user)])
TIPOS_ML = ('gold_special', 'gold_pro')


def obter_db():
    return get_supabase()


def obter_cliente_ml() -> MLCliente:
    return MLCliente()


async def ml_desconectado(request: Request, exc: MLDesconectado):
    return JSONResponse(status_code=409, content={'detail': 'Conecte a conta do Mercado Livre'})


async def ml_erro(request: Request, exc: MLErro):
    return JSONResponse(status_code=502, content={'detail': exc.mensagem})


def _dinheiro(d: dict) -> dict:
    return {k: round(float(v), 2) for k, v in d.items()}


# --- atributos da categoria ---------------------------------------------------

_atributos_cache: tuple[float, list] = (0.0, [])


def atributos_categoria() -> list:
    global _atributos_cache
    if time.time() - _atributos_cache[0] < 3600 and _atributos_cache[1]:
        return _atributos_cache[1]
    lista = checar(httpx.get(f'{API}/categories/MLB6284/attributes', timeout=20))
    visiveis = []
    for a in lista:
        tags = a.get('tags') or {}
        if isinstance(tags, dict):
            tags = [k for k, v in tags.items() if v]
        if 'hidden' not in tags and 'read_only' not in tags:
            visiveis.append(a)
    _atributos_cache = (time.time(), visiveis)
    return visiveis


@router.get('/atributos')
def atributos():
    return atributos_categoria()


# --- preço ----------------------------------------------------------------------

class PacoteIn(BaseModel):
    peso_g: int | None = None
    altura_cm: float | None = None
    largura_cm: float | None = None
    comprimento_cm: float | None = None

    def pacote(self) -> Pacote:
        dec = lambda v: None if v is None else Decimal(str(v))
        return Pacote(self.peso_g, dec(self.altura_cm), dec(self.largura_cm), dec(self.comprimento_cm))


class ItemPrecoIn(BaseModel):
    chave: str
    custo: float
    margem: float
    tipo: Literal['frasco', 'decant']


class PrecosIn(BaseModel):
    itens: list[ItemPrecoIn]
    pacotes: dict[Literal['frasco', 'decant'], PacoteIn]


@router.post('/precos')
def precos(body: PrecosIn, cliente: MLCliente = Depends(obter_cliente_ml)):
    saida = []
    for it in body.itens:
        pacote = body.pacotes.get(it.tipo, PacoteIn()).pacote()
        linha = {'chave': it.chave}
        for lt in TIPOS_ML:
            try:
                r = calcular_preco(Decimal(str(it.custo)), Decimal(str(it.margem)), consulta_ml(cliente, lt, pacote))
                linha[lt] = _dinheiro(r)
            except (ValueError, RuntimeError) as e:
                linha[lt] = {'erro': str(e)}
        saida.append(linha)
    return {'itens': saida}


# --- IA ---------------------------------------------------------------------------

def _config(db) -> dict:
    dados = db.table('anuncios_config').select('ia_ativa, modelo_descricao').eq('id', 1).execute().data
    return dados[0] if dados else {}


def _produto_com_ia(db, produto_id) -> tuple[dict, dict]:
    config = _config(db)
    if not config.get('ia_ativa') or not settings.anthropic_api_key:
        raise HTTPException(status_code=409, detail='IA desligada')
    produto = carregar_produto(db, produto_id)
    if not produto:
        raise HTTPException(status_code=404, detail='Perfume não encontrado')
    return produto, config


class FichaIn(BaseModel):
    produto_id: str


@router.post('/ia/ficha')
def ia_ficha(body: FichaIn, db=Depends(obter_db)):
    p, _ = _produto_com_ia(db, body.produto_id)
    return {'ficha': ia.sugerir_ficha(p['nome'], p.get('marca'), p.get('volume_ml'), atributos_categoria())}


class AlvoIn(BaseModel):
    chave: str
    tipo: Literal['frasco', 'decant']
    ml: float | None = None


class TextosIn(BaseModel):
    produto_id: str
    anuncios: list[AlvoIn]


@router.post('/ia/textos')
def ia_textos(body: TextosIn, db=Depends(obter_db)):
    p, config = _produto_com_ia(db, body.produto_id)
    try:
        textos = ia.gerar_textos(p.get('ficha') or {}, p['nome'], p.get('marca'),
                                 [a.model_dump() for a in body.anuncios], config.get('modelo_descricao') or '')
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {'textos': textos}


# --- publicar e gerir -------------------------------------------------------------

class PublicarIn(BaseModel):
    ids: list[str]


@router.post('/publicar')
def publicar(body: PublicarIn, db=Depends(obter_db), cliente: MLCliente = Depends(obter_cliente_ml)):
    resultados = []
    for anuncio_id in body.ids:
        try:
            resultados.append(publicar_um(db, cliente, anuncio_id))
        except MLDesconectado:
            raise
        except Exception as e:  # um anúncio com problema não derruba os outros
            erro = f'Falha inesperada ({type(e).__name__})'
            gravar(db, anuncio_id, {'status': 'erro', 'erro': erro})
            resultados.append({'id': anuncio_id, 'status': 'erro', 'erro': erro})
    return {'resultados': resultados}


def _publicado(db, anuncio_id) -> dict:
    a = carregar_anuncio(db, anuncio_id)
    if not a:
        raise HTTPException(status_code=404, detail='Anúncio não encontrado')
    if not a.get('ml_item_id'):
        raise HTTPException(status_code=400, detail='Anúncio ainda não publicado')
    return a


@router.get('/{anuncio_id}/qualidade')
def qualidade(anuncio_id: str, db=Depends(obter_db), cliente: MLCliente = Depends(obter_cliente_ml)):
    a = _publicado(db, anuncio_id)
    perf = cliente.get(f"/item/{a['ml_item_id']}/performance")
    pendencias = [
        {'titulo': w.get('title'), 'texto': w.get('label'), 'link': w.get('link')}
        for b in perf.get('buckets') or [] for v in b.get('variables') or [] for r in v.get('rules') or []
        if r.get('status') != 'COMPLETED' for w in [r.get('wordings') or {}]
    ]
    score = round(float(perf['score'])) if perf.get('score') is not None else None
    nivel = perf.get('level_wording')
    gravar(db, anuncio_id, {'qualidade_score': score, 'qualidade_nivel': nivel, 'qualidade_em': agora()})
    return {'score': score, 'nivel': nivel, 'pendencias': pendencias}


@router.post('/{anuncio_id}/quantidade')
def quantidade(anuncio_id: str, db=Depends(obter_db), cliente: MLCliente = Depends(obter_cliente_ml)):
    a = _publicado(db, anuncio_id)
    produto = carregar_produto(db, a['produto_id']) or {}
    q = quantidade_disponivel(produto, ml_aberto(db, a['produto_id']), a['tipo'], a.get('ml'))
    cliente.put(f"/items/{a['ml_item_id']}", {'available_quantity': q})
    return {'quantidade': q}


class StatusIn(BaseModel):
    status: Literal['paused', 'active']


@router.post('/{anuncio_id}/status')
def alterar_status(anuncio_id: str, body: StatusIn, db=Depends(obter_db),
                   cliente: MLCliente = Depends(obter_cliente_ml)):
    a = _publicado(db, anuncio_id)
    cliente.put(f"/items/{a['ml_item_id']}", {'status': body.status})
    novo = 'pausado' if body.status == 'paused' else 'publicado'
    gravar(db, anuncio_id, {'status': novo})
    return {'status': novo}


class PrecoIn(BaseModel):
    preco: float = Field(gt=0)


@router.post('/{anuncio_id}/preco')
def alterar_preco(anuncio_id: str, body: PrecoIn, db=Depends(obter_db),
                  cliente: MLCliente = Depends(obter_cliente_ml)):
    a = _publicado(db, anuncio_id)
    preco = round(body.preco, 2)
    cliente.put(f"/items/{a['ml_item_id']}", {'price': preco})
    gravar(db, anuncio_id, {'preco': preco})
    return {'preco': preco}
