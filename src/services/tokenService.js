const { PrismaClient } = require('@prisma/client');
const Redis = require('redis');
const { WorldID } = require('@worldcoin/minikit-js');
const logger = require('../utils/logger');

const prisma = new PrismaClient();
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL
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
      // Calculate token reward (0.1 tokens per 3 seconds)
      const tokenReward = Math.floor(seconds / 3) * 0.1;
      
      if (tokenReward > 0) {
        await this.addTokens(userId, tokenReward, 'EARN', videoId);
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
      const cachedBalance = await redisClient.get(`user:${userId}:balance`);
      if (cachedBalance) {
        return parseFloat(cachedBalance);
      }

      // If not in cache, get from database
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Cache the result
      await redisClient.set(
        `user:${userId}:balance`,
        user.tokenBalance.toString(),
        'EX',
        300 // Cache for 5 minutes
      );

      return user.tokenBalance;
    } catch (error) {
      throw new Error(`Error getting balance: ${error.message}`);
    }
  }
}

module.exports = new TokenService(); 