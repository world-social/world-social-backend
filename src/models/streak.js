const prisma = require('../configs/database');
const logger = require('../utils/logger');

class StreakModel {
  async findById(id) {
    try {
      return await prisma.streak.findUnique({
        where: { id },
        include: {
          user: true
        }
      });
    } catch (error) {
      logger.error(`Error finding streak by id: ${error.message}`);
      throw error;
    }
  }

  async findByUserId(userId) {
    try {
      return await prisma.streak.findUnique({
        where: { userId },
        include: {
          user: true
        }
      });
    } catch (error) {
      logger.error(`Error finding streak by user id: ${error.message}`);
      throw error;
    }
  }

  async create(data) {
    try {
      return await prisma.streak.create({
        data,
        include: {
          user: true
        }
      });
    } catch (error) {
      logger.error(`Error creating streak: ${error.message}`);
      throw error;
    }
  }

  async update(id, data) {
    try {
      return await prisma.streak.update({
        where: { id },
        data,
        include: {
          user: true
        }
      });
    } catch (error) {
      logger.error(`Error updating streak: ${error.message}`);
      throw error;
    }
  }

  async getLeaderboard(type = 'streak', limit = 10) {
    try {
      const orderBy = type === 'streak' ? 'currentStreak' : 'longestStreak';
      return await prisma.streak.findMany({
        take: parseInt(limit),
        orderBy: {
          [orderBy]: 'desc'
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true
            }
          }
        }
      });
    } catch (error) {
      logger.error(`Error getting streak leaderboard: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new StreakModel(); 