const redisClient = require('../src/configs/redis');
const logger = require('../src/utils/logger');

async function testRedisConnection() {
  try {
    logger.info('Testing Redis connection...');

    // Test basic set/get
    const testKey = 'test:connection';
    const testValue = 'Hello Redis!';
    
    logger.info('Setting test value...');
    await redisClient.set(testKey, testValue);
    
    logger.info('Getting test value...');
    const retrievedValue = await redisClient.get(testKey);
    
    if (retrievedValue === testValue) {
      logger.info('✅ Redis connection test successful!');
      logger.info(`Retrieved value: ${retrievedValue}`);
    } else {
      logger.error('❌ Redis test failed: Retrieved value does not match');
    }

    // Test Redis info
    logger.info('Getting Redis server info...');
    const info = await redisClient.info();
    logger.info('Redis server info:', info);

  } catch (error) {
    logger.error('❌ Redis connection test failed:', error);
  } finally {
    // Close the connection
    if (redisClient.isOpen) {
      await redisClient.quit();
      logger.info('Redis connection closed');
    }
    process.exit(0);
  }
}

// Run the test
testRedisConnection(); 