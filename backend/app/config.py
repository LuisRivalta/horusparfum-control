# [CLAUDE-CODE-AUDIT]
# ID                 : 20261118-162018-18f2
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : config.py
# Assunto            : 
# Origem             : solicitacao do usuario
# Motivo             : Variaveis SHOPIFY_* e HORUS_SYNC_SECRET para a integracao Shopify
# Ultima modificacao : 2026-11-18 16:20:18
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
from pydantic_settings import BaseSettings
from pydantic_settings import SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = ""
    supabase_key: str = ""
    supabase_service_role_key: str = ""
    frontend_url: str = "http://localhost:5173"
    ml_client_id: str = ""
    ml_client_secret: str = ""
    ml_redirect_uri: str = ""
    shopify_loja: str = ""
    shopify_client_id: str = ""
    shopify_client_secret: str = ""
    horus_sync_secret: str = ""
    anthropic_api_key: str = ""


settings = Settings()
