const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const gamificationService = require('../services/gamificationService');

/**
 * @swagger
 * /api/gamification/streak:
 *   get:
 *     summary: Get user streak information
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Streak information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 currentStreak:
 *                   type: integer
 *                 longestStreak:
 *                   type: integer
 *                 lastActivityDate:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get('/streak', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        currentStreak: true,
        longestStreak: true,
        lastActivityDate: true
      }
    });

    res.json(user);
  } catch (error) {
    logger.error('Error fetching streak:', error);
    res.status(500).json({ error: 'Failed to fetch streak information' });
  }
});

/**
 * @swagger
 * /api/gamification/badges:
 *   get:
 *     summary: Get user badges
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Badges retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 badges:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       icon:
 *                         type: string
 *                       unlockedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get('/badges', authenticateToken, async (req, res) => {
  try {
    const badges = await prisma.badge.findMany({
      where: { userId: req.user.id },
      orderBy: { unlockedAt: 'desc' }
    });

    res.json({ badges });
  } catch (error) {
    logger.error('Error fetching badges:', error);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});

/**
 * @swagger
 * /api/gamification/missions:
 *   get:
 *     summary: Get daily missions
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daily missions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 missions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       reward:
 *                         type: number
 *                       type:
 *                         type: string
 *                         enum: [WATCH, UPLOAD, LIKE, COMMENT]
 *                       progress:
 *                         type: number
 *                       target:
 *                         type: number
 *                       completed:
 *                         type: boolean
 *       401:
 *         description: Unauthorized
 */
