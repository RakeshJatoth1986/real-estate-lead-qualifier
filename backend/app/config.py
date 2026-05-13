from pydantic_settings import BaseSettings
from typing import Optional


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

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
