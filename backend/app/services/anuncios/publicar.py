# [CLAUDE-CODE-AUDIT]
# ID                 : 20261116-152622-8839
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Publicacao de anuncios
# Assunto            : Monta o item do ML e publica sem duplicar
# Origem             : solicitacao do usuario
# Motivo             : Brief da Task 7 pede montar_item, quantidade_disponivel e a publicacao isolada por anuncio.
# Criado em          : 2026-11-16 15:25:28
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
"""Monta o item do ML a partir do rascunho e publica um anúncio sem duplicar."""
from datetime import datetime, timezone
from decimal import Decimal

from app.services.anuncios.preco import FRETE_GRATIS_A_PARTIR, Pacote
from app.services.mercadolivre import MLErro

CATEGORIA = 'MLB6284'
SEM_GTIN_DECANT = '17055160'


def _num(v) -> str:
    """Número como texto sem zeros à direita: 5.0 → '5', 15.50 → '15.5'."""
    return f'{Decimal(str(v)).normalize():f}'


def agora() -> str:
    return datetime.now(timezone.utc).isoformat()


def quantidade_disponivel(produto: dict, ml_aberto: float, tipo: str, ml: float | None) -> int:
    lacrados = max(int(produto.get('estoque_atual') or 0), 0)
    if tipo == 'frasco' or not ml or ml <= 0:
        return lacrados
    total = Decimal(lacrados) * Decimal(str(produto.get('volume_ml') or 0)) + Decimal(str(ml_aberto or 0))
    return max(int(total // Decimal(str(ml))), 0)


def montar_item(anuncio: dict, produto: dict, user_product: bool, quantidade: int, pacote: Pacote) -> dict:
    attrs = {}
    for aid, v in (produto.get('ficha') or {}).items():
        attrs[aid] = {'id': aid, 'value_id': v['value_id']} if v.get('value_id') else {'id': aid, 'value_name': v.get('value_name')}
    attrs.setdefault('BRAND', {'id': 'BRAND', 'value_name': produto.get('marca')})
    attrs.setdefault('PERFUME_NAME', {'id': 'PERFUME_NAME', 'value_name': produto.get('nome')})
    decant = anuncio['tipo'] == 'decant'
    ml = anuncio['ml'] if decant else produto.get('volume_ml')
    if ml:
        attrs['UNIT_VOLUME'] = {'id': 'UNIT_VOLUME', 'value_name': f'{_num(ml)} mL'}
    if decant:
        attrs.pop('GTIN', None)  # decant nunca leva o código de barras do frasco
        attrs['EMPTY_GTIN_REASON'] = {'id': 'EMPTY_GTIN_REASON', 'value_id': SEM_GTIN_DECANT}
    elif produto.get('gtin'):
        attrs.pop('EMPTY_GTIN_REASON', None)
        attrs['GTIN'] = {'id': 'GTIN', 'value_name': produto['gtin']}
    for aid, v in (('SELLER_PACKAGE_HEIGHT', pacote.altura_cm), ('SELLER_PACKAGE_WIDTH', pacote.largura_cm),
                   ('SELLER_PACKAGE_LENGTH', pacote.comprimento_cm), ('SELLER_PACKAGE_WEIGHT', pacote.peso_g)):
        if v is not None:
            attrs[aid] = {'id': aid, 'value_name': _num(int(v) if aid == 'SELLER_PACKAGE_WEIGHT' else v)}

    preco = Decimal(str(anuncio['preco']))
    return {
        ('family_name' if user_product else 'title'): anuncio['titulo'],
        'category_id': CATEGORIA,
        'price': float(preco),
        'currency_id': 'BRL',
        'available_quantity': quantidade,
        'buying_mode': 'buy_it_now',
        'condition': 'new',
        'listing_type_id': anuncio['listing_type'],
        'pictures': [{'source': u} for u in anuncio.get('fotos') or []],
        'attributes': list(attrs.values()),
        'shipping': {'mode': 'me2', 'free_shipping': preco >= FRETE_GRATIS_A_PARTIR},
    }


# --- leitura do banco ---------------------------------------------------------

def carregar_produto(db, produto_id) -> dict | None:
    dados = db.table('produtos').select(
        'id, nome, volume_ml, marca_id, estoque_atual, gtin, ficha').eq('id', produto_id).execute().data
    if not dados:
        return None
    produto = dados[0]
    marca = db.table('marcas').select('nome').eq('id', produto.get('marca_id')).execute().data if produto.get('marca_id') else []
    produto['marca'] = marca[0]['nome'] if marca else None
    return produto


def ml_aberto(db, produto_id) -> float:
    linhas = db.table('frascos_abertos').select('ml_restante').eq('produto_id', produto_id).eq('status', 'ativo').execute().data
    return float(sum(Decimal(str(r.get('ml_restante') or 0)) for r in linhas))


def pacote_envio(db, tipo: str) -> Pacote:
    linhas = db.table('insumo_listas').select('peso_g, altura_cm, largura_cm, comprimento_cm').eq('tipo', f'envio_{tipo}').execute().data
    k = linhas[0] if linhas else {}
    dec = lambda v: None if v is None else Decimal(str(v))
    return Pacote(k.get('peso_g'), dec(k.get('altura_cm')), dec(k.get('largura_cm')), dec(k.get('comprimento_cm')))


def carregar_anuncio(db, anuncio_id) -> dict | None:
    dados = db.table('anuncios').select('*').eq('id', anuncio_id).execute().data
    return dados[0] if dados else None


def gravar(db, anuncio_id, campos: dict) -> None:
    db.table('anuncios').update({**campos, 'updated_at': agora()}).eq('id', anuncio_id).execute()


# --- publicação ---------------------------------------------------------------

def publicar_um(db, cliente, anuncio_id) -> dict:
    """Publica um rascunho; nunca cria o item de novo se já há ml_item_id. MLDesconectado sobe."""
    a = carregar_anuncio(db, anuncio_id)
    if not a:
        return {'id': anuncio_id, 'status': 'erro', 'erro': 'Anúncio não encontrado'}
    if a.get('ml_item_id') or a.get('status') not in ('rascunho', 'erro'):
        return {'id': anuncio_id, 'status': a.get('status'), 'ml_item_id': a.get('ml_item_id'), 'erro': a.get('erro')}

    produto = carregar_produto(db, a['produto_id'])
    if not produto:
        gravar(db, anuncio_id, {'status': 'erro', 'erro': 'Perfume não encontrado'})
        return {'id': anuncio_id, 'status': 'erro', 'erro': 'Perfume não encontrado'}
    qtd = quantidade_disponivel(produto, ml_aberto(db, a['produto_id']), a['tipo'], a.get('ml'))
    item = montar_item(a, produto, cliente.user_product, qtd, pacote_envio(db, a['tipo']))
    try:
        criado = cliente.post('/items', item)
    except MLErro as e:
        gravar(db, anuncio_id, {'status': 'erro', 'erro': e.mensagem})
        return {'id': anuncio_id, 'status': 'erro', 'erro': e.mensagem}

    ml_id = criado['id']
    # Grava já: daqui em diante uma nova tentativa não cria outro item.
    gravar(db, anuncio_id, {'status': 'publicado', 'ml_item_id': ml_id, 'permalink': criado.get('permalink'), 'erro': None})
    erros = []
    try:
        cliente.post(f'/items/{ml_id}/description', {'plain_text': a.get('descricao') or ''})
    except MLErro as e:
        erros.append(f'Descrição: {e.mensagem}')
    try:
        situacao = cliente.get(f'/items/{ml_id}')
        if situacao.get('status') == 'closed':
            sub = situacao.get('sub_status') or []
            erros.append('ML fechou o anúncio: ' + (', '.join(sub) if isinstance(sub, list) else str(sub)))
    except MLErro:
        pass  # conferência opcional; o item já foi criado
    erro = '; '.join(erros) or None
    if erro:
        gravar(db, anuncio_id, {'erro': erro})
    return {'id': anuncio_id, 'status': 'publicado', 'ml_item_id': ml_id, 'erro': erro}
