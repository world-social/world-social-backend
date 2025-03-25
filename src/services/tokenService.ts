import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

const prisma = new PrismaClient();

interface DailyBonusResult {
  dailyBonus: {
    id: string;
    userId: string;
    amount: number;
    collectedAt: Date;
  };
  newBalance: number;
}

interface TransactionResult {
  user: {
    id: string;
    tokenBalance: number;
  };
  transaction: {
    id: string;
    userId: string;
    videoId: string | null;
    amount: number;
    type: string;
  };
}

class TokenService {
  async addTokens(userId: string, amount: number, type: string, videoId: string | null = null): Promise<TransactionResult> {
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

  async deductTokens(userId: string, amount: number, type: string, videoId: string | null = null): Promise<TransactionResult> {
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

  async getTokenBalance(userId: string): Promise<number> {
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

  async getTransactionHistory(userId: string, limit: number = 10): Promise<any[]> {
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

  async rewardWatchTime(userId: string, seconds: number, videoId: string): Promise<number> {
    try {
      // Check if user has already been rewarded for this video in the last 24 hours
      const lastReward = await prisma.watchReward.findFirst({
        where: {
          userId,
          videoId,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      });

      if (lastReward) {
        logger.info(`User ${userId} already received reward for video ${videoId} in the last 24 hours`);
        return 0;
      }

      // Calculate token reward (0.1 tokens per 3 seconds, max 10 tokens per video)
      const tokenReward = Math.min(Math.floor(seconds / 5) * 0.1, 10);
      
      if (tokenReward > 0) {
        // Start a transaction to ensure atomicity
        await prisma.$transaction(async (tx) => {
          // Create watch reward record
          await tx.watchReward.create({
            data: {
              userId,
              videoId,
              seconds,
              tokenReward
            }
          });

          // Update user's token balance and watch time
          await tx.user.update({
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
        });

        logger.info(`Rewarded ${tokenReward} tokens to user ${userId} for watching video ${videoId}`);
        return tokenReward;
      }

      return 0;
    } catch (error) {
      logger.error('Error rewarding watch time:', error);
      throw error;
    }
  }

  async rewardEngagement(userId: string, videoId: string, type: 'LIKE' | 'COMMENT' | 'SHARE'): Promise<number> {
    try {
      // Check if user has already engaged with this video
      const lastEngagement = await prisma.engagement.findFirst({
        where: {
          userId,
          videoId,
          type,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      });

      if (lastEngagement) {
        return 0;
      }

      // Calculate token reward based on engagement type
      let tokenReward = 0;
      switch (type) {
        case 'LIKE':
          tokenReward = 0.5;
          break;
        case 'COMMENT':
          tokenReward = 1;
          break;
        case 'SHARE':
          tokenReward = 2;
          break;
      }

      // Start a transaction to ensure atomicity
      await prisma.$transaction(async (tx) => {
        // Create engagement record
        await tx.engagement.create({
          data: {
            userId,
            videoId,
            type,
            tokenReward
          }
        });

        // Update user's token balance
        await tx.user.update({
          where: { id: userId },
          data: {
            tokenBalance: {
              increment: tokenReward
            }
          }
        });
      });

      logger.info(`Rewarded ${tokenReward} tokens to user ${userId} for ${type} on video ${videoId}`);
      return tokenReward;
    } catch (error) {
      logger.error('Error rewarding engagement:', error);
      throw error;
    }
  }

  async checkDailyBonus(userId: string): Promise<{ canCollect: boolean; lastCollection?: Date }> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const lastCollection = await prisma.dailyBonus.findFirst({
        where: {
          userId,
          collectedAt: {
            gte: today
          }
        }
      });

      return {
        canCollect: !lastCollection,
        lastCollection: lastCollection?.collectedAt
      };
    } catch (error) {
      logger.error('Error checking daily bonus:', error);
      throw error;
    }
  }

  async claimDailyBonus(userId: string): Promise<DailyBonusResult> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if user has already collected today's bonus
      const lastCollection = await prisma.dailyBonus.findFirst({
        where: {
          userId,
          collectedAt: {
            gte: today
          }
        }
      });

      if (lastCollection) {
        throw new Error("Already collected today's bonus");
      }

      const DAILY_BONUS_AMOUNT = 5; // 5 tokens per day

      // Start a transaction to ensure atomicity
      const result = await prisma.$transaction(async (tx) => {
        // Create daily bonus record
        const dailyBonus = await tx.dailyBonus.create({
          data: {
            userId,
            amount: DAILY_BONUS_AMOUNT,
            collectedAt: new Date()
          }
        });

        // Update user's token balance
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            tokenBalance: {
              increment: DAILY_BONUS_AMOUNT
            }
          },
          select: {
            tokenBalance: true
          }
        });

        return {
          dailyBonus,
          newBalance: updatedUser.tokenBalance
        };
      });

      logger.info(`User ${userId} claimed daily bonus of ${DAILY_BONUS_AMOUNT} tokens`);
      return result;
    } catch (error) {
      logger.error('Error claiming daily bonus:', error);
      throw error;
    }
  }

  async withdrawEarnings(userId: string): Promise<any> {
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

      const totalEarnings = user.videos.reduce((sum, video) => sum + video.tokenReward, 0);

      if (totalEarnings <= 0) {
        throw new Error('No earnings to withdraw');
      }

      // Start a transaction to ensure atomicity
      const result = await prisma.$transaction(async (tx) => {
        // Create withdrawal record
        const withdrawal = await tx.withdrawal.create({
          data: {
            userId,
            amount: totalEarnings,
            status: 'PENDING'
          }
        });

        // Reset video earnings
        await tx.video.updateMany({
          where: { userId },
          data: { tokenReward: 0 }
        });

        return withdrawal;
      });

      logger.info(`User ${userId} withdrew ${totalEarnings} tokens`);
      return result;
    } catch (error) {
      logger.error('Error withdrawing earnings:', error);
      throw error;
    }
  }
}

export default new TokenService(); 