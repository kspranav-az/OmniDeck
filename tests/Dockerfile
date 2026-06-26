FROM python:3.12-slim-bookworm

# Install system deps + Docker CLI + MinIO client + DB tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    make \
    jq \
    redis-tools \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg arch=$(dpkg --print-architecture)] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-16 docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/* \
    && ARCH=$(uname -m) \
    && if [ "$ARCH" = "aarch64" ]; then MINIO_ARCH="arm64"; else MINIO_ARCH="$ARCH"; fi \
    && curl -fsSL -o /usr/local/bin/mc https://dl.min.io/client/mc/release/linux-${MINIO_ARCH}/mc \
    && chmod +x /usr/local/bin/mc

# Install MongoDB Database Tools (mongodump, mongorestore, etc.)
# MongoDB does not publish Debian arm64 packages, so use the Ubuntu 22.04 arm64 .deb
# which installs cleanly on Debian bookworm.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgssapi-krb5-2 \
    && ARCH=$(uname -m) \
    && case "$ARCH" in \
        aarch64|arm64) MONGO_TOOLS_URL="https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2204-arm64-100.17.0.deb" ;; \
        x86_64|amd64) MONGO_TOOLS_URL="https://fastdl.mongodb.org/tools/db/mongodb-database-tools-debian12-x86_64-100.17.0.deb" ;; \
        *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
    esac \
    && curl -fsSL -o /tmp/mongodb-database-tools.deb "$MONGO_TOOLS_URL" \
    && dpkg -i /tmp/mongodb-database-tools.deb \
    && rm /tmp/mongodb-database-tools.deb \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    cp /root/.local/bin/uv /usr/local/bin/uv

# Set working dir
WORKDIR /workspace

# Pre-install test dependencies with uv
RUN uv pip install --system pytest httpx psycopg[binary] pymongo redis minio sqlalchemy
