const prisma = require('../configs/database');
const logger = require('../utils/logger');

class VideoModel {
  async findById(id) {
    try {
      return await prisma.video.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });
    } catch (error) {
      logger.error(`Error finding video by ID: ${error.message}`);
      throw error;
    }
  }

  async create(data) {
    try {
      return await prisma.video.create({
        data,
        include: {
          user: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });
    } catch (error) {
      logger.error(`Error creating video: ${error.message}`);
      throw error;
    }
  }

  async update(id, data) {
    try {
      return await prisma.video.update({
        where: { id },
        data,
        include: {
          user: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });
    } catch (error) {
      logger.error(`Error updating video: ${error.message}`);
      throw error;
    }
  }

  async delete(id) {
    try {
      return await prisma.video.delete({
        where: { id }
      });
    } catch (error) {
      logger.error(`Error deleting video: ${error.message}`);
      throw error;
    }
  }

  async getFeed(cursor, limit = 10) {
    try {
      return await prisma.video.findMany({
        take: parseInt(limit) + 1,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });
    } catch (error) {
      logger.error(`Error getting video feed: ${error.message}`);
      throw error;
    }
  }

  async getUserVideos(userId, cursor, limit = 10) {
    try {
      return await prisma.video.findMany({
        where: { userId },
        take: parseInt(limit) + 1,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });
    } catch (error) {
      logger.error(`Error getting user videos: ${error.message}`);
      throw error;
    }
  }

  async incrementViews(id) {
    try {
      return await prisma.video.update({
        where: { id },
        data: {
          views: {
            increment: 1
          }
        }
      });
    } catch (error) {
      logger.error(`Error incrementing video views: ${error.message}`);
      throw error;
    }
  }

  async incrementLikes(id) {
    try {
      return await prisma.video.update({
        where: { id },
        data: {
          likes: {
            increment: 1
          }
        }
      });
    } catch (error) {
      logger.error(`Error incrementing video likes: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new VideoModel(); 