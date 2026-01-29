FROM python:3.11-slim

WORKDIR /app

# Install poetry
RUN pip install poetry==1.7.1

# Copy dependency files
COPY pyproject.toml poetry.lock* ./

# Install dependencies
RUN poetry config virtualenvs.create false \
    && poetry install --no-interaction --no-ansi --no-dev

# Copy source code
COPY src ./src

# Create non-root user
RUN adduser --disabled-password --gecos '' appuser
USER appuser

EXPOSE 8001

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]
