# Use Node.js LTS version
FROM node:20-slim

# Install ffmpeg and other required dependencies
RUN apt-get update && \
    apt-get install -y ffmpeg curl postgresql-client && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install dependencies
RUN npm install -g pnpm && \
    pnpm install

# Copy app source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose port
EXPOSE 8081

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8081/health || exit 1

# Start the application with a wait for database
CMD ["sh", "-c", "npx prisma migrate deploy && node src/app.js"] 