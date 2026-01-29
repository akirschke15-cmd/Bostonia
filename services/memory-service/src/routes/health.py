from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {
        "success": True,
        "data": {
            "status": "healthy",
            "service": "memory-service",
        },
    }
