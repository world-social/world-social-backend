const prisma = require('../configs/database');
const logger = require('../utils/logger');

class BadgeModel {
  async findById(id) {
    try {
      return await prisma.badge.findUnique({
        where: { id },
        include: {
          user: true
        }
      });
    } catch (error) {
      logger.error(`Error finding badge by id: ${error.message}`);
      throw error;
    }
  }

  async create(data) {
    try {
      return await prisma.badge.create({
        data,
        include: {
          user: true
        }
      });
    } catch (error) {
      logger.error(`Error creating badge: ${error.message}`);
      throw error;
    }
  }

  async getUserBadges(userId) {
    try {
      return await prisma.badge.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      logger.error(`Error getting user badges: ${error.message}`);
      throw error;
    }
  }

  async delete(id) {
    try {
      return await prisma.badge.delete({
        where: { id }
      });
    } catch (error) {
      logger.error(`Error deleting badge: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new BadgeModel(); 