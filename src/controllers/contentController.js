const prisma = require('../configs/database');
const storageClient = require('../configs/storage');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const tokenService = require('../services/tokenService');
const gamificationService = require('../services/gamificationService');
const logger = require('../utils/logger');
const config = require('../configs/video-service-config');

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

      // Upload to storage
      const videoKey = `videos/${userId}/${Date.now()}-${req.file.originalname}`;
      const bucketName = config.bucketName;

      if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'validation') {
        // Use S3
        await storageClient.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: videoKey,
          Body: req.file.buffer,
          ContentType: req.file.mimetype
        }));
      } else {
        // Use MinIO
        await storageClient.putObject(
          bucketName,
          videoKey,
          req.file.buffer,
          req.file.size
        );
      }

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
            tokenReward: video.tokenReward,
            createdAt: video.createdAt
          }
        }
      });
    } catch (error) {
      logger.error('Error uploading video:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to upload video'
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
      const video = await prisma.video.findUnique({
        where: { id: parseInt(videoId) }
      });

      if (!video) {
        return res.status(404).json({
          status: 'error',
          message: 'Video not found'
        });
      }

      const bucketName = config.bucketName;

      if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'validation') {
        // Use S3
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: video.videoUrl
        });
        const response = await storageClient.send(command);
        res.setHeader('Content-Type', response.ContentType);
        response.Body.pipe(res);
      } else {
        // Use MinIO
        const stream = await storageClient.getObject(bucketName, video.videoUrl);
        stream.pipe(res);
      }
    } catch (error) {
      logger.error('Error streaming video:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to stream video'
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
        where: { id: parseInt(videoId) }
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

      const bucketName = config.bucketName;

      if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'validation') {
        // Use S3
        await storageClient.send(new DeleteObjectCommand({
          Bucket: bucketName,
          Key: video.videoUrl
        }));
      } else {
        // Use MinIO
        await storageClient.removeObject(bucketName, video.videoUrl);
      }

      await prisma.video.delete({
        where: { id: parseInt(videoId) }
      });

      logger.info(`Video deleted: ${videoId} by user ${userId}`);

      res.status(200).json({
        status: 'success',
        message: 'Video deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting video:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to delete video'
      });
    }
  }

  async getThumbnail(req, res) {
    try {
      const { videoId } = req.params;
      const video = await prisma.video.findUnique({
        where: { id: videoId }
      });

      if (!video || !video.thumbnailUrl) {
        return res.status(404).json({
          status: 'error',
          message: 'Thumbnail not found'
        });
      }

      try {
        const thumbnailStream = await storageClient.getFile(video.thumbnailUrl);
        res.setHeader('Content-Type', 'image/jpeg');
        thumbnailStream.pipe(res);
      } catch (error) {
        logger.error('Error getting thumbnail from storage:', error);
        res.status(404).json({
          status: 'error',
          message: 'Thumbnail not found in storage'
        });
      }
    } catch (error) {
      logger.error('Error serving thumbnail:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to serve thumbnail'
      });
    }
  }
}

module.exports = new ContentController(); 