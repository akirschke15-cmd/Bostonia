from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""

    # Server
    port: int = 8003
    debug: bool = False

    # External services
    frontend_url: str = "http://localhost:3000"

    # Anthropic (for AI-based moderation)
    anthropic_api_key: str = ""

    # Moderation thresholds
    severity_threshold_low: float = 0.3
    severity_threshold_medium: float = 0.6
    severity_threshold_high: float = 0.8

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
