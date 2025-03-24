const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const gamificationService = require('../services/gamificationService');
const logger = require('../utils/logger');

class GamificationController {
  async getStreak(req, res) {
    try {
      const streak = await gamificationService.updateStreak(req.user.id);

      res.json({
        status: 'success',
        data: {
          streak
        }
      });
    } catch (error) {
      logger.error(`Streak fetch error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async getBadges(req, res) {
    try {
      const badges = await gamificationService.getUserBadges(req.user.id);

      res.json({
        status: 'success',
        data: {
          badges
        }
      });
    } catch (error) {
      logger.error(`Badges fetch error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async getLeaderboard(req, res) {
    try {
      const { type = 'streak' } = req.query;
      const leaderboard = await gamificationService.getLeaderboard(type);

      res.json({
        status: 'success',
        data: {
          leaderboard
        }
      });
    } catch (error) {
      logger.error(`Leaderboard fetch error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async getAchievements(req, res) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          videos: true,
          badges: true,
          streak: true
        }
      });

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      const achievements = {
        videoCount: user.videos.length,
        totalEarnings: user.videos.reduce((sum, video) => sum + video.tokenReward, 0),
        badgeCount: user.badges.length,
        currentStreak: user.streak?.currentStreak || 0,
        longestStreak: user.streak?.longestStreak || 0
      };

      res.json({
        status: 'success',
        data: {
          achievements
        }
      });
    } catch (error) {
      logger.error(`Achievements fetch error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async getDailyMissions(req, res) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          videos: true,
          streak: true
        }
      });

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      const missions = [
        {
          id: 'watch_videos',
          title: 'Watch Videos',
          description: 'Watch 5 videos today',
          reward: 10,
          progress: user.streak?.lastActive ? 0 : 0,
          target: 5
        },
        {
          id: 'upload_video',
          title: 'Upload Video',
          description: 'Upload a video today',
          reward: 20,
          progress: user.videos.some(video => 
            new Date(video.createdAt).toDateString() === new Date().toDateString()
          ) ? 1 : 0,
          target: 1
        },
        {
          id: 'earn_tokens',
          title: 'Earn Tokens',
          description: 'Earn 50 tokens today',
          reward: 15,
          progress: user.videos.reduce((sum, video) => 
            new Date(video.createdAt).toDateString() === new Date().toDateString() 
              ? sum + video.tokenReward 
              : sum, 0
          ),
          target: 50
        }
      ];

      res.json({
        status: 'success',
        data: {
          missions
        }
      });
    } catch (error) {
      logger.error(`Daily missions error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async getMissions(req, res) {
    try {
      const missions = await prisma.mission.findMany({
        where: {
          userId: req.user.id,
          completed: false
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      res.json(missions);
    } catch (error) {
      logger.error('Error fetching missions:', error);
      res.status(500).json({ error: 'Failed to fetch missions' });
    }
  }

  async updateMissionProgress(req, res) {
    try {
      const { missionId } = req.params;
      const { progress } = req.body;

      const mission = await prisma.mission.findUnique({
        where: {
          id: missionId,
          userId: req.user.id
        }
      });

      if (!mission) {
        return res.status(404).json({ error: 'Mission not found' });
      }

      const updatedProgress = Math.min(mission.target, mission.progress + progress);
      const completed = updatedProgress >= mission.target;

      const updatedMission = await prisma.mission.update({
        where: { id: missionId },
        data: {
          progress: updatedProgress,
          completed
        }
      });

      // If mission is completed, award tokens
      if (completed) {
        await prisma.user.update({
          where: { id: req.user.id },
          data: {
            tokenBalance: {
              increment: mission.reward
            }
          }
        });
      }

      res.json(updatedMission);
    } catch (error) {
      logger.error('Error updating mission progress:', error);
      res.status(500).json({ error: 'Failed to update mission progress' });
    }
  }

  async getAchievements(req, res) {
    try {
      const achievements = await prisma.achievement.findMany({
        where: {
          userId: req.user.id
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      res.json(achievements);
    } catch (error) {
      logger.error('Error fetching achievements:', error);
      res.status(500).json({ error: 'Failed to fetch achievements' });
    }
  }

  async updateAchievementProgress(req, res) {
    try {
      const { achievementId } = req.params;
      const { progress } = req.body;

      const achievement = await prisma.achievement.findUnique({
        where: {
          id: achievementId,
          userId: req.user.id
        }
      });

      if (!achievement) {
        return res.status(404).json({ error: 'Achievement not found' });
      }

      const updatedProgress = Math.min(achievement.target, achievement.progress + progress);
      const unlocked = updatedProgress >= achievement.target;

      const updatedAchievement = await prisma.achievement.update({
        where: { id: achievementId },
        data: {
          progress: updatedProgress,
          unlocked
        }
      });

      // If achievement is unlocked, award tokens
      if (unlocked && !achievement.unlocked) {
        await prisma.user.update({
          where: { id: req.user.id },
          data: {
            tokenBalance: {
              increment: achievement.reward
            }
          }
        });
      }

      res.json(updatedAchievement);
    } catch (error) {
      logger.error('Error updating achievement progress:', error);
      res.status(500).json({ error: 'Failed to update achievement progress' });
    }
  }

  async getGlobalLeaderboard(req, res) {
    try {
      const leaderboard = await prisma.user.findMany({
        select: {
          id: true,
          username: true,
          avatar: true,
          tokenBalance: true
        },
        orderBy: {
          tokenBalance: 'desc'
        },
        take: 100
      });

      // Add rank to each entry
      const leaderboardWithRank = leaderboard.map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

      res.json(leaderboardWithRank);
    } catch (error) {
      logger.error('Error fetching leaderboard:', error);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  }
}

module.exports = new GamificationController(); 