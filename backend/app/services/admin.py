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
