// const Redis = require('redis');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const { promisify } = require('util');
const os = require('os');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');
const storageClient = require('../configs/storage');
const config = require('../configs/video-service-config');

// Mock Redis client
const redisClient = {
  isOpen: true,
  connect: async () => {},
  disconnect: async () => {},
  get: async () => null,
  set: async () => 'OK',
  del: async () => 1,
  on: () => {},
  off: () => {},
  quit: async () => {},
  ping: async () => 'PONG'
};

const ffmpegPromise = promisify(ffmpeg);

const CACHE_DURATION = process.env.CACHE_DURATION || 3600; // Default to 1 hour if not set

class VideoService {
  constructor() {
    this.bucketName = config.bucketName;
    this.maxVideoSize = config.maxVideoSize;
    this.videoRetentionDays = config.videoRetentionDays;
    this.initialize();
  }

  async initialize() {
    try {
      await this.ensureBucket();
      // await this.connectRedis();
    } catch (error) {
      logger.error('Error initializing VideoService:', error);
      throw error;
    }
  }

  // async connectRedis() {
  //   try {
  //     if (!redisClient.isOpen) {
  //       await redisClient.connect();
  //       logger.info('Redis connected successfully');
  //     }
  //   } catch (error) {
  //     logger.error('Redis connection error:', error);
  //     throw error;
  //   }
  // }

  async ensureBucket() {
    try {
      await storageClient.ensureBucketExists(this.bucketName);
      logger.info(`Bucket ${this.bucketName} ready`);
    } catch (error) {
      logger.error('Error ensuring bucket exists:', error);
      throw error;
    }
  }

  // Helper method to get full URL for a file
  getFullUrl(objectKey) {
    return `${config.getBaseUrl()}/${objectKey}`;
  }

