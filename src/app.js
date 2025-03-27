require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const swaggerUi = require('swagger-ui-express');
const specs = require('./configs/swagger');
const logger = require('./utils/logger');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { authenticateToken } = require('./middleware/auth');
const multer = require('multer');
const path = require('path');
const os = require('os');
const morgan = require('morgan');
const { errorHandler } = require('./middleware/errorHandler');
const { rateLimitConfig } = require('./configs/rateLimit');
const { connectRedis } = require('./configs/redis');

// Initialize Express app
const app = express();
const prisma = new PrismaClient();
const httpServer = createServer(app);

// CORS configuration
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('No origin provided - allowing request');
      return callback(null, true);
    }
    
    // Log all incoming origins for debugging
    console.log('Incoming request origin:', origin);
    
    // Allow all Vercel domains and localhost
    if (origin.match(/\.vercel\.app$/) || 
        origin === 'http://localhost:3000' || 
        origin === 'http://localhost:3001') {
      console.log('Origin allowed:', origin);
      callback(null, true);
    } else {
      console.log('Origin rejected:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'Accept', 'Origin', 'X-Requested-With', 'Access-Control-Allow-Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
};

const io = new Server(httpServer, {
  cors: corsOptions
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, os.tmpdir());
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  }
});

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https://world-social-backend-production.up.railway.app", "https://*.vercel.app", "wss://world-social-backend-production.up.railway.app"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "https:", "blob:"],
      frameSrc: ["'self'", "https:"],
      upgradeInsecureRequests: []
    }
  }
}));

// Apply CORS middleware before any other middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Only parse JSON for non-multipart requests
app.use((req, res, next) => {
  if (!req.is('multipart/form-data')) {
    express.json({ limit: '100mb' })(req, res, next);
  } else {
    next();
  }
});

app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: {
    status: 'error',
    error: 'Rate limit exceeded. Please try again later.'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to all routes except static files
app.use((req, res, next) => {
  if (req.path.startsWith('/static/')) {
    return next();
  }
  limiter(req, res, next);
});

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "WorldSocial API Documentation"
}));

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is healthy',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  // Check database connection
  prisma.$queryRaw`SELECT 1`
    .then(() => {
      res.status(200).json({
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString()
      });
    })
    .catch((error) => {
      logger.error('Health check failed:', error);
      res.status(503).json({
        status: 'error',
        database: 'disconnected',
        error: error.message
      });
    });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/content', require('./routes/content'));
app.use('/api/tokens', require('./routes/tokens'));
app.use('/api/gamification', require('./routes/gamification'));

// WebSocket connection handling
io.on('connection', (socket) => {
  logger.info('New WebSocket connection');

  // Authenticate socket connection
  socket.on('authenticate', async (token) => {
    try {
      const user = await authenticateToken(token);
      if (user) {
        socket.userId = user.id;
        socket.join(`user:${user.id}`);
        socket.emit('authenticated', { success: true });
      } else {
        socket.emit('authenticated', { success: false, error: 'Invalid token' });
      }
    } catch (error) {
      socket.emit('authenticated', { success: false, error: 'Authentication failed' });
    }
  });

  // Join video room
  socket.on('joinVideo', (videoId) => {
    if (socket.userId) {
      socket.join(`video:${videoId}`);
      logger.info(`User ${socket.userId} joined video ${videoId}`);
    }
  });

  // Leave video room
  socket.on('leaveVideo', (videoId) => {
    if (socket.userId) {
      socket.leave(`video:${videoId}`);
      logger.info(`User ${socket.userId} left video ${videoId}`);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    logger.info('WebSocket connection closed');
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong!'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Closing HTTP server...');
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = { app, httpServer, upload }; 