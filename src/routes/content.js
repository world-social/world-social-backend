const express = require('express');
const { body, validationResult } = require('express-validator');
const { verifyToken } = require('../middleware/auth');
const VideoService = require('../services/videoService');
const tokenService = require('../services/tokenService');
const gamificationService = require('../services/gamificationService');
const contentController = require('../controllers/contentController');
const { validateVideoUpload } = require('../utils/validators');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const fs = require('fs').promises;
const os = require('os');
const multer = require('multer');

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, os.tmpdir());
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  }
});

const router = express.Router();

// Create a single instance of VideoService to be used across all routes
const videoService = new VideoService();

// Function to get video duration
const getVideoDuration = (filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(metadata.format.duration);
    });
  });
};

// Function to trim video to 30 seconds
const trimVideo = (inputPath) => {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(os.tmpdir(), `trimmed-${Date.now()}.mp4`);
    
    ffmpeg(inputPath)
      .setDuration(30) // Trim to 30 seconds
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run();
  });
};

/**
 * @swagger
 * /api/content/upload:
 *   post:
 *     summary: Upload a new video
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - video
 *               - title
 *               - description
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *                 description: Video file to upload
 *               title:
 *                 type: string
 *                 description: Video title
 *               description:
 *                 type: string
 *                 description: Video description
 *     responses:
 *       201:
 *         description: Video uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     video:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         title:
 *                           type: string
 *                         description:
 *                           type: string
 *                         url:
 *                           type: string
 *                         userId:
 *                           type: string
 *       400:
 *         description: Invalid input or file type
 *       401:
 *         description: Unauthorized
 */
router.post('/upload', authenticateToken, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        status: 'error',
        error: 'No video file provided' 
      });
    }

    const { title, description } = req.body;
    if (!title || !description) {
      return res.status(400).json({
        status: 'error',
        error: 'Title and description are required'
      });
    }

    // Upload video and get metadata
    const videoMetadata = await videoService.uploadVideo(req.file, req.user.id);
    
    // Transform the response to match the expected format
    const response = {
      id: videoMetadata.id,
      title: videoMetadata.title || req.file.originalname,
      description: videoMetadata.description || req.file.originalname,
      videoUrl: videoMetadata.videoUrl,
      thumbnailUrl: videoMetadata.thumbnailUrl,
      duration: videoMetadata.duration,
      userId: videoMetadata.userId,
      createdAt: videoMetadata.createdAt
    };

    res.json({
      status: 'success',
      data: { video: response }
    });
  } catch (error) {
    console.error('Error uploading video:', error);
    res.status(500).json({ 
      status: 'error',
      error: error.message || 'Failed to upload video'
    });
  }
});

/**
 * @swagger
 * /api/content/feed:
 *   get:
 *     summary: Get video feed
 *     tags: [Content]
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
 *         description: Number of videos to return
 *     responses:
 *       200:
 *         description: Video feed retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     videos:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           title:
 *                             type: string
 *                           description:
 *                             type: string
 *                           url:
 *                             type: string
 *                           userId:
 *                             type: string
 *                           user:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               username:
 *                                 type: string
 *                     nextCursor:
 *                       type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/feed', authenticateToken, async (req, res) => {
  try {
    const { cursor, limit = 10 } = req.query;
    
    // Log request parameters
    logger.info(`Fetching video feed with cursor: ${cursor}, limit: ${limit}`);

    // Get videos from database
    const videos = await prisma.video.findMany({
      take: parseInt(limit),
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: {
        createdAt: 'desc'
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

    logger.info(`Found ${videos.length} videos`);

    const nextCursor = videos.length === parseInt(limit) ? videos[videos.length - 1].id : null;

    // Transform videos to include full URLs
    const transformedVideos = await Promise.all(videos.map(async (video) => {
      try {
        const metadata = await videoService.getVideoMetadata(video.id);
        return {
          ...video,
          videoUrl: metadata.videoUrl,
          thumbnailUrl: metadata.thumbnailUrl
        };
      } catch (error) {
        logger.warn(`Error getting metadata for video ${video.id}:`, error);
        return null; // Return null for videos with missing metadata
      }
    }));

    // Filter out videos with missing URLs
    const validVideos = transformedVideos.filter(video => video && video.videoUrl);
    logger.info(`Returning ${validVideos.length} valid videos`);

    res.json({
      status: 'success',
      data: {
        videos: validVideos,
        nextCursor
      }
    });
  } catch (error) {
    logger.error('Error fetching feed:', error);
    res.status(500).json({ 
      status: 'error',
      error: 'Failed to fetch feed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/content/{videoId}:
 *   get:
 *     summary: Get video metadata by ID
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Video ID
 *     responses:
 *       200:
 *         description: Video metadata retrieved successfully
 *       404:
 *         description: Video not found
 */
router.get('/:videoId', authenticateToken, async (req, res) => {
  try {
    const video = await videoService.getVideoMetadata(req.params.videoId);
    res.json({
      status: 'success',
      data: video
    });
  } catch (error) {
    logger.error('Error getting video metadata:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ 
      status: 'error',
      message: error.message 
    });
  }
});

