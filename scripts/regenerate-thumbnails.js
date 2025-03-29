const { PrismaClient } = require('@prisma/client');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const logger = require('../src/utils/logger');
const storageClient = require('../src/configs/storage');
const config = require('../src/configs/video-service-config');

const prisma = new PrismaClient();

async function regenerateThumbnails() {
  try {
    // Get all videos that need thumbnails
    const videos = await prisma.video.findMany({
      where: {
        thumbnailUrl: null
      }
    });

    logger.info(`Found ${videos.length} videos without thumbnails`);

    for (const video of videos) {
      try {
        // Create temporary directory for processing
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumb-'));
        const timestamp = Date.now();
        const thumbnailPath = path.join(tempDir, `thumb-${timestamp}.jpg`);

        // Get video file from storage
        const videoStream = await storageClient.getFile(config.bucketName, video.url);
        
        // Save video stream to temporary file
        const tempVideoPath = path.join(tempDir, 'temp-video.mp4');
        const chunks = [];
        for await (const chunk of videoStream) {
          chunks.push(chunk);
        }
        await fs.writeFile(tempVideoPath, Buffer.concat(chunks));

        // Generate thumbnail
        await new Promise((resolve, reject) => {
          ffmpeg(tempVideoPath)
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
            .on('end', () => {
              logger.info(`Generated thumbnail for video ${video.id}`);
              resolve();
            })
            .on('error', (err) => {
              logger.error(`Error generating thumbnail for video ${video.id}:`, err);
              reject(err);
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
        const thumbnailName = `${video.url.replace(/\.[^/.]+$/, '')}-thumb.jpg`;
        await storageClient.uploadFile(config.bucketName, thumbnailName, thumbnailBuffer);
        logger.info(`Uploaded thumbnail for video ${video.id}`);

        // Update video record with thumbnail URL
        await prisma.video.update({
          where: { id: video.id },
          data: { thumbnailUrl: thumbnailName }
        });
        logger.info(`Updated video ${video.id} with thumbnail URL`);

        // Cleanup temporary files
        await fs.unlink(tempVideoPath);
        await fs.unlink(thumbnailPath);
        await fs.rmdir(tempDir);

      } catch (error) {
        logger.error(`Error processing video ${video.id}:`, error);
        // Continue with next video even if this one fails
      }
    }

    logger.info('Thumbnail regeneration completed');
  } catch (error) {
    logger.error('Error in regenerateThumbnails:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
regenerateThumbnails(); 