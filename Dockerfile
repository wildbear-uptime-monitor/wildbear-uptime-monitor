FROM node:20-slim

# Install Playwright Chromium dependencies
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libxshmfence1 libx11-xcb1 \
    fonts-liberation fonts-noto-color-emoji wget ca-certificates \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm ci --include=dev

# Install Playwright Chromium browser
RUN npx playwright install chromium

# Copy source
COPY . .

# Build the app
RUN npm run build

# Remove dev dependencies to slim down
RUN npm prune --production

# Expose the port Railway assigns
EXPOSE ${PORT:-5000}

CMD ["node", "dist/index.cjs"]