/**
 * @swagger
 * /api/content/{videoId}/stream:
 *   get:
 *     summary: Stream video by ID
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Video ID
 *     responses:
 *       200:
 *         description: Video stream
 *       404:
 *         description: Video not found
 */
router.get('/:videoId/stream', authenticateToken, async (req, res) => {
  try {
    const video = await videoService.getVideoMetadata(req.params.videoId);
    const stream = await videoService.getVideoStream(req.params.videoId);

    // Set appropriate headers for video streaming
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(video.filePath)}"`);

    // Pipe the video stream to the response
    stream.pipe(res);

    // Handle stream errors
    stream.on('error', (error) => {
      logger.error('Error streaming video:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming video' });
      }
    });

    // Handle client disconnection
    req.on('close', () => {
      stream.destroy();
    });
  } catch (error) {
    logger.error('Error streaming video:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/content/{videoId}/like:
 *   post:
 *     summary: Like a video
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the video to like
 *     responses:
 *       200:
 *         description: Video liked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     likes:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Video not found
 */
router.post('/:videoId/like', authenticateToken, async (req, res) => {
  try {
    const video = await prisma.video.findUnique({
      where: { id: req.params.videoId }
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Check if already liked
    const existingLike = await prisma.like.findUnique({
      where: {
        userId_videoId: {
          userId: req.user.id,
          videoId: video.id
        }
      }
    });

    if (existingLike) {
      return res.status(400).json({ error: 'Video already liked' });
    }

    // Create like and update video likes count
    const [like, updatedVideo] = await prisma.$transaction([
      prisma.like.create({
        data: {
          userId: req.user.id,
          videoId: video.id
        }
      }),
      prisma.video.update({
        where: { id: video.id },
        data: { likes: { increment: 1 } }
      })
    ]);

    // Reward tokens for engagement
    await tokenService.rewardEngagement(req.user.id, video.id, 'LIKE');

    res.json({
      status: 'success',
      data: {
        like,
        video: updatedVideo
      }
    });
  } catch (error) {
    logger.error('Error liking video:', error);
    res.status(500).json({ error: 'Failed to like video' });
  }
});

/**
 * @swagger
 * /api/content/{videoId}/watch-time:
 *   post:
 *     summary: Reward watch time for a video
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the video
 *       - in: body
 *         required: true
 *         schema:
 *           type: object
 *           required:
 *             - seconds
 *           properties:
 *             seconds:
 *               type: integer
 *     responses:
 *       200:
 *         description: Watch time rewarded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     reward:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Video not found
 */
router.post('/:videoId/watch-time', authenticateToken, async (req, res) => {
  try {
    const { seconds } = req.body;
    const video = await prisma.video.findUnique({
      where: { id: req.params.videoId }
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Reward tokens for watch time
    const reward = await tokenService.rewardWatchTime(req.user.id, seconds, video.id);

    res.json({
      status: 'success',
      data: {
        reward
      }
    });
  } catch (error) {
    logger.error('Error rewarding watch time:', error);
    res.status(500).json({ error: 'Failed to reward watch time' });
  }
});

/**
 * @swagger
 * /api/content/{videoId}:
 *   delete:
 *     summary: Delete a video
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the video to delete
 *     responses:
 *       200:
 *         description: Video deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not the video owner
 *       404:
 *         description: Video not found
 */
router.delete('/:videoId', authenticateToken, async (req, res) => {
  try {
    const video = await prisma.video.findUnique({
      where: { id: req.params.videoId }
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    if (video.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this video' });
    }

    await prisma.video.delete({
      where: { id: video.id }
    });

    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    logger.error('Error deleting video:', error);
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

/**
 * @swagger
 * /api/content/tokens/balance:
 *   get:
 *     summary: Get user's token balance
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's token balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     balance:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 */
router.get('/tokens/balance', authenticateToken, async (req, res) => {
  try {
    const balance = await tokenService.getTokenBalance(req.user.id);
    
    res.json({
      status: 'success',
      data: {
        balance
      }
    });
  } catch (error) {
    logger.error('Error getting token balance:', error);
    res.status(500).json({ error: 'Failed to get token balance' });
  }
});

/**
 * @swagger
 * /api/content/tokens/history:
 *   get:
 *     summary: Get user's token transaction history
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of transactions to return
 *     responses:
 *       200:
 *         description: User's token transaction history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           amount:
 *                             type: integer
 *                           type:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                           updatedAt:
 *                             type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/tokens/history', authenticateToken, async (req, res) => {
  try {
    const { limit } = req.query;
    const transactions = await tokenService.getTransactionHistory(req.user.id, parseInt(limit) || 10);
    
    res.json({
      status: 'success',
      data: {
        transactions
      }
    });
  } catch (error) {
    logger.error('Error getting transaction history:', error);
    res.status(500).json({ error: 'Failed to get transaction history' });
  }
});

module.exports = router; 