router.get('/missions', authenticateToken, async (req, res) => {
  try {
    const missions = await prisma.userMission.findMany({
      where: {
        userId: req.user.id,
        completed: false
      },
      include: {
        mission: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ missions });
  } catch (error) {
    logger.error('Error fetching missions:', error);
    res.status(500).json({ error: 'Failed to fetch missions' });
  }
});

/**
 * @swagger
 * /api/gamification/missions/{missionId}/progress:
 *   post:
 *     summary: Update mission progress
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: missionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               progress:
 *                 type: number
 *     responses:
 *       200:
 *         description: Mission progress updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Mission not found
 */
router.post('/missions/:missionId/progress', authenticateToken, async (req, res) => {
  try {
    const { progress } = req.body;
    const { missionId } = req.params;

    const userMission = await prisma.userMission.findFirst({
      where: {
        userId: req.user.id,
        missionId,
      },
      include: {
        mission: true,
      },
    });

    if (!userMission) {
      return res.status(404).json({ status: 'error', error: 'Mission not found' });
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

    res.json({ status: 'success', data: updatedMission });
  } catch (error) {
    logger.error('Error updating mission progress:', error);
    res.status(500).json({ status: 'error', error: 'Failed to update mission progress' });
  }
});

/**
 * @swagger
 * /api/gamification/achievements:
 *   get:
 *     summary: Get user achievements
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Achievements retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 achievements:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       reward:
 *                         type: number
 *                       type:
 *                         type: string
 *                         enum: [FIRST_VIDEO, FIRST_LIKE, FIRST_COMMENT, POPULAR_VIDEO]
 *                       progress:
 *                         type: number
 *                       target:
 *                         type: number
 *                       completed:
 *                         type: boolean
 *                       unlockedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get('/achievements', authenticateToken, async (req, res) => {
  try {
    const achievements = await prisma.userAchievement.findMany({
      where: {
        userId: req.user.id,
      },
      include: {
        achievement: true,
      },
    });
    res.json({ status: 'success', data: achievements });
  } catch (error) {
    logger.error('Error fetching achievements:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch achievements' });
  }
});

/**
 * @swagger
 * /api/gamification/achievements/progress:
 *   get:
 *     summary: Check achievement progress
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Achievement progress retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/achievements/progress', authenticateToken, async (req, res) => {
  try {
    const achievements = await prisma.userAchievement.findMany({
      where: {
        userId: req.user.id,
        completed: false,
      },
      include: {
        achievement: true,
      },
    });
    res.json({ status: 'success', data: achievements });
  } catch (error) {
    logger.error('Error checking achievement progress:', error);
    res.status(500).json({ status: 'error', error: 'Failed to check achievement progress' });
  }
});

/**
 * @swagger
 * /api/gamification/leaderboard:
 *   get:
 *     summary: Get global leaderboard
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *         description: Leaderboard period
 *     responses:
 *       200:
 *         description: Leaderboard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 leaderboard:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rank:
 *                         type: number
 *                       username:
 *                         type: string
 *                       points:
 *                         type: number
 *                       avatar:
 *                         type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/leaderboard', authenticateToken, async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    const now = new Date();
    let startDate;

    switch (period) {
      case 'weekly':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'monthly':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      default: // daily
        startDate = new Date(now.setDate(now.getDate() - 1));
    }

    const leaderboard = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        avatar: true,
        _count: {
          select: {
            videos: true,
            likes: true,
            comments: true
          }
        }
      },
      orderBy: {
        tokenBalance: 'desc'
      },
      take: 100
    });

    const formattedLeaderboard = leaderboard.map((user, index) => ({
      rank: index + 1,
      username: user.username,
      points: user._count.videos * 10 + user._count.likes * 5 + user._count.comments * 3,
      avatar: user.avatar
    }));

    res.json({ leaderboard: formattedLeaderboard });
  } catch (error) {
    logger.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

/**
 * @swagger
 * /api/gamification/claim-reward:
 *   post:
 *     summary: Claim mission reward
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - missionId
 *             properties:
 *               missionId:
 *                 type: string
 *                 description: ID of the completed mission
 *     responses:
 *       200:
 *         description: Reward claimed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Reward claimed successfully
 *                 reward:
 *                   type: number
 *       400:
 *         description: Mission not completed or already claimed
 *       401:
 *         description: Unauthorized
 */
router.post('/missions/:missionId/claim', authenticateToken, async (req, res) => {
  try {
    const { missionId } = req.params;

    const userMission = await prisma.userMission.findFirst({
      where: {
        userId: req.user.id,
        missionId,
      },
      include: {
        mission: true,
      },
    });

    if (!userMission) {
      return res.status(404).json({ status: 'error', error: 'Mission not found' });
    }

    if (!userMission.completed) {
      return res.status(400).json({ status: 'error', error: 'Mission not completed' });
    }

    // Update user tokens
    await prisma.user.update({
      where: {
        id: req.user.id,
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

    res.json({ status: 'success', data: updatedMission });
  } catch (error) {
    logger.error('Error claiming mission reward:', error);
    res.status(500).json({ status: 'error', error: 'Failed to claim mission reward' });
  }
});

/**
 * @swagger
 * /api/gamification/stats:
 *   get:
 *     summary: Get user's gamification stats
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's gamification stats retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     streak:
 *                       type: object
 *                       properties:
 *                         currentStreak:
 *                           type: integer
 *                         longestStreak:
 *                           type: integer
 *                     achievements:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         unlocked:
 *                           type: integer
 *                         list:
 *                           type: array
 *                           items:
 *                             type: object
 *                     missions:
 *                       type: object
 *                       properties:
 *                         available:
 *                           type: integer
 *                         list:
 *                           type: array
 *                           items:
 *                             type: object
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: req.user.id,
      },
      select: {
        id: true,
        username: true,
        avatar: true,
        tokenBalance: true,
        streak: true,
        lastStreakDate: true,
        totalWatchTime: true,
        videos: {
          select: {
            id: true,
            title: true,
            url: true,
            thumbnailUrl: true,
            createdAt: true,
            views: true,
            description: true,
            duration: true,
            likeCount: true,
            tags: true,
            tokenReward: true
          }
        },
        transactions: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 50,
          select: {
            id: true,
            amount: true,
            type: true,
            description: true,
            createdAt: true,
            videoId: true
          }
        },
        _count: {
          select: {
            videos: true,
            likes: true,
            comments: true,
            userAchievements: {
              where: {
                completed: true
              }
            },
            userMissions: {
              where: {
                completed: true
              }
            }
          }
        },
        userAchievements: {
          where: {
            completed: true
          },
          include: {
            achievement: {
              select: {
                id: true,
                name: true,
                description: true,
                reward: true,
                icon: true
              }
            }
          }
        },
        userMissions: {
          where: {
            completed: true
          },
          include: {
            mission: {
              select: {
                id: true,
                name: true,
                description: true,
                reward: true,
                type: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ 
        status: 'error',
        error: 'User not found' 
      });
    }

    // Transform the data to ensure consistent field names
    const response = {
      status: 'success',
      data: {
        user: {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          tokenBalance: user.tokenBalance,
          streak: user.streak || 0,
          lastStreakDate: user.lastStreakDate,
          totalWatchTime: user.totalWatchTime || 0
        },
        stats: {
          videos: user._count.videos || 0,
          likes: user._count.likes || 0,
          comments: user._count.comments || 0,
          completedAchievements: user._count.userAchievements || 0,
          completedMissions: user._count.userMissions || 0
        },
        videos: user.videos.map(video => ({
          id: video.id,
          title: video.title,
          videoUrl: video.url, // Map url to videoUrl for frontend compatibility
          thumbnailUrl: video.thumbnailUrl,
          createdAt: video.createdAt,
          views: video.views || 0,
          description: video.description,
          duration: video.duration,
          likeCount: video.likeCount || 0,
          tags: video.tags || [],
          tokenReward: video.tokenReward || 0
        })),
        achievements: user.userAchievements.map(ua => ({
          id: ua.achievement.id,
          name: ua.achievement.name,
          description: ua.achievement.description,
          reward: ua.achievement.reward,
          icon: ua.achievement.icon,
          completedAt: ua.completedAt
        })),
        missions: user.userMissions.map(um => ({
          id: um.mission.id,
          name: um.mission.name,
          description: um.mission.description,
          reward: um.mission.reward,
          type: um.mission.type,
          completedAt: um.completedAt
        })),
        transactions: user.transactions.map(tx => ({
          id: tx.id,
          amount: tx.amount,
          type: tx.type,
          description: tx.description,
          createdAt: tx.createdAt,
          videoId: tx.videoId
        }))
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching gamification stats:', error);
    res.status(500).json({ 
      status: 'error',
      error: 'Failed to fetch gamification stats',
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/gamification/missions:
 *   get:
 *     summary: Get available missions
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available missions retrieved successfully
 */
router.get('/missions', authenticateToken, async (req, res) => {
  try {
    const missions = await gamificationService.getAvailableMissions(req.user.id);
    
    res.json({
      status: 'success',
      data: missions
    });
  } catch (error) {
    logger.error('Error getting missions:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to get missions'
    });
  }
});

/**
 * @swagger
 * /api/gamification/missions/{missionId}/complete:
 *   post:
 *     summary: Complete a mission
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: missionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Mission completed successfully
 */
router.post('/missions/:missionId/complete', authenticateToken, async (req, res) => {
  try {
    const result = await gamificationService.completeMission(
      req.user.id,
      req.params.missionId
    );
    
    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    logger.error('Error completing mission:', error);
    if (error.message.includes('already completed')) {
      return res.status(400).json({
        status: 'error',
        error: error.message
      });
    }
    res.status(500).json({
      status: 'error',
      error: 'Failed to complete mission'
    });
  }
});

/**
 * @swagger
 * /api/gamification/streak:
 *   post:
 *     summary: Update user's streak
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Streak updated successfully
 */
router.post('/streak', authenticateToken, async (req, res) => {
  try {
    const streak = await gamificationService.updateStreak(req.user.id);

    res.json({
      status: 'success',
      data: { streak }
    });
  } catch (error) {
    logger.error('Error updating streak:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to update streak'
    });
  }
});

module.exports = router; 