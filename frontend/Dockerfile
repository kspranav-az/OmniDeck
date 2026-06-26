# Stage 1: Build React SPA
FROM node:20-slim AS node-build

WORKDIR /app

# Install dependencies and build
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Python runtime
FROM python:3.12-slim-bookworm

WORKDIR /app

# Install uv via pip
RUN pip install --no-cache-dir uv

# Install system tools: curl, postgresql-client-16, redis-tools, and MinIO client
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    lsb-release \
    redis-tools \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg arch=$(dpkg --print-architecture)] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-16 \
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

# Install Python dependencies
COPY requirements.txt .
RUN uv pip install --system -r requirements.txt

# Copy backend application
COPY . .

# Copy built React SPA from node-build stage
COPY --from=node-build /app/dist ./dist

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
