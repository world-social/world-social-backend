# WorldSocial Backend

This is the backend service for the WorldSocial platform.

## Features

- Video upload and streaming with infinite scroll
- Token rewards system for user engagement
- Influencer earnings and withdrawals
- Gamification system with streaks and badges
- User verification using World ID
- NFT integration for exclusive content
- Real-time updates for token balances and engagement metrics

## Tech Stack

- Node.js with Express
- PostgreSQL with Prisma ORM
- Redis for caching and preloading
- MinIO for video storage
- World MiniKit SDK for blockchain integration
- JWT for authentication
- Docker for development environment

## Prerequisites

- Node.js 18 or higher
- Docker and Docker Compose
- PostgreSQL 15
- Redis 7
- World MiniKit SDK credentials
- Ethereum wallet for smart contract deployment

## Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/world-social.git
cd world-social
```

2. Install dependencies:
```bash
cd world-social-backend
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start the development environment:
```bash
docker-compose up -d
npm run dev
```

## API Documentation

The API documentation is available at `/api-docs` when running the server.

## Development

- `npm run dev`: Start the development server
- `npm run build`: Build the project
- `npm start`: Start the production server
- `npm test`: Run tests

## License

MIT 