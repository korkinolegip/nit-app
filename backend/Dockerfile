FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy and install dependencies
COPY pyproject.toml ./
COPY . .
RUN pip install --no-cache-dir -e '.[moderation]'

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
