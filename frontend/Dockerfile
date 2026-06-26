FROM python:3.12-slim

WORKDIR /app

# Install uv via pip (faster and more reliable than curl install in containerized builds)
RUN pip install --no-cache-dir uv

# Install dependencies
COPY requirements.txt .
RUN uv pip install --system -r requirements.txt

# Copy application
COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
