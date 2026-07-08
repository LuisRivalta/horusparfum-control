from fastapi import HTTPException, status

from app.auth.deps import ADMIN_EMAIL


def _get_value(obj, key: str):
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def _normalize_user(user) -> dict:
    return {
        'id': _get_value(user, 'id'),
        'email': _get_value(user, 'email'),
        'created_at': _get_value(user, 'created_at'),
        'last_sign_in_at': _get_value(user, 'last_sign_in_at'),
    }


def _response_user(response):
    return _get_value(response, 'user') or response


def list_auth_users(supabase) -> list[dict]:
    response = supabase.auth.admin.list_users()
    users = _get_value(response, 'users') or _get_value(response, 'data') or []
    return [_normalize_user(user) for user in users]


def create_auth_user(supabase, email: str, password: str) -> dict:
    response = supabase.auth.admin.create_user(
        {
            'email': email,
            'password': password,
            'email_confirm': True,
        }
    )
    return _normalize_user(_response_user(response))


def delete_auth_user(supabase, user_id: str, admin_email: str = ADMIN_EMAIL) -> dict:
    response = supabase.auth.admin.get_user_by_id(user_id)
    user = _response_user(response)
    email = (_get_value(user, 'email') or '').lower()

    if email == admin_email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='O admin principal nao pode ser removido',
        )

    supabase.auth.admin.delete_user(user_id)
    return {'users': 1}


ADMIN_ENTITIES = {
    'produtos': {'table': 'produtos', 'select': 'id,nome,created_at', 'label': 'nome', 'order': 'created_at'},
    'pedidos': {'table': 'pedidos', 'select': 'id,numero,status,created_at', 'label': 'numero', 'order': 'created_at'},
    'vendas': {'table': 'vendas', 'select': 'id,numero,cliente,created_at', 'label': 'cliente', 'order': 'created_at'},
    'transacoes': {'table': 'transacoes', 'select': 'id,descricao,created_at', 'label': 'descricao', 'order': 'created_at'},
    'contas': {'table': 'contas', 'select': 'id,descricao,entidade,created_at', 'label': 'descricao', 'order': 'created_at'},
    'metas': {'table': 'metas', 'select': 'id,label,created_at', 'label': 'label', 'order': 'created_at'},
    'categorias': {'table': 'categorias', 'select': 'id,nome,created_at', 'label': 'nome', 'order': 'created_at'},
    'marcas': {'table': 'marcas', 'select': 'id,nome,created_at', 'label': 'nome', 'order': 'created_at'},
    'fornecedores': {'table': 'fornecedores', 'select': 'id,nome,created_at', 'label': 'nome', 'order': 'created_at'},
    'canais': {'table': 'canais', 'select': 'id,nome,created_at', 'label': 'nome', 'order': 'created_at'},
    'embalagens': {'table': 'embalagens_decant', 'select': 'id,tamanho_ml,custo', 'label': 'tamanho_ml', 'order': None},
}


def _invalid_entity():
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Entidade administrativa invalida')


def _data(response):
    return _get_value(response, 'data') or []


def _ids(rows, key='id'):
    return [row.get(key) for row in rows if row.get(key) is not None]


def _add(summary, table, rows):
    count = len(rows or [])
    if count:
        summary[table] = summary.get(table, 0) + count


def _select_eq(supabase, table, columns, column, value):
    return _data(supabase.table(table).select(columns).eq(column, value).execute())


def _delete_eq(supabase, summary, table, column, value):
    rows = _data(supabase.table(table).delete().eq(column, value).execute())
    _add(summary, table, rows)
    return rows

def _delete_in(supabase, summary, table, column, values):
    values = [value for value in values if value is not None]
    if not values:
        return []
    rows = _data(supabase.table(table).delete().in_(column, values).execute())
    _add(summary, table, rows)
    return rows


def list_admin_entities(supabase, entity, search=None):
    config = ADMIN_ENTITIES.get(entity)
    if config is None:
        _invalid_entity()
    query = supabase.table(config['table']).select(config['select'])
    if search and config.get('label'):
        query = query.ilike(config['label'], f'%%{search}%%')
    if config.get('order'):
        query = query.order(config['order'], desc=True)
    return _data(query.limit(50).execute())


def _delete_venda(supabase, venda_id):
    summary = {}
    itens = _select_eq(supabase, 'venda_itens', 'id,decant_id', 'venda_id', venda_id)
    decant_ids = _ids(itens, 'decant_id')
    _delete_eq(supabase, summary, 'transacoes', 'venda_id', venda_id)
    _delete_eq(supabase, summary, 'venda_itens', 'venda_id', venda_id)
    _delete_in(supabase, summary, 'decants', 'id', decant_ids)
    _delete_eq(supabase, summary, 'vendas', 'id', venda_id)
    return summary


def _delete_pedido(supabase, pedido_id):
    summary = {}
    _delete_eq(supabase, summary, 'divergencias', 'pedido_id', pedido_id)
    _delete_eq(supabase, summary, 'pedido_itens', 'pedido_id', pedido_id)
    _delete_eq(supabase, summary, 'pedidos', 'id', pedido_id)
    return summary


def _delete_simple(supabase, entity, item_id):
    config = ADMIN_ENTITIES.get(entity)
    if config is None:
        _invalid_entity()
    summary = {}
    _delete_eq(supabase, summary, config['table'], 'id', item_id)
    return summary


def delete_admin_entity(supabase, entity, item_id):
    if entity == 'vendas':
        return _delete_venda(supabase, item_id)
    if entity == 'pedidos':
        return _delete_pedido(supabase, item_id)
    if entity == 'produtos':
        return _delete_produto(supabase, item_id)
    return _delete_simple(supabase, entity, item_id)


def _delete_produto(supabase, produto_id):
    summary = {}
    pedido_itens = _select_eq(supabase, 'pedido_itens', 'id,pedido_id', 'produto_id', produto_id)
    pedido_item_ids = _ids(pedido_itens)
    frascos = _select_eq(supabase, 'frascos_abertos', 'id', 'produto_id', produto_id)
    frasco_ids = _ids(frascos)
    venda_itens = _select_eq(supabase, 'venda_itens', 'id,venda_id,decant_id', 'produto_id', produto_id)
    venda_ids = _ids(venda_itens, 'venda_id')
    product_decants = _select_eq(supabase, 'decants', 'id', 'produto_id', produto_id)
    decant_ids = _ids(venda_itens, 'decant_id')
    for row in product_decants:
        if row.get('id') not in decant_ids:
            decant_ids.append(row.get('id'))
    _delete_eq(supabase, summary, 'movimentacoes', 'produto_id', produto_id)
    _delete_in(supabase, summary, 'divergencias', 'pedido_item_id', pedido_item_ids)
    _delete_eq(supabase, summary, 'pedido_itens', 'produto_id', produto_id)
    _delete_in(supabase, summary, 'transacoes', 'venda_id', venda_ids)
    _delete_eq(supabase, summary, 'venda_itens', 'produto_id', produto_id)
    _delete_in(supabase, summary, 'decants', 'id', decant_ids)
    _delete_in(supabase, summary, 'frascos_abertos', 'id', frasco_ids)
    _delete_in(supabase, summary, 'vendas', 'id', venda_ids)
    _delete_eq(supabase, summary, 'produtos', 'id', produto_id)
    return summary
