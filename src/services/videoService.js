const { Client } = require('minio');
const Redis = require('redis');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const { promisify } = require('util');
const os = require('os');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Initialize MinIO client
const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

// Ensure bucket exists with proper permissions
const bucketName = process.env.MINIO_BUCKET || 'worldsocial-videos';
const policy = {
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Allow',
      Principal: { AWS: ['*'] },
      Action: ['s3:GetObject'],
      Resource: [`arn:aws:s3:::${bucketName}/*`]
    }
  ]
};

(async () => {
  try {
    const exists = await minioClient.bucketExists(bucketName);
    if (!exists) {
      await minioClient.makeBucket(bucketName);
      console.log('Bucket created successfully');
    }
    // Set bucket policy for public read access
    await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
    console.log('Bucket policy set successfully');
  } catch (err) {
    console.error('Error initializing MinIO bucket:', err);
  }
})();

// Initialize Redis client
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL
});

// Connect to Redis
redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

const ffmpegPromise = promisify(ffmpeg);

class VideoService {
  constructor() {
    this.bucketName = process.env.MINIO_BUCKET || 'worldsocial-videos';
    this.initialize();
  }

  async initialize() {
    try {
      await this.ensureBucket();
      await this.connectRedis();
    } catch (error) {
      console.error('Error initializing VideoService:', error);
      throw error;
    }
  }

  async connectRedis() {
    try {
      if (!redisClient.isOpen) {
        await redisClient.connect();
        console.log('Redis connected successfully');
      }
    } catch (error) {
      console.error('Redis connection error:', error);
      throw error;
    }
  }

  async ensureBucket() {
    try {
      const exists = await minioClient.bucketExists(this.bucketName);
      if (!exists) {
        await minioClient.makeBucket(this.bucketName);
        await minioClient.setBucketPolicy(this.bucketName, JSON.stringify(policy));
        console.log('Bucket created and policy set successfully');
      }
    } catch (error) {
      console.error('Error ensuring bucket exists:', error);
      throw error;
    }
  }

  // Helper method to get full URL for a file
  getFullUrl(filePath) {
    return `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}/${this.bucketName}/${filePath}`;
  }