  // Helper method to extract file path from URL
  extractFilePath(url) {
    // Remove protocol, host, and port if present
    const path = url.replace(/^https?:\/\/[^\/]+\//, '');
    // Remove bucket name if present
    return path.replace(`${this.bucketName}/`, '');
  }

  async uploadVideo(file, userId) {
    let contentId = null;
    let uploadedFiles = [];
    let createdVideo = null;
    let redisKey = null;

    try {
      // Ensure services are initialized
      await this.initialize();

      // Create a unique filename with timestamp
      const timestamp = Date.now();
      contentId = `${userId}-${timestamp}`;
      redisKey = `video:${contentId}`;
      
      // Use the original filename but ensure it's safe
      const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${contentId}/${safeFileName}`;
      const filePath = file.path;

      // Verify file exists and is readable
      try {
        await fs.access(filePath);
        const stats = await fs.stat(filePath);
        if (stats.size === 0) {
          throw new Error('Uploaded file is empty');
        }
      } catch (error) {
        throw new Error(`Invalid file: ${error.message}`);
      }

      // Get video duration using ffprobe
      let duration;
      try {
        duration = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
              logger.error('ffprobe error:', err);
              reject(new Error(`Failed to get video duration: ${err.message}`));
            } else {
              resolve(metadata.format.duration);
            }
          });
        });
      } catch (error) {
        throw new Error(`Failed to process video: ${error.message}`);
      }

      logger.info(`Video duration: ${duration} seconds`);

      // Create output path with timestamp to avoid conflicts
      const tempDir = os.tmpdir();
      const outputPath = path.join(tempDir, `trimmed-${timestamp}.mp4`);
      let finalVideoPath = filePath;
      let finalFileName = fileName;

      // Trim video if it's longer than 30 seconds
      if (duration > 30) {
        try {
          await new Promise((resolve, reject) => {
            ffmpeg(filePath)
              .setDuration(30)
              .videoCodec('libx264')
              .videoBitrate('1000k')
              .size('720x?')
              .autopad()
              .audioCodec('aac')
              .audioBitrate('128k')
              .outputOptions([
                '-preset ultrafast',
                '-movflags +faststart',
                '-max_muxing_queue_size 9999'
              ])
              .on('start', (commandLine) => {
                logger.info('Started ffmpeg with command:', commandLine);
              })
              .on('progress', (progress) => {
                logger.info(`Processing: ${progress.percent}% done`);
              })
              .on('end', () => {
                logger.info('Video trimming completed');
                resolve();
              })
              .on('error', (err) => {
                logger.error('Error during trimming:', err);
                reject(new Error(`Failed to trim video: ${err.message}`));
              })
              .save(outputPath);
          });

          // Verify the trimmed file
          await fs.access(outputPath);
          const stats = await fs.stat(outputPath);
          if (stats.size === 0) {
            throw new Error('Trimmed video file is empty');
          }
          finalVideoPath = outputPath;
          finalFileName = `${contentId}/trimmed-${safeFileName}`;
        } catch (error) {
          throw new Error(`Failed to process trimmed video: ${error.message}`);
        }
      }

      // Generate thumbnail with optimized settings
      const thumbnailName = `${contentId}/${safeFileName.replace(/\.[^/.]+$/, '')}-thumb.jpg`;
      const thumbnailPath = path.join(tempDir, `thumb-${timestamp}.jpg`);
      
      try {
        // Generate thumbnail
        await new Promise((resolve, reject) => {
          ffmpeg(finalVideoPath)
            .screenshots({
              timestamps: ['50%'],
              filename: path.basename(thumbnailPath),
              folder: path.dirname(thumbnailPath),
              size: '320x240'
            })
            .outputOptions([
              '-frames:v 1',
              '-q:v 2'
            ])
            .on('start', (commandLine) => {
              logger.info('Started thumbnail generation with command:', commandLine);
            })
            .on('end', () => {
              logger.info('Thumbnail generation completed');
              resolve();
            })
            .on('error', (err) => {
              logger.error('Error generating thumbnail:', err);
              reject(new Error(`Failed to generate thumbnail: ${err.message}`));
            })
            .save(thumbnailPath);
        });

        // Verify thumbnail file exists and is readable
        await fs.access(thumbnailPath);
        const thumbnailStats = await fs.stat(thumbnailPath);
        if (thumbnailStats.size === 0) {
          throw new Error('Generated thumbnail is empty');
        }

        // Upload thumbnail to storage
        const thumbnailBuffer = await fs.readFile(thumbnailPath);
        await storageClient.uploadFile(this.bucketName, thumbnailName, thumbnailBuffer);
        logger.info(`Thumbnail uploaded: ${thumbnailName}`);

        // Upload video to storage
        const videoBuffer = await fs.readFile(finalVideoPath);
        await storageClient.uploadFile(this.bucketName, finalFileName, videoBuffer);
        logger.info(`Video uploaded: ${finalFileName}`);

        // Create video record in database
        createdVideo = await prisma.video.create({
          data: {
            userId,
            title: file.originalname,
            url: finalFileName,
            thumbnailUrl: thumbnailName,
            duration: Math.min(duration, 30),
            tags: [],
            description: null,
            views: 0,
            likeCount: 0,
            tokenReward: 0
          }
        });

        // Store in Redis for caching
        await redisClient.set(
          redisKey,
          JSON.stringify({
            videoUrl: this.getFullUrl(finalFileName),
            thumbnailUrl: this.getFullUrl(thumbnailName),
            duration: Math.min(duration, 30)
          }),
          'EX',
          CACHE_DURATION
        );

        uploadedFiles = [finalVideoPath, thumbnailPath];
      } catch (error) {
        logger.error('Error processing video:', error);
        throw error;
      }

      return {
        video: createdVideo,
        files: uploadedFiles
      };
    } catch (error) {
      logger.error('Error in uploadVideo:', error);
      throw error;
    } finally {
      // Cleanup temporary files
      for (const file of uploadedFiles) {
        try {
          await fs.unlink(file);
        } catch (error) {
          logger.error(`Error deleting temporary file ${file}:`, error);
        }
      }
    }
  }

  async getFeed(cursor, limit = 10, userId) {
    try {
      // Convert cursor to Date if provided
      const cursorDate = cursor ? new Date(parseInt(cursor)) : undefined;
      
      // Fetch videos with cursor-based pagination
      const videos = await prisma.video.findMany({
        take: limit + 1, // Take one extra to determine if there are more results
        where: {
          // Add cursor condition if provided
          ...(cursorDate && {
            createdAt: {
              lt: cursorDate // Less than the cursor date for backwards pagination
            }
          })
        },
        orderBy: {
          createdAt: 'desc' // Most recent first
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true
            }
          },
          _count: {
            select: {
              likes: true,
              comments: true
            }
          }
        }
      });

      // Determine if there are more results
      const hasMore = videos.length > limit;
      const results = hasMore ? videos.slice(0, -1) : videos;
      
      // Get the cursor for the next page
      const lastVideo = results[results.length - 1];
      const nextCursor = hasMore ? lastVideo.createdAt.getTime().toString() : null;

      // Transform videos to include complete URLs and counts
      const transformedVideos = results.map(video => ({
        id: video.id,
        title: video.title,
        description: video.description,
        videoUrl: video.url,
        thumbnailUrl: video.thumbnailUrl,
        duration: video.duration,
        views: video.views,
        createdAt: video.createdAt,
        user: video.user,
        stats: {
          likes: video._count.likes,
          comments: video._count.comments
        },
        tags: video.tags || []
      }));

          return {
        videos: transformedVideos,
        nextCursor,
        hasMore
          };
        } catch (error) {
      logger.error('Error fetching video feed:', error);
      throw error;
    }
  }

  async getVideoMetadata(videoId) {
    try {
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true
            }
          },
          _count: {
            select: {
              likes: true,
              comments: true
            }
          }
        }
      });

      if (!video) {
        throw new Error('Video not found');
      }

      return {
        id: video.id,
        title: video.title,
        description: video.description,
        videoUrl: video.url,
        thumbnailUrl: video.thumbnailUrl,
        duration: video.duration,
        views: video.views,
        createdAt: video.createdAt,
        user: video.user,
        stats: {
          likes: video._count.likes,
          comments: video._count.comments
        },
        tags: video.tags || []
      };
    } catch (error) {
      logger.error('Error getting video metadata:', error);
      throw error;
    }
  }

  async getVideoStream(videoId) {
    try {
      const video = await this.getVideoMetadata(videoId);
      
      if (!video || !video.url) {
        throw new Error('Video metadata not found or invalid');
      }

      // Get video stream from storage
      const filePath = this.extractFilePath(video.url);
      return await storageClient.getFile(this.bucketName, filePath);
    } catch (error) {
      logger.error('Error in getVideoStream:', error);
      throw new Error(`Error getting video stream: ${error.message}`);
    }
  }

  async deleteVideo(videoId) {
    try {
      const video = await prisma.video.findUnique({
        where: { id: videoId }
      });

      if (!video) {
        throw new Error('Video not found');
      }

      const filePath = this.extractFilePath(video.url);
      await storageClient.deleteFile(this.bucketName, filePath);
      await prisma.video.delete({ where: { id: videoId } });
      logger.info(`Video ${videoId} deleted successfully`);
    } catch (error) {
      logger.error('Error deleting video:', error);
      throw error;
    }
  }

  async streamVideo(videoId) {
    try {
      // Try to get video from Redis cache first
      const cachedVideo = await redisClient.get(`video:${videoId}`);
      if (cachedVideo) {
        logger.info(`Video ${videoId} found in Redis cache`);
        return JSON.parse(cachedVideo);
      }

      const video = await prisma.video.findUnique({
        where: { id: videoId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profileImage: true
            }
          }
        }
      });

      if (!video) {
        throw new Error('Video not found');
      }

      // Get video stream from storage
      const filePath = this.extractFilePath(video.url);
      let videoStream;
      
      if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'validation') {
        // For production, get stream directly from S3
        videoStream = await storageClient.getFile(this.bucketName, filePath);
      } else {
        // For local development with MinIO
        videoStream = await storageClient.getFile(this.bucketName, filePath);
      }

      // Cache video metadata in Redis
      await redisClient.set(
        `video:${videoId}`,
        JSON.stringify(video),
        'EX',
        parseInt(process.env.CACHE_DURATION) || 3600 // Default to 1 hour if not set
      );

      return {
        video,
        stream: videoStream
      };
    } catch (error) {
      logger.error('Error in streamVideo:', error);
      throw new Error(`Error streaming video: ${error.message}`);
    }
  }

  async getVideoFeed(page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;
      
      // Try to get feed from Redis cache
      const cacheKey = `feed:${page}:${limit}`;
      const cachedFeed = await redisClient.get(cacheKey);
      if (cachedFeed) {
        logger.info(`Feed page ${page} found in Redis cache`);
        return JSON.parse(cachedFeed);
      }

      const videos = await prisma.video.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profileImage: true
            }
          }
        }
      });

      // Cache feed in Redis
      await redisClient.set(
        cacheKey,
        JSON.stringify(videos),
        'EX',
        CACHE_DURATION
      );

      return videos;
    } catch (error) {
      logger.error('Error getting video feed:', error);
      throw error;
    }
  }
}

module.exports = new VideoService(); 