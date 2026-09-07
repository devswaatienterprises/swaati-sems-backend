import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../utils/apiResponse';
import { env } from '../config/env';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Server-side logging for diagnostics
  console.error(`[API Error Caught]: ${req.method} ${req.originalUrl}`, err?.message || err);

  let statusCode = err.statusCode || (err.status && typeof err.status === 'number' ? err.status : 500);
  let userFriendlyMessage = err.message || 'An unexpected error occurred. Please try again.';

  // Handle CORS Error
  if (err.message && err.message.includes('CORS policy')) {
    statusCode = 403;
    userFriendlyMessage = 'Access forbidden by CORS policy.';
  }

  // Handle Prisma unique constraint violation (P2002)
  if (err.code === 'P2002') {
    statusCode = 400;
    const targetField = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
    userFriendlyMessage = `A record with this ${targetField} already exists in the system.`;
  }

  // Handle Prisma record not found (P2025)
  if (err.code === 'P2025') {
    statusCode = 404;
    userFriendlyMessage = 'Requested record was not found or has been removed.';
  }

  // Handle Prisma connection errors or driver failures
  if (err.code === 'P1001' || err.code === 'P1000' || err.code === 'P1017') {
    statusCode = 503;
    userFriendlyMessage = 'Database service is temporarily unavailable. Please try again shortly.';
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    userFriendlyMessage = 'Invalid session token. Please sign in again.';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    userFriendlyMessage = 'Session has expired. Please sign in again.';
  }

  // In production, mask unhandled 500 errors to prevent leaking database URLs or stacks
  if (env.IS_PRODUCTION && statusCode >= 500) {
    userFriendlyMessage = 'An internal server error occurred. Please contact technical support.';
  }

  return ApiResponse.error(
    res,
    userFriendlyMessage,
    statusCode,
    !env.IS_PRODUCTION ? err.stack : null
  );
}

