const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listVideos() {
  try {
    const videos = await prisma.video.findMany({
      select: {
        id: true,
        title: true,
        videoUrl: true,
        contentId: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log('Videos in database:');
    videos.forEach(video => {
      console.log(`\nID: ${video.id}`);
      console.log(`Title: ${video.title}`);
      console.log(`Video URL: ${video.videoUrl}`);
      console.log(`Content ID: ${video.contentId}`);
      console.log(`Created: ${video.createdAt}`);
    });
  } catch (error) {
    console.error('Error listing videos:', error);
  } finally {
    await prisma.$disconnect();
  }
}

listVideos(); 