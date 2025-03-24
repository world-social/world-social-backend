const prisma = require('../configs/database');
const tokenService = require('../services/tokenService');
const logger = require('../utils/logger');

class TokenController {
  async getBalance(req, res) {
    try {
      const balance = await tokenService.getBalance(req.user.id);

      res.json({
        status: 'success',
        data: {
          balance
        }
      });
    } catch (error) {
      logger.error(`Balance fetch error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async getTransactionHistory(req, res) {
    try {
      const transactions = await tokenService.getTransactionHistory(req.user.id);

      res.json({
        status: 'success',
        data: {
          transactions
        }
      });
    } catch (error) {
      logger.error(`Transaction history error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async withdrawEarnings(req, res) {
    try {
      const transaction = await tokenService.withdrawEarnings(req.user.id);

      logger.info(`Earnings withdrawn by user ${req.user.id}`);

      res.json({
        status: 'success',
        data: {
          transaction
        }
      });
    } catch (error) {
      logger.error(`Withdrawal error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async getInfluencerEarnings(req, res) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          videos: true
        }
      });

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      const totalEarnings = user.videos.reduce((sum, video) => sum + video.tokenReward, 0);

      res.json({
        status: 'success',
        data: {
          totalEarnings,
          videoCount: user.videos.length
        }
      });
    } catch (error) {
      logger.error(`Influencer earnings error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async getTokenStats(req, res) {
    try {
      const stats = await prisma.transaction.groupBy({
        by: ['type'],
        _sum: {
          amount: true
        }
      });

      res.json({
        status: 'success',
        data: {
          stats
        }
      });
    } catch (error) {
      logger.error(`Token stats error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
}

module.exports = new TokenController(); 