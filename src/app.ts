import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import apiV1Router from './routes/v1';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimit';

const app = express();

// Trust reverse proxy headers on Render / Cloudflare
app.set('trust proxy', 1);

// Security & Headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Strict CORS Handling
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, server-to-server, curl, health checks)
      if (!origin) return callback(null, true);

      const normalizedOrigin = origin.trim().replace(/^["']|["']$/g, '').trim().replace(/\/+$/, '');

      if (env.CORS_ORIGINS.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  })
);

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cookieParser());

// Root Health Check for Render & uptime monitors
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    name: 'Swaati Enterprises SEMS API',
    status: 'active',
    version: '1.0.0',
  });
});

// Apply General Rate Limiter to all API routes
app.use('/api', apiLimiter);

// Versioned API Routes
app.use('/api/v1', apiV1Router);

// Centralized Error Handler
app.use(errorHandler);

// Start Server
app.listen(env.PORT, () => {
  console.log(`🚀 [Swaati Backend API] Server running on port ${env.PORT} [${env.NODE_ENV}]`);
});

export default app;

