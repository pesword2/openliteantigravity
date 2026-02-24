FROM node:22-alpine

WORKDIR /app

# Copy package info and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application code
COPY . .

# Start the server
CMD ["node", "server.js"]
