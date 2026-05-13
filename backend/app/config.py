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
        # Only load .env file in local development (when file exists)
        # On Railway, env vars are injected directly — no .env file needed
        "env_file": ".env" if os.path.exists(".env") else None,
        "env_file_encoding": "utf-8",
        "extra": "ignore",
        # Environment variables always take priority over .env file
        "env_prefix": "",
    }


settings = Settings()
