const { PrismaClient } = require('@prisma/client');
const { Client } = require('minio');
const Redis = require('redis');

const prisma = new PrismaClient();

// Initialize MinIO client
const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

// Initialize Redis client
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL
});

const bucketName = process.env.MINIO_BUCKET || 'worldsocial-videos';

async function cleanupVideos() {
  try {
    console.log('Starting video cleanup process...');

    // Connect to Redis
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log('Connected to Redis');
    }

    // Get all videos from database
    const videos = await prisma.video.findMany();
    console.log(`Found ${videos.length} videos in database`);

    let deletedCount = 0;
    let skippedCount = 0;

    // Check each video
    for (const video of videos) {
      try {
        // Skip if no videoUrl
        if (!video.videoUrl) {
          console.log(`Video ${video.id} has no videoUrl, deleting from database...`);
          await prisma.video.delete({ where: { id: video.id } });
          // Clear Redis cache for this video
          await redisClient.del(`video:${video.id}`);
          deletedCount++;
          continue;
        }

        // Check if file exists in MinIO
        try {
          await minioClient.statObject(bucketName, video.videoUrl);
        } catch (error) {
          console.log(`Video file not found in MinIO for video ${video.id}, deleting from database...`);
          
          // Delete thumbnail if it exists
          if (video.thumbnailUrl) {
            try {
              await minioClient.removeObject(bucketName, video.thumbnailUrl);
              console.log(`Deleted missing thumbnail for video ${video.id}`);
            } catch (thumbError) {
              console.log(`Error deleting thumbnail for video ${video.id}:`, thumbError.message);
            }
          }

          // Delete video record from database
          await prisma.video.delete({ where: { id: video.id } });
          // Clear Redis cache for this video
          await redisClient.del(`video:${video.id}`);
          deletedCount++;
          continue;
        }

        // If we get here, the video is valid
        skippedCount++;
      } catch (error) {
        console.error(`Error processing video ${video.id}:`, error);
        // Try to delete the video record if there's an error
        try {
          await prisma.video.delete({ where: { id: video.id } });
          // Clear Redis cache for this video
          await redisClient.del(`video:${video.id}`);
          deletedCount++;
        } catch (deleteError) {
          console.error(`Error deleting video ${video.id}:`, deleteError);
        }
      }
    }

    // Clear Redis cache for all videos
    try {
      const keys = await redisClient.keys('video:*');
      if (keys.length > 0) {
        await redisClient.del(keys);
        console.log(`Cleared ${keys.length} video entries from Redis cache`);
      }
    } catch (redisError) {
      console.error('Error clearing Redis cache:', redisError);
    }

    console.log('\nCleanup Summary:');
    console.log(`Total videos processed: ${videos.length}`);
    console.log(`Videos deleted: ${deletedCount}`);
    console.log(`Valid videos skipped: ${skippedCount}`);

  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await prisma.$disconnect();
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
  }
}

// Run the cleanup
cleanupVideos(); 