  // Helper method to extract file path from URL
  extractFilePath(url) {
    // Remove protocol, host, and port if present
    const path = url.replace(/^https?:\/\/[^\/]+\//, '');
    // Remove bucket name if present
    return path.replace(`${process.env.MINIO_BUCKET}/`, '');
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
              console.error('ffprobe error:', err);
              reject(new Error(`Failed to get video duration: ${err.message}`));
            } else {
              resolve(metadata.format.duration);
            }
          });
        });
      } catch (error) {
        throw new Error(`Failed to process video: ${error.message}`);
      }

      console.info(`Video duration: ${duration} seconds`);

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
              .output(outputPath)
              .on('end', resolve)
              .on('error', (err) => {
                console.error('Error during trimming:', err);
                reject(new Error(`Failed to trim video: ${err.message}`));
              })
              .run();
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

      // Upload to MinIO
      try {
        await minioClient.fPutObject(
          this.bucketName,
          finalFileName,
          finalVideoPath
        );
        uploadedFiles.push(finalFileName);
      } catch (error) {
        throw new Error(`Failed to upload video to MinIO: ${error.message}`);
      }

      // Generate thumbnail
      const thumbnailName = `${contentId}/${safeFileName.replace(/\.[^/.]+$/, '')}-thumb.jpg`;
      const thumbnailPath = path.join(tempDir, `thumb-${timestamp}.jpg`);
      
      try {
        await new Promise((resolve, reject) => {
          ffmpeg(finalVideoPath)
            .screenshots({
              timestamps: ['50%'],
              filename: path.basename(thumbnailPath),
              folder: path.dirname(thumbnailPath),
              size: '320x240'
            })
            .on('end', resolve)
            .on('error', (err) => {
              console.error('Error generating thumbnail:', err);
              reject(new Error(`Failed to generate thumbnail: ${err.message}`));
            });
        });

        // Upload thumbnail to MinIO
        await minioClient.fPutObject(
          this.bucketName,
          thumbnailName,
          thumbnailPath
        );
        uploadedFiles.push(thumbnailName);
      } catch (error) {
        console.warn('Failed to generate/upload thumbnail:', error.message);
        // Continue without thumbnail
      }

      // Clean up temporary files
      try {
        if (duration > 30) {
          await fs.unlink(outputPath);
        }
        await fs.unlink(thumbnailPath);
      } catch (error) {
        console.warn('Failed to clean up temporary files:', error.message);
      }

      // Create video record in database
      createdVideo = await prisma.video.create({
        data: {
          id: contentId,
          userId,
          title: file.originalname,
          description: file.originalname,
          thumbnailUrl: thumbnailName,
          duration: Math.min(Math.round(duration), 30),
          views: 0,
          likeCount: 0,
          tags: [],
          url: this.getFullUrl(finalFileName)
        }
      });

      // Only cache in Redis after successful database creation
      const videoMetadata = {
        id: createdVideo.id,
        title: createdVideo.title,
        description: createdVideo.description,
        videoUrl: createdVideo.url,
        thumbnailUrl: createdVideo.thumbnailUrl ? this.getFullUrl(createdVideo.thumbnailUrl) : null,
        userId: createdVideo.userId,
        duration: createdVideo.duration,
        createdAt: createdVideo.createdAt
      };

      // Cache video metadata in Redis
      await redisClient.set(
        redisKey,
        JSON.stringify(videoMetadata),
        'EX',
        3600
      );

      // Return the metadata
      return videoMetadata;
    } catch (error) {
      console.error('Error in uploadVideo:', error);
      
      // Rollback: Delete uploaded files from MinIO
      if (contentId && uploadedFiles.length > 0) {
        try {
          await Promise.all(uploadedFiles.map(fileName => 
            minioClient.removeObject(this.bucketName, fileName)
          ));
          console.log('Successfully rolled back uploaded files');
        } catch (rollbackError) {
          console.error('Error during rollback of uploaded files:', rollbackError);
        }
      }

      // Rollback: Delete video record from database
      if (createdVideo) {
        try {
          await prisma.video.delete({
            where: { id: contentId }
          });
          console.log('Successfully rolled back database record');
        } catch (rollbackError) {
          console.error('Error during rollback of database record:', rollbackError);
        }
      }

      // Rollback: Clear Redis cache if it was set
      if (redisKey) {
        try {
          await redisClient.del(redisKey);
          console.log('Successfully cleared Redis cache');
        } catch (rollbackError) {
          console.error('Error during rollback of Redis cache:', rollbackError);
        }
      }

      throw new Error(`Error uploading video: ${error.message}`);
    }
  }

  async getVideoMetadata(videoId) {
    try {
      // Try to get from Redis cache first
      const cachedMetadata = await redisClient.get(`video:${videoId}`);
      if (cachedMetadata) {
        try {
          const metadata = JSON.parse(cachedMetadata);
          if (!metadata || !metadata.videoUrl) {
            // Clear invalid cache entry
            await redisClient.del(`video:${videoId}`);
            throw new Error('Invalid cached metadata');
          }

          // Verify file exists in MinIO
          try {
            const filePath = this.extractFilePath(metadata.videoUrl);
            await minioClient.statObject(this.bucketName, filePath);
          } catch (error) {
            console.warn(`Video file not found in MinIO for video ${videoId}:`, error.message);
            // Clear cache if file doesn't exist
            await redisClient.del(`video:${videoId}`);
            throw new Error(`Video file not found in storage: ${error.message}`);
          }

          return metadata;
        } catch (error) {
          // Clear invalid cache entry
          await redisClient.del(`video:${videoId}`);
          console.warn('Cleared invalid cache entry:', error.message);
        }
      }

      // If not in cache or cache was invalid, get from database
      const video = await prisma.video.findFirst({
        where: { id: videoId },
        include: { user: true }
      });

      if (!video) {
        throw new Error('Video not found');
      }

      // If video has no url, return a basic metadata object
      if (!video.url) {
        console.warn(`Video ${videoId} has no url in database`);
        return {
          id: video.id,
          title: video.title,
          description: video.description,
          videoUrl: null,
          thumbnailUrl: null,
          userId: video.userId,
          duration: video.duration,
          createdAt: video.createdAt
        };
      }

      // Verify file exists in MinIO
      try {
        const filePath = this.extractFilePath(video.url);
        await minioClient.statObject(this.bucketName, filePath);
      } catch (error) {
        console.warn(`Video file not found in MinIO for video ${videoId}:`, error.message);
        // Return metadata with null URLs if file doesn't exist
        return {
          id: video.id,
          title: video.title,
          description: video.description,
          videoUrl: null,
          thumbnailUrl: null,
          userId: video.userId,
          duration: video.duration,
          createdAt: video.createdAt
        };
      }

      // Transform the database result to match our metadata format
      const metadata = {
        id: video.id,
        title: video.title,
        description: video.description,
        videoUrl: video.url,
        thumbnailUrl: video.thumbnailUrl ? this.getFullUrl(video.thumbnailUrl) : null,
        userId: video.userId,
        duration: video.duration,
        createdAt: video.createdAt
      };

      // Cache the result
      await redisClient.set(
        `video:${videoId}`,
        JSON.stringify(metadata),
        'EX',
        3600
      );

      return metadata;
    } catch (error) {
      console.error('Error in getVideoMetadata:', error);
      throw new Error(`Error getting video metadata: ${error.message}`);
    }
  }

  async preloadVideo(videoId) {
    try {
      const video = await this.getVideoMetadata(videoId);
      
      // Preload video URL to Redis
      await redisClient.set(
        `preload:${videoId}`,
        video.url,
        'EX',
        3600
      );

      return video;
    } catch (error) {
      throw new Error(`Error preloading video: ${error.message}`);
    }
  }

  async getVideoStream(videoId) {
    try {
      const video = await this.getVideoMetadata(videoId);
      
      if (!video || !video.videoUrl) {
        throw new Error('Video metadata not found or invalid');
      }

      // Log the file path for debugging
      console.log('Attempting to get video with path:', video.videoUrl);

      // Verify the file exists in MinIO
      try {
        const filePath = this.extractFilePath(video.videoUrl);
        await minioClient.statObject(this.bucketName, filePath);
      } catch (error) {
        // If file doesn't exist in MinIO, clear the cache and throw error
        await redisClient.del(`video:${videoId}`);
        throw new Error(`Video file not found in storage: ${error.message}`);
      }

      // Get video stream from MinIO using the file path
      const filePath = this.extractFilePath(video.videoUrl);
      const stream = await minioClient.getObject(
        this.bucketName,
        filePath
      );

      return stream;
    } catch (error) {
      console.error('Error in getVideoStream:', error);
      throw new Error(`Error getting video stream: ${error.message}`);
    }
  }

  async trimVideo(inputPath, maxDuration = 30) {
    try {
      // Get video duration
      const duration = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
          if (err) reject(err);
          else resolve(metadata.format.duration);
        });
      });

      console.info(`Trimming video from ${duration} seconds to ${maxDuration} seconds`);

      // Create output path with timestamp to avoid conflicts
      const timestamp = Date.now();
      const outputPath = path.join(os.tmpdir(), `trimmed-${timestamp}.mp4`);

      // Trim video if it's longer than maxDuration
      if (duration > maxDuration) {
        await new Promise((resolve, reject) => {
          ffmpeg(inputPath)
            .setDuration(maxDuration)
            .output(outputPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });

        // Upload trimmed video to MinIO
        const fileName = path.basename(inputPath);
        const trimmedFileName = `trimmed-${fileName}`;
        await minioClient.fPutObject(
          this.bucketName,
          trimmedFileName,
          outputPath
        );

        // Clean up temporary file
        await fs.unlink(outputPath);

        return trimmedFileName;
      }

      return path.basename(inputPath);
    } catch (error) {
      console.error('Error in trimVideo:', error);
      throw new Error(`Error trimming video: ${error.message}`);
    }
  }
}

// Export the class instead of an instance
module.exports = VideoService; 