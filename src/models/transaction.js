const prisma = require('../configs/database');
const logger = require('../utils/logger');

class TransactionModel {
  async create(data) {
    try {
      return await prisma.transaction.create({
        data,
        include: {
          video: true
        }
      });
    } catch (error) {
      logger.error(`Error creating transaction: ${error.message}`);
      throw error;
    }
  }

  async getUserTransactions(userId, cursor, limit = 10) {
    try {
      return await prisma.transaction.findMany({
        where: { userId },
        take: parseInt(limit) + 1,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          video: true
        }
      });
    } catch (error) {
      logger.error(`Error getting user transactions: ${error.message}`);
      throw error;
    }
  }

  async getTransactionStats() {
    try {
      return await prisma.transaction.groupBy({
        by: ['type'],
        _sum: {
          amount: true
        }
      });
    } catch (error) {
      logger.error(`Error getting transaction stats: ${error.message}`);
      throw error;
    }
  }

  async getVideoTransactions(videoId) {
    try {
      return await prisma.transaction.findMany({
        where: { videoId },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      logger.error(`Error getting video transactions: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new TransactionModel(); 