const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const Redis = require('redis');

const redisClient = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Connect to Redis with error handling
redisClient.on('error', (err) => {
  logger.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  logger.info('Redis Client Connected');
});

// Connect to Redis
redisClient.connect().catch((err) => {
  logger.error('Failed to connect to Redis:', err);
});

/**
 * @swagger
 * /api/tokens/balance:
 *   get:
 *     summary: Get user's token balance
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 balance:
 *                   type: number
 *                   description: User's token balance
 *       401:
 *         description: Unauthorized
 */
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { tokenBalance: true }
    });

    res.json({ balance: user.tokenBalance });
  } catch (error) {
    logger.error('Error fetching token balance:', error);
    res.status(500).json({ error: 'Failed to fetch token balance' });
  }
});

/**
 * @swagger
 * /api/tokens/transactions:
 *   get:
 *     summary: Get user's transaction history
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Cursor for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of transactions to return
 *     responses:
 *       200:
 *         description: Transaction history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       type:
 *                         type: string
 *                         enum: [REWARD, WITHDRAWAL]
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 nextCursor:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const { cursor, limit = 10 } = req.query;
    const transactions = await prisma.transaction.findMany({
      where: { userId: req.user.id },
      take: parseInt(limit),
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: 'desc' }
    });

    const nextCursor = transactions.length === parseInt(limit) ? transactions[transactions.length - 1].id : null;

    res.json({
      transactions,
      nextCursor,
      hasMore: nextCursor !== null
    });
  } catch (error) {
    logger.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * @swagger
 * /api/tokens/withdraw:
 *   post:
 *     summary: Withdraw tokens (for influencers)
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Amount of tokens to withdraw
 *     responses:
 *       200:
 *         description: Tokens withdrawn successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *       400:
 *         description: Insufficient balance
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an influencer
 */
router.post('/withdraw', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user.isInfluencer) {
      return res.status(403).json({ error: 'Only influencers can withdraw tokens' });
    }

    if (user.tokenBalance < amount) {
      return res.status(400).json({ error: 'Insufficient token balance' });
    }

    // In production, implement actual withdrawal logic here
    await prisma.user.update({
      where: { id: user.id },
      data: { tokenBalance: { decrement: amount } }
    });

    await prisma.transaction.create({
      data: {
        userId: user.id,
        amount: -amount,
        type: 'WITHDRAWAL'
      }
    });

    res.json({ message: 'Tokens withdrawn successfully' });
  } catch (error) {
    logger.error('Error withdrawing tokens:', error);
    res.status(500).json({ error: 'Failed to withdraw tokens' });
  }
});

/**
 * @swagger
 * /api/tokens/earnings:
 *   get:
 *     summary: Get influencer earnings
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Earnings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalEarnings:
 *                   type: number
 *                 availableBalance:
 *                   type: number
 *                 withdrawalHistory:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an influencer
 */
router.get('/earnings', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user.isInfluencer) {
      return res.status(403).json({ error: 'Only influencers can view earnings' });
    }

    const withdrawals = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        type: 'WITHDRAWAL'
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      totalEarnings: user.totalEarnings,
      availableBalance: user.tokenBalance,
      withdrawalHistory: withdrawals
    });
  } catch (error) {
    logger.error('Error fetching earnings:', error);
    res.status(500).json({ error: 'Failed to fetch earnings' });
  }
});

/**
 * @swagger
 * /api/tokens/stats:
 *   get:
 *     summary: Get token distribution statistics
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalSupply:
 *                   type: number
 *                 circulatingSupply:
 *                   type: number
 *                 totalRewards:
 *                   type: number
 *                 totalWithdrawals:
 *                   type: number
 *       401:
 *         description: Unauthorized
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await prisma.$transaction([
      prisma.user.aggregate({
        _sum: {
          tokenBalance: true,
          totalEarnings: true
        }
      }),
      prisma.transaction.aggregate({
        where: { type: 'WITHDRAWAL' },
        _sum: { amount: true }
      })
    ]);

    res.json({
      totalSupply: 1000000, // In production, get from smart contract
      circulatingSupply: stats[0]._sum.tokenBalance || 0,
      totalRewards: stats[0]._sum.totalEarnings || 0,
      totalWithdrawals: Math.abs(stats[1]._sum.amount || 0)
    });
  } catch (error) {
    logger.error('Error fetching token stats:', error);
    res.status(500).json({ error: 'Failed to fetch token statistics' });
  }
});

/**
 * @swagger
 * /api/tokens/daily-bonus/status:
 *   get:
 *     summary: Check if user has collected daily bonus
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daily bonus status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasCollected:
 *                   type: boolean
 *                   description: Whether the user has collected today's bonus
 *       401:
 *         description: Unauthorized
 */
router.get('/daily-bonus/status', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const key = `daily_bonus:${req.user.id}:${today}`;
    
    const hasCollected = await redisClient.get(key);
    
    res.json({ hasCollected: !!hasCollected });
  } catch (error) {
    logger.error('Error checking daily bonus status:', error);
    res.status(500).json({ error: 'Failed to check daily bonus status' });
  }
});

/**
 * @swagger
 * /api/tokens/daily-bonus:
 *   post:
 *     summary: Collect daily bonus
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daily bonus collected successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 amount:
 *                   type: number
 *                   description: Amount of tokens received
 *       400:
 *         description: Already collected today's bonus
 *       401:
 *         description: Unauthorized
 */
router.post('/daily-bonus', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const key = `daily_bonus:${req.user.id}:${today}`;
    
    // Check if already collected today
    const hasCollected = await redisClient.get(key);
    if (hasCollected) {
      return res.status(400).json({ error: 'Already collected today\'s bonus' });
    }

    const bonusAmount = 10; // Daily bonus amount
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    // Update user's token balance
    await prisma.user.update({
      where: { id: user.id },
      data: { tokenBalance: { increment: bonusAmount } }
    });

    // Record the transaction
    await prisma.transaction.create({
      data: {
        userId: user.id,
        amount: bonusAmount,
        type: 'REWARD',
        description: 'Daily bonus reward'
      }
    });

    // Mark as collected in Redis (expires in 24 hours)
    await redisClient.set(key, '1', { EX: 86400 });

    res.json({ amount: bonusAmount });
  } catch (error) {
    logger.error('Error collecting daily bonus:', error);
    res.status(500).json({ error: 'Failed to collect daily bonus' });
  }
});

module.exports = router; 