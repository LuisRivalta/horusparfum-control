from supabase import create_client

from app.config import settings


def get_supabase():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
