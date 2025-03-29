const Redis = require('redis');
const logger = require('../utils/logger');

// Initialize Redis client
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL
});

// Connect to Redis
redisClient.on('error', (err) => logger.error('Redis Client Error:', err));
redisClient.on('connect', () => logger.info('Redis Client Connected'));

// Connect immediately
(async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      logger.info('Redis connected successfully');
    }
  } catch (error) {
    logger.error('Redis connection error:', error);
  }
})();

module.exports = redisClient; 