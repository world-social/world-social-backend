const { PrismaClient } = require('@prisma/client');
const Redis = require('redis');

const prisma = new PrismaClient();
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL
});

class GamificationService {
  async updateStreak(userId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get or create streak record
      let streak = await prisma.streak.findFirst({
        where: { userId }
      });

      if (!streak) {
        streak = await prisma.streak.create({
          data: {
            userId,
            currentStreak: 1,
            longestStreak: 1,
            lastActive: today
          }
        });
      } else {
        const lastActive = new Date(streak.lastActive);
        lastActive.setHours(0, 0, 0, 0);

        // Calculate days difference
        const daysDiff = Math.floor((today - lastActive) / (1000 * 60 * 60 * 24));

        if (daysDiff === 1) {
          // Consecutive day
          streak.currentStreak += 1;
          if (streak.currentStreak > streak.longestStreak) {
            streak.longestStreak = streak.currentStreak;
          }
        } else if (daysDiff > 1) {
          // Streak broken
          streak.currentStreak = 1;
        }

        streak.lastActive = today;
        await prisma.streak.update({
          where: { id: streak.id },
          data: streak
        });
      }

      // Check for streak-based badges
      await this.checkStreakBadges(userId, streak);

      return streak;
    } catch (error) {
      throw new Error(`Error updating streak: ${error.message}`);
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
}

module.exports = new GamificationService(); 