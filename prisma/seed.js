const { PrismaClient } = require('@prisma/client')
const { randomUUID } = require('crypto')
const prisma = new PrismaClient()

async function main() {
  // Delete existing data and create new data in a transaction
  await prisma.$transaction(async (tx) => {
    // Delete existing data
    console.log('Cleaning up existing data...')
    try {
      await Promise.all([
        tx.transaction.deleteMany(),
        tx.comment.deleteMany(),
        tx.like.deleteMany(),
        tx.nft.deleteMany(),
        tx.video.deleteMany(),
        tx.achievement.deleteMany(),
        tx.badge.deleteMany(),
        tx.streak.deleteMany(),
        tx.mission.deleteMany(),
        tx.user.deleteMany(),
      ])
      console.log('Existing data cleaned up successfully')
    } catch (error) {
      console.log('Note: Some tables might not exist yet, continuing with seed...')
    }

    // Create sample users
    console.log('Creating sample users...')
    const users = await Promise.all([
      tx.user.create({
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
          worldId: randomUUID(),
        },
      }),
      tx.user.create({
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
          worldId: randomUUID(),
        },
      }),
      tx.user.create({
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
          worldId: randomUUID(),
        },
      }),
    ])
    console.log('Sample users created successfully')

    // Create sample videos
    console.log('Creating sample videos...')
    const videos = await Promise.all([
      tx.video.create({
        data: {
          title: 'Amazing Dance Moves',
          description: 'Check out these incredible dance moves!',
          url: 'https://storage.googleapis.com/world-social-videos/sample1.mp4',
          thumbnailUrl: 'https://storage.googleapis.com/world-social-videos/thumbnails/sample1.jpg',
          userId: users[0].id,
          likeCount: 150,
          views: 1000,
          duration: 30,
          tags: ['dance', 'entertainment'],
        },
      }),
      tx.video.create({
        data: {
          title: 'Cooking Masterclass',
          description: 'Learn how to cook amazing dishes!',
          url: 'https://storage.googleapis.com/world-social-videos/sample2.mp4',
          thumbnailUrl: 'https://storage.googleapis.com/world-social-videos/thumbnails/sample2.jpg',
          userId: users[1].id,
          likeCount: 200,
          views: 1500,
          duration: 45,
          tags: ['cooking', 'food'],
        },
      }),
      tx.video.create({
        data: {
          title: 'Travel Vlog',
          description: 'Exploring beautiful places around the world',
          url: 'https://storage.googleapis.com/world-social-videos/sample3.mp4',
          thumbnailUrl: 'https://storage.googleapis.com/world-social-videos/thumbnails/sample3.jpg',
          userId: users[2].id,
          likeCount: 100,
          views: 800,
          duration: 60,
          tags: ['travel', 'vlog'],
        },
      }),
    ])
    console.log('Sample videos created successfully')

    // Create sample likes
    console.log('Creating sample likes...')
    await Promise.all([
      tx.like.create({
        data: {
          userId: users[1].id,
          videoId: videos[0].id,
        },
      }),
      tx.like.create({
        data: {
          userId: users[2].id,
          videoId: videos[0].id,
        },
      }),
      tx.like.create({
        data: {
          userId: users[0].id,
          videoId: videos[1].id,
        },
      }),
      tx.like.create({
        data: {
          userId: users[2].id,
          videoId: videos[1].id,
        },
      }),
    ])
    console.log('Sample likes created successfully')

    // Create sample comments
    console.log('Creating sample comments...')
    await Promise.all([
      tx.comment.create({
        data: {
          content: 'Amazing video! Keep it up!',
          userId: users[1].id,
          videoId: videos[0].id,
        },
      }),
      tx.comment.create({
        data: {
          content: 'Love your content!',
          userId: users[2].id,
          videoId: videos[0].id,
        },
      }),
      tx.comment.create({
        data: {
          content: 'Great cooking tips!',
          userId: users[0].id,
          videoId: videos[1].id,
        },
      }),
    ])
    console.log('Sample comments created successfully')

    // Create sample transactions
    console.log('Creating sample transactions...')
    await Promise.all([
      tx.transaction.create({
        data: {
          userId: users[0].id,
          amount: 100,
          type: 'REWARD',
          description: 'Video reward',
        },
      }),
      tx.transaction.create({
        data: {
          userId: users[1].id,
          amount: 80,
          type: 'REWARD',
          description: 'Video reward',
        },
      }),
      tx.transaction.create({
        data: {
          userId: users[0].id,
          amount: -200,
          type: 'WITHDRAWAL',
          description: 'Token withdrawal',
        },
      }),
    ])
    console.log('Sample transactions created successfully')

    // Create sample missions
    console.log('Creating sample missions...')
    const missions = [
      {
        id: "watch-5-videos",
        name: "Watch 5 Videos",
        description: "Watch 5 videos to earn tokens",
        type: "WATCH_VIDEOS",
        requirements: JSON.stringify([{ type: "WATCH_VIDEOS", amount: 5 }]),
        reward: 20,
        duration: 24
      },
      {
        id: "like-3-videos",
        name: "Like 3 Videos",
        description: "Like 3 videos to earn tokens",
        type: "LIKE_VIDEOS",
        requirements: JSON.stringify([{ type: "LIKE_VIDEOS", amount: 3 }]),
        reward: 30,
        duration: 24
      },
      {
        id: "comment-on-videos",
        name: "Comment on Videos",
        description: "Leave 2 comments to earn tokens",
        type: "COMMENT_VIDEOS",
        requirements: JSON.stringify([{ type: "COMMENT_VIDEOS", amount: 2 }]),
        reward: 40,
        duration: 24
      }
    ];

    for (const mission of missions) {
      await tx.mission.upsert({
        where: {
          id: mission.id
        },
        update: {
          name: mission.name,
          description: mission.description,
          type: mission.type,
          requirements: mission.requirements,
          reward: mission.reward,
          duration: mission.duration
        },
        create: {
          id: mission.id,
          name: mission.name,
          description: mission.description,
          type: mission.type,
          requirements: mission.requirements,
          reward: mission.reward,
          duration: mission.duration
        }
      });
    }

    // Create achievements
    const achievements = [
      {
        id: "first-video",
        name: "First Video",
        description: "Upload your first video",
        icon: "🎥",
        requirements: JSON.stringify([{ type: "UPLOAD_VIDEOS", amount: 1 }]),
        reward: 50
      },
      {
        id: "social-butterfly",
        name: "Social Butterfly",
        description: "Follow 10 creators",
        icon: "🦋",
        requirements: JSON.stringify([{ type: "FOLLOW_USERS", amount: 10 }]),
        reward: 100
      },
      {
        id: "engagement-master",
        name: "Engagement Master",
        description: "Get 100 likes on your videos",
        icon: "👍",
        requirements: JSON.stringify([{ type: "GET_LIKES", amount: 100 }]),
        reward: 200
      }
    ];

    for (const achievement of achievements) {
      await tx.achievement.upsert({
        where: {
          id: achievement.id
        },
        update: {
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          requirements: achievement.requirements,
          reward: achievement.reward
        },
        create: {
          id: achievement.id,
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          requirements: achievement.requirements,
          reward: achievement.reward
        }
      });
    }

    console.log('Seed data created successfully!')
  })
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  }) 