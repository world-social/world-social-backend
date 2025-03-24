const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  // Create sample users
  const users = await Promise.all([
    prisma.user.create({
      data: {
        username: 'john_doe',
        email: 'john@example.com',
        password: '$2b$10$K7L1OJ45/4Y2nIvhRVpCe.FSmhDdWoXehVzJptJ/op0lSsvqNu9.m', // password: 'password123'
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=john',
        isInfluencer: true,
        tokenBalance: 1000,
        totalEarnings: 5000,
        followers: 1500,
        following: 500,
        worldId: 'world-1',
      },
    }),
    prisma.user.create({
      data: {
        username: 'jane_smith',
        email: 'jane@example.com',
        password: '$2b$10$K7L1OJ45/4Y2nIvhRVpCe.FSmhDdWoXehVzJptJ/op0lSsvqNu9.m',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jane',
        isInfluencer: true,
        tokenBalance: 800,
        totalEarnings: 3000,
        followers: 1200,
        following: 300,
        worldId: 'world-1',
      },
    }),
    prisma.user.create({
      data: {
        username: 'mike_wilson',
        email: 'mike@example.com',
        password: '$2b$10$K7L1OJ45/4Y2nIvhRVpCe.FSmhDdWoXehVzJptJ/op0lSsvqNu9.m',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike',
        isInfluencer: false,
        tokenBalance: 500,
        totalEarnings: 1000,
        followers: 800,
        following: 200,
        worldId: 'world-1',
      },
    }),
  ])

  // Create sample videos
  const videos = await Promise.all([
    prisma.video.create({
      data: {
        title: 'Amazing Dance Moves',
        description: 'Check out these incredible dance moves!',
        url: 'https://storage.googleapis.com/world-social-videos/sample1.mp4',
        thumbnailUrl: 'https://storage.googleapis.com/world-social-videos/thumbnails/sample1.jpg',
        userId: users[0].id,
        likes: 150,
        views: 1000,
        duration: 30,
        tags: ['dance', 'entertainment'],
      },
    }),
    prisma.video.create({
      data: {
        title: 'Cooking Masterclass',
        description: 'Learn how to cook amazing dishes!',
        url: 'https://storage.googleapis.com/world-social-videos/sample2.mp4',
        thumbnailUrl: 'https://storage.googleapis.com/world-social-videos/thumbnails/sample2.jpg',
        userId: users[1].id,
        likes: 200,
        views: 1500,
        duration: 45,
        tags: ['cooking', 'food'],
      },
    }),
    prisma.video.create({
      data: {
        title: 'Travel Vlog',
        description: 'Exploring beautiful places around the world',
        url: 'https://storage.googleapis.com/world-social-videos/sample3.mp4',
        thumbnailUrl: 'https://storage.googleapis.com/world-social-videos/thumbnails/sample3.jpg',
        userId: users[2].id,
        likes: 100,
        views: 800,
        duration: 60,
        tags: ['travel', 'vlog'],
      },
    }),
  ])

  // Create sample likes
  await Promise.all([
    prisma.like.create({
      data: {
        userId: users[1].id,
        videoId: videos[0].id,
      },
    }),
    prisma.like.create({
      data: {
        userId: users[2].id,
        videoId: videos[0].id,
      },
    }),
    prisma.like.create({
      data: {
        userId: users[0].id,
        videoId: videos[1].id,
      },
    }),
    prisma.like.create({
      data: {
        userId: users[2].id,
        videoId: videos[1].id,
      },
    }),
  ])

  // Create sample comments
  await Promise.all([
    prisma.comment.create({
      data: {
        content: 'Amazing video! Keep it up!',
        userId: users[1].id,
        videoId: videos[0].id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'Love your content!',
        userId: users[2].id,
        videoId: videos[0].id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'Great cooking tips!',
        userId: users[0].id,
        videoId: videos[1].id,
      },
    }),
  ])

  // Create sample transactions
  await Promise.all([
    prisma.transaction.create({
      data: {
        userId: users[0].id,
        amount: 100,
        type: 'REWARD',
        description: 'Video reward',
      },
    }),
    prisma.transaction.create({
      data: {
        userId: users[1].id,
        amount: 80,
        type: 'REWARD',
        description: 'Video reward',
      },
    }),
    prisma.transaction.create({
      data: {
        userId: users[0].id,
        amount: -200,
        type: 'WITHDRAWAL',
        description: 'Token withdrawal',
      },
    }),
  ])

  // Create sample missions
  await Promise.all([
    prisma.mission.create({
      data: {
        title: 'Watch 5 Videos',
        description: 'Watch 5 videos to earn tokens',
        reward: 50,
        type: 'WATCH',
        target: 5,
      },
    }),
    prisma.mission.create({
      data: {
        title: 'Like 3 Videos',
        description: 'Like 3 videos to earn tokens',
        reward: 30,
        type: 'LIKE',
        target: 3,
      },
    }),
    prisma.mission.create({
      data: {
        title: 'Comment on 2 Videos',
        description: 'Comment on 2 videos to earn tokens',
        reward: 40,
        type: 'COMMENT',
        target: 2,
      },
    }),
  ])

  console.log('Seed data created successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  }) 