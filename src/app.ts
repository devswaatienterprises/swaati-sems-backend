import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import apiV1Router from './routes/v1';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Security & Middleware
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Versioned API Routes
app.use('/api/v1', apiV1Router);

// Centralized Error Handler
app.use(errorHandler);

// Start Server
app.listen(env.PORT, () => {
  console.log(`🚀 [Swaati Backend API] TypeScript Server running on http://localhost:${env.PORT}`);
});

export default app;
