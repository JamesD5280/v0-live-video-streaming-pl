FROM node:20-slim

# Install FFmpeg (allow unauthenticated to handle GPG key rotation)
RUN apt-get -o Acquire::AllowInsecureRepositories=true update && apt-get --allow-unauthenticated install -y ffmpeg fonts-dejavu-core fonts-liberation2 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy server code and the licensed Viga font used by scrolling overlays
COPY streaming-server.js package.json ./
COPY fonts ./fonts

# Install dependencies
RUN npm install --production

EXPOSE 3001

CMD ["node", "streaming-server.js"]
