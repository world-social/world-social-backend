const jwt = require('jsonwebtoken');
const { WorldID } = require('@worldcoin/minikit-js');
const prisma = require('../configs/database');
const logger = require('../utils/logger');

class AuthController {
  async register(req, res) {
    try {
      const { worldId, username } = req.body;

      // Verify World ID
      const isVerified = await WorldID.verify(worldId);
      if (!isVerified) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid World ID'
        });
      }

      // Check if user exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { worldId },
            { username }
          ]
        }
      });

      if (existingUser) {
        return res.status(400).json({
          status: 'error',
          message: 'User already exists'
        });
      }

      // Create user
      const user = await prisma.user.create({
        data: {
          worldId,
          username
        }
      });

      // Generate token
      const token = jwt.sign(
        { id: user.id, worldId: user.worldId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );

      logger.info(`User registered: ${user.id}`);

      res.status(201).json({
        status: 'success',
        data: {
          user: {
            id: user.id,
            username: user.username,
            worldId: user.worldId
          },
          token
        }
      });
    } catch (error) {
      logger.error(`Registration error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async login(req, res) {
    try {
      const { worldId } = req.body;

      // Verify World ID
      const isVerified = await WorldID.verify(worldId);
      if (!isVerified) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid World ID'
        });
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { worldId }
      });

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      // Generate token
      const token = jwt.sign(
        { id: user.id, worldId: user.worldId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );

      logger.info(`User logged in: ${user.id}`);

      res.json({
        status: 'success',
        data: {
          user: {
            id: user.id,
            username: user.username,
            worldId: user.worldId
          },
          token
        }
      });
    } catch (error) {
      logger.error(`Login error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async getProfile(req, res) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          videos: true,
          badges: true,
          streak: true
        }
      });

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      res.json({
        status: 'success',
        data: {
          user: {
            id: user.id,
            username: user.username,
            worldId: user.worldId,
            tokenBalance: user.tokenBalance,
            videoCount: user.videos.length,
            badges: user.badges,
            streak: user.streak
          }
        }
      });
    } catch (error) {
      logger.error(`Profile fetch error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
}

module.exports = new AuthController(); 