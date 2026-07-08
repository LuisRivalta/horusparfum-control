from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.deps import get_admin_user
from app.db.supabase import get_supabase
from app.services.admin import create_auth_user, delete_auth_user, list_auth_users

router = APIRouter()


class AdminCreateUserRequest(BaseModel):
    email: str
    password: str = Field(min_length=6)


@router.get('/users')
def listar_usuarios_admin(_admin: dict = Depends(get_admin_user)):
    return {'users': list_auth_users(get_supabase())}


@router.post('/users', status_code=status.HTTP_201_CREATED)
def criar_usuario_admin(
    payload: AdminCreateUserRequest,
    _admin: dict = Depends(get_admin_user),
):
    try:
        user = create_auth_user(get_supabase(), payload.email, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    return {'user': user}


@router.delete('/users/{user_id}')
def remover_usuario_admin(
    user_id: str,
    admin: dict = Depends(get_admin_user),
):
    deleted = delete_auth_user(get_supabase(), user_id, admin.get('email') or '')
    return {'deleted': deleted}
