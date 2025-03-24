const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

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
    const missions = await prisma.mission.findMany({
      where: {
        userId: req.user.id,
        completed: false
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
    const { missionId } = req.params;
    const { progress } = req.body;

    const mission = await prisma.mission.findUnique({
      where: { id: missionId }
    });

    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    if (mission.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this mission' });
    }

    const updatedMission = await prisma.mission.update({
      where: { id: missionId },
      data: {
        progress,
        completed: progress >= mission.target
      }
    });

    res.json(updatedMission);
  } catch (error) {
    logger.error('Error updating mission progress:', error);
    res.status(500).json({ error: 'Failed to update mission progress' });
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
    const achievements = await prisma.achievement.findMany({
      where: { userId: req.user.id },
      orderBy: { unlockedAt: 'desc' }
    });

    res.json({ achievements });
  } catch (error) {
    logger.error('Error fetching achievements:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

/**
 * @swagger
 * /api/gamification/achievements/{achievementId}/progress:
 *   post:
 *     summary: Update achievement progress
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: achievementId
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
 *         description: Achievement progress updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Achievement not found
 */
router.post('/achievements/:achievementId/progress', authenticateToken, async (req, res) => {
  try {
    const { achievementId } = req.params;
    const { progress } = req.body;

    const achievement = await prisma.achievement.findUnique({
      where: { id: achievementId }
    });

    if (!achievement) {
      return res.status(404).json({ error: 'Achievement not found' });
    }

    if (achievement.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this achievement' });
    }

    const updatedAchievement = await prisma.achievement.update({
      where: { id: achievementId },
      data: {
        progress,
        completed: progress >= achievement.target,
        unlockedAt: progress >= achievement.target ? new Date() : undefined
      }
    });

    res.json(updatedAchievement);
  } catch (error) {
    logger.error('Error updating achievement progress:', error);
    res.status(500).json({ error: 'Failed to update achievement progress' });
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
router.post('/claim-reward', authenticateToken, async (req, res) => {
  try {
    const { missionId } = req.body;
    const mission = await prisma.mission.findUnique({
      where: { id: missionId }
    });

    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    if (mission.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to claim this reward' });
    }

    if (!mission.completed) {
      return res.status(400).json({ error: 'Mission not completed' });
    }

    if (mission.rewardClaimed) {
      return res.status(400).json({ error: 'Reward already claimed' });
    }

    // Update mission and user balance in a transaction
    const [updatedMission, updatedUser] = await prisma.$transaction([
      prisma.mission.update({
        where: { id: missionId },
        data: { rewardClaimed: true }
      }),
      prisma.user.update({
        where: { id: req.user.id },
        data: { tokenBalance: { increment: mission.reward } }
      })
    ]);

    res.json({
      message: 'Reward claimed successfully',
      reward: mission.reward
    });
  } catch (error) {
    logger.error('Error claiming reward:', error);
    res.status(500).json({ error: 'Failed to claim reward' });
  }
});

module.exports = router; 