const prisma = require('../configs/database');
const minioClient = require('../configs/minio');
const tokenService = require('../services/tokenService');
const gamificationService = require('../services/gamificationService');
const logger = require('../utils/logger');

class ContentController {
  async uploadVideo(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          message: 'No video file provided'
        });
      }

      const { title, description } = req.body;
      const userId = req.user.id;

      // Upload to MinIO
      const videoKey = `videos/${userId}/${Date.now()}-${req.file.originalname}`;
      await minioClient.putObject(
        process.env.MINIO_BUCKET_NAME,
        videoKey,
        req.file.buffer,
        req.file.size
      );

      // Create video record
      const video = await prisma.video.create({
        data: {
          userId,
          title,
          description,
          videoUrl: videoKey
        }
      });

      // Award tokens for uploading
      await tokenService.earnTokens(userId, 10, video.id);

      // Check for achievements
      await gamificationService.checkAchievements(userId);

      logger.info(`Video uploaded: ${video.id} by user ${userId}`);

      res.status(201).json({
        status: 'success',
        data: {
          video: {
            id: video.id,
            title: video.title,
            description: video.description,
            videoUrl: video.videoUrl,
            tokenReward: video.tokenReward
          }
        }
      });
    } catch (error) {
      logger.error(`Video upload error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async getVideoFeed(req, res) {
    try {
      const { cursor, limit = 10 } = req.query;
      const userId = req.user.id;

      const videos = await prisma.video.findMany({
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

      const hasMore = videos.length > limit;
      const feedVideos = hasMore ? videos.slice(0, -1) : videos;

      // Preload next video for smooth scrolling
      if (hasMore) {
        const nextVideo = videos[videos.length - 1];
        // You can implement preloading logic here
      }

      res.json({
        status: 'success',
        data: {
          videos: feedVideos,
          hasMore,
          nextCursor: hasMore ? feedVideos[feedVideos.length - 1].id : null
        }
      });
    } catch (error) {
      logger.error(`Feed fetch error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async streamVideo(req, res) {
    try {
      const { videoId } = req.params;
      const userId = req.user.id;

      const video = await prisma.video.findUnique({
        where: { id: videoId }
      });

      if (!video) {
        return res.status(404).json({
          status: 'error',
          message: 'Video not found'
        });
      }

      // Get video stream from MinIO
      const videoStream = await minioClient.getObject(
        process.env.MINIO_BUCKET_NAME,
        video.videoUrl
      );

      // Set response headers
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', videoStream.length);

      // Update video views
      await prisma.video.update({
        where: { id: videoId },
        data: {
          views: {
            increment: 1
          }
        }
      });

      // Award tokens for watching
      await tokenService.earnTokens(userId, 1, videoId);

      // Stream video
      videoStream.pipe(res);
    } catch (error) {
      logger.error(`Video stream error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async likeVideo(req, res) {
    try {
      const { videoId } = req.params;
      const userId = req.user.id;

      const video = await prisma.video.findUnique({
        where: { id: videoId }
      });

      if (!video) {
        return res.status(404).json({
          status: 'error',
          message: 'Video not found'
        });
      }

      // Update video likes
      await prisma.video.update({
        where: { id: videoId },
        data: {
          likes: {
            increment: 1
          }
        }
      });

      // Award tokens for liking
      await tokenService.earnTokens(userId, 2, videoId);

      res.json({
        status: 'success',
        data: {
          likes: video.likes + 1
        }
      });
    } catch (error) {
      logger.error(`Video like error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async deleteVideo(req, res) {
    try {
      const { videoId } = req.params;
      const userId = req.user.id;

      const video = await prisma.video.findUnique({
        where: { id: videoId }
      });

      if (!video) {
        return res.status(404).json({
          status: 'error',
          message: 'Video not found'
        });
      }

      if (video.userId !== userId) {
        return res.status(403).json({
          status: 'error',
          message: 'Not authorized to delete this video'
        });
      }

      // Delete from MinIO
      await minioClient.removeObject(
        process.env.MINIO_BUCKET_NAME,
        video.videoUrl
      );

      // Delete from database
      await prisma.video.delete({
        where: { id: videoId }
      });

      logger.info(`Video deleted: ${videoId} by user ${userId}`);

      res.json({
        status: 'success',
        message: 'Video deleted successfully'
      });
    } catch (error) {
      logger.error(`Video deletion error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
}

module.exports = new ContentController(); 