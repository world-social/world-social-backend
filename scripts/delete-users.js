const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteAllUsers() {
  try {
    console.log('Starting deletion process...');

    // Delete all related records first
    console.log('Deleting likes...');
    await prisma.like.deleteMany();

    console.log('Deleting comments...');
    await prisma.comment.deleteMany();

    console.log('Deleting transactions...');
    await prisma.transaction.deleteMany();

    console.log('Deleting streaks...');
    await prisma.streak.deleteMany();

    console.log('Deleting badges...');
    await prisma.badge.deleteMany();

    console.log('Deleting NFTs...');
    await prisma.nFT.deleteMany();

    console.log('Deleting achievements...');
    await prisma.achievement.deleteMany();

    console.log('Deleting videos...');
    await prisma.video.deleteMany();

    console.log('Finally, deleting users...');
    await prisma.user.deleteMany();

    console.log('All users and related records have been deleted successfully!');
  } catch (error) {
    console.error('Error deleting users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllUsers(); 