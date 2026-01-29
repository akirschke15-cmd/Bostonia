import json
import logging
from typing import Any, AsyncGenerator

import httpx
from anthropic import Anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from src.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize Anthropic client
client = Anthropic(api_key=settings.anthropic_api_key) if settings.anthropic_api_key else None


class ChatRequest(BaseModel):
    """Chat request model."""

    conversation_id: str
    message: str
    user_id: str


class ChatResponse(BaseModel):
    """Chat response model."""

    content: str
    metadata: dict[str, Any] | None = None


async def get_conversation_context(conversation_id: str) -> dict[str, Any]:
    """Fetch conversation context from chat service."""
    try:
        async with httpx.AsyncClient() as http_client:
            # Get conversation details
            conv_response = await http_client.get(
                f"http://localhost:3004/api/conversations/{conversation_id}"
            )
            if conv_response.status_code != 200:
                raise HTTPException(status_code=404, detail="Conversation not found")

            conv_data = conv_response.json()
            if not conv_data.get("success"):
                raise HTTPException(status_code=404, detail="Conversation not found")

            conversation = conv_data["data"]

            # Get recent messages
            messages_response = await http_client.get(
                f"http://localhost:3004/api/conversations/{conversation_id}/messages",
                params={"limit": 20},
            )
            messages_data = messages_response.json()
            messages = messages_data.get("data", [])

            return {
                "conversation": conversation,
                "messages": messages,
                "character": conversation.get("character", {}),
            }
    except httpx.RequestError as e:
        logger.error(f"Error fetching conversation context: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch conversation context")


async def get_memory_context(conversation_id: str, message: str) -> list[str]:
    """Fetch relevant memories from memory service."""
    try:
        async with httpx.AsyncClient() as http_client:
            response = await http_client.post(
                f"{settings.memory_service_url}/api/memory/retrieve",
                json={
                    "conversation_id": conversation_id,
                    "query": message,
                    "limit": 5,
                },
            )
            if response.status_code == 200:
                data = response.json()
                return [m["content"] for m in data.get("data", {}).get("memories", [])]
    except httpx.RequestError as e:
        logger.warning(f"Memory service unavailable: {e}")

    return []


async def check_moderation(content: str) -> dict[str, Any]:
    """Check content with moderation service."""
    try:
        async with httpx.AsyncClient() as http_client:
            response = await http_client.post(
                f"{settings.moderation_service_url}/api/moderate",
                json={"content": content},
            )
            if response.status_code == 200:
                return response.json().get("data", {"passed": True})
    except httpx.RequestError as e:
        logger.warning(f"Moderation service unavailable: {e}")

    # Default to allowing if moderation is unavailable
    return {"passed": True, "flags": []}


def build_messages(
    character: dict[str, Any],
    messages: list[dict[str, Any]],
    user_message: str,
    memories: list[str],
) -> list[dict[str, str]]:
    """Build message history for Claude."""
    result: list[dict[str, str]] = []

    # Add memory context if available
    memory_context = ""
    if memories:
        memory_context = "\n\nRelevant context from previous conversations:\n"
        memory_context += "\n".join(f"- {m}" for m in memories)

    # Add conversation history
    for msg in messages:
        role = "user" if msg["role"] == "USER" else "assistant"
        result.append({"role": role, "content": msg["content"]})

    # Add current user message
    result.append({"role": "user", "content": user_message + memory_context})

    return result


@router.post("/chat")
async def chat(request: ChatRequest) -> dict[str, Any]:
    """Process a chat message and return AI response."""
    if not client:
        raise HTTPException(status_code=503, detail="AI service not configured")

    # Check moderation
    moderation = await check_moderation(request.message)
    if not moderation.get("passed", True):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "CONTENT_BLOCKED",
                "message": "Message blocked by content moderation",
                "flags": moderation.get("flags", []),
            },
        )

    # Get context
    context = await get_conversation_context(request.conversation_id)
    character = context["character"]
    messages = context["messages"]

    # Get memories
    memories = await get_memory_context(request.conversation_id, request.message)

    # Build system prompt
    system_prompt = character.get("systemPrompt", "You are a helpful AI assistant.")

    # Build messages
    claude_messages = build_messages(character, messages, request.message, memories)

    try:
        # Call Claude
        response = client.messages.create(
            model=settings.claude_model,
            max_tokens=settings.max_tokens,
            temperature=settings.temperature,
            system=system_prompt,
            messages=claude_messages,
        )

        content = response.content[0].text if response.content else ""

        # Check response moderation
        response_moderation = await check_moderation(content)
        if not response_moderation.get("passed", True):
            content = "I apologize, but I cannot provide that response."

        return {
            "success": True,
            "data": {
                "content": content,
                "metadata": {
                    "model": response.model,
                    "prompt_tokens": response.usage.input_tokens,
                    "completion_tokens": response.usage.output_tokens,
                },
            },
        }
    except Exception as e:
        logger.error(f"Claude API error: {e}")
        raise HTTPException(status_code=500, detail="AI service error")


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest) -> EventSourceResponse:
    """Process a chat message and stream the AI response using Server-Sent Events."""
    if not client:
        raise HTTPException(status_code=503, detail="AI service not configured")

    # Check moderation
    moderation = await check_moderation(request.message)
    if not moderation.get("passed", True):
        raise HTTPException(status_code=400, detail="Message blocked by content moderation")

    # Get context
    context = await get_conversation_context(request.conversation_id)
    character = context["character"]
    messages = context["messages"]

    # Get memories
    memories = await get_memory_context(request.conversation_id, request.message)

    # Build system prompt
    system_prompt = character.get("systemPrompt", "You are a helpful AI assistant.")

    # Build messages
    claude_messages = build_messages(character, messages, request.message, memories)

    async def generate() -> AsyncGenerator[dict[str, Any], None]:
        """Generate SSE events for streaming response."""
        full_content = ""
        try:
            with client.messages.stream(
                model=settings.claude_model,
                max_tokens=settings.max_tokens,
                temperature=settings.temperature,
                system=system_prompt,
                messages=claude_messages,
            ) as stream:
                for text in stream.text_stream:
                    full_content += text
                    yield {
                        "event": "chunk",
                        "data": json.dumps({"content": text}),
                    }

                # Send completion event with full content
                yield {
                    "event": "done",
                    "data": json.dumps({
                        "content": full_content,
                        "metadata": {
                            "model": settings.claude_model,
                        },
                    }),
                }
        except Exception as e:
            logger.error(f"Claude streaming error: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"error": "AI service unavailable"}),
            }

    return EventSourceResponse(generate())
