"""
Application Configuration
Loads environment variables and provides centralized config management
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Supabase
    supabase_url: str
    supabase_key: str
    supabase_service_role_key: str

    # OpenAI
    openai_api_key: str
    openai_embedding_model: str = "text-embedding-3-small"

    # Xero
    xero_client_id: str
    xero_client_secret: str
    xero_redirect_uri: str

    # Application
    environment: str = "development"
    debug: bool = True
    log_level: str = "INFO"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Security
    encryption_key: str

    # Processing Settings
    max_batch_size: int = 50
    vector_similarity_threshold: float = 0.95
    ai_confidence_threshold: float = 0.8
    math_tolerance: float = 0.01

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
