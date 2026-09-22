import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import apiV1Router from './routes/v1';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimit';

const app = express();

// Trust reverse proxy headers on Render / Cloudflare / Vercel
app.set('trust proxy', 1);

// Security & Headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Explicit Allowed Origins Set for fast, accurate lookup
const EXPLICIT_ALLOWED_ORIGINS = new Set<string>([
  'https://app.swaatienterprises.com',
  'https://swaatienterprises.com',
  'https://www.swaatienterprises.com',
  'https://api.swaatienterprises.com',
  'https://swaatienterprises.in',
  'https://www.swaatienterprises.in',
  'https://app.swaatienterprises.in',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
]);

const ALLOWED_DOMAIN_PATTERNS = [
  /^https:\/\/([a-zA-Z0-9_-]+\.)*swaatienterprises\.com$/,
  /^https:\/\/([a-zA-Z0-9_-]+\.)*swaatienterprises\.in$/,
  /^https:\/\/([a-zA-Z0-9_-]+\.)*vercel\.app$/,
  /^https:\/\/([a-zA-Z0-9_-]+\.)*onrender\.com$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/,
];

export const isOriginAllowed = (origin?: string): boolean => {
  if (!origin) return true; // Allow non-browser requests (health checks, server-to-server, curl)

  const normalized = origin
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();

  if (EXPLICIT_ALLOWED_ORIGINS.has(normalized)) return true;

  if (
    env.CORS_ORIGINS.some(
      (o) => o.trim().replace(/\/+$/, '').toLowerCase() === normalized
    )
  ) {
    return true;
  }

  return ALLOWED_DOMAIN_PATTERNS.some((pattern) => pattern.test(normalized));
};

// Top-level middleware: Failsafe CORS header injection & OPTIONS preflight handler for Vercel Serverless
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;

  if (origin && isOriginAllowed(origin)) {
    const normalizedOrigin = origin.trim().replace(/^["']|["']$/g, '').trim().replace(/\/+$/, '');
    res.setHeader('Access-Control-Allow-Origin', normalizedOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Allow-Headers, Access-Control-Request-Method, Access-Control-Request-Headers'
    );
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(200).end();
  }

  next();
});

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS Blocked]: Origin ${origin} is not in allowed origins list`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Allow-Headers',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
  ],
  exposedHeaders: ['Authorization', 'Set-Cookie'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

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

import { RecurringTaskService } from './services/recurringTask.service';

// Start Server (Standalone mode only; skipped on Vercel Serverless)
if (!process.env.VERCEL) {
  app.listen(env.PORT, () => {
    console.log(`🚀 [Swaati Backend API] Server running on port ${env.PORT} [${env.NODE_ENV}]`);

    // Initial generation check on startup
    RecurringTaskService.generateDueTasks()
      .then((res) => {
        if (res.generatedCount > 0) {
          console.log(`⚡ [Recurring Tasks] Generated ${res.generatedCount} due tasks on startup.`);
        }
      })
      .catch((err) => console.warn('⚠️ [Recurring Tasks Startup Check Warning]:', err.message));

    // Periodic recurring task generator check (Every 15 minutes)
    setInterval(() => {
      RecurringTaskService.generateDueTasks().catch((err) =>
        console.warn('⚠️ [Recurring Tasks Periodic Check Warning]:', err.message)
      );
    }, 15 * 60 * 1000);
  });
}

export default app;
