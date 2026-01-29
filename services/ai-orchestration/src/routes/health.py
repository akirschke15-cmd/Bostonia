from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {
        "success": True,
        "data": {
            "status": "healthy",
            "service": "ai-orchestration",
        },
    }


@router.get("/health/ready")
async def readiness_check() -> dict:
    """Readiness check endpoint."""
    # TODO: Check Anthropic API connectivity
    return {
        "success": True,
        "data": {
            "status": "ready",
            "service": "ai-orchestration",
        },
    }
