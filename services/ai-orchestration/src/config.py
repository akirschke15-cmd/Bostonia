from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""

    # Server
    port: int = 8001
    debug: bool = False

    # External services
    frontend_url: str = "http://localhost:3000"
    memory_service_url: str = "http://localhost:8002"
    moderation_service_url: str = "http://localhost:8003"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Anthropic
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"
    max_tokens: int = 4096
    temperature: float = 0.8

    # Rate limiting
    rate_limit_requests: int = 60
    rate_limit_window: int = 60

    class Config:
        env_file = "../../.env"
        extra = "ignore"


settings = Settings()
