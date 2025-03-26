const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function resetTokens() {
  try {
    console.log('Starting token reset...');

    // Reset all user token balances to 0
    await prisma.user.updateMany({
      data: {
        tokenBalance: 0
      }
    });
    console.log('Reset user token balances');

    // Delete all watch rewards
    await prisma.watchReward.deleteMany({});
    console.log('Cleared watch rewards');

    // Delete all engagement rewards
    await prisma.engagement.deleteMany({});
    console.log('Cleared engagement rewards');

    // Reset mission progress
    await prisma.mission.deleteMany({});
    console.log('Reset mission progress');

    // Reset achievement progress
    await prisma.achievement.deleteMany({});
    console.log('Reset achievement progress');

    // Reset daily bonus claims
    await prisma.dailyBonus.deleteMany({});
    console.log('Reset daily bonus claims');

    console.log('Token reset completed successfully');
  } catch (error) {
    console.error('Error resetting tokens:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the reset
resetTokens()
  .catch((error) => {
    console.error('Failed to reset tokens:', error);
    process.exit(1);
  }); 