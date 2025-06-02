// const Redis = require('redis');
// const logger = require('../utils/logger');

// // Get Redis URL from environment or use default for local development
// const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// logger.info(`Redis configuration - URL: ${redisUrl}`);

// // Initialize Redis client with retry strategy
// const redisClient = Redis.createClient({
//   url: redisUrl,
//   socket: {
//     reconnectStrategy: (retries) => {
//       if (retries > 10) {
//         logger.error('Redis max retries reached. Giving up...');
//         return new Error('Redis max retries reached');
//       }
//       // Exponential backoff: 2^retries * 100ms
//       const delay = Math.min(2 ** retries * 100, 3000);
//       logger.info(`Redis reconnecting in ${delay}ms...`);
//       return delay;
//     },
//     connectTimeout: 10000, // 10 seconds
//     keepAlive: 30000, // 30 seconds
//   }
// });

// // Connect to Redis
// redisClient.on('error', (err) => {
//   logger.error('Redis Client Error:', err);
//   // Log additional connection details for debugging
//   logger.error('Redis connection details:', {
//     url: redisUrl,
//     isOpen: redisClient.isOpen,
//     retryCount: redisClient.retryCount
//   });
// });

// redisClient.on('connect', () => logger.info('Redis Client Connected'));
// redisClient.on('reconnecting', () => logger.info('Redis Client Reconnecting...'));
// redisClient.on('ready', () => logger.info('Redis Client Ready'));

// // Connect immediately
// (async () => {
//   try {
//     if (!redisClient.isOpen) {
//       logger.info(`Attempting to connect to Redis at ${redisUrl}`);
//       await redisClient.connect();
//       logger.info('Redis connected successfully');
//     }
//   } catch (error) {
//     logger.error('Redis connection error:', error);
//     // Don't throw here, let the application continue without Redis
//     // The reconnection strategy will handle retries
//   }
// })();

// Create a mock Redis client with basic functionality
const mockRedisClient = {
  isOpen: true,
  connect: async () => {},
  disconnect: async () => {},
  get: async () => null,
  set: async () => 'OK',
  del: async () => 1,
  on: () => {},
  off: () => {},
  quit: async () => {},
  ping: async () => 'PONG'
};

module.exports = mockRedisClient; 