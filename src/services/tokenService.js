const { PrismaClient } = require('@prisma/client');
const Redis = require('redis');
const { WorldID } = require('@worldcoin/minikit-js');
const { ethers } = require('ethers');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

require('dotenv').config();

// Create Redis client with retry strategy
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
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
      // Check how many unique videos the user has been rewarded from today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const uniqueRewardedVideos = await prisma.transaction.findMany({
        where: {
          userId,
          type: 'EARN',
          createdAt: {
            gte: today
          }
        },
        distinct: ['videoId']
      });

      // If this is a new video and we've already reached 15 unique videos today
      const hasRewardedThisVideo = uniqueRewardedVideos.some(tx => tx.videoId === videoId);
      if (!hasRewardedThisVideo && uniqueRewardedVideos.length >= 15) {
        logger.info(`User ${userId} has reached the daily limit of 15 unique videos`);
        return 0;
      }

      // Calculate token reward (0.1 tokens per 5 seconds)
      const tokenReward = Math.floor(seconds / 5) * 0.1;
      
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
              description: `Watch time reward for video ${videoId} (${seconds} seconds)`
            }
          });

          return {
            user: updatedUser,
            transaction
          };
        });

        logger.info(`Rewarded ${tokenReward} tokens to user ${userId} for watching video ${videoId} for ${seconds} seconds`);
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

  async checkDailyTokens(userId) {
    try {
      // Check Redis connection
      if (!redisClient.isOpen) {
        try {
          await redisClient.connect();
        } catch (error) {
          logger.error('Failed to connect to Redis:', error);
          // Return default state with next collection time
          return {
            canCollect: true,
            nextCollectionTime: new Date(Date.now() + (24 * 60 * 60 * 1000))
          };
        }
      }

      const lastClaimKey = `daily_claim:${userId}`;
      const lastClaim = await redisClient.get(lastClaimKey);
      
      if (lastClaim) {
        const lastClaimTime = parseInt(lastClaim);
        const now = Date.now();
        const hoursSinceLastClaim = (now - lastClaimTime) / (1000 * 60 * 60);
        
        if (hoursSinceLastClaim < 24) {
          return {
            canCollect: false,
            nextCollectionTime: new Date(lastClaimTime + (24 * 60 * 60 * 1000))
          };
        }
      }

      const wallet = new ethers.Wallet(process.env.BACKEND_PRIVATE_KEY);
      // Define the message to be signed. You can customize this payload as needed.
      const message = `DailyClaim:${userId}:${Date.now()}`;
      const signature = await wallet.signMessage(message);

      logger.info("Generated signature for daily claim");
      
      // If user can collect, set next collection time to 24 hours from now
      return {
        canCollect: true,
        nextCollectionTime: new Date(Date.now() + (24 * 60 * 60 * 1000)),
        signature: signature
      };
    } catch (error) {
      logger.error('Error checking daily tokens:', error);
      // Return default state with next collection time
      return {
        canCollect: false,
        nextCollectionTime: new Date(Date.now() + (24 * 60 * 60 * 1000)),
        error: error.message
      };
    }
  }

  async claimDailyTokens(userId) {
    const client = await prisma.$transaction(async (tx) => {
      // Check if user can claim
      const lastClaim = await tx.dailyBonus.findFirst({
        where: { userId },
        orderBy: { collectedAt: 'desc' }
      });

      if (lastClaim) {
        const now = new Date();
        const lastClaimDate = new Date(lastClaim.collectedAt);
        const diff = now.getTime() - lastClaimDate.getTime();
        const hoursSinceLastClaim = diff / (1000 * 60 * 60);

        if (hoursSinceLastClaim < 24) {
          throw new Error('Daily bonus already claimed');
        }
      }

      // Create daily bonus record
      const dailyBonus = await tx.dailyBonus.create({
        data: {
          userId,
          amount: 100, // Fixed amount for daily bonus
          collectedAt: new Date()
        }
      });

      // TODO: Call smart contract to transfer tokens
      // After successful smart contract call:
      
      // Update user's token balance to zero
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          tokenBalance: 0
        }
      });

      return { dailyBonus, user };
    });

    return client;
  }
}

module.exports = new TokenService(); 