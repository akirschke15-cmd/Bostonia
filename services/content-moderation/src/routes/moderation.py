import logging
import re
from typing import Any

from anthropic import Anthropic
from fastapi import APIRouter
from pydantic import BaseModel

from src.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize Anthropic client for AI moderation
claude_client = Anthropic(api_key=settings.anthropic_api_key) if settings.anthropic_api_key else None

# Keyword-based filters (basic safety net)
BLOCKED_PATTERNS = [
    # Violence
    r"\b(kill|murder|harm|attack|hurt)\s+(yourself|myself|people|someone)\b",
    # Self-harm
    r"\b(suicide|self[- ]?harm|end\s+(my|your)\s+life)\b",
    # Illegal activities
    r"\b(how\s+to\s+(make|create|build)\s+(bomb|weapon|drug))\b",
    # Personal information solicitation
    r"\b(what['\u2019]?s\s+your\s+(address|phone|ssn|credit\s+card))\b",
]

# Categories for classification
MODERATION_CATEGORIES = [
    "violence",
    "self_harm",
    "sexual_explicit",
    "hate_speech",
    "harassment",
    "illegal_activity",
    "personal_info",
    "spam",
]


class ModerationRequest(BaseModel):
    """Content moderation request."""

    content: str
    filter_level: str = "moderate"  # strict, moderate, relaxed


class ModerationFlag(BaseModel):
    """A moderation flag."""

    category: str
    severity: str
    description: str


class ModerationResponse(BaseModel):
    """Moderation result."""

    passed: bool
    flags: list[ModerationFlag]
    score: float


def check_keyword_filters(content: str) -> list[ModerationFlag]:
    """Check content against keyword-based filters."""
    flags: list[ModerationFlag] = []
    content_lower = content.lower()

    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, content_lower, re.IGNORECASE):
            flags.append(
                ModerationFlag(
                    category="keyword_match",
                    severity="high",
                    description=f"Content matched blocked pattern",
                )
            )

    return flags


async def check_ai_moderation(content: str) -> tuple[list[ModerationFlag], float]:
    """Use Claude to analyze content for safety issues."""
    if not claude_client:
        return [], 0.0

    try:
        prompt = f"""Analyze the following content for safety issues. Respond with a JSON object containing:
- "flags": array of objects with "category" (one of: violence, self_harm, sexual_explicit, hate_speech, harassment, illegal_activity, personal_info, spam), "severity" (low/medium/high), and "description"
- "score": overall safety score from 0 (completely safe) to 1 (extremely unsafe)

Content to analyze:
"{content}"

Respond ONLY with valid JSON, no other text."""

        response = claude_client.messages.create(
            model="claude-haiku-4-20250514",  # Use faster model for moderation
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = response.content[0].text if response.content else "{}"

        # Parse JSON response
        import json

        try:
            result = json.loads(response_text)
            flags = [
                ModerationFlag(
                    category=f.get("category", "unknown"),
                    severity=f.get("severity", "low"),
                    description=f.get("description", ""),
                )
                for f in result.get("flags", [])
            ]
            score = float(result.get("score", 0))
            return flags, score
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse AI moderation response: {response_text}")
            return [], 0.0

    except Exception as e:
        logger.error(f"AI moderation error: {e}")
        return [], 0.0


@router.post("/moderate")
async def moderate_content(request: ModerationRequest) -> dict[str, Any]:
    """Moderate content for safety."""
    all_flags: list[ModerationFlag] = []

    # Check keyword filters first (fast)
    keyword_flags = check_keyword_filters(request.content)
    all_flags.extend(keyword_flags)

    # If keyword filter caught something high severity, block immediately
    if any(f.severity == "high" for f in keyword_flags):
        return {
            "success": True,
            "data": ModerationResponse(
                passed=False,
                flags=all_flags,
                score=1.0,
            ).model_dump(),
        }

    # AI moderation for more nuanced analysis
    ai_flags, ai_score = await check_ai_moderation(request.content)
    all_flags.extend(ai_flags)

    # Calculate final score
    final_score = ai_score
    if keyword_flags:
        final_score = max(final_score, 0.5)

    # Determine if content passes based on filter level
    thresholds = {
        "strict": settings.severity_threshold_low,
        "moderate": settings.severity_threshold_medium,
        "relaxed": settings.severity_threshold_high,
    }
    threshold = thresholds.get(request.filter_level, settings.severity_threshold_medium)

    passed = final_score < threshold and not any(f.severity == "high" for f in all_flags)

    return {
        "success": True,
        "data": ModerationResponse(
            passed=passed,
            flags=all_flags,
            score=final_score,
        ).model_dump(),
    }


@router.post("/moderate/batch")
async def moderate_batch(contents: list[str]) -> dict[str, Any]:
    """Moderate multiple pieces of content."""
    results = []

    for content in contents[:10]:  # Limit batch size
        keyword_flags = check_keyword_filters(content)
        ai_flags, ai_score = await check_ai_moderation(content)

        all_flags = keyword_flags + ai_flags
        passed = ai_score < settings.severity_threshold_medium and not any(
            f.severity == "high" for f in all_flags
        )

        results.append(
            ModerationResponse(
                passed=passed,
                flags=all_flags,
                score=ai_score,
            ).model_dump()
        )

    return {
        "success": True,
        "data": {"results": results},
    }


@router.get("/categories")
async def get_categories() -> dict[str, Any]:
    """Get available moderation categories."""
    return {
        "success": True,
        "data": {
            "categories": MODERATION_CATEGORIES,
            "severity_levels": ["low", "medium", "high"],
            "filter_levels": ["strict", "moderate", "relaxed"],
        },
    }
