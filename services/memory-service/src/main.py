import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.routes import health, memory

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    logger.info("Starting Memory Service")
    yield
    logger.info("Shutting down Memory Service")


app = FastAPI(
    title="Bostonia Memory Service",
    description="RAG-based memory management for conversations",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["Health"])
app.include_router(memory.router, prefix="/api", tags=["Memory"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.debug,
    )
