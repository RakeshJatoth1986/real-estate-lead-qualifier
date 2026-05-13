import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # WhatsApp
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_ACCESS_TOKEN: str = ""
    WHATSAPP_VERIFY_TOKEN: str = "real_estate_verify_token"
    WHATSAPP_API_VERSION: str = "v19.0"

    # App
    APP_SECRET_KEY: str = "changeme_supersecret"
    DATABASE_URL: str = "sqlite:///./leads.db"

    # Google Form
    GOOGLE_FORM_SECRET: str = "form_secret_token"

    model_config = {
        # On Railway, RAILWAY_ENVIRONMENT is set automatically
        # In that case, skip .env file and use Railway's injected env vars
        "env_file": None if os.environ.get("RAILWAY_ENVIRONMENT") else ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
