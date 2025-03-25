const { PrismaClient } = require('@prisma/client');
const Redis = require('redis');
const { WorldID } = require('@worldcoin/minikit-js');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

// Create Redis client with retry strategy
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        return new Error('Too many retries');
      }
      return Math.min(retries * 100, 3000);
    }
  }
});

// Connect to Redis
redisClient.connect().catch(err => {
  logger.error('Redis connection error:', err);
});

// Handle Redis connection events
redisClient.on('connect', () => {
  logger.info('Redis client connected');
});

redisClient.on('error', (err) => {
  logger.error('Redis client error:', err);
});

redisClient.on('reconnecting', () => {
  logger.info('Redis client reconnecting...');
});

class TokenService {
  async addTokens(userId, amount, type, videoId = null) {
    try {
      // Start a transaction to ensure atomicity
      const result = await prisma.$transaction(async (tx) => {
        // Update user's token balance
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            tokenBalance: {
              increment: amount
            }
          }
        });

        // Create transaction record
        const transaction = await tx.transaction.create({
          data: {
            userId,
            videoId,
            amount,
            type
          }
        });

        return {
          user: updatedUser,
          transaction
        };
      });

      logger.info(`Added ${amount} tokens to user ${userId}`);
      return result;
    } catch (error) {
      logger.error('Error adding tokens:', error);
      throw error;
    }
  }

  async deductTokens(userId, amount, type, videoId = null) {
    try {
      // Start a transaction to ensure atomicity
      const result = await prisma.$transaction(async (tx) => {
        // Check if user has enough tokens
        const user = await tx.user.findUnique({
          where: { id: userId }
        });

        if (!user || user.tokenBalance < amount) {
          throw new Error('Insufficient token balance');
        }

        // Update user's token balance
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            tokenBalance: {
              decrement: amount
            }
          }
        });

        // Create transaction record
        const transaction = await tx.transaction.create({
          data: {
            userId,
            videoId,
            amount: -amount, // Negative amount for deductions
            type
          }
        });

        return {
          user: updatedUser,
          transaction
        };
      });

      logger.info(`Deducted ${amount} tokens from user ${userId}`);
      return result;
    } catch (error) {
      logger.error('Error deducting tokens:', error);
      throw error;
    }
  }

  async getTokenBalance(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { tokenBalance: true }
      });

      return user?.tokenBalance || 0;
    } catch (error) {
      logger.error('Error getting token balance:', error);
      throw error;
    }
  }

  async getTransactionHistory(userId, limit = 10) {
    try {
      const transactions = await prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          video: {
            select: {
              id: true,
              title: true,
              thumbnailUrl: true
            }
          }
        }
      });

      return transactions;
    } catch (error) {
      logger.error('Error getting transaction history:', error);
      throw error;
    }
  }

  async rewardWatchTime(userId, seconds, videoId) {
    try {
      // Ensure Redis is connected
      if (!redisClient.isOpen) {
        await redisClient.connect();
      }

      // Check if user has already been rewarded for this video in the last 24 hours
      const lastRewardKey = `watch_reward:${userId}:${videoId}`;
      const lastReward = await redisClient.get(lastRewardKey);
      
      if (lastReward) {
        const lastRewardTime = parseInt(lastReward);
        const now = Date.now();
        const hoursSinceLastReward = (now - lastRewardTime) / (1000 * 60 * 60);
        
        if (hoursSinceLastReward < 24) {
          logger.info(`User ${userId} already received reward for video ${videoId} in the last 24 hours`);
          return 0;
        }
      }

      // Calculate token reward (0.1 tokens per 5 seconds, max 10 tokens per video)
      const tokenReward = Math.min(Math.floor(seconds / 5) * 0.1, 10);
      
      if (tokenReward > 0) {
        // Start a transaction to ensure atomicity
        const result = await prisma.$transaction(async (tx) => {
          // Update user's token balance
          const updatedUser = await tx.user.update({
            where: { id: userId },
            data: {
              tokenBalance: {
                increment: tokenReward
              },
              totalWatchTime: {
                increment: seconds
              }
            }
          });

          // Update video's token reward
          await tx.video.update({
            where: { id: videoId },
            data: {
              tokenReward: {
                increment: tokenReward
              }
            }
          });

          // Create transaction record
          const transaction = await tx.transaction.create({
            data: {
              userId,
              videoId,
              amount: tokenReward,
              type: 'EARN',
              description: `Watch time reward for video ${videoId}`
            }
          });

          return {
            user: updatedUser,
            transaction
          };
        });

        // Set the last reward time in Redis (24 hours expiry)
        await redisClient.set(lastRewardKey, Date.now().toString(), {
          EX: 24 * 60 * 60 // 24 hours in seconds
        });

        // Invalidate user balance cache
        await redisClient.del(`user:${userId}:balance`);

        logger.info(`Rewarded ${tokenReward} tokens to user ${userId} for watching video ${videoId}`);
        return tokenReward;
      }
      
      return 0;
    } catch (error) {
      logger.error('Error rewarding watch time:', error);
      throw error;
    }
  }

  async rewardEngagement(userId, videoId, type) {
    try {
      let rewardAmount = 0;
      
      switch (type) {
        case 'LIKE':
          rewardAmount = 0.5;
          break;
        case 'COMMENT':
          rewardAmount = 1.0;
          break;
        case 'SHARE':
          rewardAmount = 2.0;
          break;
        default:
          throw new Error('Invalid engagement type');
      }

      await this.addTokens(userId, rewardAmount, 'EARN', videoId);
      return rewardAmount;
    } catch (error) {
      logger.error('Error rewarding engagement:', error);
      throw error;
    }
  }

  async earnTokens(userId, amount, videoId = null) {
    try {
      // Get user's World ID
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Verify World ID
      const isVerified = await WorldID.verify(user.worldId);
      if (!isVerified) {
        throw new Error('Invalid World ID');
      }

      // Record transaction in database
      const transaction = await prisma.transaction.create({
        data: {
          userId,
          videoId,
          amount,
          type: 'EARN'
        }
      });

      // Update user's token balance
      await prisma.user.update({
        where: { id: userId },
        data: {
          tokenBalance: {
            increment: amount
          }
        }
      });

      // If video is associated, update video's token reward
      if (videoId) {
        await prisma.video.update({
          where: { id: videoId },
          data: {
            tokenReward: {
              increment: amount
            }
          }
        });
      }

      // Invalidate Redis cache
      await redisClient.del(`user:${userId}:balance`);

      return transaction;
    } catch (error) {
      throw new Error(`Error earning tokens: ${error.message}`);
    }
  }

  async withdrawEarnings(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          videos: true
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Verify World ID
      const isVerified = await WorldID.verify(user.worldId);
      if (!isVerified) {
        throw new Error('Invalid World ID');
      }

      // Calculate total earnings from videos
      const totalEarnings = user.videos.reduce((sum, video) => sum + video.tokenReward, 0);

      if (totalEarnings <= 0) {
        throw new Error('No earnings to withdraw');
      }

      // Record withdrawal transaction
      const transaction = await prisma.transaction.create({
        data: {
          userId,
          amount: totalEarnings,
          type: 'WITHDRAW'
        }
      });

      // Update user's token balance
      await prisma.user.update({
        where: { id: userId },
        data: {
          tokenBalance: {
            decrement: totalEarnings
          }
        }
      });

      // Invalidate Redis cache
      await redisClient.del(`user:${userId}:balance`);

      return transaction;
    } catch (error) {
      throw new Error(`Error withdrawing earnings: ${error.message}`);
    }
  }

  async getBalance(userId) {
    try {
      // Try to get from Redis cache first
      //const cachedBalance = await redisClient.get(`user:${userId}:balance`);
      /*if (cachedBalance) {
        return parseFloat(cachedBalance);
      }*/

      // If not in cache, get from database
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Cache the result
      /*await redisClient.set(
        `user:${userId}:balance`,
        user.tokenBalance.toString(),
        'EX',
        300 // Cache for 5 minutes
      );*/

      return user.tokenBalance;
    } catch (error) {
      throw new Error(`Error getting balance: ${error.message}`);
    }
  }

  async checkDailyBonus(userId) {
    try {
      if (!redisClient.isOpen) {
        await redisClient.connect();
      }

      const lastBonusKey = `daily_bonus:${userId}`;
      const lastBonus = await redisClient.get(lastBonusKey);
      
      if (lastBonus) {
        const lastBonusTime = parseInt(lastBonus);
        const now = Date.now();
        const hoursSinceLastBonus = (now - lastBonusTime) / (1000 * 60 * 60);
        
        if (hoursSinceLastBonus < 24) {
          return {
            canCollect: false,
            nextCollectionTime: new Date(lastBonusTime + (24 * 60 * 60 * 1000))
          };
        }
      }
      
      return {
        canCollect: true,
        nextCollectionTime: null
      };
    } catch (error) {
      logger.error('Error checking daily bonus:', error);
      throw error;
    }
  }

  async claimDailyBonus(userId) {
    try {
      if (!redisClient.isOpen) {
        await redisClient.connect();
      }

      const bonusStatus = await this.checkDailyBonus(userId);
      
      if (!bonusStatus.canCollect) {
        throw new Error('Daily bonus already collected');
      }

      const DAILY_BONUS_AMOUNT = 10;
      
      // Start a transaction to ensure atomicity
      const result = await prisma.$transaction(async (tx) => {
        // Update user's token balance
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            tokenBalance: {
              increment: DAILY_BONUS_AMOUNT
            }
          }
        });

        // Create transaction record
        const transaction = await tx.transaction.create({
          data: {
            userId,
            amount: DAILY_BONUS_AMOUNT,
            type: 'DAILY_BONUS',
            description: 'Daily login bonus'
          }
        });

        return {
          user: updatedUser,
          transaction
        };
      });

      // Set the last bonus time in Redis (24 hours expiry)
      const lastBonusKey = `daily_bonus:${userId}`;
      await redisClient.set(lastBonusKey, Date.now().toString(), {
        EX: 24 * 60 * 60 // 24 hours in seconds
      });

      // Invalidate user balance cache
      await redisClient.del(`user:${userId}:balance`);

      logger.info(`Daily bonus of ${DAILY_BONUS_AMOUNT} tokens awarded to user ${userId}`);
      return result;
    } catch (error) {
      logger.error('Error claiming daily bonus:', error);
      throw error;
    }
  }
}

module.exports = new TokenService(); 