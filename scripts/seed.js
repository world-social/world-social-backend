const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  try {
    // Create mock user if it doesn't exist
    const mockUser = await prisma.user.upsert({
      where: { username: 'testuser' },
      update: {},
      create: {
        id: '1',
        username: 'testuser',
        email: 'testuser@example.com',
        password: 'testpassword123', // This should be hashed in a real app
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=testuser',
        tokenBalance: 0,
        worldId: 'mock-world-id'
      }
    });

    console.log('Database seeded successfully:', mockUser);
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seed(); 