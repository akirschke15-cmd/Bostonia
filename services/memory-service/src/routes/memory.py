import json
import logging
from typing import Any

import redis.asyncio as redis
from fastapi import APIRouter, HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel

from src.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize clients
redis_client: redis.Redis | None = None
openai_client: AsyncOpenAI | None = None

try:
    redis_client = redis.from_url(settings.redis_url)
except Exception as e:
    logger.warning(f"Redis connection failed: {e}")

if settings.openai_api_key:
    openai_client = AsyncOpenAI(api_key=settings.openai_api_key)


class StoreMemoryRequest(BaseModel):
    """Request to store a memory."""

    conversation_id: str
    content: str
    memory_type: str = "fact"
    importance: float = 0.5


class RetrieveMemoryRequest(BaseModel):
    """Request to retrieve memories."""

    conversation_id: str
    query: str
    limit: int = 5


class MemoryResponse(BaseModel):
    """Memory response model."""

    id: str
    content: str
    memory_type: str
    importance: float
    relevance_score: float | None = None


async def get_embedding(text: str) -> list[float] | None:
    """Get embedding for text using OpenAI."""
    if not openai_client:
        return None

    try:
        response = await openai_client.embeddings.create(
            input=text,
            model=settings.embedding_model,
        )
        return response.data[0].embedding
    except Exception as e:
        logger.error(f"Embedding error: {e}")
        return None


@router.post("/memory/store")
async def store_memory(request: StoreMemoryRequest) -> dict[str, Any]:
    """Store a memory entry."""
    if not redis_client:
        raise HTTPException(status_code=503, detail="Memory service unavailable")

    try:
        # Generate memory ID
        memory_id = f"{request.conversation_id}:{hash(request.content)}"

        # Get embedding
        embedding = await get_embedding(request.content)

        # Store in Redis
        memory_data = {
            "id": memory_id,
            "conversation_id": request.conversation_id,
            "content": request.content,
            "type": request.memory_type,
            "importance": request.importance,
            "embedding": embedding,
        }

        # Store with TTL for short-term memory
        key = f"memory:{memory_id}"
        await redis_client.setex(
            key,
            settings.short_term_ttl,
            json.dumps(memory_data),
        )

        # Add to conversation's memory index
        index_key = f"memory_index:{request.conversation_id}"
        await redis_client.sadd(index_key, memory_id)
        await redis_client.expire(index_key, settings.short_term_ttl * 24)  # Keep index longer

        return {
            "success": True,
            "data": {
                "id": memory_id,
                "stored": True,
            },
        }
    except Exception as e:
        logger.error(f"Store memory error: {e}")
        raise HTTPException(status_code=500, detail="Failed to store memory")


@router.post("/memory/retrieve")
async def retrieve_memories(request: RetrieveMemoryRequest) -> dict[str, Any]:
    """Retrieve relevant memories for a query."""
    if not redis_client:
        raise HTTPException(status_code=503, detail="Memory service unavailable")

    try:
        # Get all memory IDs for this conversation
        index_key = f"memory_index:{request.conversation_id}"
        memory_ids = await redis_client.smembers(index_key)

        if not memory_ids:
            return {"success": True, "data": {"memories": []}}

        # Fetch all memories
        memories: list[dict[str, Any]] = []
        for mid in memory_ids:
            key = f"memory:{mid.decode() if isinstance(mid, bytes) else mid}"
            data = await redis_client.get(key)
            if data:
                memory = json.loads(data)
                memories.append(memory)

        # If we have embeddings, do semantic search
        query_embedding = await get_embedding(request.query)

        if query_embedding:
            # Calculate cosine similarity
            def cosine_similarity(a: list[float], b: list[float]) -> float:
                dot = sum(x * y for x, y in zip(a, b))
                norm_a = sum(x * x for x in a) ** 0.5
                norm_b = sum(x * x for x in b) ** 0.5
                return dot / (norm_a * norm_b) if norm_a and norm_b else 0

            for memory in memories:
                if memory.get("embedding"):
                    memory["relevance_score"] = cosine_similarity(
                        query_embedding, memory["embedding"]
                    )
                else:
                    memory["relevance_score"] = memory.get("importance", 0.5)

            # Sort by relevance
            memories.sort(key=lambda m: m.get("relevance_score", 0), reverse=True)
        else:
            # Sort by importance if no embeddings
            memories.sort(key=lambda m: m.get("importance", 0), reverse=True)

        # Return top memories
        top_memories = memories[: request.limit]

        return {
            "success": True,
            "data": {
                "memories": [
                    {
                        "id": m["id"],
                        "content": m["content"],
                        "type": m.get("type", "fact"),
                        "importance": m.get("importance", 0.5),
                        "relevance_score": m.get("relevance_score"),
                    }
                    for m in top_memories
                ],
            },
        }
    except Exception as e:
        logger.error(f"Retrieve memory error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve memories")


@router.delete("/memory/{conversation_id}")
async def clear_memories(conversation_id: str) -> dict[str, Any]:
    """Clear all memories for a conversation."""
    if not redis_client:
        raise HTTPException(status_code=503, detail="Memory service unavailable")

    try:
        # Get all memory IDs
        index_key = f"memory_index:{conversation_id}"
        memory_ids = await redis_client.smembers(index_key)

        # Delete all memories
        for mid in memory_ids:
            key = f"memory:{mid.decode() if isinstance(mid, bytes) else mid}"
            await redis_client.delete(key)

        # Delete index
        await redis_client.delete(index_key)

        return {
            "success": True,
            "data": {
                "cleared": len(memory_ids),
            },
        }
    except Exception as e:
        logger.error(f"Clear memory error: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear memories")


@router.get("/memory/{conversation_id}/summary")
async def get_memory_summary(conversation_id: str) -> dict[str, Any]:
    """Get summary of memories for a conversation."""
    if not redis_client:
        raise HTTPException(status_code=503, detail="Memory service unavailable")

    try:
        index_key = f"memory_index:{conversation_id}"
        memory_ids = await redis_client.smembers(index_key)

        return {
            "success": True,
            "data": {
                "conversation_id": conversation_id,
                "total_memories": len(memory_ids),
            },
        }
    except Exception as e:
        logger.error(f"Memory summary error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get memory summary")
