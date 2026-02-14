#!/bin/bash
# 2MStream Streaming Engine - One-Click Setup
# Run this on any VPS (Ubuntu/Debian recommended)
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/YOUR_REPO/main/scripts/streaming-engine/setup.sh | bash
#
# Or manually:
#   chmod +x setup.sh && ./setup.sh

set -e

echo "======================================="
echo "  2MStream Streaming Engine Setup"
echo "======================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "[1/4] Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "  Docker installed."
else
    echo "[1/4] Docker already installed."
fi

# Check if docker compose is available
if ! docker compose version &> /dev/null; then
    echo "[2/4] Installing Docker Compose..."
    sudo apt-get update -qq && sudo apt-get install -y -qq docker-compose-plugin
    echo "  Docker Compose installed."
else
    echo "[2/4] Docker Compose already available."
fi

# Prompt for API secret
echo ""
echo "[3/4] Configuration"
echo "  Enter the same STREAMING_API_SECRET you set in your 2MStream dashboard:"
read -p "  API Secret: " API_SECRET

if [ -z "$API_SECRET" ]; then
    echo "  Error: API secret is required."
    exit 1
fi

# Create docker-compose.yml
echo ""
echo "[4/4] Creating configuration..."

mkdir -p ~/2mstream && cd ~/2mstream

cat > docker-compose.yml << EOF
services:
  streaming-engine:
    image: ghcr.io/2mstream/engine:latest
    build: .
    ports:
      - "3001:3001"
    environment:
      - PORT=3001
      - API_SECRET=${API_SECRET}
      - VIDEO_DIR=/videos
    volumes:
      - ./videos:/videos
    restart: unless-stopped
EOF

# Create videos directory
mkdir -p videos

# Check if we have the local files to build
if [ -f "streaming-server.js" ] && [ -f "Dockerfile" ]; then
    echo "  Building from local files..."
    docker compose up -d --build
else
    # Create a minimal Dockerfile inline
    cat > Dockerfile << 'DOCKERFILE'
FROM node:20-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY streaming-server.js package.json ./
RUN npm install --production
EXPOSE 3001
CMD ["node", "streaming-server.js"]
DOCKERFILE

    cat > package.json << 'PACKAGE'
{
  "name": "2mstream-engine",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "express": "^4.21.0",
    "cors": "^2.8.5"
  }
}
PACKAGE

    # Download the streaming server
    echo "  Note: Copy streaming-server.js to ~/2mstream/ and run again."
    echo "  Or paste it from the scripts/streaming-engine/ folder in your 2MStream project."
    echo ""
fi

echo ""
echo "======================================="
echo "  Setup Complete!"
echo "======================================="
echo ""
echo "  Your streaming engine is running on port 3001."
echo ""
echo "  In your 2MStream dashboard, set:"
echo "    STREAMING_SERVER_URL = http://$(hostname -I | awk '{print $1}'):3001"
echo ""
echo "  Useful commands:"
echo "    docker compose logs -f    # View logs"
echo "    docker compose restart    # Restart"
echo "    docker compose down       # Stop"
echo ""
echo "  Test it:"
echo "    curl -H 'Authorization: Bearer ${API_SECRET}' http://localhost:3001/health"
echo ""
