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
const commentService = require('../services/commentService');

const videoService = VideoService;

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
      id: videoMetadata.video.id,
      title: videoMetadata.video.title,
      description: description,
      url: videoMetadata.video.url,
      thumbnailUrl: videoMetadata.video.thumbnailUrl,
      duration: videoMetadata.video.duration,
      userId: videoMetadata.video.userId,
      createdAt: videoMetadata.video.createdAt,
      user: req.user,
      stats: {
        likes: 0,
        comments: 0,
        views: 0
      }
    };

    // Send success response with complete video data
    res.json({
      status: 'success',
      data: { 
        video: response,
        message: 'Video uploaded successfully'
      }
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
 *     summary: Get paginated video feed
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
 */
router.get('/feed', authenticateToken, async (req, res) => {
  try {
    const { cursor, limit = 10 } = req.query;
    const feed = await videoService.getFeed(cursor, parseInt(limit), req.user.id);
    
    res.json({
      status: 'success',
      data: feed
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
    const reward = await tokenService.rewardWatchTime(req.user.id, seconds, req.params.videoId);

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

/**
 * @swagger
 * /api/content/watch/{videoId}:
 *   post:
 *     summary: Record video watch time and reward tokens
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the video being watched
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - watchTime
 *             properties:
 *               watchTime:
 *                 type: number
 *                 description: Time spent watching the video in seconds
 *     responses:
 *       200:
 *         description: Watch time recorded and tokens rewarded
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
 *                     tokensEarned:
 *                       type: number
 *                       description: Number of tokens earned
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post('/watch/:videoId', authenticateToken, async (req, res) => {
  try {
    const { videoId } = req.params;
    const { watchTime } = req.body;

    if (!watchTime || watchTime < 0) {
      return res.status(400).json({
        status: 'error',
        error: 'Invalid watch time'
      });
    }

    // Verify video exists
    const video = await prisma.video.findUnique({
      where: { id: videoId }
    });

    if (!video) {
      return res.status(404).json({
        status: 'error',
        error: 'Video not found'
      });
    }

    // Don't reward tokens if user is watching their own video
    if (video.userId === req.user.id) {
      return res.json({
        status: 'success',
        data: { tokensEarned: 0 }
      });
    }

    // Reward tokens for watch time
    const tokensEarned = await tokenService.rewardWatchTime(
      req.user.id,
      watchTime,
      videoId
    );

    res.json({
      status: 'success',
      data: { tokensEarned }
    });
  } catch (error) {
    logger.error('Error recording watch time:', error);
    res.status(500).json({
      status: 'error',
      error: error.message || 'Failed to record watch time'
    });
  }
});

/**
 * @swagger
 * /api/content/{videoId}/comments:
 *   get:
 *     summary: Get comments for a video
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Comments retrieved successfully
 */
router.get('/:videoId/comments', authenticateToken, async (req, res) => {
  try {
    const { cursor, limit = 10 } = req.query;
    const comments = await commentService.getComments(
      req.params.videoId,
      cursor,
      parseInt(limit)
    );

    res.json({
      status: 'success',
      data: comments
    });
  } catch (error) {
    logger.error('Error fetching comments:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch comments',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/content/{videoId}/comments:
 *   post:
 *     summary: Add a comment to a video
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Comment added successfully
 */
router.post('/:videoId/comments', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        error: 'Comment content is required'
      });
    }

    const comment = await commentService.addComment(
      req.user.id,
      req.params.videoId,
      content.trim()
    );

    res.status(201).json({
      status: 'success',
      data: comment
    });
  } catch (error) {
    logger.error('Error adding comment:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to add comment',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/content/comments/{commentId}:
 *   delete:
 *     summary: Delete a comment
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Comment deleted successfully
 */
router.delete('/comments/:commentId', authenticateToken, async (req, res) => {
  try {
    await commentService.deleteComment(req.user.id, req.params.commentId);
    
    res.json({
      status: 'success',
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting comment:', error);
    if (error.message.includes('Unauthorized')) {
      return res.status(403).json({
        status: 'error',
        error: error.message
      });
    }
    if (error.message.includes('not found')) {
      return res.status(404).json({
        status: 'error',
        error: error.message
      });
    }
    res.status(500).json({
      status: 'error',
      error: 'Failed to delete comment',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/content/comments/{commentId}/like:
 *   post:
 *     summary: Like a comment
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Comment liked successfully
 */
router.post('/comments/:commentId/like', authenticateToken, async (req, res) => {
  try {
    const stats = await commentService.likeComment(req.user.id, req.params.commentId);
    
    res.json({
      status: 'success',
      data: stats
    });
  } catch (error) {
    logger.error('Error liking comment:', error);
    if (error.message.includes('already liked')) {
      return res.status(400).json({
        status: 'error',
        error: error.message
      });
    }
    res.status(500).json({
      status: 'error',
      error: 'Failed to like comment',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/content/{videoId}/thumbnail:
 *   get:
 *     summary: Get video thumbnail
 *     tags: [Content]
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thumbnail image
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Thumbnail not found
 */
router.get('/:videoId/thumbnail', contentController.getThumbnail);

module.exports = router; 