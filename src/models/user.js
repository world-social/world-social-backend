const prisma = require('../configs/database');
const logger = require('../utils/logger');

class UserModel {
  async findById(id) {
    try {
      return await prisma.user.findUnique({
        where: { id },
        include: {
          videos: true,
          badges: true,
          streak: true
        }
      });
    } catch (error) {
      logger.error(`Error finding user by ID: ${error.message}`);
      throw error;
    }
  }

  async findByWorldId(worldId) {
    try {
      return await prisma.user.findUnique({
        where: { worldId }
      });
    } catch (error) {
      logger.error(`Error finding user by World ID: ${error.message}`);
      throw error;
    }
  }

  async create(data) {
    try {
      return await prisma.user.create({
        data,
        include: {
          videos: true,
          badges: true,
          streak: true
        }
      });
    } catch (error) {
      logger.error(`Error creating user: ${error.message}`);
      throw error;
    }
  }

  async update(id, data) {
    try {
      return await prisma.user.update({
        where: { id },
        data,
        include: {
          videos: true,
          badges: true,
          streak: true
        }
      });
    } catch (error) {
      logger.error(`Error updating user: ${error.message}`);
      throw error;
    }
  }

  async delete(id) {
    try {
      return await prisma.user.delete({
        where: { id }
      });
    } catch (error) {
      logger.error(`Error deleting user: ${error.message}`);
      throw error;
    }
  }

  async findInfluencers(limit = 10) {
    try {
      return await prisma.user.findMany({
        where: {
          videos: {
            _count: {
              gte: 10
            }
          }
        },
        include: {
          videos: true,
          badges: true,
          streak: true
        },
        take: limit
      });
    } catch (error) {
      logger.error(`Error finding influencers: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new UserModel(); 