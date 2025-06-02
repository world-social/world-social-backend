const { PrismaClient } = require('@prisma/client');
// const Redis = require('redis');
const logger = require('../utils/logger');
const tokenService = require('./tokenService');

const prisma = new PrismaClient();

// Mock Redis client
const redisClient = {
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

class GamificationService {
  // Mission Management
  async getAvailableMissions(userId) {
    try {
      // Try to get from Redis cache first
      const cachedMissions = await redisClient.get(`missions:${userId}`);
      if (cachedMissions) {
        return JSON.parse(cachedMissions);
      }

      const missions = await prisma.mission.findMany({
        where: {
          type: {
            in: ['DAILY', 'WEEKLY', 'SPECIAL']
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Cache missions for 5 minutes
      await redisClient.set(
        `missions:${userId}`,
        JSON.stringify(missions),
        'EX',
        300
      );

      return missions;
    } catch (error) {
      logger.error('Error getting available missions:', error);
      throw error;
    }
  }

  async completeMission(userId, missionId) {
    try {
      const mission = await prisma.mission.findUnique({
        where: { id: missionId }
      });

      if (!mission) {
        throw new Error('Mission not found');
      }

      // Check if mission is already completed
      const completionKey = `mission_completion:${userId}:${missionId}`;
      const isCompleted = await redisClient.get(completionKey);
      
      if (isCompleted) {
        throw new Error('Mission already completed');
      }

      // Start a transaction to ensure atomicity
      const result = await prisma.$transaction(async (tx) => {
        // Reward tokens
        await tokenService.addTokens(userId, mission.reward, 'MISSION_COMPLETE');

        // Mark mission as completed
        await redisClient.set(completionKey, '1', 'EX', 24 * 60 * 60); // 24 hours expiry

        // Update user's achievements
        await this.checkAndUpdateAchievements(userId, tx);

        return {
          mission,
          reward: mission.reward
        };
      });

      // Invalidate relevant caches
      await this.invalidateUserCaches(userId);

      return result;
    } catch (error) {
      logger.error('Error completing mission:', error);
      throw error;
    }
  }

  // Achievement Management
  async checkAndUpdateAchievements(userId, tx = prisma) {
    try {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: {
          videos: true,
          achievements: true
        }
      });

      const achievements = await tx.achievement.findMany({
        where: {
          userId,
          unlocked: false
        }
      });

      for (const achievement of achievements) {
        let progress = 0;
        let shouldUnlock = false;

        switch (achievement.type) {
          case 'VIDEO_COUNT':
            progress = user.videos.length;
            shouldUnlock = progress >= achievement.target;
            break;
          case 'TOTAL_VIEWS':
            progress = user.videos.reduce((sum, video) => sum + video.views, 0);
            shouldUnlock = progress >= achievement.target;
            break;
          case 'TOTAL_LIKES':
            progress = user.videos.reduce((sum, video) => sum + video.likeCount, 0);
            shouldUnlock = progress >= achievement.target;
            break;
          case 'TOTAL_EARNINGS':
            progress = user.totalEarnings;
            shouldUnlock = progress >= achievement.target;
            break;
        }

        if (shouldUnlock) {
          await tx.achievement.update({
            where: { id: achievement.id },
            data: {
              progress: achievement.target,
              unlocked: true
            }
          });

          // Reward tokens for unlocking achievement
          await tokenService.addTokens(userId, achievement.reward, 'ACHIEVEMENT_UNLOCK');
        } else {
          await tx.achievement.update({
            where: { id: achievement.id },
            data: { progress }
          });
        }
      }
    } catch (error) {
      logger.error('Error checking achievements:', error);
      throw error;
    }
  }

  // Streak Management
  async updateStreak(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      const lastStreakDate = user.lastStreakDate ? new Date(user.lastStreakDate) : null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let streak = user.streak || 0;
      let reward = 0;

      if (!lastStreakDate || lastStreakDate < today) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (lastStreakDate && lastStreakDate.getTime() === yesterday.getTime()) {
          streak += 1;
          reward = Math.min(streak * 10, 100); // 10 tokens per day, max 100
        } else {
          streak = 1;
          reward = 10;
        }

        await prisma.user.update({
          where: { id: userId },
          data: {
            streak,
            lastStreakDate: today,
            tokens: {
              increment: reward,
            },
          },
        });
      }

      return { streak, reward };
    } catch (error) {
      logger.error('Error updating streak:', error);
      throw error;
    }
  }

  // Cache Management
  async invalidateUserCaches(userId) {
    try {
      const keys = [
        `missions:${userId}`,
        `achievements:${userId}`,
        `streak:${userId}`,
        `user:${userId}:balance`
      ];

      await Promise.all(keys.map(key => redisClient.del(key)));
    } catch (error) {
      logger.error('Error invalidating user caches:', error);
    }
  }

  // Get user's gamification stats
  async getUserStats(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          _count: {
            select: {
              videos: true,
              likes: true,
              comments: true,
            },
          },
          userAchievements: {
            where: { completed: true },
            _count: true,
          },
          userMissions: {
            where: { completed: true },
            _count: true,
          },
        },
      });

      return {
        id: user.id,
        userId: user.id,
        tokens: user.tokens,
        streak: user.streak,
        lastStreakDate: user.lastStreakDate,
        totalVideos: user._count.videos,
        totalLikes: user._count.likes,
        totalComments: user._count.comments,
        totalWatchTime: user.totalWatchTime || 0,
        achievementsCompleted: user.userAchievements._count,
        missionsCompleted: user.userMissions._count,
      };
    } catch (error) {
      logger.error('Error getting user stats:', error);
      throw error;
    }
  }

  async checkStreakBadges(userId, streak) {
    try {
      const badges = [];

      // Check for streak milestones
      if (streak.currentStreak === 7) {
        badges.push({
          name: 'Week Warrior',
          description: 'Maintained a 7-day streak'
        });
      }

      if (streak.currentStreak === 30) {
        badges.push({
          name: 'Monthly Master',
          description: 'Maintained a 30-day streak'
        });
      }

      if (streak.longestStreak === 100) {
        badges.push({
          name: 'Century Champion',
          description: 'Achieved a 100-day streak'
        });
      }

      // Create badges
      for (const badge of badges) {
        await prisma.badge.create({
          data: {
            userId,
            ...badge
          }
        });
      }

      return badges;
    } catch (error) {
      throw new Error(`Error checking streak badges: ${error.message}`);
    }
  }

  async getLeaderboard(type = 'streak') {
    try {
      let leaderboard;

      switch (type) {
        case 'streak':
          leaderboard = await prisma.streak.findMany({
            include: {
              user: {
                select: {
                  username: true
                }
              }
            },
            orderBy: {
              currentStreak: 'desc'
            },
            take: 100
          });
          break;

        case 'tokens':
          leaderboard = await prisma.user.findMany({
            select: {
              id: true,
              username: true,
              tokenBalance: true
            },
            orderBy: {
              tokenBalance: 'desc'
            },
            take: 100
          });
          break;

        case 'videos':
          leaderboard = await prisma.video.groupBy({
            by: ['userId'],
            _count: {
              id: true
            },
            orderBy: {
              _count: {
                id: 'desc'
              }
            },
            take: 100
          });
          break;

        default:
          throw new Error('Invalid leaderboard type');
      }

      return leaderboard;
    } catch (error) {
      throw new Error(`Error getting leaderboard: ${error.message}`);
    }
  }

  async getUserBadges(userId) {
    try {
      return await prisma.badge.findMany({
        where: { userId },
        orderBy: { earnedAt: 'desc' }
      });
    } catch (error) {
      throw new Error(`Error getting user badges: ${error.message}`);
    }
  }

  async checkAchievementBadges(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          videos: true,
          transactions: true
        }
      });

      const badges = [];

      // Check for video count achievements
      if (user.videos.length >= 10) {
        badges.push({
          name: 'Content Creator',
          description: 'Posted 10 videos'
        });
      }

      if (user.videos.length >= 100) {
        badges.push({
          name: 'Video Veteran',
          description: 'Posted 100 videos'
        });
      }

      // Check for token earnings achievements
      const totalEarnings = user.transactions
        .filter(t => t.type === 'EARN')
        .reduce((sum, t) => sum + t.amount, 0);

      if (totalEarnings >= 1000) {
        badges.push({
          name: 'Token Tycoon',
          description: 'Earned 1000 tokens'
        });
      }

      // Create badges
      for (const badge of badges) {
        await prisma.badge.create({
          data: {
            userId,
            ...badge
          }
        });
      }

      return badges;
    } catch (error) {
      throw new Error(`Error checking achievement badges: ${error.message}`);
    }
  }

  async updateMissionProgress(userId, missionId, progress) {
    try {
      const userMission = await prisma.userMission.findFirst({
        where: {
          userId,
          missionId,
        },
        include: {
          mission: true,
        },
      });

      if (!userMission) {
        throw new Error('Mission not found');
      }

      const updatedMission = await prisma.userMission.update({
        where: {
          id: userMission.id,
        },
        data: {
          progress,
          completed: progress >= userMission.mission.requirements[0].amount,
        },
        include: {
          mission: true,
        },
      });

      return updatedMission;
    } catch (error) {
      logger.error('Error updating mission progress:', error);
      throw error;
    }
  }

  async claimMissionReward(userId, missionId) {
    try {
      const userMission = await prisma.userMission.findFirst({
        where: {
          userId,
          missionId,
        },
        include: {
          mission: true,
        },
      });

      if (!userMission) {
        throw new Error('Mission not found');
      }

      if (!userMission.completed) {
        throw new Error('Mission not completed');
      }

      // Update user tokens
      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          tokens: {
            increment: userMission.mission.reward,
          },
        },
      });

      // Mark mission as claimed
      const updatedMission = await prisma.userMission.update({
        where: {
          id: userMission.id,
        },
        data: {
          completedAt: new Date(),
        },
        include: {
          mission: true,
        },
      });

      return updatedMission;
    } catch (error) {
      logger.error('Error claiming mission reward:', error);
      throw error;
    }
  }

  async checkAchievementProgress(userId) {
    try {
      const achievements = await prisma.userAchievement.findMany({
        where: {
          userId,
          completed: false,
        },
        include: {
          achievement: true,
        },
      });

      return achievements;
    } catch (error) {
      logger.error('Error checking achievement progress:', error);
      throw error;
    }
  }

  async getUserAchievements(userId) {
    try {
      const achievements = await prisma.userAchievement.findMany({
        where: {
          userId,
        },
        include: {
          achievement: true,
        },
      });

      return achievements;
    } catch (error) {
      logger.error('Error getting user achievements:', error);
      throw error;
    }
  }

  async getUserMissions(userId) {
    try {
      const missions = await prisma.userMission.findMany({
        where: {
          userId,
          completed: false,
        },
        include: {
          mission: true,
        },
      });

      return missions;
    } catch (error) {
      logger.error('Error getting user missions:', error);
      throw error;
    }
  }
}

module.exports = new GamificationService(); 