FROM node:22-bookworm

WORKDIR /app

# Copy package info and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Install Playwright browsers and OS dependencies
RUN npx playwright install --with-deps chromium

# Copy application code
COPY . .

# Start the server
CMD ["node", "server.js"]
