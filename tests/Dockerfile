FROM python:3.12-slim

# Install system deps + Docker CLI + MinIO client
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    make \
    jq \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/* \
    && ARCH=$(uname -m) \
    && if [ "$ARCH" = "aarch64" ]; then MINIO_ARCH="arm64"; else MINIO_ARCH="$ARCH"; fi \
    && curl -fsSL -o /usr/local/bin/mc https://dl.min.io/client/mc/release/linux-${MINIO_ARCH}/mc \
    && chmod +x /usr/local/bin/mc

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    cp /root/.local/bin/uv /usr/local/bin/uv

# Set working dir
WORKDIR /workspace

# Pre-install test dependencies with uv
RUN uv pip install --system pytest httpx psycopg[binary] pymongo redis minio sqlalchemy
