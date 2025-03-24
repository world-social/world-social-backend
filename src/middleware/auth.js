const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // For development, accept mock token
    if (token === 'mock-jwt-token') {
      req.user = {
        id: '41445b8b-e984-4a49-b2b0-de73e1e8a710',
        username: 'testuser',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=testuser'
      };
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Error in auth middleware:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const isInfluencer = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        videos: true
      }
    });

    if (!user || user.videos.length < 10) {
      return res.status(403).json({
        status: 'error',
        message: 'User is not an influencer'
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Error checking influencer status'
    });
  }
};

// Comment out the original verifyToken for now
/*
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    });

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Verify with World ID
    const isVerified = await WorldID.verify(decoded.worldId);
    if (!isVerified) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid World ID verification'
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid token'
    });
  }
};
*/

module.exports = {
  authenticateToken,
  isInfluencer
}; 