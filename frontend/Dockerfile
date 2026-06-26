FROM python:3.12-slim

WORKDIR /app

# Install uv via pip
RUN pip install --no-cache-dir uv

# Install MinIO client (mc) for bucket/user management
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ARCH=$(uname -m) \
    && if [ "$ARCH" = "aarch64" ]; then MINIO_ARCH="arm64"; else MINIO_ARCH="$ARCH"; fi \
    && curl -fsSL -o /usr/local/bin/mc https://dl.min.io/client/mc/release/linux-${MINIO_ARCH}/mc \
    && chmod +x /usr/local/bin/mc

# Install dependencies
COPY requirements.txt .
RUN uv pip install --system -r requirements.txt

# Copy application
COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
