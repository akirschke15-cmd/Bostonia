import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.routes import chat, health

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    logger.info("Starting AI Orchestration Service")
    yield
    logger.info("Shutting down AI Orchestration Service")


app = FastAPI(
    title="Bostonia AI Orchestration Service",
    description="Claude AI integration for character conversations",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(chat.router, prefix="/api", tags=["Chat"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.debug,
    )
