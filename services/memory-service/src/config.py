from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""

    # Server
    port: int = 8002
    debug: bool = False

    # External services
    frontend_url: str = "http://localhost:3000"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Pinecone
    pinecone_api_key: str = ""
    pinecone_environment: str = ""
    pinecone_index_name: str = "bostonia-memories"

    # OpenAI (for embeddings)
    openai_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"

    # Memory settings
    short_term_ttl: int = 3600  # 1 hour
    max_memories_per_query: int = 10

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
