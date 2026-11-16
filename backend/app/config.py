# [CLAUDE-CODE-AUDIT]
# ID                 : 20261116-145142-de7e
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : config.py
# Assunto            : 
# Origem             : solicitacao do usuario
# Motivo             : Brief da Task 2 pede as variaveis do ML/Anthropic e o registro do router mercadolivre.
# Ultima modificacao : 2026-11-16 14:51:42
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
    anthropic_api_key: str = ""


settings = Settings()
