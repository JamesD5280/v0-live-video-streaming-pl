FROM node:20-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy server file
COPY streaming-server.js package.json ./

# Install dependencies
RUN npm install --production

EXPOSE 3001

CMD ["node", "streaming-server.js"]
