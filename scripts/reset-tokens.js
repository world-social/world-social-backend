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