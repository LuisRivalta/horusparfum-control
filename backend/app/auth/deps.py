from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db.supabase import get_supabase

security = HTTPBearer()


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token invalido",
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    token = credentials.credentials

    try:
        response = get_supabase().auth.get_user(token)
    except Exception:
        raise _unauthorized()

    user = getattr(response, "user", None)
    if user is None:
        raise _unauthorized()

    return {
        "sub": getattr(user, "id", None),
        "email": getattr(user, "email", None),
    }
