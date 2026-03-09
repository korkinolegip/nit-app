FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy and install dependencies
COPY pyproject.toml ./
COPY . .
RUN pip install --no-cache-dir -e '.[moderation]'

RUN chmod +x start.sh
CMD ["bash", "start.sh"]
